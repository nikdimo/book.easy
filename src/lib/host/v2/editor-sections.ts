/**
 * The editor's left navigation.
 *
 * One list, shared by the desktop rail and the phone chip row, so the two can never
 * drift. `built: false` sections are real routes that show a short placeholder — a
 * navigation item that does nothing when clicked is worse than one that explains itself.
 */
export interface EditorSection {
  slug: string;
  /** UI catalog key for the label. */
  key: string;
  /** English source text, and the fallback when nothing is translated. */
  source: string;
  built: boolean;
  completion: boolean;
  group?: "calendar";
}

export const EDITOR_SECTIONS: EditorSection[] = [
  { slug: "photos", key: "host.editor.section.photos", source: "Photos", built: true, completion: true },
  { slug: "basics", key: "host.editor.section.basics", source: "Title & description", built: true, completion: true },
  { slug: "rooms", key: "host.editor.section.rooms", source: "Property details", built: false, completion: true },
  { slug: "amenities", key: "host.editor.section.amenities", source: "Amenities", built: true, completion: true },
  { slug: "location", key: "host.editor.section.location", source: "Location", built: false, completion: true },
  { slug: "house-rules", key: "host.editor.section.house_rules", source: "House rules", built: false, completion: true },
  { slug: "arrival-guide", key: "host.editor.section.arrival_guide", source: "Arrival guide", built: false, completion: true },
  { slug: "pricing", key: "host.editor.section.pricing", source: "Pricing", built: true, completion: false, group: "calendar" },
  { slug: "availability", key: "host.editor.section.availability", source: "Availability", built: true, completion: false, group: "calendar" },
];

export const EDITOR_COMPLETION_SECTIONS = EDITOR_SECTIONS.filter((section) => section.completion);

const EDITOR_COMPLETION_SLUGS = new Set(
  EDITOR_COMPLETION_SECTIONS.map((section) => section.slug),
);

/** Counts only real listing tasks, even if a caller accidentally includes one of the
 * Calendar handoff pages in its completed-slug payload. */
export function editorCompletionCount(completedSlugs: readonly string[]): number {
  return new Set(completedSlugs.filter((slug) => EDITOR_COMPLETION_SLUGS.has(slug))).size;
}

/** Completion facts shared by every route. Keeping this pure prevents a section's
 * checkmark from disappearing merely because the host navigated elsewhere. */
export function editorCompletedSections(input: {
  photoCount: number;
  basicsComplete: boolean;
}): string[] {
  return [
    ...(input.photoCount > 0 ? ["photos"] : []),
    ...(input.basicsComplete ? ["basics"] : []),
  ];
}

export function findEditorSection(slug: string): EditorSection | undefined {
  return EDITOR_SECTIONS.find((section) => section.slug === slug);
}
