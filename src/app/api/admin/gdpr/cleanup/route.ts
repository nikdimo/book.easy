import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { runDataRetentionCleanup } from '@/lib/services/gdpr.service';

/**
 * POST /api/admin/gdpr/cleanup
 * Runs data retention cleanup (admin only)
 * Can be triggered manually or via scheduled job
 */
export async function POST() {
  try {
    const session = await auth();

    // Verify admin access
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 403 }
      );
    }

    const result = await runDataRetentionCleanup();

    return NextResponse.json(
      {
        success: result.cleanedUp,
        message: result.cleanedUp
          ? 'Data retention cleanup completed successfully'
          : 'Cleanup completed with errors',
        deletedRecords: result.deletedRecords,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Admin cleanup error:', error);
    return NextResponse.json(
      {
        error: 'Failed to run cleanup',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
