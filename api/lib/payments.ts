import { Mppx, spark } from "@tipt/sdk/server";

const mppx = Mppx.create({
  methods: [
    spark.charge({
      mnemonic: process.env.MNEMONIC!,
    }),
  ],
  secretKey: process.env.MPP_SECRET_KEY!,
});

/**
 * mppx inspects the incoming request headers to detect a payment proof and to
 * build the invoice challenge. Route handlers may have already consumed the
 * request body (e.g. POST /api/image), so we hand mppx a fresh bodyless GET
 * request carrying the same URL and headers.
 */
function toChargeRequest(req: Request): Request {
  const headers = new Headers(req.headers);
  return new Request(req.url, { method: "GET", headers });
}

/**
 * The MPP charge `description` is echoed into the WWW-Authenticate HTTP header,
 * which only accepts Latin-1 (ByteString) characters. Map common "smart"
 * punctuation to ASCII and drop anything else outside the printable range.
 */
function sanitizeHeaderText(text: string): string {
  return text
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2026]/g, "...")
    .replace(/[^\x20-\x7E]/g, "");
}

function paymentRequired(challenge: Response): Response {
  // Preserve the upstream challenge headers (including WWW-Authenticate) and
  // return a JSON 402 body.
  const headers = new Headers(challenge.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify({ error: "Payment required" }), {
    status: 402,
    headers,
  });
}

/**
 * Gates a JSON response behind an MPP HTTP 402 Lightning payment.
 * If the request lacks valid payment, responds 402 with the invoice challenge.
 * Otherwise builds the body, attaches the payment receipt headers, and responds 200.
 */
export async function gatedJson(
  req: Request,
  opts: { amount: number; description: string },
  buildBody: () => unknown,
): Promise<Response> {
  const chargeResult = await mppx.charge({
    amount: String(opts.amount),
    currency: "sat",
    description: sanitizeHeaderText(opts.description),
    methodDetails: { invoice: "" },
  })(toChargeRequest(req));

  if (chargeResult.status === 402) {
    return paymentRequired(chargeResult.challenge as Response);
  }

  const body = buildBody();
  const innerResponse = new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  return (
    chargeResult as { withReceipt: (r: Response) => Response }
  ).withReceipt(innerResponse);
}

/**
 * Gates a binary (e.g. image) response behind an MPP HTTP 402 Lightning payment.
 * The charged-for work (`buildBody`) only runs after payment clears.
 */
export async function gatedBinary(
  req: Request,
  opts: { amount: number; description: string },
  buildBody: () => Promise<{ data: Buffer; contentType: string }>,
): Promise<Response> {
  const chargeResult = await mppx.charge({
    amount: String(opts.amount),
    currency: "sat",
    description: sanitizeHeaderText(opts.description),
    methodDetails: { invoice: "" },
  })(toChargeRequest(req));

  if (chargeResult.status === 402) {
    return paymentRequired(chargeResult.challenge as Response);
  }

  const { data, contentType } = await buildBody();
  const innerResponse = new Response(new Uint8Array(data), {
    status: 200,
    headers: { "content-type": contentType },
  });

  return (
    chargeResult as { withReceipt: (r: Response) => Response }
  ).withReceipt(innerResponse);
}
