/**
 * Every scene the panel's Prev/Next buttons cycle through, in order. The
 * first entry is the scene iwsdk.config.json opens with. Each scene file
 * carries its own welcome-panel node; the guitar is persistent, so it
 * survives the level change.
 */
export interface SceneEntry {
  file: string;
  name: string;
}

export const SCENES: readonly SceneEntry[] = [
  { file: 'main', name: 'Theatre' },
  { file: 'farm', name: 'Farm Festival' },
  { file: 'living-room', name: "Grandma's Living Room" },
  { file: 'birthday-cake', name: 'Giant Birthday Cake' },
  { file: 'dentist', name: "Dentist's Waiting Room" },
  { file: 'laundromat', name: 'Laundromat' },
  { file: 'ice-floe', name: 'Ice Floe' },
  { file: 'break-room', name: 'Office Break Room' },
  { file: 'giant-table', name: "Giant's Kitchen Table" },
  { file: 'bathtub', name: 'Bathtub' },
  { file: 'wedding', name: 'Abandoned Wedding' },
  { file: 'cliffside', name: 'Cliffside Sunset' },
  { file: 'northern-lights', name: 'Northern Lights' },
  { file: 'underwater', name: 'Underwater' },
  { file: 'lantern-lake', name: 'Lantern Lake' },
  { file: 'blossom-garden', name: 'Cherry Blossom Garden' },
];

export function sceneUrl(entry: SceneEntry): string {
  return `${import.meta.env.BASE_URL}scenes/${entry.file}.iwsdk.scene.json`;
}

/** Index of `?scene=<file>` in the list, or -1 when absent or unknown. */
export function sceneFromQuery(search: string): number {
  const file = new URLSearchParams(search).get('scene');
  return file == null ? -1 : SCENES.findIndex((s) => s.file === file);
}
