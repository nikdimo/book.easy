import { db } from '@/lib/db';

export interface ConsentPreferences {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
}

export async function saveUserConsent(
  userId: string | undefined,
  sessionId: string,
  preferences: ConsentPreferences,
  ipAddress?: string,
  userAgent?: string
) {
  try {
    await db.userConsent.upsert({
      where: { sessionId },
      update: {
        userId: userId || null,
        essential: preferences.essential,
        analytics: preferences.analytics,
        marketing: preferences.marketing,
        updatedAt: new Date(),
      },
      create: {
        userId: userId || null,
        sessionId,
        essential: preferences.essential,
        analytics: preferences.analytics,
        marketing: preferences.marketing,
        ipAddress,
        userAgent,
      },
    });
  } catch (error) {
    console.error('Failed to save consent:', error);
    throw error;
  }
}

export async function getUserConsent(sessionId: string) {
  try {
    return await db.userConsent.findUnique({
      where: { sessionId },
    });
  } catch (error) {
    console.error('Failed to get consent:', error);
    return null;
  }
}

export async function hasUserConsentedToAnalytics(sessionId: string): Promise<boolean> {
  const consent = await getUserConsent(sessionId);
  return consent?.analytics ?? false;
}

export async function hasUserConsentedToMarketing(sessionId: string): Promise<boolean> {
  const consent = await getUserConsent(sessionId);
  return consent?.marketing ?? false;
}
