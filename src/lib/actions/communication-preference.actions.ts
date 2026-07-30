"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import {
  requestEmailMarketingConsent,
  setPushMarketingConsent,
  withdrawUserMarketing,
} from "@/lib/services/marketing-consent.service";

export async function saveCommunicationPreferences(formData: FormData) {
  const session = await requireUser();
  const user = await db.user.findUniqueOrThrow({
    where: { id: session.id },
    select: { email: true, isHost: true },
  });
  await db.communicationPreference.upsert({
    where: { userId: session.id },
    create: {
      userId: session.id,
      messageEmail: formData.get("messageEmail") === "on",
      reviewEmail: formData.get("reviewEmail") === "on",
      operationalPush: formData.get("operationalPush") === "on",
    },
    update: {
      messageEmail: formData.get("messageEmail") === "on",
      reviewEmail: formData.get("reviewEmail") === "on",
      operationalPush: formData.get("operationalPush") === "on",
    },
  });

  const audience = user.isHost ? "HOST" : "GUEST";
  if (formData.get("marketingEmail") === "on") {
    await requestEmailMarketingConsent({
      email: user.email,
      userId: session.id,
      audience,
      source: "account-communication-settings",
    });
  } else {
    await withdrawUserMarketing({
      userId: session.id,
      channel: "EMAIL",
      source: "account-communication-settings",
    });
  }

  await setPushMarketingConsent({
    userId: session.id,
    email: user.email,
    audience,
    enabled: formData.get("marketingPush") === "on",
    source: "account-communication-settings",
  });
  revalidatePath("/account/communications");
}
