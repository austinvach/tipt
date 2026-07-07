export enum ProblemType {
  InvalidPreimage = 'https://paymentauth.org/problems/invalid-preimage',
  PreimageConsumed = 'https://paymentauth.org/problems/preimage-consumed',
  InvoiceExpired = 'https://paymentauth.org/problems/invoice-expired',
  SessionNotFound = 'https://paymentauth.org/problems/session-not-found',
  SessionClosed = 'https://paymentauth.org/problems/session-closed',
  DepositConsumed = 'https://paymentauth.org/problems/deposit-consumed',
  InsufficientDeposit = 'https://paymentauth.org/problems/insufficient-deposit',
  InvalidReturnInvoice = 'https://paymentauth.org/problems/invalid-return-invoice',
  UnknownAction = 'https://paymentauth.org/problems/unknown-action',
}

export class ProblemDetailsError extends Error {
  readonly type: string
  readonly status: number
  readonly detail: string | undefined

  constructor(options: { type: string; title: string; status: number; detail?: string }) {
    super(options.title)
    this.name = 'ProblemDetailsError'
    this.type = options.type
    this.status = options.status
    this.detail = options.detail
  }
}

export function toProblemResponse(error: ProblemDetailsError): Response {
  return Response.json(
    {
      type: error.type,
      title: error.message,
      status: error.status,
      detail: error.detail,
    },
    {
      status: error.status,
      headers: { 'Content-Type': 'application/problem+json' },
    },
  )
}
