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
          <Link
            href="https://microsoftedge.microsoft.com/addons/Microsoft-Edge-Extensions-Home"
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
          >
            <Wallet className="h-5 w-5 text-primary" />
            <h2 className="mt-3 text-lg font-semibold">TIPT Extension</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Handles HTTP 402 payment requests while keeping wallet keys safe in the browser.
            </p>
            <span className="mt-4 inline-block text-sm font-medium text-primary">
              Get extension
            </span>
          </Link>
          <Link
            href="https://www.npmjs.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
          >
            <Code2 className="h-5 w-5 text-primary" />
            <h2 className="mt-3 text-lg font-semibold">TIPT SDK</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Enables HTTP 402 payment requests in your client and/or server applications.
            </p>
            <span className="mt-4 inline-block text-sm font-medium text-primary">
              View on npm
            </span>
          </Link>
          <Link
            href="/api"
            className="block rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
          >
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="mt-3 text-lg font-semibold">TIPT API</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              A test API that uses the TIPT SDK to gate content behind HTTP 402 payment requests.
            </p>
            <span className="mt-4 inline-block text-sm font-medium text-primary">
              View API docs
            </span>
          </Link>
          <Link
            href="/sandbox"
            className="block rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
          >
            <FlaskConical className="h-5 w-5 text-primary" />
            <h2 className="mt-3 text-lg font-semibold">TIPT Sandbox</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Demos how the TIPT Extension can be used to unlock premium content (videos, articles, etc).
            </p>
            <span className="mt-4 inline-block text-sm font-medium text-primary">
              Open sandbox
            </span>
          </Link>
        </div>
      </div>
    </main>
  );
}