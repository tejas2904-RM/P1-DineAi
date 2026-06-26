from __future__ import annotations

import asyncio
import hashlib
import importlib.util
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from middleware import (
    CircuitBreaker,
    SecurityHeadersMiddleware,
    api_key_auth,
    circuit_breaker_dependency,
    deduplicator,
    llm_circuit_breaker,
    rate_limit_dependency,
    rate_limiter,
    require_role,
)
from schemas import (
    AuthStatusResponse,
    ErrorDetail,
    ErrorResponse,
    FeedbackRequest,
    RecommendationItem,
    RecommendationRequest as RecRequest,
    RecommendationResponse,
)

# ---------------------------------------------------------------------------
# Project paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]
PHASE5_BACKEND = PROJECT_ROOT / "Phase5" / "backend"
PHASE6_SRC = PROJECT_ROOT / "Phase6" / "src"

# Ensure Phase5 backend is importable
if str(PHASE5_BACKEND) not in sys.path:
    sys.path.insert(0, str(PHASE5_BACKEND))
if str(PHASE6_SRC) not in sys.path:
    sys.path.insert(0, str(PHASE6_SRC))

# Load Groq API key
load_dotenv(dotenv_path=PROJECT_ROOT / "Phase4" / ".env", override=True)

# ---------------------------------------------------------------------------
# Import Phase5 modules
# ---------------------------------------------------------------------------
# We import the key components from Phase5 backend directly
# Phase5 main has complex importlib loading, so we reuse its objects

# First load Phase3/Phase4 modules the same way Phase5 does
PHASE3_SRC = PROJECT_ROOT / "Phase3" / "src"
PHASE4_SRC = PROJECT_ROOT / "Phase4" / "src"


def _load_module(name: str, path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


# Load Phase3
p3_models = _load_module("p3_models_v7", PHASE3_SRC / "models.py")
sys.modules["models"] = p3_models
p3_cache = _load_module("p3_cache_v7", PHASE3_SRC / "cache.py")
sys.modules["cache"] = p3_cache
p3_scoring = _load_module("p3_scoring_v7", PHASE3_SRC / "scoring.py")
sys.modules["scoring"] = p3_scoring
p3_engine = _load_module("p3_engine_v7", PHASE3_SRC / "engine.py")
sys.modules["engine"] = p3_engine

_saved_short = {}
for _short in ("models", "cache", "scoring", "engine"):
    _saved_short[_short] = sys.modules.get(_short)
    if _short in sys.modules:
        del sys.modules[_short]

# Load Phase4
p4_models = _load_module("p4_models_v7", PHASE4_SRC / "models.py")
sys.modules["models"] = p4_models
p4_groq = _load_module("p4_groq_v7", PHASE4_SRC / "groq_adapter.py")
sys.modules["groq_adapter"] = p4_groq
p4_fallback = _load_module("p4_fallback_v7", PHASE4_SRC / "fallback.py")
sys.modules["fallback"] = p4_fallback
p4_parser = _load_module("p4_parser_v7", PHASE4_SRC / "parser.py")
sys.modules["parser"] = p4_parser
p4_prompt = _load_module("p4_prompt_v7", PHASE4_SRC / "prompt_builder.py")
sys.modules["prompt_builder"] = p4_prompt
p4_engine = _load_module("p4_engine_v7", PHASE4_SRC / "engine.py")
sys.modules["engine"] = p4_engine

for _short, _mod in _saved_short.items():
    if _mod is not None:
        sys.modules[_short] = _mod

# Phase6 observability
from observability import (
    FeedbackRecord,
    LLMTelemetry,
    MetricsStore,
    RequestTelemetry,
    UXTelemetry,
)

metrics_store = MetricsStore(max_records=10_000)

# ---------------------------------------------------------------------------
# Initialize engines
# ---------------------------------------------------------------------------
DATASET_PATH = PROJECT_ROOT / "Phase1" / "outputs" / "restaurants_clean.csv"
candidate_engine = p3_engine.CandidateEngine(DATASET_PATH, cache_ttl_seconds=120)
groq_adapter = p4_groq.GroqAdapter()
llm_engine = p4_engine.Phase4Engine(groq_adapter)

# ---------------------------------------------------------------------------
# Normalizer
# ---------------------------------------------------------------------------
import re  # noqa: E402

LOCATION_ALIASES = {
    "blr": "bangalore",
    "bengaluru": "bangalore",
    "new delhi": "delhi",
    "ncr": "delhi ncr",
}

BUDGET_ALIASES = {
    "cheap": "low",
    "budget": "low",
    "affordable": "low",
    "moderate": "medium",
    "mid": "medium",
    "expensive": "high",
    "premium": "high",
    "luxury": "high",
}


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip().lower()


def _normalize_location(value: str) -> str:
    key = _normalize_text(value)
    return LOCATION_ALIASES.get(key, key)


def _normalize_budget(value: str) -> str:
    key = _normalize_text(value)
    if key in {"low", "medium", "high"}:
        return key
    return BUDGET_ALIASES.get(key, key)


def _normalize_cuisine(value: str) -> str:
    return _normalize_text(value)


def _normalize_tags(tags: List[str]) -> List[str]:
    out = []
    seen = set()
    for tag in tags:
        t = _normalize_text(tag)
        if not t:
            continue
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out


def _cors_origins() -> List[str]:
    raw = os.getenv("CORS_ORIGINS", "").strip()
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    return [
        "http://localhost:8080",
        "http://localhost:3000",
        "http://localhost:8082",
    ]


# ---------------------------------------------------------------------------
# FastAPI app with Phase7 hardening
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Phase7 Hardened Recommendation API",
    version="2.0.0",
    docs_url="/v1/docs",
    redoc_url="/v1/redoc",
)

# Security headers middleware
app.add_middleware(SecurityHeadersMiddleware)

# CORS — configurable via CORS_ORIGINS (comma-separated) for Render / Vercel
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Retry-After", "X-Request-ID"],
    max_age=600,
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError):
    metrics_store.record_error(
        request_id=str(uuid.uuid4()),
        error_type="VALIDATION_ERROR",
        message=str(exc),
    )
    details = []
    for err in exc.errors():
        loc = ".".join(str(part) for part in err.get("loc", []) if part != "body")
        details.append(
            ErrorDetail(field=loc or "body", message=err.get("msg", "invalid value"))
        )
    payload = ErrorResponse(
        code="VALIDATION_ERROR",
        message="Request validation failed",
        details=details,
    )
    return JSONResponse(status_code=400, content=payload.model_dump())


# ---------------------------------------------------------------------------
# Public endpoints (no auth required)
# ---------------------------------------------------------------------------
@app.get("/v1/health")
async def health():
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "2.0.0",
        "circuit_breaker": llm_circuit_breaker.state.value,
    }


@app.get("/v1/auth/status", response_model=AuthStatusResponse)
async def auth_status(request: Request):
    try:
        meta = api_key_auth(request)
        return AuthStatusResponse(
            authenticated=True,
            roles=meta.get("roles", []),
            rate_limit={"rate": meta.get("rate"), "capacity": meta.get("capacity")},
        )
    except Exception:
        return AuthStatusResponse(
            authenticated=False,
            roles=[],
            rate_limit={"rate": 0, "capacity": 0},
        )


# ---------------------------------------------------------------------------
# Protected endpoints
# ---------------------------------------------------------------------------
@app.post("/v1/recommendations")
async def create_recommendation(
    payload: RecRequest,
    request: Request,
    _rate=Depends(rate_limit_dependency),
    _auth=Depends(api_key_auth),
    _cb=Depends(circuit_breaker_dependency),
):
    start_time = time.time()
    request_id = str(uuid.uuid4())

    # Request deduplication
    body_bytes = await request.body()
    dedup_key = deduplicator._key(request, body_bytes)
    is_first = deduplicator.start(dedup_key)

    if not is_first:
        # Wait for in-flight request to complete (up to 30s)
        for _ in range(300):
            cached = deduplicator.get_response(dedup_key)
            if cached is not None:
                dedup_key_to_remove = dedup_key
                # Don't remove here; let the first request handle cleanup
                return cached
            await asyncio.sleep(0.1)
        # Timeout - proceed with fresh request

    try:
        # Normalize inputs
        location = _normalize_location(payload.location)
        budget = _normalize_budget(payload.budget)
        cuisine = _normalize_cuisine(payload.cuisine)
        tags = _normalize_tags(payload.tags or [])

        # Phase 3: Candidate retrieval
        pref3 = p3_models.PreferenceRequest(
            location=location,
            budget=budget,
            cuisine=cuisine,
            min_rating=payload.minRating,
            tags=tags,
            top_k=payload.topK,
        )
        phase3_result = candidate_engine.retrieve(pref3)
        candidates_raw = phase3_result.get("candidates", [])
        cache_hit = phase3_result.get("cacheHit", False)

        # Convert to Phase4 candidates
        phase4_candidates = []
        for c in candidates_raw:
            phase4_candidates.append(
                p4_models.Candidate(
                    restaurant_id=c["restaurant_id"],
                    name=c["name"],
                    location=c["location"],
                    cuisine=c["cuisine"],
                    rating=c["rating"],
                    avg_cost_for_two=c["avg_cost_for_two"],
                    budget_band=c["budget_band"],
                    score=c["score"],
                    reason=c.get("reason", ""),
                )
            )

        # Phase 4: LLM recommendation (with circuit breaker)
        pref4 = p4_models.Preference(
            location=location,
            budget=budget,
            cuisine=cuisine,
            min_rating=payload.minRating,
            tags=tags,
        )

        async def _llm_call():
            return llm_engine.generate(
                preference=pref4,
                candidates=phase4_candidates,
                top_k=payload.topK,
            )

        try:
            phase4_result = await _cb.call(_llm_call)
        except Exception as cb_exc:
            # Circuit breaker open or LLM failure - use fallback
            fb = p4_fallback.fallback_recommendations(candidates=phase4_candidates, top_k=payload.topK)
            phase4_result = {
                "recommendations": fb["recommendations"],
                "summary": fb["summary"],
                "used_fallback": True,
                "fallback_reason": f"circuit_breaker_or_llm_error: {cb_exc}",
                "llm_telemetry": [],
            }

        # Enrich recommendations
        candidate_map = {c.restaurant_id: c for c in phase4_candidates}
        enriched_recs: List[RecommendationItem] = []
        for rec in phase4_result["recommendations"]:
            cand = candidate_map.get(rec.restaurant_id)
            if cand:
                enriched_recs.append(
                    RecommendationItem(
                        rank=rec.rank,
                        restaurantId=rec.restaurant_id,
                        name=cand.name,
                        cuisine=cand.cuisine,
                        rating=cand.rating,
                        estimatedCost=cand.avg_cost_for_two,
                        reason=rec.reason,
                    )
                )

        latency_ms = int((time.time() - start_time) * 1000)
        used_fallback = phase4_result.get("used_fallback", False)

        response = RecommendationResponse(
            requestId=request_id,
            recommendations=enriched_recs,
            summary=phase4_result.get("summary", ""),
            usedFallback=used_fallback,
            latencyMs=latency_ms,
            fallbackReason=phase4_result.get("fallback_reason"),
            circuitBreakerState=llm_circuit_breaker.state.value,
        )

        # Telemetry
        metrics_store.record_request(
            RequestTelemetry(
                request_id=request_id,
                timestamp=datetime.now(timezone.utc).isoformat(),
                location=location,
                budget=budget,
                cuisine=cuisine,
                min_rating=payload.minRating,
                tags=tags,
                top_k=payload.topK,
                latency_ms=latency_ms,
                used_fallback=used_fallback,
                fallback_reason=phase4_result.get("fallback_reason"),
                candidate_count=len(candidates_raw),
                cache_hit=cache_hit,
            )
        )

        for llm_t in phase4_result.get("llm_telemetry", []):
            metrics_store.record_llm(
                LLMTelemetry(
                    request_id=request_id,
                    latency_ms=llm_t.get("latency_ms", 0),
                    prompt_tokens=llm_t.get("prompt_tokens", 0),
                    completion_tokens=llm_t.get("completion_tokens", 0),
                    total_tokens=llm_t.get("total_tokens", 0),
                    model=llm_t.get("model", ""),
                    attempt=llm_t.get("attempt", 1),
                )
            )

        deduplicator.finish(dedup_key, response)
        return response

    except HTTPException:
        deduplicator.remove(dedup_key)
        raise
    except Exception as exc:
        deduplicator.remove(dedup_key)
        metrics_store.record_error(request_id, type(exc).__name__, str(exc))
        raise HTTPException(status_code=500, detail=f"Internal error: {exc}")


@app.post("/v1/feedback")
async def create_feedback(
    payload: FeedbackRequest,
    _rate=Depends(rate_limit_dependency),
    _auth=Depends(api_key_auth),
):
    metrics_store.record_feedback(
        FeedbackRecord(
            request_id=payload.requestId,
            restaurant_id=payload.restaurantId,
            helpful=payload.helpful,
            comment=payload.comment,
        )
    )
    return {
        "requestId": payload.requestId,
        "restaurantId": payload.restaurantId,
        "helpful": payload.helpful,
        "status": "recorded",
    }


@app.get("/v1/metrics")
async def metrics(_auth=Depends(require_role("admin"))):
    snapshot = metrics_store.snapshot()
    return {
        "service": "phase7-recommendation-api",
        "cacheSize": candidate_engine.cache.size(),
        "circuitBreaker": llm_circuit_breaker.state.value,
        **snapshot,
    }


@app.get("/v1/observability/requests")
async def recent_requests(
    limit: int = 20,
    _auth=Depends(require_role("admin")),
):
    return {"requests": metrics_store.export_requests(limit=limit)}


@app.get("/v1/observability/feedback")
async def recent_feedback(
    limit: int = 20,
    _auth=Depends(require_role("admin")),
):
    return {"feedback": metrics_store.export_feedback(limit=limit)}


# Legacy redirect (unversioned -> v1 for backward compat during migration)
@app.api_route("/recommendations", methods=["POST"])
async def legacy_recommendations(request: Request):
    return await create_recommendation(
        payload=RecRequest(**await request.json()),
        request=request,
        _rate=await rate_limit_dependency(request),
        _auth=api_key_auth(request),
        _cb=await circuit_breaker_dependency(),
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
