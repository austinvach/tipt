import Link from "next/link";
import { Code2, ShieldCheck, FlaskConical, Wallet } from "lucide-react";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground px-6 py-14">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          TIPT
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
           The Internet Payment Toolkit
        </h1>
        <p className="mt-4 max-w-3xl text-base text-muted-foreground sm:text-lg">
          A collection of open source, non-custodial tools that make online payments easy.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <section className="rounded-2xl border border-border bg-card p-5">
            <Wallet className="h-5 w-5 text-primary" />
            <h2 className="mt-3 text-lg font-semibold">TIPT Extension</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Handles HTTP 402 payment requests while keeping wallet information local to the browser.
            </p>
          </section>
          <section className="rounded-2xl border border-border bg-card p-5">
            <Code2 className="h-5 w-5 text-primary" />
            <h2 className="mt-3 text-lg font-semibold">TIPT SDK</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Enables support for HTTP 402 payment requests in your client or server applications.
            </p>
          </section>
          <section className="rounded-2xl border border-border bg-card p-5">
            <FlaskConical className="h-5 w-5 text-primary" />
            <h2 className="mt-3 text-lg font-semibold">TIPT Sandbox</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Demos that use the TIPT SDK to unlock premium content (videos, articles, etc).
            </p>
            <Link href="/sandbox" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
              Open sandbox
            </Link>
          </section>
          <section className="rounded-2xl border border-border bg-card p-5">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="mt-3 text-lg font-semibold">TIPT API</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              A test API that uses the TIPT SDK to gate content behind HTTP 402 payment requests.
            </p>
            <Link href="/api" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
              View API docs
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}