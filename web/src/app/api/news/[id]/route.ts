import { NEWS } from "@/lib/api/data/news";
import { gatedJson } from "@/lib/api/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const item = NEWS.find((n) => n.id === id);

  if (!item) {
    return Response.json({ error: "Article not found" }, { status: 404 });
  }

  try {
    return await gatedJson(
      req,
      { amount: item.bitcoin, description: `Read "${item.title}"` },
      () => ({
        id: item.id,
        title: item.title,
        url: item.url,
        publishedAt: item.publishedAt,
        author: item.author,
        fullArticle: item.fullArticle,
      }),
    );
  } catch (err) {
    console.error("Article error", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
