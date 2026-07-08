import Link from "next/link";
import { Code2, ShieldCheck, FlaskConical } from "lucide-react";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground px-6 py-14">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          TIPT
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
          Lightning-Native Payment Flows For The Web
        </h1>
        <p className="mt-4 max-w-3xl text-base text-muted-foreground sm:text-lg">
          TIPT bundles an SDK, a 402-enabled API, and an interactive sandbox so teams can ship pay-to-unlock experiences with minimal integration overhead.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <section className="rounded-2xl border border-border bg-card p-5">
            <Code2 className="h-5 w-5 text-primary" />
            <h2 className="mt-3 text-lg font-semibold">SDK</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Browser client that handles 402 retries, wallet events, and payment credential plumbing.
            </p>
          </section>
          <section className="rounded-2xl border border-border bg-card p-5">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="mt-3 text-lg font-semibold">API</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Server routes that challenge with HTTP 402 and unlock premium content after payment.
            </p>
            <Link href="/api" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
              View API docs
            </Link>
          </section>
          <section className="rounded-2xl border border-border bg-card p-5">
            <FlaskConical className="h-5 w-5 text-primary" />
            <h2 className="mt-3 text-lg font-semibold">Sandbox</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              End-to-end demos for video, articles, and image generation using the same API routes.
            </p>
            <Link href="/sandbox" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
              Open sandbox
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}