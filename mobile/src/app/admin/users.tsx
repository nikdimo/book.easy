import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { AppScreen, EmptyNotice, LoadingState, Pill, SectionHeader } from "@/components/ui";
import { useLanguage } from "@/context/language-context";
import { AdminUserItem, fetchAdminUsers, toggleUserStatus } from "@/lib/api";
import { colors, radii, spacing } from "@/theme";

type UserFilter = "all" | "hosts" | "admins" | "deactivated";

export default function AdminUsersScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<UserFilter>("all");
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const res = await fetchAdminUsers();
      setUsers(res.users);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleToggleStatus = async (userId: string, currentIsActive: boolean) => {
    try {
      setProcessingId(userId);
      await toggleUserStatus(userId, !currentIsActive);
      await loadData(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to change user status");
    } finally {
      setProcessingId(null);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      !searchQuery.trim() ||
      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterTab === "hosts") return u.isHost;
    if (filterTab === "admins") return u.role === "ADMIN" || u.role === "SUPERADMIN";
    if (filterTab === "deactivated") return !u.isActive;
    return true;
  });

  if (loading) {
    return (
      <AppScreen eyebrow="ADMIN" title="User Management">
        <LoadingState />
      </AppScreen>
    );
  }

  return (
    <AppScreen
      eyebrow="ADMIN MODERATION"
      title="User Management"
      subtitle="Inspect platform accounts, roles, and status."
      onRefresh={() => loadData(true)}
      refreshing={refreshing}
    >
      {/* Back Button */}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        style={styles.backButton}
      >
        <Text style={styles.backButtonText}>← {t("Back to Admin Hub")}</Text>
      </Pressable>

      {/* Search Input */}
      <View style={styles.searchBox}>
        <Text style={{ fontSize: 16 }}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email…"
          placeholderTextColor={colors.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <Pressable onPress={() => setSearchQuery("")}>
            <Text style={{ color: colors.muted, fontSize: 14 }}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabContainer}>
        <TabChip
          label={`All (${users.length})`}
          active={filterTab === "all"}
          onPress={() => setFilterTab("all")}
        />
        <TabChip
          label={`Hosts (${users.filter((u) => u.isHost).length})`}
          active={filterTab === "hosts"}
          onPress={() => setFilterTab("hosts")}
        />
        <TabChip
          label="Admins"
          active={filterTab === "admins"}
          onPress={() => setFilterTab("admins")}
        />
        <TabChip
          label={`Deactivated (${users.filter((u) => !u.isActive).length})`}
          active={filterTab === "deactivated"}
          onPress={() => setFilterTab("deactivated")}
        />
      </View>

      <SectionHeader title="Users List" count={filteredUsers.length} />

      {error ? (
        <EmptyNotice
          title="Could not load users"
          description={error}
          onRetry={() => void loadData()}
        />
      ) : filteredUsers.length === 0 ? (
        <EmptyNotice
          title="No users found"
          description="No registered user matches your current search or filter."
        />
      ) : (
        <View style={styles.list}>
          {filteredUsers.map((item) => (
            <View key={item.id} style={styles.userCard}>
              <View style={styles.avatarBox}>
                <Text style={styles.avatarText}>
                  {item.name
                    ?.split(" ")
                    .map((p) => p[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase() || "U"}
                </Text>
              </View>

              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.userName}>{item.name || "Unnamed User"}</Text>
                  {item.role === "ADMIN" || item.role === "SUPERADMIN" ? (
                    <Pill label="ADMIN" tone="warning" />
                  ) : item.isHost ? (
                    <Pill label="HOST" tone="success" />
                  ) : (
                    <Pill label="USER" tone="neutral" />
                  )}
                  {!item.isActive ? <Pill label="SUSPENDED" tone="warning" /> : null}
                </View>
                <Text style={styles.userEmail}>{item.email}</Text>
                <Text style={styles.userMeta}>
                  🏠 {item.listingsCount} listings • 📖 {item.bookingsCount} bookings
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={processingId === item.id}
                onPress={() => void handleToggleStatus(item.id, item.isActive)}
                style={({ pressed }) => [
                  item.isActive ? styles.deactivateBtn : styles.reactivateBtn,
                  pressed && { opacity: 0.7 },
                  processingId === item.id && { opacity: 0.5 },
                ]}
              >
                <Text
                  style={item.isActive ? styles.deactivateBtnText : styles.reactivateBtnText}
                >
                  {processingId === item.id
                    ? "Updating…"
                    : item.isActive
                    ? "Deactivate"
                    : "Activate"}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </AppScreen>
  );
}

function TabChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  backButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.md,
    height: 48,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: colors.ink,
    fontSize: 14,
  },
  tabContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  chipActive: {
    backgroundColor: colors.ink,
  },
  chipText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700",
  },
  chipTextActive: {
    color: "#fff",
  },
  list: {
    gap: spacing.md,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
  },
  avatarBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "900",
  },
  userName: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  userEmail: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  userMeta: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 4,
  },
  deactivateBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.md,
    backgroundColor: "#FFF6F6",
    borderWidth: 1,
    borderColor: "#F2C9C9",
  },
  deactivateBtnText: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: "800",
  },
  reactivateBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.md,
    backgroundColor: colors.successSoft,
  },
  reactivateBtnText: {
    color: colors.success,
    fontSize: 11,
    fontWeight: "800",
  },
});
