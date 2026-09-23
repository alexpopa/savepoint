import { safeReturnPath } from "../auth";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ return_to?: string }> }) {
  return <LoginForm returnTo={safeReturnPath((await searchParams).return_to)} />;
}
