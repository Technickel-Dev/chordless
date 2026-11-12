/**
 * Pictograms for the instruments' floating signs, as SVG path data on a
 * 24 x 24 grid drawn with round 2-unit strokes. They are Lucide icons
 * (ISC licence, https://lucide.dev), the same set the panel's UIKitML uses,
 * flattened to paths so a canvas can stroke them with Path2D.
 */
export const HUD_ICONS = {
  hand: ['M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2', 'M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2', 'M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8', 'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15'],
  grab: ['M18 11.5V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1.4', 'M14 10V8a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2', 'M10 9.9V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v5', 'M6 14a2 2 0 0 0-2-2a2 2 0 0 0-2 2', 'M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-4a8 8 0 0 1-8-8 2 2 0 1 1 4 0'],
  pointer: ['M22 14a8 8 0 0 1-8 8', 'M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2', 'M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1', 'M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10', 'M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15'],
  moveHorizontal: ['m18 8 4 4-4 4', 'M2 12h20', 'm6 8-4 4 4 4'],
  arrowDown: ['M12 5v14', 'm19 12-7 7-7-7'],
  arrowUp: ['m5 12 7-7 7 7', 'M12 19V5'],
  footprints: ['M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z', 'M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z', 'M16 17h4', 'M4 13h4'],
  volumeX: ['M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z', 'M22 9L16 15', 'M16 9L22 15'],
  hammer: ['m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9', 'm18 15 4-4', 'm21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5'],
  wind: ['M12.8 19.6A2 2 0 1 0 14 16H2', 'M17.5 8a2.5 2.5 0 1 1 2 4H2', 'M9.8 4.4A2 2 0 1 1 11 8H2'],
  gauge: ['m12 14 4-4', 'M3.34 19a10 10 0 1 1 17.32 0'],
  smile: ['M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0', 'M8 14s1.5 2 4 2 4-2 4-2', 'M9 9L9.01 9', 'M15 9L15.01 9'],
  arrowLeftRight: ['M8 3 4 7l4 4', 'M4 7h16', 'm16 21 4-4-4-4', 'M20 17H4'],
  rotateCw: ['M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8', 'M21 3v5h-5'],
  /** The panel's reset button. */
  locateFixed: ['M2 12h3', 'M19 12h3', 'M12 2v3', 'M12 19v3', 'M5 12a7 7 0 1 0 14 0a7 7 0 1 0 -14 0', 'M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0'],

  // Drawn for smashing, in the same style; Lucide has nothing for these.
  /** An impact: a jagged star. */
  burst: ['M12 2L13.61 8.12L19.07 4.93L16.99 9.93L22 12L15.88 13.61L19.07 19.07L14.07 16.99L12 22L10.39 15.88L4.93 19.07L7.01 14.07L2 12L8.12 10.39L4.93 4.93L9.93 7.01Z'],
  /** Swung down in an arc onto the floor. */
  swingDown: ['M4 3a14 14 0 0 1 12.5 13', 'M16.5 16l2.2-2.7', 'M16.5 16l-2.4-2.4', 'M3 21h18', 'M10.5 21l-1.5-2', 'M19.5 21l1.5-2'],
  /** Thrown, up and away. */
  throwArc: ['M3 20Q8 4 21 9', 'M21 9l-1.65-2.74', 'M21 9l-3.06.93', 'M3 22h5'],
  /** Tipped over its foot. */
  topple: ['M7.01 18.38L13.5 21L18.37 8.95L11.88 6.32Z', 'M2 21h20', 'M9 4Q20 3 21.5 11', 'M21.5 11l1.29-2.49', 'M21.5 11l-2.1-1.85'],
} as const;

export type HudIcon = keyof typeof HUD_ICONS;
