import { auth } from "@/lib/auth";
import { createMobileHandoffToken } from "@/lib/mobile-session-token";
import MobileAuthCompleteClient from "./mobile-auth-complete-client";

export default async function MobileAuthCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ native?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  const handoff = session?.user?.id
    ? await createMobileHandoffToken(session.user.id)
    : null;
  return <MobileAuthCompleteClient handoff={handoff} native={params.native === "1"} />;
}
