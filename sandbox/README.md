# TIPT Sandbox

This folder contains a single Next.js app for Lightning 402 payment demos.

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

The sandbox runs as a client-first app that calls `/api` by default and proxies that route to the hosted API in local development:

- **App**: Next.js frontend rooted in `src/app`.
- **API**: `/api` by default, proxied to `https://tiptapi.vercel.app/api` in local development.

Project-level standardized commands:

- `pnpm run dev`
- `pnpm run build`
- `pnpm run preview`

## Running the Application Locally

### App

The app works standalone and calls `/api` by default:

```bash
pnpm run dev
```

Next.js will print the local URL. The app includes two experiments:

- `/vod` (Video On-Demand)
- `/news` (News Article Paywall)

Optional: override the API base URL for client builds/runs:

```bash
NEXT_PUBLIC_API_BASE_URL=/api
```

Optional: override the sandbox dev server port (defaults to `5173`):

```bash
PORT=5173
```

## Deploying To Vercel

1. Import the repository into Vercel.
2. Keep the project root at `sandbox/`.
3. Ensure the build command is `pnpm run build`.
4. Set `NEXT_PUBLIC_API_BASE_URL` only if you need a non-default API host.

The Next config rewrites `/api/*` to `https://tiptapi.vercel.app/api/*`, so no SPA fallback rewrite is needed.

## Troubleshooting

- If install fails with "Use pnpm instead", run with `pnpm` only (not npm/yarn).
