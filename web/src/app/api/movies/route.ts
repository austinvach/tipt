import { MOVIES } from "@/lib/api/data/movies";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(
    MOVIES.map(({ videoUrl: _videoUrl, bitcoin, ...movie }) => ({
      ...movie,
      price: String(bitcoin),
      currency: "BTC",
    })),
  );
}
