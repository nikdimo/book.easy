import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getUserConsent,
  hashConsentNetworkAddress,
  saveUserConsent,
} from '@/lib/services/consent.service';
import { clientIpFromHeaders } from '@/lib/rate-limit';
import { randomBytes } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { essential, analytics, marketing } = body;

    // Validate input
    if (typeof essential !== 'boolean') {
      return NextResponse.json(
        { error: 'Essential consent is required' },
        { status: 400 }
      );
    }

    const session = await auth();
    const userId = session?.user?.id;

    // Get or create session ID from cookie
    let sessionId = request.cookies.get('consent-session')?.value;
    if (!sessionId) {
      sessionId = randomBytes(16).toString('hex');
    }

    const ipAddress = hashConsentNetworkAddress(clientIpFromHeaders(request.headers));
    const userAgent = request.headers.get('user-agent') || undefined;

    await saveUserConsent(
      userId,
      sessionId,
      {
        essential: essential === true,
        analytics: analytics === true,
        marketing: marketing === true,
      },
      ipAddress,
      userAgent
    );

    const response = NextResponse.json(
      { success: true, message: 'Consent preferences saved' },
      { status: 200 }
    );

    // Set cookie to persist session ID
    response.cookies.set('consent-session', sessionId, {
      maxAge: 60 * 60 * 24 * 365, // 1 year
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Consent API error:', error);
    return NextResponse.json(
      { error: 'Failed to save consent preferences' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.cookies.get('consent-session')?.value;
    if (!sessionId) {
      return NextResponse.json(
        { error: 'No session found' },
        { status: 404 }
      );
    }

    const consent = await getUserConsent(sessionId);
    if (!consent) {
      return NextResponse.json({ error: 'No preferences found' }, { status: 404 });
    }
    return NextResponse.json({
      essential: consent.essential,
      analytics: consent.analytics,
      marketing: consent.marketing,
      updatedAt: consent.updatedAt,
    });
  } catch (error) {
    console.error('Consent GET error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve consent preferences' },
      { status: 500 }
    );
  }
}
