import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  confirmAccountDeletion,
  requestAccountDeletion,
} from '@/lib/services/account-deletion.service';

/**
 * POST /api/gdpr/delete
 *
 * Two-step erasure (GDPR Right to Erasure). Sign-in is passwordless, so instead of a
 * password re-prompt the account's own mailbox is the second factor:
 *
 *   1. `{}`             → emails a one-time confirmation link, deletes nothing.
 *   2. `{ token }`      → consumes the link and deletes the account.
 *
 * The web UI drives this through server actions; this route exists for the mobile
 * client and for anyone exercising their rights programmatically.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const token = typeof body?.token === 'string' ? body.token : null;

    if (!token) {
      const requested = await requestAccountDeletion(session.user.id);
      if (!requested.ok) {
        return NextResponse.json({ error: requested.error }, { status: 429 });
      }
      return NextResponse.json({
        status: 'confirmation_sent',
        message: `A confirmation link has been sent to ${requested.sentTo}. It expires in 1 hour.`,
      });
    }

    const result = await confirmAccountDeletion(token, session.user.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const response = NextResponse.json({
      status: 'deleted',
      message: 'Account and personal data successfully deleted',
    });
    response.cookies.set('next-auth.session-token', '', { maxAge: 0, path: '/' });
    return response;
  } catch (error) {
    console.error('Account deletion error:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete account',
        message:
          error instanceof Error
            ? error.message
            : 'Please contact support for assistance',
      },
      { status: 500 }
    );
  }
}
