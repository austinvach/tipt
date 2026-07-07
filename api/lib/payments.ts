import { Mppx, spark } from "@tipt/sdk/server";
import { BodyDigest, Challenge } from "mppx";

const mppx = Mppx.create({
  methods: [
    spark.charge({
      mnemonic: process.env.MNEMONIC!,
    }),
    spark.spark({
      mnemonic: process.env.MNEMONIC!,
    }),
  ],
  secretKey: process.env.MPP_SECRET_KEY!,
});

type ChargeMethod = "bitcoin" | "spark";
const CHARGE_METHODS: ChargeMethod[] = ["bitcoin", "spark"];

function parseAcceptPaymentPreference(headerValue: string): ChargeMethod[] {
  const intent = "charge";
  const scores = new Map<ChargeMethod, { q: number; specificity: number }>();

  for (const rawPart of headerValue.split(",")) {
    const part = rawPart.trim();
    if (!part) continue;
    const [token, ...params] = part.split(";").map((s) => s.trim());
    const [methodToken, intentToken] = token.split("/");
    if (!methodToken || !intentToken) continue;

    let q = 1;
    for (const param of params) {
      const [k, v] = param.split("=").map((s) => s.trim());
      if (k?.toLowerCase() !== "q" || !v) continue;
      const parsed = Number(v);
      if (Number.isFinite(parsed)) q = parsed;
    }
    if (q <= 0) continue;

    for (const method of CHARGE_METHODS) {
      const methodMatches = methodToken === "*" || methodToken === method;
      const intentMatches = intentToken === "*" || intentToken === intent;
      if (!methodMatches || !intentMatches) continue;

      const specificity =
        (methodToken === method ? 1 : 0) + (intentToken === intent ? 1 : 0);
      const current = scores.get(method);
      if (!current || q > current.q || (q === current.q && specificity > current.specificity)) {
        scores.set(method, { q, specificity });
      }
    }
  }

  const ranked = [...CHARGE_METHODS]
    .map((method, index) => ({
      method,
      rank: scores.get(method),
      index,
    }))
    .filter((entry) => entry.rank !== undefined)
    .sort((a, b) => {
      if (a.rank!.q !== b.rank!.q) return b.rank!.q - a.rank!.q;
      if (a.rank!.specificity !== b.rank!.specificity) {
        return b.rank!.specificity - a.rank!.specificity;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.method);

  // Spec allows ignoring malformed/unsatisfied preferences; fallback to server order.
  return ranked.length > 0 ? ranked : [...CHARGE_METHODS];
}

async function computeRequestDigest(req: Request): Promise<string | undefined> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const cloned = req.clone();
  const bodyText = await cloned.text();
  return BodyDigest.compute(bodyText);
}

function composeCharge(
  req: Request,
  opts: { amount: number; description: string },
) {
  const description = sanitizeHeaderText(opts.description);
  return mppx.compose(
    [
      "bitcoin/charge",
      {
        amount: String(opts.amount),
        currency: "sat",
        description,
      },
    ],
    [
      "spark/charge",
      {
        amount: String(opts.amount),
        currency: "sat",
        description,
      },
    ],
  )(req);
}

async function maybeBindDigestChallenges(
  req: Request,
  opts: { amount: number; description: string },
  challengeResponse: Response,
): Promise<Response> {
  const digest = await computeRequestDigest(req);
  if (!digest) return challengeResponse;

  const description = sanitizeHeaderText(opts.description);
  const orderedMethods = (() => {
    const acceptPayment = req.headers.get("Accept-Payment");
    if (!acceptPayment) return [...CHARGE_METHODS];
    try {
      return parseAcceptPaymentPreference(acceptPayment);
    } catch {
      return [...CHARGE_METHODS];
    }
  })();

  const generated = await Promise.all(
    orderedMethods.map(async (methodName) => {
      const baseChallenge =
        methodName === "bitcoin"
          ? await mppx.challenge.bitcoin.charge({
              amount: String(opts.amount),
              currency: "sat",
              description,
            })
          : await mppx.challenge.spark.charge({
              amount: String(opts.amount),
              currency: "sat",
              description,
            });

      return Challenge.from({
        secretKey: process.env.MPP_SECRET_KEY!,
        realm: baseChallenge.realm,
        method: baseChallenge.method,
        intent: baseChallenge.intent,
        request: baseChallenge.request,
        ...(baseChallenge.description !== undefined
          ? { description: baseChallenge.description }
          : {}),
        ...(baseChallenge.expires !== undefined
          ? { expires: baseChallenge.expires }
          : {}),
        ...(baseChallenge.opaque !== undefined ? { opaque: baseChallenge.opaque } : {}),
        digest,
      });
    }),
  );

  const headers = new Headers(challengeResponse.headers);
  headers.delete("www-authenticate");
  for (const challenge of generated) {
    headers.append("www-authenticate", Challenge.serialize(challenge));
  }

  const body = await challengeResponse.text();
  return new Response(body, {
    status: challengeResponse.status,
    headers,
  });
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

/**
 * Gates a JSON response behind an MPP HTTP 402 payment challenge.
 * Offers both `bitcoin/charge` (plain BOLT11 invoice) and `spark/charge`
 * (direct Spark transfer) and lets Accept-Payment negotiate ordering.
 * If the request lacks valid payment, responds 402 with the invoice challenge.
 * Otherwise builds the body, attaches the payment receipt headers, and responds 200.
 */
export async function gatedJson(
  req: Request,
  opts: { amount: number; description: string },
  buildBody: () => unknown,
): Promise<Response> {
  const chargeResult = await composeCharge(req, opts);

  if (chargeResult.status === 402) {
    return maybeBindDigestChallenges(req, opts, chargeResult.challenge as Response);
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
 * Gates a binary (e.g. image) response behind an MPP HTTP 402 payment challenge.
 * Offers both `bitcoin/charge` and `spark/charge` methods.
 * The charged-for work (`buildBody`) only runs after payment clears.
 */
export async function gatedBinary(
  req: Request,
  opts: { amount: number; description: string },
  buildBody: () => Promise<{ data: Buffer; contentType: string }>,
): Promise<Response> {
  const chargeResult = await composeCharge(req, opts);

  if (chargeResult.status === 402) {
    return maybeBindDigestChallenges(req, opts, chargeResult.challenge as Response);
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
