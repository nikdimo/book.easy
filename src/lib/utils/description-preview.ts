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
