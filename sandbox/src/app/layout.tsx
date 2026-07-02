import type { Metadata } from "next";
import "../index.css";

export const metadata: Metadata = {
  title: "Sandbox — Lightning 402 demos",
  description: "TIPT sandbox with separate Lightning 402 payment demos.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}