import Link from "next/link";

type AppHeaderProps = {
  pageTitle?: string;
};

export default function AppHeader({ pageTitle }: AppHeaderProps) {
  const logoClassName = "h-8 w-8 object-cover object-left";

  return (
    <header className="border-b border-border px-6 py-4 flex items-center gap-3">
      {pageTitle ? (
        <>
          <Link
            href="/sandbox"
            className="flex items-center gap-2 text-foreground transition-colors hover:opacity-80"
          >
            <img src="/tiptgreen.svg" alt="TIPT" className={logoClassName} />
            <span className="font-semibold text-foreground text-lg">SANDBOX</span>
          </Link>
          <span className="text-border">/</span>
          <span className="text-sm font-medium text-foreground">{pageTitle}</span>
        </>
      ) : (
        <div className="flex items-center gap-2">
          <img src="/tiptgreen.svg" alt="TIPT" className={logoClassName} />
          <span className="font-semibold text-foreground text-lg">SANDBOX</span>
        </div>
      )}
    </header>
  );
}
