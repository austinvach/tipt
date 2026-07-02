import { NEWS } from "@/lib/data/news";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(
    NEWS.map(({ fullArticle: _fullArticle, bitcoin, ...item }) => ({
      ...item,
      price: String(bitcoin),
      currency: "BTC",
    })),
  );
}
