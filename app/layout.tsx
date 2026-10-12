import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RGBoner — Great Games. Questionable Taste.",
  description: "Show off your collection, defend your Top 10, and challenge your friends.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
