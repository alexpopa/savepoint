import { CalendarDays, Lock, Plus, Trophy, Users } from "lucide-react";
import { requireUser } from "../auth";
import SiteHeader from "../site-header";
import { eventDays, statusLabels } from "../../lib/event-rules";
import { getEventList, type EventSummary } from "../../lib/events";
import { hasPermission } from "../../lib/permissions";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const user = await requireUser("/events");
  let list: EventSummary[] | null = null;
  try { list = await getEventList(user); } catch (error) { console.error("Could not load events", error instanceof Error ? error.message : "unknown error"); }
  const sections = list ? [
    { id: "invited", title: "Invitations", events: list.filter((event) => event.memberStatus === "invited" && event.status !== "ended") },
    { id: "mine", title: "Your events", events: list.filter((event) => (event.memberStatus === "joined" || event.hosting) && event.status !== "ended") },
    { id: "open", title: "Open to join", events: list.filter((event) => !event.memberStatus && !event.hosting && event.visibility === "public" && event.status !== "ended") },
    { id: "past", title: "Past events", events: list.filter((event) => event.status === "ended") },
  ].filter((section) => section.events.length) : [];
  const canCreate = hasPermission(user, false);
  return <main className="library-page"><SiteHeader email={user.email} showAdmin={canCreate}/>
    <div className="library-wrap events-wrap">
      <div className="page-heading"><div><p className="eyebrow"><Trophy size={14} aria-hidden="true"/> PLAY TOGETHER</p><h1>Events</h1><p className="subcopy">Count the games you play between two dates, with friends.</p></div>
        {canCreate && <a className="event-create" href="/events/new"><Plus size={18} aria-hidden="true"/>New event</a>}</div>
      {!list && <p className="notice error" role="alert">Events are temporarily unavailable. Please try again.</p>}
      {list && !sections.length && <div className="empty-state"><div className="empty-icon"><Trophy size={27} aria-hidden="true"/></div><h2>No events yet</h2><p>When someone invites you or opens an event, it shows up here.</p></div>}
      {sections.map((section) => <section className="events-section" key={section.id} aria-labelledby={`events-${section.id}`}>
        <div className="section-title"><h2 id={`events-${section.id}`}>{section.title}</h2></div>
        <ul className="event-list">{section.events.map((event) => <li key={event.id}><a className="event-card" href={`/events/${event.id}`}>
          <span className={`event-status is-${event.status}`}>{statusLabels[event.status]}</span>
          <strong>{event.name}</strong>
          <span className="event-card-meta"><CalendarDays size={15} aria-hidden="true"/>{eventDays(event.startDay, event.endDay)}</span>
          <span className="event-card-meta"><Users size={15} aria-hidden="true"/>{event.players} {event.players === 1 ? "player" : "players"}{event.visibility === "private" && <><Lock size={14} aria-hidden="true"/>Private</>}</span>
          {event.description && <span className="event-card-description">{event.description}</span>}
        </a></li>)}</ul>
      </section>)}
    </div>
  </main>;
}
