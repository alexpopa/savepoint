import { requireUser } from "../../auth";
import SiteHeader from "../../site-header";
import EventSettingsForm from "../event-settings-form";
import { hasPermission } from "../../../lib/permissions";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const user = await requireUser("/events/new");
  const canCreate = hasPermission(user, false);
  return <main className="library-page"><SiteHeader email={user.email} showAdmin={canCreate}/>
    <div className="library-wrap settings-wrap">
      <p className="eyebrow">EVENTS</p><h1>New event</h1>
      {canCreate ? <EventSettingsForm/> : <p className="notice error" role="alert">Only site admins can create events for now.</p>}
      <p><a className="inline-link" href="/events">Back to events</a></p>
    </div>
  </main>;
}
