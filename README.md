# TIPT Monorepo

This repository contains three related projects for Lightning payment flows:

- extension: Browser extension wallet and payment approval UX
- sdk: Browser SDK that handles 402 Payment Required retries via extension events
- sandbox: Demo web app for testing paid-content/payment flows against the SDK and extension

## Repository Layout

- extension: Chrome extension (Vite + React + TypeScript)
- sdk: Publishable library package (tsup + TypeScript + Vitest)
- sandbox: Demo client app (Vite + React + TypeScript)
- package.json: Root monorepo scripts
- pnpm-workspace.yaml: Workspace package configuration

## How The Pieces Fit Together

1. A web app (sandbox or another client) uses the sdk package.
2. The sdk detects 402 responses and requests payment approval through browser events.
3. The extension listens for those events, asks the user to approve, and returns credentials.
4. The sdk retries the original request with the returned credential.

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

The sandbox runs with Vite and exposes Lightning payment demo routes.

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
pnpm --filter @tipt/sandbox run preview
```

## Notes

- sandbox depends on sdk via workspace linking (local package), so SDK changes are available without publishing.
- If extension behavior changes, rebuild and reload the unpacked extension in Chrome.
- Existing package-level README files still contain deeper package details.
