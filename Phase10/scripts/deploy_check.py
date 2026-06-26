#!/usr/bin/env python3
"""
DineWise AI - Phase 10 Vercel Deployment Smoke Test Script

This script verifies a deployed DineWise AI frontend instance (on Vercel or locally)
by checking essential routes, headers (security, caching), and PWA assets.
It uses only Python standard libraries and is safe for Windows console output.
"""

import argparse
import sys
import urllib.request
import urllib.error
from typing import Dict, Tuple, List

# Colors for terminal output
RESET = "\033[0m"
BOLD = "\033[1m"
GREEN = "\033[32m"
RED = "\033[31m"
YELLOW = "\033[33m"
CYAN = "\033[36m"

# Safe console status symbols
SYM_PASS = f"{GREEN}[PASS]{RESET}"
SYM_FAIL = f"{RED}[FAIL]{RESET}"
SYM_WARN = f"{YELLOW}[WARN]{RESET}"


def print_header(title: str) -> None:
    print(f"\n{BOLD}{CYAN}{'=' * 60}{RESET}")
    print(f"{BOLD}{CYAN}{title.center(60)}{RESET}")
    print(f"{BOLD}{CYAN}{'=' * 60}{RESET}\n")


def check_url(url: str, expected_status: int = 200) -> Tuple[bool, int, Dict[str, str]]:
    """Fetches a URL and returns status, headers, and success status."""
    try:
        # Create request with a User-Agent to bypass simple blocks
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "DineWise-Smoke-Tester/1.0"}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            headers = {k.lower(): v for k, v in response.getheaders()}
            return response.status == expected_status, response.status, headers
    except urllib.error.HTTPError as e:
        headers = {k.lower(): v for k, v in e.headers.items()}
        return e.code == expected_status, e.code, headers
    except urllib.error.URLError as e:
        print(f"{BOLD}{RED}[ERROR] Connection Error for {url}:{RESET} {e.reason}")
        return False, 0, {}
    except Exception as e:
        print(f"{BOLD}{RED}[ERROR] Unexpected Error for {url}:{RESET} {str(e)}")
        return False, 0, {}


def run_checks(base_url: str) -> bool:
    base_url = base_url.rstrip("/")
    all_passed = True

    # 1. Check Homepage
    print(f"{BOLD}1. Checking Homepage...{RESET}")
    ok, code, headers = check_url(base_url)
    if ok:
        print(f"   {SYM_PASS} Homepage status is 200 OK")
    else:
        print(f"   {SYM_FAIL} Homepage returned status {code} (Expected 200)")
        all_passed = False

    # 2. Check Security Headers on Homepage
    print(f"\n{BOLD}2. Checking Security Headers on Homepage...{RESET}")
    security_headers = [
        ("x-frame-options", "DENY"),
        ("x-content-type-options", "nosniff"),
        ("referrer-policy", "strict-origin-when-cross-origin")
    ]
    for header, expected_val in security_headers:
        val = headers.get(header)
        if val:
            if expected_val.lower() in val.lower():
                print(f"   {SYM_PASS} {header}: {val}")
            else:
                print(f"   {SYM_WARN} {header}: {val} (Expected containing: {expected_val})")
        else:
            print(f"   {SYM_FAIL} {header} is missing!")
            all_passed = False

    csp = headers.get("content-security-policy")
    if csp:
        print(f"   {SYM_PASS} content-security-policy: {csp[:60]}...")
    else:
        print(f"   {SYM_FAIL} content-security-policy is missing!")
        all_passed = False

    # 3. Check PWA Manifest
    print(f"\n{BOLD}3. Checking PWA Manifest...{RESET}")
    manifest_url = f"{base_url}/manifest.json"
    ok, code, m_headers = check_url(manifest_url)
    if ok:
        print(f"   {SYM_PASS} Manifest status is 200 OK")
        cc = m_headers.get("cache-control", "")
        if "max-age=0" in cc or "no-cache" in cc or "must-revalidate" in cc:
            print(f"   {SYM_PASS} Manifest Caching: {cc} (Bypasses Vercel cache correctly)")
        else:
            print(f"   {SYM_WARN} Manifest Caching: {cc or 'None'} (Recommended to set max-age=0 or no-cache)")
    else:
        print(f"   {SYM_FAIL} Manifest returned status {code} (Expected 200)")
        all_passed = False

    # 4. Check Service Worker
    print(f"\n{BOLD}4. Checking Service Worker...{RESET}")
    sw_url = f"{base_url}/sw.js"
    ok, code, sw_headers = check_url(sw_url)
    if ok:
        print(f"   {SYM_PASS} Service Worker status is 200 OK")
        cc = sw_headers.get("cache-control", "")
        if "max-age=0" in cc or "no-cache" in cc or "must-revalidate" in cc:
            print(f"   {SYM_PASS} Service Worker Caching: {cc} (Bypasses Vercel cache correctly)")
        else:
            print(f"   {SYM_WARN} Service Worker Caching: {cc or 'None'} (Recommended to set max-age=0 or no-cache)")
        
        swa = sw_headers.get("service-worker-allowed", "")
        if swa == "/":
            print(f"   {SYM_PASS} Service-Worker-Allowed: {swa}")
        else:
            print(f"   {SYM_WARN} Service-Worker-Allowed: {swa or 'None'} (Recommended: /)")
    else:
        print(f"   {SYM_FAIL} Service Worker returned status {code} (Expected 200)")
        all_passed = False

    # 5. Check API Gateway Connection Info (Proxy Test)
    print(f"\n{BOLD}5. Checking API Gateway Integration...{RESET}")
    api_url = f"{base_url}/api/v1/health"
    # Note: Phase 8 API might return 401 Unauthorized if API key is not present,
    # but that still proves the rewrite routed the request successfully.
    # Therefore, we accept 200, 401, or 403 as successful connection.
    try:
        req = urllib.request.Request(
            api_url,
            headers={"User-Agent": "DineWise-Smoke-Tester/1.0"}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            code = response.status
    except urllib.error.HTTPError as e:
        code = e.code
    except urllib.error.URLError:
        code = 0

    if code in [200, 401, 403]:
        print(f"   {SYM_PASS} API rewrite /api/v1/health responded with status {code} (Integration OK)")
    elif code == 404:
        print(f"   {SYM_FAIL} API rewrite returned 404. Rewrites might not be configured or backend is down.")
        all_passed = False
    else:
        print(f"   {SYM_WARN} API rewrite returned status {code or 'Connection Refused'} (Verify backend health)")

    return all_passed


def main() -> None:
    parser = argparse.ArgumentParser(description="Smoke test DineWise AI Vercel frontend.")
    parser.add_argument(
        "--url",
        default="http://localhost:8082",
        help="The full base URL of the deployed application (default: http://localhost:8082)"
    )
    args = parser.parse_args()

    print_header("DineWise AI - Vercel Deployment Test")
    print(f"Target URL: {BOLD}{CYAN}{args.url}{RESET}\n")

    success = run_checks(args.url)

    print(f"\n{BOLD}{'=' * 60}{RESET}")
    if success:
        print(f"{BOLD}{GREEN}[SUCCESS] Smoke test passed successfully! Deployment is healthy.{RESET}")
        sys.exit(0)
    else:
        print(f"{BOLD}{RED}[FAILURE] Smoke test encountered warnings/failures. See details above.{RESET}")
        sys.exit(1)


if __name__ == "__main__":
    main()
