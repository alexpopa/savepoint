import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Savepoint — Your Game Library",
  description: "A personal library for the games you want to remember.",
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
