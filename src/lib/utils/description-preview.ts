export const LANDING_DESCRIPTION_PREVIEW_LENGTH = 120;
export const DESCRIPTION_PREVIEW_LENGTH = 260;

export function splitDescriptionPreview(
  text: string,
  limit: number = DESCRIPTION_PREVIEW_LENGTH
): { visible: string; hidden: string; truncated: boolean } {
  const trimmed = text.trim();
  if (trimmed.length <= limit) {
    return { visible: trimmed, hidden: "", truncated: false };
  }

  const breakAt = trimmed.lastIndexOf(" ", limit);
  const cut = breakAt > 0 ? breakAt : limit;

  return {
    visible: trimmed.slice(0, cut).trimEnd(),
    hidden: trimmed.slice(cut).trimStart(),
    truncated: true,
  };
}

export function splitDescriptionPreviewTiers(text: string): {
  landing: string;
  property: string;
  expanded: string;
  landingTruncated: boolean;
  expandedTruncated: boolean;
} {
  const landingPreview = splitDescriptionPreview(
    text,
    LANDING_DESCRIPTION_PREVIEW_LENGTH
  );
  const propertyPreview = splitDescriptionPreview(
    text,
    DESCRIPTION_PREVIEW_LENGTH
  );

  if (!landingPreview.truncated) {
    return {
      landing: landingPreview.visible,
      property: "",
      expanded: "",
      landingTruncated: false,
      expandedTruncated: false,
    };
  }

  const propertyVisible = propertyPreview.visible
    .slice(landingPreview.visible.length)
    .trimStart();

  return {
    landing: landingPreview.visible,
    property: propertyVisible,
    expanded: propertyPreview.hidden,
    landingTruncated: true,
    expandedTruncated: propertyPreview.truncated,
  };
}
