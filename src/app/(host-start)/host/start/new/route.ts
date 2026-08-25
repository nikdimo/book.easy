import { auth } from "@/lib/auth";
import {
  HOST_START_COOKIE_OPTIONS,
  HOST_START_DRAFT_COOKIE,
} from "@/lib/host-start-draft";
import { relativeRedirect } from "@/lib/http/relative-redirect";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || (!session.user.isHost && session.user.role !== "ADMIN")) {
    return relativeRedirect("/login");
  }
  const response = relativeRedirect("/host/start/property-type");
  response.cookies.set(HOST_START_DRAFT_COOKIE, "", {
    ...HOST_START_COOKIE_OPTIONS,
    maxAge: 0,
  });
  return response;
}
