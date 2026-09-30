import { notFound } from "next/navigation";
import MessagesPage from "../messages-page";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ name: string }> }) {
  let segment: string;
  try { segment = decodeURIComponent((await params).name); } catch { notFound(); }
  return <MessagesPage segment={segment}/>;
}
