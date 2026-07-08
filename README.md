# TIPT Monorepo

This repository contains three projects for Lightning payment flows:

- extension: Browser extension wallet and payment approval UX
- sdk: Browser SDK that handles 402 Payment Required retries via extension events
- web: Main Next.js app with landing page (/), API docs (/api), and demo sandbox (/sandbox)

## Repository Layout

- extension: Chrome extension (Vite + React + TypeScript)
- sdk: Publishable library package (tsup + TypeScript + Vitest)
- web: Main web app (Next.js + TypeScript)
- package.json: Root monorepo scripts
- pnpm-workspace.yaml: Workspace package configuration

## How The Pieces Fit Together

1. The web app (or another client) calls /api endpoints and uses the sdk package.
2. The sdk detects 402 Payment Required responses and builds a wallet proxy whose calls are forwarded to the extension over window events (mpp:wallet-rpc / mpp:wallet-rpc-response).
3. The extension prompts the user to approve, pays the invoice with its wallet, and returns raw wallet results.
4. The sdk resolves payment preimages, builds credentials, and retries the original request.

## Prerequisites

- Node.js 18+
- pnpm 11+
- Chrome (for extension development)

## Install Dependencies

From repository root:

```bash
pnpm install
```

## Monorepo Scripts (Root)

```bash
pnpm run build
pnpm run typecheck
pnpm run test
pnpm run lint
```

Development scripts:

```bash
pnpm run dev:web
pnpm run dev:sdk
pnpm run dev:extension
```

## End-to-End Local Setup

### 1) Install dependencies

```bash
pnpm install
```

### 2) Configure web app environment

```bash
cp web/.env.example web/.env.local
```

Then fill in at least:

- MNEMONIC
- MPP_SECRET_KEY
- AI_INTEGRATIONS_GEMINI_API_KEY

### 3) Build SDK once

```bash
pnpm --filter @tipt/sdk run build
```

### 4) Build and load extension in Chrome

```bash
pnpm --filter @tipt/extension run build
```

Then in Chrome:

1. Open chrome://extensions
2. Enable Developer mode
3. Click Load unpacked
4. Select extension/dist

After each extension change, rebuild and click Reload on the extension card.

### 5) Run web app

```bash
pnpm run dev:web
```

Open the URL printed by Next.js (usually http://localhost:3000).

### 6) Validate routes

- /: landing page for SDK/API/Sandbox
- /api: API documentation page
- /sandbox: interactive payment demos

### 7) First-run wallet flow

1. Open extension popup
2. Create or restore wallet
3. Unlock with PIN
4. Approve payments from web sandbox prompts

## Package-Specific Commands

### extension

```bash
pnpm --filter @tipt/extension run dev
pnpm --filter @tipt/extension run typecheck
pnpm --filter @tipt/extension run build
pnpm --filter @tipt/extension run preview
```

### sdk

```bash
pnpm --filter @tipt/sdk run dev
pnpm --filter @tipt/sdk run typecheck
pnpm --filter @tipt/sdk run test
pnpm --filter @tipt/sdk run build
```

### web

```bash
pnpm --filter @tipt/web run dev
pnpm --filter @tipt/web run build
pnpm --filter @tipt/web run typecheck
pnpm --filter @tipt/web run start
```

## Notes

- web depends on sdk via workspace linking, so SDK changes are available without publishing.
- sdk is self-contained in this monorepo and is consumed by web via workspace linking (@tipt/sdk).
- If extension behavior changes, rebuild and reload the unpacked extension in Chrome.
