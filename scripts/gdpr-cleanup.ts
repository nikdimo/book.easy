/**
 * GDPR Data Retention Cleanup Job
 *
 * This script runs the automatic data retention cleanup according to policies.
 * Should be scheduled to run daily via:
 * - Cron job (Linux/Mac): 0 2 * * * node -r tsx scripts/gdpr-cleanup.ts
 * - Scheduled task (Windows): Daily at 2:00 AM
 * - Cloud scheduler: Cloud Run, Lambda, etc.
 *
 * Usage: npx tsx scripts/gdpr-cleanup.ts
 */

import { runDataRetentionCleanup } from '@/lib/services/gdpr.service';

async function main() {
  console.log('🧹 Starting GDPR data retention cleanup...');
  console.log(`⏰ Time: ${new Date().toISOString()}`);

  try {
    const result = await runDataRetentionCleanup();

    if (result.cleanedUp) {
      console.log('✅ Cleanup completed successfully');
      console.log('\nDeleted records:');
      Object.entries(result.deletedRecords).forEach(([key, count]) => {
        if (count > 0) {
          console.log(`  • ${key}: ${count}`);
        }
      });
    } else {
      console.log('⚠️  Cleanup completed with errors. Check logs.');
    }
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();
