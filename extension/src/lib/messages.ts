// Single source of truth for chrome.runtime message names.
//
// Every onMessage handler in the extension dispatches on `msg.type`, so a
// type-name collision between background and offscreen would silently
// route to the wrong worker. Keeping all type strings here makes
// collisions a compile-time problem.
//
// Naming convention:
//   * TIPT_OFFSCREEN_* — handled by offscreen.ts
//   * TIPT_402_* / TIPT_MPP_* — handled by background.ts
//   * TIPT_* (everything else) — handled by offscreen.ts
//
// The offscreen and background share the chrome.runtime.onMessage channel
// but use disjoint type strings, so it doesn't matter which worker is
// woken first.

export const MSG = {
  // Offscreen wallet ops (popup → offscreen)
  WALLET_CREATE: 'TIPT_WALLET_CREATE',
  GET_BALANCE: 'TIPT_GET_BALANCE',
  GET_TRANSFERS: 'TIPT_GET_TRANSFERS',
  CREATE_INVOICE: 'TIPT_CREATE_INVOICE',
  GET_FEE_ESTIMATE: 'TIPT_GET_FEE_ESTIMATE',
  PAY_INVOICE: 'TIPT_PAY_INVOICE',
  HAS_WALLET: 'TIPT_HAS_WALLET',
  DISPOSE_WALLET: 'TIPT_DISPOSE_WALLET',
  // Thin wallet-RPC passthroughs for the MPP charge flow (background →
  // offscreen). These return the RAW SparkWallet results (projected to the
  // fields the page-side @tipt/sdk consumes) without
  // interpreting them — no preimage polling, no credential building. The
  // page-side SDK owns preimage resolution and credential serialization.
  OFFSCREEN_PAY_LIGHTNING_RAW: 'TIPT_OFFSCREEN_PAY_LIGHTNING_RAW',
  OFFSCREEN_GET_SEND_REQUEST: 'TIPT_OFFSCREEN_GET_SEND_REQUEST',
  OFFSCREEN_GET_TRANSFER: 'TIPT_OFFSCREEN_GET_TRANSFER',
  OFFSCREEN_CREATE_LIGHTNING_INVOICE: 'TIPT_OFFSCREEN_CREATE_LIGHTNING_INVOICE',
  // Fire-and-forget warm-up: spin up the offscreen SparkWallet SDK ahead of
  // any actual 402 confirm, so the user doesn't pay the cold-start cost on
  // the critical path between clicking Approve and the page receiving its
  // mpp:credential.
  PREWARM_WALLET: 'TIPT_PREWARM_WALLET',

  // 402 / MPP background ops
  MPP_REQUEST_TRIGGERED: 'TIPT_MPP_REQUEST_TRIGGERED',
  // Wallet-RPC bridge (content → background): forwards a single wallet method
  // call from the page-side SDK. The `payLightningInvoice` method is gated by
  // the approval flow; read methods are read-only follow-ups.
  WALLET_RPC_402: 'TIPT_402_WALLET_RPC',
  CONFIRM_RESPONSE_402: 'TIPT_402_CONFIRM_RESPONSE',
  ALLOWLIST_LIST_402: 'TIPT_402_ALLOWLIST_LIST',
  ALLOWLIST_REMOVE_402: 'TIPT_402_ALLOWLIST_REMOVE',
} as const;

export type Envelope<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };
