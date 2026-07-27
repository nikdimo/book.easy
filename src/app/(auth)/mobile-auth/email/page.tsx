import { EmailAuthClient } from "./email-auth-client";

export default async function MobileEmailAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email = "" } = await searchParams;
  return <EmailAuthClient email={email.trim()} />;
}
