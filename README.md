# TIPT Monorepo

This repository contains three related projects for Lightning payment flows:

- extension: Browser extension wallet and payment approval UX
- sdk: Browser SDK that handles 402 Payment Required retries via extension events
- sandbox: Demo web app for testing paid-content/payment flows against the SDK and extension
- api: Next.js API that serves 402-protected movie/news/image routes

## Repository Layout

- extension: Chrome extension (Vite + React + TypeScript)
- sdk: Publishable library package (tsup + TypeScript + Vitest)
- sandbox: Demo client app (Next.js + TypeScript)
- api: API server (Next.js + TypeScript)
- package.json: Root monorepo scripts
- pnpm-workspace.yaml: Workspace package configuration

## How The Pieces Fit Together

1. A web app (sandbox or another client) calls api endpoints and uses the sdk package.
2. The sdk detects `402 Payment Required` responses and builds a **wallet proxy** whose calls are forwarded to the extension over `window` events (`mpp:wallet-rpc` / `mpp:wallet-rpc-response`).
3. The extension is a thin passthrough: it prompts the user to approve, pays the invoice with its wallet (the seed never leaves the extension), and returns the raw wallet results.
4. The sdk resolves the payment preimage across Lightning and Spark routes, builds the credential, and transparently retries the original request.

> The extension holds the wallet and enforces user approval + spending caps. All
> invoice verification, preimage resolution, and credential building happen
> page-side in the SDK — the extension never interprets the payment.

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

From repository root:

- Build all packages:

```bash
pnpm run build
```

- Typecheck all packages:

```bash
pnpm run typecheck
```

- Run tests where available:

```bash
pnpm run test
```

- Run lint where available:

```bash
pnpm run lint
```

## Development: Run Each Component

Use separate terminals from repository root.

## End-to-End Local Setup (Latest Extension + Sandbox + API)

This is the recommended flow to run everything locally with the latest code.

### 1) Install dependencies

```bash
pnpm install
```

### 2) Configure API environment

```bash
cp api/.env.example api/.env
```

Then fill in at least:

- `MNEMONIC`
- `MPP_SECRET_KEY`

For `/api/image`, also set:

- `AI_INTEGRATIONS_GEMINI_API_KEY`

### 3) Build SDK once

```bash
pnpm --filter @tipt/sdk run build
```

### 4) Build and load the extension in Chrome

```bash
pnpm --filter @tipt/extension run build
```

Then in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `extension/dist`

After each extension change, rebuild and click **Reload** on the extension card.

### 5) Run API locally (port 5000)

```bash
PORT=5000 pnpm run dev:api
```

### 6) Run sandbox against local API

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api pnpm run dev:sandbox
```

Open the sandbox URL printed by Next.js (usually `http://localhost:3000`).

### 7) First-run wallet flow

1. Open the extension popup
2. Create or restore wallet
3. Unlock with PIN
4. Approve payments from sandbox prompts

### 1) SDK watch mode

```bash
pnpm run dev:sdk
```

This keeps sdk builds updated while developing dependent apps.

### 2) Extension dev server

```bash
pnpm run dev:extension
```

For loading in Chrome as an unpacked extension, build it and load the generated output:

```bash
pnpm --filter @tipt/extension run build
```

Then open chrome://extensions, enable Developer mode, click Load unpacked, and select extension/dist.

### 3) Sandbox app

```bash
pnpm run dev:sandbox
```

The sandbox runs as a Next.js app and exposes paid-content demo routes.

By default, sandbox `/api/*` requests are rewritten to the hosted API.
To use your local API instead, run sandbox with:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api pnpm --filter @tipt/sandbox run dev
```

This configures the rewrite destination; browser calls still use same-origin `/api/*`.

Run the API locally in another terminal:

```bash
pnpm run dev:api
```

### 4) API server (api)

```bash
pnpm run dev:api
```

Set required env vars first (for example, `MPP_SECRET_KEY`) based on `api/.env.example`.

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

### sandbox

```bash
pnpm --filter @tipt/sandbox run dev
pnpm --filter @tipt/sandbox run build
pnpm --filter @tipt/sandbox run typecheck
pnpm --filter @tipt/sandbox run start
```

## Notes

- sandbox depends on sdk via workspace linking (local package), so SDK changes are available without publishing.
- sdk is self-contained in this monorepo and is consumed by api/sandbox via workspace linking (`@tipt/sdk`).
- If extension behavior changes, rebuild and reload the unpacked extension in Chrome.
- Existing package-level README files still contain deeper package details.
