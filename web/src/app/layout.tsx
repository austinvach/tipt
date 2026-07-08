import type { Metadata } from "next";
import "../index.css";

export const metadata: Metadata = {
  title: "TIPT — The Internet Payment Toolkit",
  description: "TIPT single web app with landing page, API docs, and interactive 402 sandbox demos.",
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