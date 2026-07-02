import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MPP API — Lightning-gated API",
  description:
    "A demo API whose premium endpoints are gated behind Lightning payments via HTTP 402 (Machine Payable Protocol).",
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
