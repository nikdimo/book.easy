import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { deleteUserAccount } from '@/lib/services/gdpr.service';

/**
 * POST /api/gdpr/delete
 * Deletes user account and associated data (GDPR Right to Erasure)
 * Requires confirmation token to prevent accidental deletion
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { confirmPassword, confirmPhrase } = await request.json();

    // Security: require confirmation phrase "DELETE MY DATA"
    if (confirmPhrase !== 'DELETE MY DATA') {
      return NextResponse.json(
        { error: 'Invalid confirmation phrase' },
        { status: 400 }
      );
    }

    // In production, verify password before deletion
    // For now, just proceed with session verification
    if (!confirmPassword) {
      return NextResponse.json(
        { error: 'Password confirmation required' },
        { status: 400 }
      );
    }

    const result = await deleteUserAccount(session.user.id);

    // Clear session after deletion
    const response = NextResponse.json(
      {
        success: true,
        message: 'Account and personal data successfully deleted',
        summary: {
          deleted: result.deletedRecords,
          anonymized: result.anonymizedRecords,
        },
      },
      { status: 200 }
    );

    // Clear auth cookie
    response.cookies.set('next-auth.session-token', '', {
      maxAge: 0,
      path: '/',
    });

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
