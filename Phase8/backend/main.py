from __future__ import annotations

import os
import sys
import csv
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

# Phase 8 modules (import BEFORE adding Phase 7 path to avoid name collision)
from schemas import (
    FavoriteCreate,
    FavoriteItem,
    FeedbackRequest,
    HistoryEntry,
    RecommendationRequest,
    RecommendationResponse,
    UserProfile,
    UserProfileUpdate,
)
import user_store

# Phase 7 base URL (the hardened API gateway).
PHASE7_BASE = os.getenv("PHASE7_BASE", "http://localhost:8001")
DEFAULT_API_KEY = os.getenv("PHASE8_DEFAULT_KEY", "phase7-demo-key")

# Restaurant dataset (used for the locations dropdown).
DATASET_PATH = Path(
    os.getenv(
        "PHASE8_DATASET",
        str(Path(__file__).resolve().parents[2] / "Phase1" / "outputs" / "restaurants_clean.csv"),
    )
)
_LOCATIONS_CACHE: Optional[List[str]] = None
_CUISINES_CACHE: Optional[List[str]] = None


def _load_locations() -> List[str]:
    global _LOCATIONS_CACHE
    if _LOCATIONS_CACHE is not None:
        return _LOCATIONS_CACHE
    locs: set[str] = set()
    try:
        with DATASET_PATH.open("r", encoding="utf-8", newline="") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                value = (row.get("location") or "").strip()
                if value:
                    locs.add(value)
    except FileNotFoundError:
        pass
    _LOCATIONS_CACHE = sorted(locs)
    return _LOCATIONS_CACHE


def _load_cuisines() -> List[str]:
    global _CUISINES_CACHE
    if _CUISINES_CACHE is not None:
        return _CUISINES_CACHE
    cuisines: set[str] = set()
    try:
        with DATASET_PATH.open("r", encoding="utf-8", newline="") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                raw = (row.get("cuisine") or "").strip()
                for part in raw.split(","):
                    value = part.strip()
                    if value and value.lower() != "nan":
                        cuisines.add(value)
    except FileNotFoundError:
        pass
    _CUISINES_CACHE = sorted(cuisines, key=str.lower)
    return _CUISINES_CACHE


def _cors_origins() -> List[str]:
    raw = os.getenv("CORS_ORIGINS", "").strip()
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    return ["*"]


app = FastAPI(title="Phase 8 - Personalization API", version="8.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _auth_headers(request: Request) -> Dict[str, str]:
    """Forward Authorization header to Phase 7, falling back to a demo key."""
    auth = request.headers.get("Authorization") or f"Bearer {DEFAULT_API_KEY}"
    return {"Authorization": auth, "Content-Type": "application/json"}


# -------------------------------------------------------------------------
# Health
# -------------------------------------------------------------------------
@app.get("/api/v1/health")
async def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "service": "phase8",
        "phase7_base": PHASE7_BASE,
        "timestamp": _utc_now(),
    }


# -------------------------------------------------------------------------
# Locations (drop-down source for the frontend)
# -------------------------------------------------------------------------
@app.get("/api/v1/locations")
async def locations() -> Dict[str, Any]:
    items = _load_locations()
    return {"count": len(items), "locations": items}


@app.get("/api/v1/cuisines")
async def cuisines() -> Dict[str, Any]:
    items = _load_cuisines()
    return {"count": len(items), "cuisines": items}


# -------------------------------------------------------------------------
# User profile
# -------------------------------------------------------------------------
@app.get("/api/v1/users/{user_id}", response_model=UserProfile)
async def get_user(user_id: str) -> UserProfile:
    return UserProfile(**user_store.get_user(user_id))


@app.put("/api/v1/users/{user_id}", response_model=UserProfile)
async def update_user(user_id: str, body: UserProfileUpdate) -> UserProfile:
    return UserProfile(**user_store.update_user(user_id, body.name, body.email))


# -------------------------------------------------------------------------
# History
# -------------------------------------------------------------------------
@app.get("/api/v1/history")
async def get_history(userId: str = Query("anonymous"), limit: int = Query(20, ge=1, le=100)) -> List[Dict[str, Any]]:
    return user_store.get_history(userId, limit)


# -------------------------------------------------------------------------
# Favorites
# -------------------------------------------------------------------------
@app.get("/api/v1/favorites")
async def list_favorites(userId: str = Query("anonymous")) -> List[Dict[str, Any]]:
    return user_store.list_favorites(userId)


@app.post("/api/v1/favorites")
async def add_favorite(body: FavoriteCreate) -> Dict[str, Any]:
    return user_store.add_favorite(
        body.userId,
        {
            "restaurantId": body.restaurantId,
            "name": body.name,
            "cuisine": body.cuisine,
            "rating": body.rating,
            "estimatedCost": body.estimatedCost,
        },
    )


@app.delete("/api/v1/favorites/{restaurant_id}")
async def delete_favorite(restaurant_id: str, userId: str = Query("anonymous")) -> Dict[str, Any]:
    ok = user_store.remove_favorite(userId, restaurant_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Favorite not found")
    return {"status": "removed", "restaurantId": restaurant_id}


# -------------------------------------------------------------------------
# Recommendations (proxied to Phase 7)
# -------------------------------------------------------------------------
@app.post("/api/v1/recommendations")
async def recommendations(body: RecommendationRequest, request: Request) -> Response:
    payload = body.model_dump()
    user_id = payload.pop("userId", "anonymous")

    headers = _auth_headers(request)
    url = f"{PHASE7_BASE}/v1/recommendations"

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(url, headers=headers, json=payload)
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Phase 7 unreachable: {e}")

    # Save successful results into history.
    if r.status_code == 200:
        try:
            data = r.json()
            user_store.add_history(
                {
                    "requestId": data.get("requestId", str(uuid.uuid4())),
                    "timestamp": _utc_now(),
                    "userId": user_id,
                    "location": payload.get("location", ""),
                    "budget": payload.get("budget", ""),
                    "cuisine": payload.get("cuisine", ""),
                    "minRating": payload.get("minRating", 0.0),
                    "recommendations": data.get("recommendations", []),
                }
            )
        except Exception:
            pass

    return Response(
        content=r.content,
        status_code=r.status_code,
        media_type=r.headers.get("content-type", "application/json"),
    )


@app.post("/api/v1/feedback")
async def feedback(body: FeedbackRequest, request: Request) -> Response:
    payload = body.model_dump()
    payload.pop("userId", None)
    headers = _auth_headers(request)
    url = f"{PHASE7_BASE}/v1/feedback"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(url, headers=headers, json=payload)
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Phase 7 unreachable: {e}")

    return Response(
        content=r.content,
        status_code=r.status_code,
        media_type=r.headers.get("content-type", "application/json"),
    )


@app.get("/api/v1/auth/status")
async def auth_status(request: Request) -> Response:
    headers = _auth_headers(request)
    url = f"{PHASE7_BASE}/v1/auth/status"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(url, headers=headers)
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Phase 7 unreachable: {e}")

    return Response(
        content=r.content,
        status_code=r.status_code,
        media_type=r.headers.get("content-type", "application/json"),
    )
