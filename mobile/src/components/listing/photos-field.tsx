import { useCallback, useRef, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Icon } from "@/components/icon";
import { Pill, SoftButton } from "@/components/ui";
import { useLanguage } from "@/context/language-context";
import {
  absoluteMediaUrl,
  ListingMediaItem,
  uploadFile,
  type FormDataValue,
} from "@/lib/api";
import { alpha, colors, radii, spacing, type } from "@/theme";

/** Publishing needs three photos. Mirrors the web rule: fewer than three does not
 *  block moving through the wizard, only publishing. */
export const MIN_PHOTOS = 3;

/** An upload in flight. Kept separate from the saved media list so a failure can be
 *  retried or discarded without ever having touched the draft. */
interface PendingUpload {
  key: string;
  uri: string;
  name: string;
  mimeType: string;
  status: "uploading" | "error";
  error?: string;
}

export function photoCount(items: ListingMediaItem[]): number {
  return items.filter((item) => item.mediaType === "IMAGE").length;
}

/** The cover is the first *photo*, never a video — a video frame cannot be used as
 *  the search thumbnail. Returns -1 when there is no photo yet. */
export function coverIndex(items: ListingMediaItem[]): number {
  return items.findIndex((item) => item.mediaType === "IMAGE");
}

export function PhotosField({
  items,
  onChange,
  onUploadingChange,
}: {
  items: ListingMediaItem[];
  onChange: (next: ListingMediaItem[]) => void;
  /** Leaving the step mid-upload would lose the file, so the wizard blocks it. */
  onUploadingChange: (uploading: boolean) => void;
}) {
  const { t } = useLanguage();
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const keyRef = useRef(0);

  const setPendingAndReport = useCallback(
    (updater: (current: PendingUpload[]) => PendingUpload[]) => {
      setPending((current) => {
        const next = updater(current);
        onUploadingChange(next.some((item) => item.status === "uploading"));
        return next;
      });
    },
    [onUploadingChange]
  );

  const runUpload = useCallback(
    async (entry: PendingUpload) => {
      try {
        // Web hands back a blob: URL that must be fetched into a Blob; native wants
        // the {uri,name,type} descriptor its FormData understands.
        const payload: Blob | FormDataValue =
          Platform.OS === "web"
            ? await (await fetch(entry.uri)).blob()
            : { uri: entry.uri, name: entry.name, type: entry.mimeType };

        const result = await uploadFile(payload, entry.name);
        onChange([...items, { url: result.url, mediaType: result.mediaType }]);
        setPendingAndReport((current) =>
          current.filter((item) => item.key !== entry.key)
        );
      } catch (caught) {
        setPendingAndReport((current) =>
          current.map((item) =>
            item.key === entry.key
              ? {
                  ...item,
                  status: "error",
                  error: caught instanceof Error ? caught.message : t("Upload failed"),
                }
              : item
          )
        );
      }
    },
    [items, onChange, setPendingAndReport, t]
  );

  const pick = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      quality: 0.9,
    });
    if (result.canceled) return;

    const entries: PendingUpload[] = result.assets.map((asset) => ({
      key: `upload-${keyRef.current++}`,
      uri: asset.uri,
      name: asset.fileName ?? `upload-${Date.now()}.jpg`,
      mimeType: asset.mimeType ?? "image/jpeg",
      status: "uploading",
    }));

    setPendingAndReport((current) => [...current, ...entries]);
    // Sequential: the server rate-limits uploads per user, and a burst of parallel
    // requests from one picker selection is exactly what trips it.
    for (const entry of entries) await runUpload(entry);
  }, [runUpload, setPendingAndReport]);

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  const photos = photoCount(items);
  const cover = coverIndex(items);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.count}>
          {photos} {t(photos === 1 ? "photo" : "photos")}
          {items.length > photos ? ` · ${items.length - photos} ${t("video")}` : ""}
        </Text>
        {photos < MIN_PHOTOS ? (
          <Pill label={`${MIN_PHOTOS - photos} more to publish`} tone="warning" />
        ) : (
          <Pill label="Ready to publish" tone="success" />
        )}
      </View>

      <SoftButton icon="add" label="Add photos or video" onPress={() => void pick()} />

      <View style={styles.grid}>
        {items.map((item, index) => (
          <View key={`${item.url}-${index}`} style={styles.tile}>
            {item.mediaType === "IMAGE" ? (
              <Image
                alt=""
                source={{ uri: absoluteMediaUrl(item.url) }}
                style={styles.thumb}
              />
            ) : (
              <View style={[styles.thumb, styles.videoThumb]}>
                <Icon color={colors.muted} name="preview" size={20} />
              </View>
            )}

            {index === cover ? (
              <View style={styles.coverTag}>
                <Text style={styles.coverText}>{t("Cover")}</Text>
              </View>
            ) : null}

            <View style={styles.tileActions}>
              <TileButton
                accessibilityLabel={t("Move earlier")}
                disabled={index === 0}
                icon="back"
                onPress={() => move(index, index - 1)}
              />
              <TileButton
                accessibilityLabel={t("Move later")}
                disabled={index === items.length - 1}
                icon="forward"
                onPress={() => move(index, index + 1)}
              />
              <TileButton
                accessibilityLabel={t("Remove")}
                destructive
                icon="trash"
                onPress={() => onChange(items.filter((_, i) => i !== index))}
              />
            </View>
          </View>
        ))}

        {pending.map((entry) => (
          <View key={entry.key} style={styles.tile}>
            <View style={[styles.thumb, styles.pendingThumb]}>
              {entry.status === "uploading" ? (
                <>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={styles.pendingText}>{t("Uploading")}…</Text>
                </>
              ) : (
                <>
                  <Icon color={colors.danger} name="alert" size={18} />
                  <Text numberOfLines={2} style={styles.errorText}>
                    {entry.error}
                  </Text>
                </>
              )}
            </View>
            {entry.status === "error" ? (
              <View style={styles.tileActions}>
                <TileButton
                  accessibilityLabel={t("Retry")}
                  icon="retry"
                  onPress={() => {
                    setPendingAndReport((current) =>
                      current.map((item) =>
                        item.key === entry.key
                          ? { ...item, status: "uploading", error: undefined }
                          : item
                      )
                    );
                    void runUpload({ ...entry, status: "uploading" });
                  }}
                />
                <TileButton
                  accessibilityLabel={t("Discard")}
                  destructive
                  icon="close"
                  onPress={() =>
                    setPendingAndReport((current) =>
                      current.filter((item) => item.key !== entry.key)
                    )
                  }
                />
              </View>
            ) : null}
          </View>
        ))}
      </View>

      <Text style={styles.hint}>
        {t(
          "The first photo is the cover guests see in search. Use the arrows to reorder."
        )}
      </Text>
    </View>
  );
}

function TileButton({
  accessibilityLabel,
  icon,
  disabled = false,
  destructive = false,
  onPress,
}: {
  accessibilityLabel: string;
  icon: "back" | "forward" | "trash" | "retry" | "close";
  disabled?: boolean;
  destructive?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tileButton,
        disabled && styles.disabled,
        pressed && { opacity: 0.6 },
      ]}
    >
      <Icon color={destructive ? colors.danger : colors.ink} name={icon} size={14} />
    </Pressable>
  );
}

const TILE = 104;

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  count: { ...type.bodyStrong, color: colors.ink },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tile: { width: TILE, gap: spacing.xs },
  thumb: {
    width: TILE,
    height: TILE,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  videoThumb: { alignItems: "center", justifyContent: "center" },
  pendingThumb: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pendingText: { ...type.caption, color: colors.muted },
  errorText: { ...type.caption, color: colors.danger, textAlign: "center" },
  coverTag: {
    position: "absolute",
    left: spacing.xs,
    top: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: alpha(colors.ink, 80),
  },
  coverText: { ...type.caption, fontSize: 10, color: "#fff" },
  tileActions: { flexDirection: "row", gap: spacing.xs },
  tileButton: {
    flex: 1,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  disabled: { opacity: 0.3 },
  hint: { ...type.caption, color: colors.muted },
});
