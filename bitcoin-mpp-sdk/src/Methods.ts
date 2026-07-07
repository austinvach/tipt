import { Method, z } from 'mppx'

export const charge = Method.from({
  intent: 'charge',
  name: 'bitcoin',
  schema: {
    credential: {
      payload: z.object({
        preimage: z.string(),
      }),
    },
    request: z.object({
      amount: z.string(),
      currency: z.optional(z.string()),
      description: z.optional(z.string()),
      methodDetails: z.optional(z.object({
        invoice: z.string(),
        paymentHash: z.optional(z.string()),
        network: z.optional(z.string()),
      })),
    }),
  },
})

export const session = Method.from({
  intent: 'session',
  name: 'bitcoin',
  schema: {
    credential: {
      payload: z.discriminatedUnion('action', [
        z.object({
          action: z.literal('open'),
          preimage: z.string(),
          returnInvoice: z.string(),
        }),
        z.object({
          action: z.literal('bearer'),
          sessionId: z.string(),
          preimage: z.string(),
        }),
        z.object({
          action: z.literal('topUp'),
          sessionId: z.string(),
          topUpPreimage: z.string(),
        }),
        z.object({
          action: z.literal('close'),
          sessionId: z.string(),
          preimage: z.string(),
        }),
      ]),
    },
    request: z.object({
      amount: z.string(),
      currency: z.string(),
      description: z.optional(z.string()),
      unitType: z.optional(z.string()),
      depositInvoice: z.optional(z.string()),
      paymentHash: z.optional(z.string()),
      depositAmount: z.optional(z.string()),
      idleTimeout: z.optional(z.string()),
    }),
  },
})
