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
  { file: 'stage', name: 'Theatre' },
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
  { file: 'desert-canyon', name: 'Desert Canyon' },
  { file: 'rainy-rooftop', name: 'Rainy Rooftop' },
  { file: 'stadium', name: 'Stadium Headliner' },
  { file: 'space-station', name: 'Space Station' },
  { file: 'volcano-rim', name: 'Volcano Rim' },
  { file: 'train-roof', name: 'Train Roof' },
  { file: 'jazz-club', name: '1950s Jazz Club' },
  { file: 'mountaintop', name: 'Mountaintop' },
  { file: 'pirate-ship', name: 'Pirate Ship' },
  { file: 'snow-globe', name: 'Snow Globe' },
  { file: 'library', name: 'Endless Library' },
  { file: 'clock-tower', name: 'Clock Tower' },
  { file: 'giant-turtle', name: 'Giant Turtle' },
  { file: 'museum', name: 'Museum at Night' },
  { file: 'surreal-desert', name: 'Surreal Desert' },
  { file: 'bowling-alley', name: 'Bowling Alley' },
  { file: 'fridge', name: 'Inside a Fridge' },
  { file: 'car-wash', name: 'Car Wash' },
  { file: 'mini-golf', name: 'Mini Golf' },
  { file: 'school-gym', name: 'School Gym' },
  { file: 'parking-garage', name: 'Parking Garage' },
  { file: 'giant-desk', name: "Giant's Desk" },
  { file: 'bouncy-castle', name: 'Bouncy Castle' },
  { file: 'supermarket', name: 'Supermarket Aisle' },
  { file: 'pinball', name: 'Inside a Pinball Machine' },
  { file: 'lavender-field', name: 'Lavender Field' },
  { file: 'bamboo-forest', name: 'Bamboo Forest' },
  { file: 'waterfall-pool', name: 'Waterfall Pool' },
  { file: 'autumn-clearing', name: 'Autumn Clearing' },
  { file: 'tropical-beach', name: 'Tropical Beach' },
  { file: 'ice-cave', name: 'Ice Cave' },
  { file: 'rice-terraces', name: 'Rice Terraces' },
  { file: 'airport-runway', name: 'Airport Runway' },
  { file: 'lighthouse', name: 'Lighthouse Gallery' },
  { file: 'balloon-basket', name: 'Hot Air Balloon' },
  { file: 'helipad', name: 'Rooftop Helipad' },
  { file: 'drive-in', name: 'Drive-In Cinema' },
  { file: 'skate-bowl', name: 'Skate Park Bowl' },
  { file: 'neon-arcade', name: 'Neon Arcade' },
  { file: 'floating-islands', name: 'Floating Islands' },
  { file: 'chessboard', name: 'Chessboard Plain' },
  { file: 'lava-lamp', name: 'Inside a Lava Lamp' },
  { file: 'upside-down-room', name: 'Upside-Down Room' },
  { file: 'record-player', name: 'Giant Record Player' },
  { file: 'paper-world', name: 'Paper World' },
];

export function sceneUrl(entry: SceneEntry): string {
  return `${import.meta.env.BASE_URL}scenes/${entry.file}.iwsdk.scene.json`;
}

/** Index of `?scene=<file>` in the list, or -1 when absent or unknown. */
export function sceneFromQuery(search: string): number {
  const file = new URLSearchParams(search).get('scene');
  return file == null ? -1 : SCENES.findIndex((s) => s.file === file);
}
