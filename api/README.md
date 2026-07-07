# MPP API

A Next.js (App Router) app whose premium API endpoints are gated behind Payment auth. Protected routes return HTTP 402 with Payment challenges and support both:

- bitcoin/charge (plain BOLT11)
- spark/charge (spark-to-spark)

## Prerequisites

- Node.js 18+
- pnpm 11+

## Setup

```bash
pnpm install
cp .env.example .env
```

Then fill in real values in `.env`.

Environment variables (see `.env.example`):

| Variable | Required | Purpose |
| --- | --- | --- |
| `MNEMONIC` | yes | Wallet mnemonic used for bitcoin/spark charge challenges |
| `MPP_SECRET_KEY` | yes | Payment challenge signing secret |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | yes* | Gemini API base URL (*only needed for `/api/image`) |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | yes* | Gemini API key (*only needed for `/api/image`) |
| `LOG_LEVEL` | no | Log level |

Next.js loads `.env` automatically for both `dev` and `build`.

## Run locally

From repository root, run API on port 5000 so sandbox can target it.

PowerShell:

```powershell
$env:PORT=5000; pnpm run dev:api
```

bash:

```bash
PORT=5000 pnpm run dev:api
```

From this `api` folder directly, you can also run:

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

Gated routes return `402` with one or more `WWW-Authenticate: Payment ...` challenges.

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
