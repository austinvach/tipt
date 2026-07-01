import { useEffect, useState } from "react";
import { Link } from "wouter";
import AppHeader from "@/components/AppHeader";
import { fetchNewsPreviews, type NewsPreview } from "@/lib/mpp";

function formatPublishedAt(value: string): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function News() {
  const [articles, setArticles] = useState<NewsPreview[]>([]);
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadNews() {
      try {
        const previews = await fetchNewsPreviews(20);

        if (!cancelled) {
          setArticles(previews);
          setLoadError("");
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadNews();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader pageTitle="News" />

      <main className="px-6 py-10">
        <section className="mx-auto max-w-4xl">
          <header className="mb-6">
            <h1 className="mt-2 text-3xl font-bold leading-tight">Latest stories</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Browse headlines, then open an article to view the preview and unlock the full story.
            </p>
          </header>

          {loadError && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {loadError}
            </p>
          )}

          {!loadError && isLoading && (
            <p className="text-sm text-muted-foreground">Loading articles...</p>
          )}

          {!loadError && !isLoading && (
            <div className="space-y-4">
              {articles.map((article) => (
                <Link
                  key={article.id}
                  href={`/news/${article.id}`}
                  className="block rounded-2xl border border-border bg-card p-5 transition hover:border-primary/40 hover:bg-card/80"
                >
                  <h2 className="text-xl font-semibold text-foreground">{article.title}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{article.excerpt || article.summary}</p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {article.author ? `By ${article.author}` : "Unknown author"}
                    {article.publishedAt ? ` · ${formatPublishedAt(article.publishedAt)}` : ""}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}