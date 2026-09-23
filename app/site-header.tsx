"use client";

import Link from "next/link";
import { Gamepad2, LogOut, Search, Settings, Users } from "lucide-react";

export default function SiteHeader({ email, query = "" }: { email: string; query?: string }) {
  return <header className="topbar">
    <Link className="brand" href="/"><span className="brand-mark"><Gamepad2 size={21}/></span><span>savepoint</span></Link>
    <form className="header-search" action="/search" role="search">
      <Search size={18} aria-hidden="true"/>
      <input type="search" name="q" defaultValue={query} minLength={2} maxLength={100} required aria-label="Search games and players" placeholder="Search games and players"/>
      <button type="submit" aria-label="Search"><Search size={17}/></button>
    </form>
    <nav className="header-actions" aria-label="Main navigation">
      <Link className="header-nav-link" href="/">My library</Link>
      <Link className="icon-button" aria-label="Browse players" title="Browse players" href="/users"><Users size={18}/></Link>
      <Link className="icon-button" aria-label="Settings and friends" title="Settings and friends" href="/settings"><Settings size={18}/></Link>
      <span className="account-avatar" title={email}>{email.charAt(0).toUpperCase()}</span>
      <a className="icon-button" aria-label="Sign out" title="Sign out" href="/signout-with-chatgpt?return_to=%2F" target="_top"><LogOut size={18}/></a>
    </nav>
  </header>;
}
