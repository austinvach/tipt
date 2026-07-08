const ENDPOINTS: {
  method: string;
  path: string;
  description: string;
  gated: boolean;
}[] = [
  {
    method: "GET",
    path: "/api/health",
    description: "Health check. Returns { status: \"ok\" }.",
    gated: false,
  },
  {
    method: "GET",
    path: "/api/movies",
    description: "List public-domain films with their price (in sats).",
    gated: false,
  },
  {
    method: "GET",
    path: "/api/movies/:id",
    description:
      "Get a film's stream URL. Requires Lightning payment — responds 402 with an invoice challenge until paid.",
    gated: true,
  },
  {
    method: "GET",
    path: "/api/news",
    description: "List news articles with their price (in sats).",
    gated: false,
  },
  {
    method: "GET",
    path: "/api/news/:id",
    description:
      "Read a full article. Requires Lightning payment — responds 402 with an invoice challenge until paid.",
    gated: true,
  },
  {
    method: "POST",
    path: "/api/image",
    description:
      "Generate an image from a { prompt } via Gemini. Requires Lightning payment — responds 402 until paid.",
    gated: true,
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-12">
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-amber-500">
          Machine Payments Protocol
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">TIPT API</h1>
        <p className="mt-3 text-stone-400">
          A demo API whose premium endpoints are gated behind Lightning
          payments and the Machine Payments Protocol (MPP). Protected routes reply with{" "}
          <code className="rounded bg-white/5 px-1.5 py-0.5 text-amber-300">
            HTTP 402 Payment Required
          </code>{" "}
          and a <code className="text-amber-300">WWW-Authenticate</code> invoice
          challenge until the payment clears.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-stone-500">
          Endpoints
        </h2>
        {ENDPOINTS.map((ep) => (
          <div
            key={`${ep.method} ${ep.path}`}
            className="rounded-lg border border-white/10 bg-white/2 p-4"
          >
            <div className="flex items-center gap-3">
              <span
                className={`rounded px-2 py-0.5 font-mono text-xs font-semibold ${
                  ep.method === "GET"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-sky-500/15 text-sky-400"
                }`}
              >
                {ep.method}
              </span>
              <code className="font-mono text-sm text-stone-200">
                {ep.path}
              </code>
              {ep.gated && (
                <span className="ml-auto rounded bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">
                  402 · pay to unlock
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-stone-400">{ep.description}</p>
          </div>
        ))}
      </section>

      <footer className="mt-14 border-t border-white/10 pt-6 text-sm text-stone-500">
        Built with Next.js · Lightning payments via{" "}
        <code className="text-stone-400">@tipt/sdk</code>
      </footer>
    </main>
  );
}
