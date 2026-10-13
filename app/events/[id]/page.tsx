import { requireUser } from "../../auth";
import SiteHeader from "../../site-header";
import EventView from "../event-view";
import { EventError, getEventDetail, type EventDetail } from "../../../lib/events";
import { hasPermission } from "../../../lib/permissions";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function EventPage({ params }: Props) {
  const raw = (await params).id;
  const user = await requireUser(`/events/${encodeURIComponent(raw)}`);
  const id = Number(raw);
  let event: EventDetail | null = null, error = "";
  if (!Number.isSafeInteger(id) || id < 1) error = "This event doesn’t exist.";
  else try { event = await getEventDetail(user, id); }
  catch (failure) { error = failure instanceof EventError && failure.status === 404 ? "This event doesn’t exist, or it’s private." : "This event is temporarily unavailable. Please try again."; }
  return <main className="library-page"><SiteHeader email={user.email} showAdmin={hasPermission(user, false)}/>
    <div className="library-wrap events-wrap">
      {event ? <EventView initial={event}/> : <><p className="notice error" role="alert">{error}</p><p><a className="inline-link" href="/events">Back to events</a></p></>}
    </div>
  </main>;
}
