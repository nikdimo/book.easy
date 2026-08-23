/**
 * Arrival-guide topics that cannot be stored safely yet.
 *
 * Check-in and check-out times already have one owner: House rules. Arrival guide may
 * show those values as a read-only summary, but it must not provide a second editor for
 * the same columns. The remaining topics have no storage or guest-visibility contract,
 * and several are physical-access credentials, so the UI names them honestly instead
 * of rendering controls that cannot save.
 */
export const ARRIVAL_GUIDE_UNAVAILABLE_TOPICS: readonly {
  key: string;
  source: string;
}[] = [
  { key: "host.editor.arrival_guide.topic_check_in_method", source: "Check-in method" },
  { key: "host.editor.arrival_guide.topic_directions", source: "Directions to the door" },
  { key: "host.editor.arrival_guide.topic_parking", source: "Parking" },
  { key: "host.editor.arrival_guide.topic_access", source: "Door or lockbox access" },
  { key: "host.editor.arrival_guide.topic_wifi", source: "Wi-Fi network and password" },
  { key: "host.editor.arrival_guide.topic_instructions", source: "Written arrival instructions" },
];
