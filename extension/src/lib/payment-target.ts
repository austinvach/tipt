// Classifies a string supplied via `mpp:challenge.detail.invoice` (or the
// popup's Send field) as a BOLT11 Lightning invoice.
//
// Spark address prefixes are taken from the SDK constants:
//   AddressNetwork       = { MAINNET: 'spark',   TESTNET: 'sparkt',  REGTEST: 'sparkrt', SIGNET: 'sparks', LOCAL: 'sparkl' }
//   LegacyAddressNetwork = { MAINNET: 'sp',      TESTNET: 'spt',     REGTEST: 'sprt',    SIGNET: 'sps',    LOCAL: 'spl'    }
// — see node_modules/@buildonspark/spark-sdk/.../address.cjs. All variants
// follow `<prefix>1<bech32m-data>`. Spark invoices (issued via
// `createSatsInvoice`) share the same address format and prefix family.
//
// BOLT11 HRPs:
//   lnbc (mainnet), lntb (testnet), lntbs (signet), lnbcrt (regtest)
// All BOLT11 invoices match /^ln(bc|tb|tbs|bcrt)/i — pre-filter so we
// don't accidentally classify a malformed input that just happens to
// start with "ln" as Lightning. (`getBolt11AmountSats` in lib/bolt11.ts
// will independently reject anything that isn't a real invoice.)

export type PaymentKind = 'lightning' | 'spark' | 'unknown';

// SDK bech32m limit is 1024 chars for Spark addresses; BOLT11 invoices
// can be a few KB. The shared cap at the page boundary is 8192 chars
// (see content.ts / background.ts MAX_INVOICE_LEN). Anything longer
// than 8192 chars was already rejected upstream — this is defense in
// depth so a future caller can't sneak megabytes past us.
const MAX_TARGET_LEN = 8192;

const BOLT11_PREFIX_RE = /^ln(bc|tb|tbs|bcrt)/i;

export function classifyPaymentTarget(value: string): PaymentKind {
  if (typeof value !== 'string') return 'unknown';
  if (value.length === 0 || value.length > MAX_TARGET_LEN) return 'unknown';
  const lower = value.toLowerCase();
  if (BOLT11_PREFIX_RE.test(lower)) return 'lightning';
  return 'unknown';
}

// Human-readable label for the confirm popup. Kept here so the prefix list
// and the label stay together — adding a new network only touches one file.
export function paymentKindLabel(kind: PaymentKind): string {
  switch (kind) {
    case 'spark': return 'Spark';
    case 'lightning': return 'Lightning';
    default: return 'Unknown';
  }
}
