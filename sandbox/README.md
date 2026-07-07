# TIPT Sandbox

This folder contains the Next.js demo app for paid-content flows using the local extension and API.

## Setup

From repository root:

```bash
pnpm install
```

## Build Process

```bash
pnpm run build
```

## Architecture

- App: Next.js frontend rooted in `src/app`.
- SDK: Uses `@tipt/sdk` extension client (`createExtensionClient`).
- API target: `/api` by default (rewritten to hosted API), or local API via `NEXT_PUBLIC_API_BASE_URL`.

Project commands:

- `pnpm run dev`
- `pnpm run build`
- `pnpm run start`
- `pnpm run typecheck`

## Running Locally With Extension + Local API

### 1) Build and load extension (from repo root)

```bash
pnpm --filter @tipt/extension run build
```

Open `chrome://extensions`, enable Developer mode, click Load unpacked, and select `extension/dist`.

### 2) Run local API on port 5000 (from repo root)

PowerShell:

```powershell
$env:PORT=5000; pnpm run dev:api
```

bash:

```bash
PORT=5000 pnpm run dev:api
```

### 3) Run sandbox against local API (from repo root)

PowerShell:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL="http://localhost:5000/api"; pnpm run dev:sandbox
```

bash:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api pnpm run dev:sandbox
```

### 4) Open the app

Next.js prints the local URL (usually `http://localhost:3000`).

Routes:

- `/vod`
- `/news`
- `/image-gen`

## API Target Behavior

By default, sandbox requests to `/api/*` are rewritten to the hosted API:

```bash
/api/* -> https://tiptapi.vercel.app/api/*
```

To use local API, set `NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api`.

Optional: route client to same-origin `/api` instead:

```bash
NEXT_PUBLIC_API_BASE_URL=/api
```

## Deploying To Vercel

1. Import the repository into Vercel.
2. Keep the project root at `sandbox/`.
3. Ensure the build command is `pnpm run build`.
4. Set `NEXT_PUBLIC_API_BASE_URL` only if you need a non-default API host.

The Next config rewrites `/api/*` to `https://tiptapi.vercel.app/api/*`, so no SPA fallback rewrite is needed.

## Troubleshooting

- If install fails with "Use pnpm instead", run with `pnpm` only (not npm/yarn).
