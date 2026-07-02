import { gatedBinary } from "@/lib/payments";
import { generateImage } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_PRICE = 100;

export async function POST(req: Request) {
  let body: { prompt?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (typeof body.prompt !== "string" || body.prompt.trim() === "") {
    return Response.json(
      { error: "A non-empty 'prompt' string is required" },
      { status: 400 },
    );
  }

  const prompt = body.prompt;

  try {
    return await gatedBinary(
      req,
      { amount: IMAGE_PRICE, description: "Generate image" },
      async () => {
        const { b64_json, mimeType } = await generateImage(prompt);
        return {
          data: Buffer.from(b64_json, "base64"),
          contentType: mimeType,
        };
      },
    );
  } catch (err) {
    console.error("Image generation error", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
