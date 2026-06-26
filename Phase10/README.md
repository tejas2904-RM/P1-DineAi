# Phase 10 — Frontend Deployment on Vercel

Phase 10 covers the deployment of the Next.js 14 frontend (`Phase8/frontend`) to [Vercel](https://vercel.com). It is designed to work in tandem with the Render backend services deployed in **Phase 9**, offering a fully-managed production environment.

```
Browser  ──►  Vercel (Next.js Edge CDN)
                  │
                  ├── (Option 1: Rewrite Proxy /api/*) ──► Render Phase 8 API ──► Render Phase 7 API
                  └── (Option 2: Direct Client Calls)  ──► Render Phase 8 API
```

## Folder layout

```
Phase10/
  README.md           # This deployment guide
  vercel.json         # Reference security headers & caching configuration
  .env.example        # Environment variable checklist
  scripts/
    deploy_check.py   # Post-deployment health, security, & PWA check script
```

## Step 1: Prepare the Codebase

Make sure all changes in `Phase8/frontend` (including `vercel.json` and `next.config.js`) are committed and pushed to your GitHub repository.

## Step 2: Vercel Project Setup

1. Log in to [Vercel](https://vercel.com).
2. Click **Add New...** → **Project**.
3. Select your repository.
4. Configure the following project settings:

   | Setting | Value | Description |
   | :--- | :--- | :--- |
   | **Framework Preset** | Next.js | Automatically detected by Vercel |
   | **Root Directory** | `Phase8/frontend` | Crucial! Points Vercel to the Next.js subfolder |
   | **Build Command** | `npm run build` | Default compilation command |
   | **Output Directory** | `.next` | Default App Router compile target |
   | **Node.js Version** | `18.x` or `20.x` | Modern runtime requirements |

## Step 3: Configure Environment Variables

Choose one of the two API routing strategies below, then set the corresponding environment variables in the Vercel project dashboard (**Settings** → **Environment Variables**):

### Option 1: Rewrite Proxy (Recommended)

In this setup, Vercel proxies all `/api/*` traffic to the Render Phase 8 backend on the server side. This eliminates CORS configuration issues and prevents direct exposure of backend API endpoints to the client.

- **Vercel Env Var:**
  - Name: `BACKEND_API_BASE`
  - Value: `https://your-phase8-render-service.onrender.com` (Do not include `/api/v1` or a trailing slash).

*Note: Next.js will automatically proxy `/api/v1/recommendations` to `https://your-phase8-render-service.onrender.com/api/v1/recommendations`.*

### Option 2: Direct Client Calls

In this setup, the browser directly requests the Render backend. This requires enabling CORS on the Render server for your Vercel deployment URL.

- **Vercel Env Var:**
  - Name: `NEXT_PUBLIC_API_BASE`
  - Value: `https://your-phase8-render-service.onrender.com/api/v1` (Includes the `/api/v1` path).

> [!WARNING]
> If using Option 2, you **must** update the `CORS_ORIGINS` environment variable on your Render Phase 8 service to include your Vercel deployment domain (e.g., `CORS_ORIGINS=https://dinewise-ai.vercel.app`).

## Step 4: Verify Caching & Csp Headers

The configuration in `Phase8/frontend/next.config.js` sets up:
1. **Strict security headers:** Content Security Policy (CSP), X-Frame-Options, Referrer-Policy.
2. **PWA caching exceptions:** Disables caching for `sw.js` and `manifest.json` (using `max-age=0, must-revalidate`) to guarantee users always receive updates immediately when redeploying.
3. **API Proxy Rewrite:** Rewrites `/api/:path*` to `BACKEND_API_BASE` for server-side proxying.

## Step 5: Post-Deployment Smoke Test

Once the deployment finishes and Vercel assigns a live URL, use the smoke-test utility to verify the deployment's status, PWA settings, and security headers:

```powershell
python Phase10/scripts/deploy_check.py --url https://your-dinewise-app.vercel.app
```

## Related documentation

- [architecture.md](file:///c:/P1_RRS/Docs/architecture.md) — Phase-wise deployment topology.
- [Phase9/README.md](file:///c:/P1_RRS/Phase9/README.md) — Backend deployment on Render.
