import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { exportUserData } from '@/lib/services/gdpr.service';

/**
 * GET /api/gdpr/export
 * Returns user's personal data in JSON format (GDPR Right to Data Portability)
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const data = await exportUserData(session.user.id);

    // Return as downloadable JSON file
    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="personal-data-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (error) {
    console.error('Data export error:', error);
    return NextResponse.json(
      { error: 'Failed to export personal data' },
      { status: 500 }
    );
  }
}
