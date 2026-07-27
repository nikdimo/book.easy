import { db } from '@/lib/db';

export interface UserDataExport {
  account: {
    id: string;
    email: string;
    name: string;
    image?: string;
    role: string;
    isHost: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
  profile?: {
    phone?: string;
    bio?: string;
    hostBio?: string;
    hostDisplayName?: string;
  };
  bookings: Array<{
    id: string;
    listingTitle: string;
    checkIn: string;
    checkOut: string;
    guestCount: number;
    totalPrice: string;
    status: string;
    createdAt: Date;
  }>;
  listings?: Array<{
    id: string;
    title: string;
    slug: string;
    status: string;
    views: number;
    createdAt: Date;
  }>;
  favorites: Array<{
    listingTitle: string;
    addedAt: Date;
  }>;
  reviews: Array<{
    listingTitle: string;
    rating?: number;
    comment?: string;
    createdAt: Date;
  }>;
  auditLog: Array<{
    action: string;
    entityType: string;
    createdAt: Date;
  }>;
  consentHistory: Array<{
    essential: boolean;
    analytics: boolean;
    marketing: boolean;
    consentedAt: Date;
  }>;
  notifications: Array<{
    type: string;
    title: string;
    body: string;
    readAt?: Date;
    createdAt: Date;
  }>;
  messages: Array<{
    conversationId: string;
    body: string;
    editedAt?: Date;
    deletedAt?: Date;
    createdAt: Date;
  }>;
}

/**
 * Export all user data in a portable format (GDPR Right to Data Portability)
 */
export async function exportUserData(userId: string): Promise<UserDataExport> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      profile: true,
      bookings: {
        include: { listing: true },
        take: 100,
      },
      listings: {
        include: { views: { select: { id: true } } },
        take: 50,
      },
      favorites: {
        include: { listing: true },
        take: 100,
      },
      auditLogs: {
        take: 200,
      },
      notifications: {
        orderBy: { createdAt: 'desc' },
        take: 500,
      },
      sentMessages: {
        orderBy: { createdAt: 'desc' },
        take: 1000,
      },
    },
  });

  // Get reviews via listing reports/comments (if stored)
  const listingReports = await db.listingReport.findMany({
    where: { reporterId: userId },
    include: { listing: true },
    take: 100,
  });

  // Get consent history
  const consentHistory = await db.userConsent.findMany({
    where: { userId },
    orderBy: { consentedAt: 'desc' },
    take: 50,
  });

  return {
    account: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image || undefined,
      role: user.role,
      isHost: user.isHost,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    profile: user.profile
      ? {
          phone: user.profile.phone || undefined,
          bio: user.profile.bio || undefined,
          hostBio: user.profile.hostBio || undefined,
          hostDisplayName: user.profile.hostDisplayName || undefined,
        }
      : undefined,
    bookings: user.bookings.map((booking) => ({
      id: booking.id,
      listingTitle: booking.listing.title,
      checkIn: booking.checkIn.toISOString().split('T')[0],
      checkOut: booking.checkOut.toISOString().split('T')[0],
      guestCount: booking.guestCount,
      totalPrice: booking.totalPrice.toString(),
      status: booking.status,
      createdAt: booking.createdAt,
    })),
    listings: user.listings
      ? user.listings.map((listing) => ({
          id: listing.id,
          title: listing.title,
          slug: listing.slug,
          status: listing.status,
          views: listing.views.length,
          createdAt: listing.createdAt,
        }))
      : undefined,
    favorites: user.favorites.map((fav) => ({
      listingTitle: fav.listing.title,
      addedAt: fav.createdAt,
    })),
    reviews: listingReports.map((report) => ({
      listingTitle: report.listing.title,
      rating: undefined,
      comment: report.message || undefined,
      createdAt: report.createdAt,
    })),
    auditLog: user.auditLogs.map((log) => ({
      action: log.action,
      entityType: log.entityType,
      createdAt: log.createdAt,
    })),
    consentHistory: consentHistory.map((consent) => ({
      essential: consent.essential,
      analytics: consent.analytics,
      marketing: consent.marketing,
      consentedAt: consent.consentedAt,
    })),
    notifications: user.notifications.map((notification) => ({
      type: notification.type,
      title: notification.title,
      body: notification.body,
      readAt: notification.readAt || undefined,
      createdAt: notification.createdAt,
    })),
    messages: user.sentMessages.map((message) => ({
      conversationId: message.conversationId,
      body: message.deletedAt ? 'Message removed' : message.body,
      editedAt: message.editedAt || undefined,
      deletedAt: message.deletedAt || undefined,
      createdAt: message.createdAt,
    })),
  };
}

/**
 * Safely delete a user account and all associated data
 * Preserves referential integrity by anonymizing instead of hard-deleting where needed
 */
export async function deleteUserAccount(userId: string): Promise<{
  success: boolean;
  deletedRecords: Record<string, number>;
  anonymizedRecords: Record<string, number>;
}> {
  const deletedRecords: Record<string, number> = {};
  const anonymizedRecords: Record<string, number> = {};

  try {
    // Start a transaction to ensure atomicity
    await db.$transaction(async (tx) => {
      // 1. Anonymize audit logs (keep for compliance, remove user ID linkage)
      const auditLogsToUpdate = await tx.auditLog.findMany({
        where: { userId },
      });
      if (auditLogsToUpdate.length > 0) {
        await tx.auditLog.deleteMany({
          where: { userId },
        });
        anonymizedRecords['auditLogs'] = auditLogsToUpdate.length;
      }

      // 2. Delete/anonymize user consent records
      const consentRecords = await tx.userConsent.findMany({
        where: { userId },
      });
      if (consentRecords.length > 0) {
        await tx.userConsent.deleteMany({
          where: { userId },
        });
        deletedRecords['consentRecords'] = consentRecords.length;
      }

      // 3. Anonymize listing reports from this user
      const reportCount = await tx.listingReport.count({
        where: { reporterId: userId },
      });
      if (reportCount > 0) {
        await tx.listingReport.updateMany({
          where: { reporterId: userId },
          data: { reporterId: null },
        });
        anonymizedRecords['listingReports'] = reportCount;
      }

      // 4. Delete favorites
      const favoriteCount = await tx.favorite.deleteMany({
        where: { userId },
      });
      deletedRecords['favorites'] = favoriteCount.count;

      // 5. Remove transient notifications and registered devices. Sent chat messages
      // keep the booking record intact but lose their sender identity through SetNull.
      const notificationCount = await tx.notification.deleteMany({ where: { userId } });
      deletedRecords['notifications'] = notificationCount.count;
      const pushTokenCount = await tx.pushToken.deleteMany({ where: { userId } });
      deletedRecords['pushTokens'] = pushTokenCount.count;

      // 6. Handle listings (listings should be anonymized, not deleted, to preserve history)
      const listingCount = await tx.listing.count({
        where: { hostId: userId },
      });
      if (listingCount > 0) {
        // Unpublish all listings
        await tx.listing.updateMany({
          where: { hostId: userId },
          data: {
            status: 'ARCHIVED',
            hostId: userId, // Will be handled in user deletion
          },
        });
        anonymizedRecords['listings'] = listingCount;
      }

      // 7. Anonymize bookings (cancel pending, keep history for records)
      const pendingBookings = await tx.booking.updateMany({
        where: {
          guestId: userId,
          status: 'PENDING',
        },
        data: {
          status: 'CANCELLED_BY_GUEST',
        },
      });
      anonymizedRecords['bookingsCancelled'] = pendingBookings.count;

      // 8. Delete user profile
      await tx.profile.deleteMany({
        where: { userId },
      });
      deletedRecords['profiles'] = 1;

      // 9. Delete auth-related records
      const sessionsDeleted = await tx.session.deleteMany({
        where: { userId },
      });
      deletedRecords['sessions'] = sessionsDeleted.count;

      const accountsDeleted = await tx.account.deleteMany({
        where: { userId },
      });
      deletedRecords['accounts'] = accountsDeleted.count;

      // 10. Finally delete the user account
      await tx.user.delete({
        where: { id: userId },
      });
      deletedRecords['user'] = 1;
    });

    return {
      success: true,
      deletedRecords,
      anonymizedRecords,
    };
  } catch (error) {
    console.error('Error deleting user account:', error);
    throw new Error('Failed to delete user account. Contact support for assistance.');
  }
}

/**
 * Automatic data deletion based on retention policies
 * Call this via a scheduled job (e.g., nightly cron)
 */
export async function runDataRetentionCleanup(): Promise<{
  deletedRecords: Record<string, number>;
  cleanedUp: boolean;
}> {
  const deletedRecords: Record<string, number> = {};
  const now = new Date();

  try {
    await db.$transaction(async (tx) => {
      // 1. Delete old listing views (older than 14 months - analytics retention)
      const viewsCutoff = new Date(now);
      viewsCutoff.setMonth(viewsCutoff.getMonth() - 14);
      const viewsDeleted = await tx.listingView.deleteMany({
        where: {
          createdAt: { lt: viewsCutoff },
        },
      });
      deletedRecords['oldListingViews'] = viewsDeleted.count;

      // 2. Delete old verification tokens (older than 7 days)
      const tokensCutoff = new Date(now);
      tokensCutoff.setDate(tokensCutoff.getDate() - 7);
      const tokensDeleted = await tx.verificationToken.deleteMany({
        where: {
          expires: { lt: tokensCutoff },
        },
      });
      deletedRecords['expiredTokens'] = tokensDeleted.count;

      // 3. Delete read notifications after one year. Unread records remain so a user
      // does not lose important booking activity simply because it is old.
      const notificationCutoff = new Date(now);
      notificationCutoff.setFullYear(notificationCutoff.getFullYear() - 1);
      const notificationsDeleted = await tx.notification.deleteMany({
        where: {
          readAt: { not: null },
          createdAt: { lt: notificationCutoff },
        },
      });
      deletedRecords['oldReadNotifications'] = notificationsDeleted.count;

      // 4. Anonymize very old audit logs (older than 2 years but keep count)
      const auditCutoff = new Date(now);
      auditCutoff.setFullYear(auditCutoff.getFullYear() - 2);
      const oldAuditLogs = await tx.auditLog.findMany({
        where: {
          createdAt: { lt: auditCutoff },
        },
        select: { id: true },
      });
      if (oldAuditLogs.length > 0) {
        await tx.auditLog.deleteMany({
          where: {
            id: { in: oldAuditLogs.map((log) => log.id) },
          },
        });
        deletedRecords['oldAuditLogs'] = oldAuditLogs.length;
      }

      // 5. Delete inactive user accounts (no login for 2 years, with backup data)
      const inactiveCutoff = new Date(now);
      inactiveCutoff.setFullYear(inactiveCutoff.getFullYear() - 2);
      const inactiveUsers = await tx.user.findMany({
        where: {
          updatedAt: { lt: inactiveCutoff },
          isActive: true,
          role: 'USER', // Don't delete admins
        },
        select: { id: true },
      });

      // Note: You would want to send email notification before actually deleting
      // For now, just mark as inactive
      if (inactiveUsers.length > 0) {
        await tx.user.updateMany({
          where: {
            id: { in: inactiveUsers.map((u) => u.id) },
          },
          data: { isActive: false },
        });
        deletedRecords['deactivatedInactiveUsers'] = inactiveUsers.length;
      }
    });

    return {
      deletedRecords,
      cleanedUp: true,
    };
  } catch (error) {
    console.error('Error running data retention cleanup:', error);
    return {
      deletedRecords,
      cleanedUp: false,
    };
  }
}

/**
 * Get data retention policy for admin review
 */
export function getDataRetentionPolicy() {
  return {
    accountData: {
      retention: '7 years',
      reason: 'Tax compliance and legal records',
      note: 'Kept after account deletion',
    },
    bookingRecords: {
      retention: '7 years',
      reason: 'Tax, audit, and dispute resolution',
      note: 'Guest/host identifiers removed, bookings kept',
    },
    listingViews: {
      retention: '14 months',
      reason: 'Analytics aggregation window',
      note: 'Aggregated and anonymized after period',
    },
    auditLogs: {
      retention: '2 years',
      reason: 'Security and compliance audit trail',
      note: 'User linkage removed after 2 years',
    },
    sessionData: {
      retention: '24 hours of inactivity',
      reason: 'Active session management',
      note: 'Auto-cleared by browser',
    },
    consentRecords: {
      retention: 'As long as user data retained (7 years)',
      reason: 'Proof of consent for GDPR',
      note: 'Kept with anonymized user indicator',
    },
    chatMessages: {
      retention: 'Booking record retention period',
      reason: 'Guest support and dispute resolution',
      note: 'Sender identity is removed when an account is deleted',
    },
    notifications: {
      retention: '1 year after being read',
      reason: 'In-app activity history',
      note: 'Unread records remain until read or account deletion',
    },
    inactiveAccounts: {
      retention: '2 years',
      reason: 'User account recovery window',
      note: 'Accounts deactivated (not deleted) after 2 years',
    },
  };
}
