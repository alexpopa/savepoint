"use client";

import Link from "next/link";
import { LogOut, Search, Settings, UserRound, Users } from "lucide-react";

const glyphs = {
  R: ["01110", "10001", "10001", "11110", "10100", "10010", "10001"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01110"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  o: ["01110", "10001", "10001", "10001", "01110"],
  n: ["11110", "10001", "10001", "10001", "10001"],
  e: ["01110", "10001", "11111", "10000", "01110"],
  r: ["10110", "11001", "10000", "10000", "10000"],
} as const;

export function BrandWordmark() {
  const colors = ["#ff1010", "#00e51b", "#173cff", "#173cff", "#173cff", "#173cff", "#173cff"];

  return <svg className="brand-wordmark" viewBox="0 0 42 7" role="img" aria-label="RGBoner" shapeRendering="crispEdges">
    {"RGBoner".split("").flatMap((letter, letterIndex) =>
      glyphs[letter as keyof typeof glyphs].flatMap((row, rowIndex) =>
        [...row].flatMap((pixel, columnIndex) => pixel === "1" ? [
          <rect
            key={`${letterIndex}-${rowIndex}-${columnIndex}`}
            x={letterIndex * 6 + columnIndex}
            y={letterIndex < 3 ? rowIndex : rowIndex + 2}
            width="1"
            height="1"
            fill={colors[letterIndex]}
          />,
        ] : []),
      ),
    )}
  </svg>;
}

export default function SiteHeader({ email, query = "" }: { email?: string; query?: string }) {
  return <header className="topbar">
    <Link className="brand" href="/" aria-label="RGBoner home"><BrandWordmark /></Link>
    <form className="header-search" action="/search" role="search">
      <Search size={18} aria-hidden="true"/>
      <input type="search" name="q" defaultValue={query} minLength={2} maxLength={100} required aria-label="Search games and players" placeholder="Search games and players"/>
      <button type="submit" aria-label="Search"><Search size={17}/></button>
    </form>
    <nav className="header-actions" aria-label="Main navigation">
      {email ? <>
        <Link className="header-nav-link" href="/">My library</Link>
        <Link className="icon-button" aria-label="My profile" title="My profile" href="/profile"><UserRound size={18}/></Link>
        <Link className="icon-button" aria-label="Browse players" title="Browse players" href="/users"><Users size={18}/></Link>
        <Link className="icon-button" aria-label="Settings and friends" title="Settings and friends" href="/settings"><Settings size={18}/></Link>
        <span className="account-avatar" title={email}>{email.charAt(0).toUpperCase()}</span>
        <form action="/api/auth/logout" method="post"><button className="icon-button" type="submit" aria-label="Sign out" title="Sign out"><LogOut size={18}/></button></form>
      </> : <Link className="header-nav-link guest-signin" href={`/login?return_to=${encodeURIComponent(query ? `/search?q=${encodeURIComponent(query)}` : "/search")}`}>Sign in</Link>}
    </nav>
  </header>;
}
