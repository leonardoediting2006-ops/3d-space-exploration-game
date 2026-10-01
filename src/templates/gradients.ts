import { makeGradient } from '../core/gradient';

export interface GradientPreset {
  id: string;
  name: string;
  group: string;
  colors: string[];
  positions?: number[];
}

export const presetGradient = (p: GradientPreset): number[] => makeGradient(p.colors, p.positions);

const g = (id: string, name: string, group: string, colors: string[], positions?: number[]): GradientPreset => ({ id, name, group, colors, positions });

/** Ready-made gradients. Colours are multi-stop and can be edited after applying. */
export const GRADIENT_PRESETS: GradientPreset[] = [
  g('sunset', 'Sunset', 'Warm', ['#ff512f', '#f09819', '#dd2476']),
  g('sunrise', 'Sunrise', 'Warm', ['#f6d365', '#fda085']),
  g('fire', 'Fire', 'Warm', ['#f12711', '#f5af19']),
  g('lava', 'Lava', 'Warm', ['#200122', '#6f0000', '#ff4500', '#ffd000'], [0, 0.35, 0.7, 1]),
  g('peach', 'Peach', 'Warm', ['#ed4264', '#ffedbc']),
  g('ember', 'Ember', 'Warm', ['#4b0000', '#ff3d00', '#ffc400']),
  g('candle', 'Candlelight', 'Warm', ['#ffecd2', '#fcb69f']),
  g('instagram', 'Social Pink', 'Warm', ['#833ab4', '#fd1d1d', '#fcb045']),

  g('ocean', 'Ocean', 'Cool', ['#2193b0', '#6dd5ed']),
  g('deepSea', 'Deep Sea', 'Cool', ['#000428', '#004e92']),
  g('ice', 'Ice', 'Cool', ['#e0eafc', '#cfdef3', '#a1c4fd'], [0, 0.5, 1]),
  g('aurora', 'Aurora', 'Cool', ['#00c9ff', '#92fe9d']),
  g('arctic', 'Arctic', 'Cool', ['#667db6', '#0082c8', '#0082c8', '#667db6'], [0, 0.4, 0.6, 1]),
  g('lagoon', 'Lagoon', 'Cool', ['#0f2027', '#203a43', '#2c5364']),
  g('twilight', 'Twilight', 'Cool', ['#0b486b', '#f56217']),
  g('midnight', 'Midnight', 'Cool', ['#0f0c29', '#302b63', '#24243e']),

  g('neonPink', 'Neon Pink', 'Vivid', ['#ff00cc', '#333399']),
  g('cyberpunk', 'Cyberpunk', 'Vivid', ['#fc00ff', '#00dbde']),
  g('vaporwave', 'Vaporwave', 'Vivid', ['#ff71ce', '#b967ff', '#01cdfe', '#05ffa1']),
  g('synthwave', 'Synthwave', 'Vivid', ['#2b1055', '#7597de', '#ff5fa2', '#ffd319'], [0, 0.35, 0.7, 1]),
  g('miami', 'Miami', 'Vivid', ['#ff0080', '#ff8c00', '#40e0d0']),
  g('toxic', 'Toxic', 'Vivid', ['#0f2027', '#7cff00']),
  g('electric', 'Electric', 'Vivid', ['#4776e6', '#8e54e9']),
  g('plasma', 'Plasma', 'Vivid', ['#f953c6', '#b91d73', '#4a00e0']),

  g('rainbow', 'Rainbow', 'Spectrum', ['#ff0000', '#ff9900', '#ffee00', '#33cc33', '#0099ff', '#6633ff', '#cc33ff']),
  g('rainbowLoop', 'Rainbow (looping)', 'Spectrum', ['#ff0000', '#ffcc00', '#33ff66', '#00ccff', '#9933ff', '#ff0000']),
  g('hueWarmCool', 'Warm to Cool', 'Spectrum', ['#ff5f6d', '#ffc371', '#6dd5fa', '#2980b9']),
  g('traffic', 'Traffic Light', 'Spectrum', ['#00c853', '#ffd600', '#d50000']),
  g('spectrumSoft', 'Soft Spectrum', 'Spectrum', ['#ffafbd', '#ffc3a0', '#fff1a8', '#b5ead7', '#a0c4ff', '#cdb4ff']),

  g('lavender', 'Lavender', 'Pastel', ['#a18cd1', '#fbc2eb']),
  g('cotton', 'Cotton Candy', 'Pastel', ['#ffafbd', '#ffc3a0']),
  g('mintCream', 'Mint Cream', 'Pastel', ['#d4fc79', '#96e6a1']),
  g('babyBlue', 'Baby Blue', 'Pastel', ['#a1c4fd', '#c2e9fb']),
  g('blush', 'Blush', 'Pastel', ['#fbc2eb', '#a6c1ee']),
  g('lemonade', 'Lemonade', 'Pastel', ['#fff1eb', '#ace0f9']),

  g('gold', 'Gold', 'Metal', ['#bf953f', '#fcf6ba', '#b38728', '#fbf5b7', '#aa771c'], [0, 0.25, 0.5, 0.75, 1]),
  g('chrome', 'Chrome', 'Metal', ['#ffffff', '#9aa0a6', '#ffffff', '#5f6368', '#dfe3e8'], [0, 0.35, 0.5, 0.52, 1]),
  g('roseGold', 'Rose Gold', 'Metal', ['#b76e79', '#f6d3cb', '#b76e79', '#f1c7be'], [0, 0.35, 0.65, 1]),
  g('bronze', 'Bronze', 'Metal', ['#804a00', '#ffd89b', '#804a00']),
  g('steel', 'Steel', 'Metal', ['#bdc3c7', '#2c3e50']),
  g('silver', 'Silver', 'Metal', ['#e6e9f0', '#ffffff', '#c9ced6', '#ffffff', '#aab2bd'], [0, 0.25, 0.5, 0.75, 1]),

  g('forest', 'Forest', 'Nature', ['#134e5e', '#71b280']),
  g('meadow', 'Meadow', 'Nature', ['#56ab2f', '#a8e063']),
  g('desert', 'Desert', 'Nature', ['#c79081', '#dfa579']),
  g('canyon', 'Canyon', 'Nature', ['#8e2de2', '#ff6a00', '#ffd66b'], [0, 0.55, 1]),
  g('galaxy', 'Galaxy', 'Nature', ['#0f0c29', '#5b2a86', '#e94057', '#f27121'], [0, 0.4, 0.75, 1]),
  g('sky', 'Daytime Sky', 'Nature', ['#1e90ff', '#87ceeb', '#e0f6ff'], [0, 0.6, 1]),

  g('blackWhite', 'Black → White', 'Basic', ['#000000', '#ffffff']),
  g('whiteBlack', 'White → Black', 'Basic', ['#ffffff', '#000000']),
  g('graphite', 'Graphite', 'Basic', ['#232526', '#414345']),
  g('duoBlueOrange', 'Duotone Blue / Orange', 'Basic', ['#0f4c81', '#ff8c42']),
  g('duoPurpleYellow', 'Duotone Purple / Yellow', 'Basic', ['#4b1d8f', '#ffd23f']),
  g('redBlack', 'Red → Black', 'Basic', ['#e52d27', '#0a0a0a']),
  g('hologram', 'Hologram', 'Basic', ['#a8edea', '#fed6e3', '#c3cfe2', '#a8edea'], [0, 0.4, 0.7, 1]),
];

export const GRADIENT_BY_ID: Record<string, GradientPreset> = Object.fromEntries(GRADIENT_PRESETS.map((p) => [p.id, p]));
