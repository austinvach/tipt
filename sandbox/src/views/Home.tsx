import Link from "next/link";
import { Film, Newspaper, WandSparkles } from "lucide-react";
import AppHeader from "@/components/AppHeader";

interface Tile {
  slug: string;
  href: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
}

const tiles: Tile[] = [
  {
    slug: "vod",
    href: "/vod",
    label: "Video On-Demand",
    description:
      "Pay-per-view streaming. No log-in required.",
    icon: <Film className="w-7 h-7" />,
    accent: "from-green-600/20 to-green-600/5 border-green-600/30",
  },
  {
    slug: "news",
    href: "/news",
    label: "Article Paywall",
    description:
      "Long-form article gated by a paywall that requires payment before reading.",
    icon: <Newspaper className="w-7 h-7" />,
    accent: "from-green-600/20 to-green-600/5 border-green-600/30",
  },
  {
    slug: "image-gen",
    href: "/image-gen",
    label: "Image Gen",
    description:
      "Generate a stylized image using a fixed prompt.",
    icon: <WandSparkles className="w-7 h-7" />,
    accent: "from-green-600/20 to-green-600/5 border-green-600/30",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader />

      {/* Hero */}
      <section className="px-6 pt-16 pb-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          TIPT SANDBOX
        </h1>
        <p className="mt-3 text-muted-foreground max-w-md mx-auto text-base leading-relaxed">
          Interactive demos using bitcoin over HTTP 402.
        </p>
      </section>

      {/* Tile grid */}
      <main className="flex-1 px-6 pb-16">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {tiles.map((tile) => (
            <TileCard key={tile.slug} tile={tile} />
          ))}
        </div>

        <section className="max-w-3xl mx-auto mt-8 text-center">
          <h2 className="text-lg font-semibold text-foreground">Other Pay-to-Play Use Cases</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Ad-Free Podcasts • Pay-Per-Stream Music • Global P2P Payments • Tipping Content Creators • GoFundMe Campaigns • Frictionless Ecommerce • In-App Purchases
          </p>
          </section>
          <section className="max-w-3xl mx-auto mt-8 text-center">
          <h2 className="text-lg font-semibold text-foreground">Additional Pay-for-Play Use Cases</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Loyalty Programs (Bing Reward, Rakuten Cash Back) • Paid Ads (Brave Browser Rewards) • Anonymized Tracking (Nielsen Computer & Mobile Panel) • Distributed Inference
          </p>
        </section>

        <div className="max-w-3xl mx-auto mt-6 text-center">
          <a
            href="https://mpp.dev/services"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-primary transition-colors underline underline-offset-4"
          >
            Explore more services at mpp.dev/services
          </a>
        </div>
      </main>
    </div>
  );
}

function TileCard({ tile }: { tile: Tile }) {
  const inner = (
    <div
      className={`group relative rounded-2xl border bg-gradient-to-br p-6 flex flex-col gap-4 transition-all duration-200 h-full hover:scale-[1.02] hover:shadow-xl cursor-pointer ${tile.accent}`}
    >
      {/* Text */}
      <div className="flex-1">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold text-foreground tracking-tight">
            {tile.label}
          </h2>
          <div className="text-primary shrink-0">{tile.icon}</div>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
          {tile.description}
        </p>
      </div>

      {/* CTA */}
      <div className="flex items-center gap-1.5 text-sm font-medium text-primary group-hover:gap-2.5 transition-all">
        Try demo
        <span className="text-base">→</span>
      </div>
    </div>
  );

  return <Link href={tile.href}>{inner}</Link>;
}
