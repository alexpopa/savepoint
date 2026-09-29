"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Gamepad2, LogOut, Search, Settings, UserRound, Users } from "lucide-react";

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const signInHref = "/login";

  useEffect(() => {
    let active = true;
    async function refreshPendingRequestCount() {
      try {
        const response = await fetch("/api/friends/pending-count");
        if (!response.ok) return;
        const result = await response.json() as { count?: unknown };
        if (active && Number.isSafeInteger(result.count) && (result.count as number) >= 0) setPendingRequestCount(result.count as number);
      } catch {}
    }

    if (email) {
      void refreshPendingRequestCount();
      window.addEventListener("friend-requests-changed", refreshPendingRequestCount);
    }
    return () => {
      active = false;
      window.removeEventListener("friend-requests-changed", refreshPendingRequestCount);
    };
  }, [email]);

  useEffect(() => {
    if (!menuOpen) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setMenuOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuRef.current?.querySelector<HTMLButtonElement>(".account-menu-trigger")?.focus();
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  return <header className="topbar">
    <a className="brand" href="/" aria-label="RGBoner home"><BrandWordmark /></a>
    <form className="header-search" action="/search" role="search">
      <Search size={18} aria-hidden="true"/>
      <input type="search" name="q" defaultValue={query} minLength={2} maxLength={100} required aria-label="Search games and players" placeholder="Search games and players"/>
      <button type="submit" aria-label="Search"><Search size={17}/></button>
    </form>
    <div className="header-actions">
      {!email && <a className="header-signin" href={signInHref}>Sign in</a>}
      {email && <div
        className="account-menu"
        ref={menuRef}
        onBlur={(event) => {
          if (!(event.relatedTarget instanceof Node) || !menuRef.current?.contains(event.relatedTarget)) setMenuOpen(false);
        }}
      >
        <button
          className="account-menu-trigger"
          type="button"
          aria-label={pendingRequestCount > 0 ? `Account menu, ${pendingRequestCount} pending friend requests` : "Account menu"}
          aria-expanded={menuOpen}
          title={pendingRequestCount > 0 ? `Account menu, ${pendingRequestCount} pending friend requests` : "Account menu"}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {pendingRequestCount > 0 && <span className="friend-request-badge" aria-hidden="true">{pendingRequestCount}</span>}
          <UserRound size={21} aria-hidden="true"/>
          <ChevronDown size={14} aria-hidden="true"/>
        </button>
        {menuOpen && <div className="account-menu-panel">
          <nav className="account-menu-nav" aria-label="Account navigation">
            <a className="account-menu-link" href="/library" onClick={() => setMenuOpen(false)}><Gamepad2 size={18} aria-hidden="true"/>My library</a>
            <a className="account-menu-link" href="/profile" onClick={() => setMenuOpen(false)}><UserRound size={18} aria-hidden="true"/>My profile</a>
            <a className="account-menu-link" href="/users" onClick={() => setMenuOpen(false)}><Users size={18} aria-hidden="true"/>Browse players</a>
            <a className="account-menu-link" href="/settings" aria-label={pendingRequestCount > 0 ? `Settings & friends, ${pendingRequestCount} pending friend requests` : undefined} onClick={() => setMenuOpen(false)}><Settings size={18} aria-hidden="true"/>Settings &amp; friends{pendingRequestCount > 0 && <span className="friend-request-badge" aria-hidden="true">{pendingRequestCount}</span>}</a>
            <form className="account-menu-signout" action="/api/auth/logout" method="post">
              <button className="account-menu-link" type="submit"><LogOut size={18} aria-hidden="true"/>Sign out</button>
            </form>
          </nav>
        </div>}
      </div>}
    </div>
  </header>;
}
