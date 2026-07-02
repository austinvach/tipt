"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, Lock, Loader2 } from "lucide-react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import {
  fetchNewsPreviewById,
  probeExtension,
  unlockNewsArticle,
  type NewsArticle,
  type NewsPreview,
} from "@/lib/mpp";

function toParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}|\r\n\r\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

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

export default function NewsArticlePage({ articleId }: { articleId: string }) {
  const [preview, setPreview] = useState<NewsPreview | null>(null);
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [hasExtension, setHasExtension] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState("");
  const [isPaying, setIsPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadPaywallInfo() {
      if (!articleId) {
        setLoadError("Missing article id.");
        return;
      }

      try {
        const [newsPreview, extensionDetected] = await Promise.all([
          fetchNewsPreviewById(articleId),
          probeExtension(),
        ]);

        if (!cancelled) {
          setPreview(newsPreview);
          setHasExtension(extensionDetected);
          setLoadError("");
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      }
    }

    loadPaywallInfo();

    return () => {
      cancelled = true;
    };
  }, [articleId]);

  async function handlePaywallPayment() {
    if (!preview) {
      return;
    }

    setIsPaying(true);
    setPaymentError("");

    try {
      const fullArticle = await unlockNewsArticle(preview);
      setArticle(fullArticle);
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsPaying(false);
    }
  }

  const articlePreviewParagraphs = toParagraphs(preview?.articlePreview || preview?.summary || "");
  const fullArticleParagraphs = toParagraphs(article?.fullArticle || "");
  const contentParagraphs = article ? fullArticleParagraphs : articlePreviewParagraphs;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader pageTitle="News" />

      <main className="px-6 py-10">
        <article className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-6 md:p-8">
          <p className="mb-4 text-sm text-muted-foreground">
            <Link href="/news" className="hover:underline">
              Back to all stories
            </Link>
          </p>

          <header className="mb-6 border-b border-border pb-5">
            <h1 className="mt-2 text-3xl font-bold leading-tight">
              {preview?.title || "Loading headline..."}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {preview?.excerpt || "Fetching article excerpt..."}
            </p>
            {(preview?.author || preview?.publishedAt) && (
              <p className="mt-2 text-xs text-muted-foreground">
                {preview?.author ? `By ${preview.author}` : ""}
                {preview?.author && preview?.publishedAt ? " · " : ""}
                {preview?.publishedAt ? formatPublishedAt(preview.publishedAt) : ""}
              </p>
            )}
          </header>

          {loadError && (
            <p className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {loadError}
            </p>
          )}

          <section className="space-y-4 text-[15px] leading-7 text-foreground/90">
            {contentParagraphs.length === 0 && !loadError && (
              <p>Loading article preview...</p>
            )}
            {contentParagraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </section>

          {!article && !loadError && (
            <section className="mt-8 rounded-2xl border border-border bg-background p-6 text-center shadow-xl">
              <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Lock className="h-5 w-5" />
              </div>
              <h2 className="text-xl font-semibold">Keep Reading</h2>

              {hasExtension === false && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-left text-xs leading-relaxed text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
                  <span>
                    MPP browser extension not detected. Install a compatible Lightning wallet extension to pay.
                    <a
                      href="https://github.com/buildonspark/mppx"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Learn more <ExternalLink className="h-3 w-3" />
                    </a>
                  </span>
                </div>
              )}

              <button
                type="button"
                onClick={handlePaywallPayment}
                disabled={isPaying || !preview || hasExtension !== true}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPaying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Waiting for payment approval...
                  </>
                ) : (
                  `Unlock Full Article (${preview?.currency === "BTC" ? "₿" : ""}${preview?.price || ""})`
                )}
              </button>

              {paymentError && (
                <p className="mt-3 text-xs text-destructive leading-relaxed">{paymentError}</p>
              )}
            </section>
          )}

        </article>
      </main>
    </div>
  );
}
