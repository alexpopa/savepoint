"use client";

import { useState } from "react";
import { Gamepad2, Flag, Check, ArrowUpRight } from "lucide-react";
import SiteHeader from "./site-header";
import type { TimelineGame, TimelineItem } from "../lib/timeline-items";

function Cover({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  return <span className="timeline-cover">{src && !failed
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
    : <Gamepad2 size={24} aria-hidden="true" />}</span>;
}

function Game({ game }: { game: TimelineGame }) {
  return <li className="timeline-game"><Cover src={game.coverUrl} /><span><strong>{game.name}</strong><small>{game.platformName || "Platform not set"}</small></span></li>;
}

function Stamp({ at, updated }: { at: number; updated?: boolean }) {
  const date = new Date(at);
  return <time dateTime={date.toISOString()} title={date.toUTCString()}>{updated ? "Updated " : ""}{date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</time>;
}

export default function Timeline({ email, items, error = false }: { email: string; items: TimelineItem[]; error?: boolean }) {
  return <div className="library-page"><SiteHeader email={email} />
    <main className="timeline-wrap">
      <header className="timeline-heading"><div><p className="timeline-eyebrow"><span className="timeline-rgb" aria-hidden="true" />Your circle</p><h1>Recent activity</h1></div><a className="timeline-players" href="/users">Find players <ArrowUpRight size={16} aria-hidden="true" /></a></header>
      <section className="timeline-screen" aria-label="Recent friend activity">
        <div className="timeline-screen-label"><span>Friends / latest</span><span>{String(items.length).padStart(2, "0")} entries</span></div>
        {error ? <div className="timeline-empty" role="alert"><h2>Activity couldn’t load.</h2><p>Please try again in a moment.</p><a href="/">Try again</a></div>
          : items.length === 0 ? <div className="timeline-empty"><Gamepad2 size={32} aria-hidden="true" /><h2>A quiet moment.</h2><p>New games and challenge updates from your friends will appear here.</p><a href="/users">Find your friends <ArrowUpRight size={16} aria-hidden="true" /></a></div>
          : <ol className="timeline-list">{items.map((item) => <li key={item.key} className={`timeline-entry ${item.kind === "challenge" ? `is-${item.state}` : "is-library"}`}>
            <span className="timeline-marker" aria-hidden="true">{item.kind === "library" ? <Gamepad2 size={18} /> : item.state === "completed" ? <Check size={18} /> : <Flag size={18} />}</span>
            <article>
              <div className="timeline-entry-heading"><h2>{item.kind === "library" ? <><a href={item.person.href}>{item.person.name}</a> added {item.games.length === 1 ? "a game" : `${item.games.length} games`}</> : <><a href={item.creator.href}>{item.creator.name}</a><span className="timeline-versus"> challenged </span><a href={item.recipient.href}>{item.recipient.name}</a></>}</h2><Stamp at={item.at} updated={item.kind === "challenge" && item.at !== item.createdAt} /></div>
              {item.kind === "library" ? <><ul className="timeline-games">{item.games.slice(0, 4).map((game) => <Game key={game.id} game={game} />)}</ul>{item.games.length > 4 && <details className="timeline-more"><summary>Show {item.games.length - 4} more games</summary><ul className="timeline-games">{item.games.slice(4).map((game) => <Game key={game.id} game={game} />)}</ul></details>}</>
                : <div className="timeline-challenge"><Cover src={item.coverUrl} /><div><p className="timeline-state">{item.state === "completed" ? "Challenge completed" : item.state === "claimed" ? `${item.recipient.name} marked it complete` : "Challenge pending"}</p><h3>{item.title}</h3><p className="timeline-game-name">{item.gameName}</p><a className="timeline-challenge-link" href={item.recipient.href}>View challenge on profile <ArrowUpRight size={14} aria-hidden="true" /></a></div></div>}
            </article>
          </li>)}</ol>}
      </section>
      {items.length > 0 && <p className="timeline-end">You’re caught up with the latest activity.</p>}
    </main>
  </div>;
}
