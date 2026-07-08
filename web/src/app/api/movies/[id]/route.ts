import { MOVIES } from "@/lib/api/data/movies";
import { gatedJson } from "@/lib/api/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const movie = MOVIES.find((m) => m.id === id);

  if (!movie) {
    return Response.json({ error: "Movie not found" }, { status: 404 });
  }

  try {
    return await gatedJson(
      req,
      {
        amount: movie.bitcoin,
        description: `Watch ${movie.title} (${movie.year})`,
      },
      () => ({
        url: movie.videoUrl,
        title: movie.title,
        year: movie.year,
        duration: movie.duration,
      }),
    );
  } catch (err) {
    console.error("Stream error", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
