import { requireUser } from "../../../auth";
import SiteHeader from "../../../site-header";
import EventManage from "../../event-manage";
import { EventError, getEventDetail, type EventDetail } from "../../../../lib/events";
import { hasPermission } from "../../../../lib/permissions";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function EventSettingsPage({ params }: Props) {
  const raw = (await params).id;
  const user = await requireUser(`/events/${encodeURIComponent(raw)}/settings`);
  const id = Number(raw);
  let event: EventDetail | null = null, error = "";
  if (!Number.isSafeInteger(id) || id < 1) error = "This event doesn’t exist.";
  else try { event = await getEventDetail(user, id); }
  catch (failure) { error = failure instanceof EventError && failure.status === 404 ? "This event doesn’t exist, or it’s private." : "This event is temporarily unavailable. Please try again."; }
  if (event && !event.viewer.host) { error = "Only the event’s hosts can change it."; event = null; }
  return <main className="library-page"><SiteHeader email={user.email} showAdmin={hasPermission(user, false)}/>
    <div className="library-wrap settings-wrap">
      {event ? <EventManage initial={event}/> : <><p className="notice error" role="alert">{error}</p><p><a className="inline-link" href={`/events/${encodeURIComponent(raw)}`}>Back to the event</a></p></>}
    </div>
  </main>;
}
