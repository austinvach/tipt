# MPP API

A [Next.js](https://nextjs.org) (App Router) app whose premium API endpoints are gated behind Lightning payments. Protected routes reply with `HTTP 402 Payment Required` plus a `WWW-Authenticate` invoice challenge (Machine Payable Protocol) and unlock once payment clears.

## Prerequisites

- Node.js 24+
- pnpm 11+

## Setup

```bash
pnpm install
cp .env.example .env   # then fill in real values (a working local .env is already provided)
```

Environment variables (see `.env.example`):

| Variable | Required | Purpose |
| --- | --- | --- |
| `MNEMONIC` | yes | Lightning MPP payment mnemonic |
| `MPP_SECRET_KEY` | yes | Lightning MPP secret key |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | yes* | Gemini API base URL (*only needed for `/api/image`) |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | yes* | Gemini API key (*only needed for `/api/image`) |
| `LOG_LEVEL` | no | Log level |

Next.js loads `.env` automatically for both `dev` and `build`.

## Run locally

```bash
pnpm dev      # http://localhost:3000
```

- Landing / API reference: http://localhost:3000
- Health: http://localhost:3000/api/health

## API

| Method | Route | Gated |
| --- | --- | --- |
| GET | `/api/health` | no |
| GET | `/api/movies` | no |
| GET | `/api/movies/:id` | 402 |
| GET | `/api/news` | no |
| GET | `/api/news/:id` | 402 |
| POST | `/api/image` (`{ "prompt": "..." }`) | 402 |

Gated routes return `402` with a `WWW-Authenticate` Lightning invoice until paid.

## Build & checks

```bash
pnpm build       # production build (also type-checks)
pnpm start       # run the production build
pnpm typecheck   # tsc --noEmit
```

## Project structure

```
app/
  page.tsx            # landing / API reference
  layout.tsx
  globals.css
  api/
    health/route.ts
    movies/route.ts
    movies/[id]/route.ts
    news/route.ts
    news/[id]/route.ts
    image/route.ts
lib/
  payments.ts         # MPP charge / 402 gating (Web Request/Response)
  gemini.ts           # Gemini image generation
  data/               # movies + news content
```

## Deploy to Vercel

Vercel auto-detects Next.js — no config needed. Set the environment variables above in the Vercel project, then:

```bash
vercel        # preview
vercel --prod # production
```

> Payment methods are provided by `@tipt/sdk` (workspace package). Server routes run on the Node.js runtime.
