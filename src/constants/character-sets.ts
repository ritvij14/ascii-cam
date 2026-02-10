export interface CharacterSet {
  name: string;
  description: string;
  characters: string;
}

export const CHARACTER_SETS: Record<string, CharacterSet> = {
  DOTS: {
    name: 'Dots',
    description: 'Just periods - minimal detail',
    characters: '.',
  },
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
