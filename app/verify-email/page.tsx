import AuthLinkForm from "../auth-link-form";

export const dynamic = "force-dynamic";
export const metadata = { referrer: "no-referrer" as const };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return <AuthLinkForm mode="verify" token={(await searchParams).token ?? ""} />;
}
