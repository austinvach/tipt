# Bitcoin MPP Spark SDK Project Plan

## Goals
- Build a thin TypeScript SDK for MPP Lightning payments using Spark SDK.
- Keep API ergonomics close to lightning-mpp-sdk.
- Use latest mppx.
- Enforce required behavior:
  1. Payment method name is `bitcoin`.
  2. `includeSparkInvoice` defaults to `true` when generating BOLT11 invoices.
  3. `preferSpark` defaults to `true` when paying invoices.
  4. Keep implementation thin around mppx + Spark.

## Scope
- SDK package with server/client entrypoints.
- Charge and session methods.
- Shared method schemas.
- Minimal utilities for network mapping and preimage resolution.
- Tests (unit/integration-style flow tests with mocked wallets where possible).
- Examples for charge and session.

## Milestones

### M1: Scaffold
- Initialize package metadata and TypeScript configs.
- Add build/typecheck/test scripts.
- Add exports for root, server, and client entrypoints.

### M2: Shared Method Schemas
- Implement `charge` and `session` schemas.
- Set method name to `bitcoin`.

### M3: Server Methods
- Implement server `charge`:
  - invoice generation using Spark wallet
  - preimage verification
  - replay protection via store
  - `includeSparkInvoice` default `true`
- Implement server `session`:
  - open/bearer/topUp/close flow
  - session store state transitions
  - server-managed refund attempt on close
  - session stream helper with top-up wait

### M4: Client Methods
- Implement client `charge`:
  - pay challenge invoice
  - `preferSpark` default `true`
  - cleanup helper
- Implement client `session`:
  - open/bearer/topUp/close credential handling
  - `preferSpark` default `true` for open and top-up
  - helper methods: `topUp`, `close`, `cleanup`, `getSession`, `resetSession`

### M5: Tests + Examples
- Add tests for:
  - method name is `bitcoin`
  - invoice generation defaults includeSparkInvoice true
  - invoice payment defaults preferSpark true
- Add runnable examples for server/client charge and session.

### M6: Hardening
- Typecheck + build + tests clean.
- Document usage in README.

## Deliverables
- Source under `src/`.
- Tests under `src/__tests__/`.
- Examples under `examples/`.
- Build outputs under `dist/` via `tsc`.
- README with configuration and behavior defaults.

## Definition of Done
- Method schemas use `bitcoin`.
- Invoice generation default includes Spark invoice.
- Invoice payment default prefers Spark routing.
- SDK remains thin and primarily delegates to mppx + Spark.
- Build and tests pass locally.
