import { ArrowRight, Gamepad2, Monitor, LibraryBig } from "lucide-react";
import { eq } from "drizzle-orm";
import { requireUser } from "../auth";
import SiteHeader from "../site-header";
import { getDb } from "../../db";
import { steamConnections, xboxConnections, psnConnections } from "../../db/schema";
import { hasPermission } from "../../lib/permissions";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const user = await requireUser("/connections");
  const db = getDb();
  let connections = null;
  try {
    const [steam, xbox, psn] = await db.batch([
      db.select({ userId: steamConnections.userId }).from(steamConnections).where(eq(steamConnections.userId, user.userId)),
      db.select({ name: xboxConnections.gamertag }).from(xboxConnections).where(eq(xboxConnections.userId, user.userId)),
      db.select({ name: psnConnections.onlineId, needsReconnect: psnConnections.needsReconnect }).from(psnConnections).where(eq(psnConnections.userId, user.userId)),
    ]);
    connections = { steam: steam[0], xbox: xbox[0], psn: psn[0] };
  } catch (error) { console.error("Could not load connected libraries", error); }
  const services = [
    { name: "Steam", path: "steam", icon: Monitor, description: "Import your Steam collection and choose the games to bring into your library.", connection: connections?.steam, account: null, reconnect: false },
    { name: "Xbox", path: "xbox", icon: Gamepad2, description: "Add the games you’ve played on Xbox and PC, and show your achievements.", connection: connections?.xbox, account: connections?.xbox?.name, reconnect: false },
    { name: "PlayStation", path: "playstation", icon: Gamepad2, description: "Add your PlayStation games and show your trophies, platinums, and playtime.", connection: connections?.psn, account: connections?.psn?.name, reconnect: connections?.psn?.needsReconnect },
  ];
  return <main className="library-page"><SiteHeader email={user.email} showAdmin={hasPermission(user, false)}/>
    <div className="library-wrap settings-wrap connections-wrap">
      <p className="eyebrow">YOUR COLLECTIONS</p><h1>Connected libraries</h1>
      <p className="subcopy">Bring your games together. Connect a service, then choose what to add to RGBoner.</p>
      {!connections && <p className="notice error" role="alert">Could not load connection status. Open a service to manage it, or try again.</p>}
      <div className="connections-grid">{services.map((service) => <section className="settings-card connection-card" key={service.path} aria-labelledby={`connection-${service.path}`}>
        <div className="connection-heading"><span className="connection-icon"><service.icon size={26} aria-hidden="true"/></span><h2 id={`connection-${service.path}`}>{service.name}</h2></div>
        <span className={`connection-status${service.reconnect ? " reconnect" : service.connection ? " connected" : ""}`}>{!connections ? "Status unavailable" : service.reconnect ? "Reconnect needed" : service.connection ? "Connected" : "Not connected"}</span>
        {service.account && <p className="connection-account">{service.account}</p>}
        <p className="connection-description">{service.description}</p>
        <a className="connection-action" href={`/settings/${service.path}`}>{!connections || service.connection ? `Manage ${service.name}` : `Connect ${service.name}`}<ArrowRight size={18} aria-hidden="true"/></a>
      </section>)}</div>
      <p className="connections-note"><LibraryBig size={18} aria-hidden="true"/>Already added your games? <a className="inline-link" href="/library">Open your library</a></p>
    </div>
  </main>;
}
