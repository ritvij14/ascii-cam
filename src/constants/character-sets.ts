export interface CharacterSet {
  name: string;
  description: string;
  characters: string;
}

export const CHARACTER_SETS: Record<string, CharacterSet> = {
MINIMAL: {
    name: 'Minimal',
    description: 'Basic ASCII characters',
    characters: ' .:-=+*#%@',
  },
  STANDARD: {
    name: 'Standard',
    description: 'Full ASCII gradient from light to dark',
    characters: ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$',
  },
  BLOCKS: {
    name: 'Blocks',
    description: 'Unicode block characters for smooth gradients',
    characters: ' ░▒▓█',
  },
};

export const DEFAULT_CHARSET = 'STANDARD';

// Single-dominant-color emojis with their approximate dominant RGB values.
// Used in emoji mode: each cell picks the emoji with the closest color to the avg cell RGB.
export const EMOJI_COLOR_PALETTE: { emoji: string; r: number; g: number; b: number }[] = [
  // Darks
  { emoji: '⬛', r: 10,  g: 10,  b: 10  },
  { emoji: '🖤', r: 35,  g: 35,  b: 35  },
  // Browns / dark warm
  { emoji: '🤎', r: 110, g: 60,  b: 30  },
  { emoji: '🟫', r: 140, g: 90,  b: 55  },
  // Warm neutrals / skin tones
  { emoji: '🫚', r: 195, g: 135, b: 70  }, // golden-tan / olive skin
  { emoji: '🍑', r: 255, g: 175, b: 135 }, // peach / light skin
  // Reds
  { emoji: '🔴', r: 215, g: 35,  b: 35  },
  { emoji: '❤️', r: 230, g: 50,  b: 50  },
  // Oranges
  { emoji: '🟠', r: 225, g: 100, b: 15  },
  { emoji: '🧡', r: 240, g: 125, b: 25  },
  // Yellows
  { emoji: '🟡', r: 240, g: 195, b: 35  },
  { emoji: '💛', r: 250, g: 215, b: 0   },
  // Greens
  { emoji: '🌿', r: 75,  g: 130, b: 55  },
  { emoji: '💚', r: 55,  g: 165, b: 55  },
  { emoji: '🟩', r: 80,  g: 185, b: 75  },
  // Blues
  { emoji: '💙', r: 45,  g: 105, b: 210 },
  { emoji: '🟦', r: 55,  g: 115, b: 215 },
  // Purples / pinks
  { emoji: '💜', r: 150, g: 60,  b: 200 },
  { emoji: '🟣', r: 155, g: 65,  b: 200 },
  { emoji: '🩷', r: 240, g: 135, b: 165 },
  { emoji: '🌸', r: 245, g: 165, b: 185 },
  // Whites
  { emoji: '🤍', r: 235, g: 235, b: 235 },
  { emoji: '⬜', r: 255, g: 255, b: 255 },
];

/** Find the emoji whose dominant color is closest to the given RGB (squared Euclidean distance) */
export function rgbToNearestEmoji(r: number, g: number, b: number): string {
  let best = EMOJI_COLOR_PALETTE[0];
  let bestDist = Infinity;
  for (const entry of EMOJI_COLOR_PALETTE) {
    const dr = r - entry.r, dg = g - entry.g, db = b - entry.b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) { bestDist = dist; best = entry; }
  }
  return best.emoji;
}
