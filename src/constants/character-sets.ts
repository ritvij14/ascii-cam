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

export const BAYER_MATRIX_4X4: number[][] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
