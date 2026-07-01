# TIPT Sandbox

This folder contains a single Vite + React app for Lightning 402 payment demos.

## Setup

From this folder:

```bash
pnpm install
```

## Build Process

```bash
pnpm run build
```

## Architecture

The sandbox currently runs as a client-first app that calls `/api` on the same origin:

- **App**: React/Vite frontend at repository root.
- **API**: `/api` is proxied/rewritten to `https://mppapi.replit.app/api`.

Project-level standardized commands:

- `pnpm run dev`
- `pnpm run build`
- `pnpm run preview`

## Running the Application Locally

### Client

The client works standalone and calls `/api` by default:

```bash
pnpm run dev
```

Vite will print the local URL. The app includes two experiments:

- `/vod` (Video On-Demand)
- `/news` (News Article Paywall)

Optional: override the API base URL for client builds/runs:

```bash
VITE_API_BASE_URL=/api
```

## Deploying To Vercel

This repo is configured for frontend-only deployment on Vercel.

1. Import the repository into Vercel.
2. Keep the project root at `sandbox/`.
3. Ensure the build command is `pnpm run build`.
4. Ensure output directory is `dist`.
5. Set `VITE_API_BASE_URL` only if you need a non-default API host.

The included `vercel.json` rewrites `/api/*` to the upstream MPP API and handles SPA routes like `/vod` on refresh.

## Troubleshooting

- If install fails with "Use pnpm instead", run with `pnpm` only (not npm/yarn).
