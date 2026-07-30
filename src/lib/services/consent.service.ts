import { db } from '@/lib/db';
import { createHmac } from 'node:crypto';

export interface ConsentPreferences {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
}

export function hashConsentNetworkAddress(address: string): string {
  const secret =
    process.env.CONSENT_AUDIT_SALT ||
    process.env.AUTH_SECRET ||
    'development-only-consent-audit-salt';
  return createHmac('sha256', secret).update(address).digest('hex');
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
        ipAddress,
        userAgent,
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
