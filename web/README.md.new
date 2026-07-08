# TIPT Web

This folder contains the main Next.js web app for TIPT.

It serves:

- /: landing page (SDK + API + sandbox overview)
- /api: API documentation page
- /api/*: 402-enabled API routes
- /sandbox/*: interactive payment demos

## Setup

From repository root:

```bash
pnpm install
cp web/.env.example web/.env.local
```

Required environment values:

- MNEMONIC
- MPP_SECRET_KEY

For image generation also set:

- AI_INTEGRATIONS_GEMINI_API_KEY

## Commands

From repository root:

```bash
pnpm run dev:web
pnpm --filter @tipt/web run build
pnpm --filter @tipt/web run start
pnpm --filter @tipt/web run typecheck
```

## Local Extension Integration

1. Build extension:

```bash
pnpm --filter @tipt/extension run build
```

2. Load extension/dist in chrome://extensions (Developer mode).

3. Run the web app:

```bash
pnpm run dev:web
```

4. Open http://localhost:3000 and test /sandbox flows.

## Deployment

When deploying to Vercel, set project root to web/.
