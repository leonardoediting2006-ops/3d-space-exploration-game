import type { SVGProps } from 'react';

/**
 * One small, consistent icon set (16px grid, 1.5px strokes) so the interface needs no emoji or
 * glyph fonts. Each entry is the inner markup of an SVG that inherits `currentColor`.
 */
const PATHS = {
  select: <path d="M4 2.5l8.5 5-3.8 1 2.2 4-1.7.9-2.2-4L4.2 12z" fill="currentColor" stroke="currentColor" strokeLinejoin="round" />,
  hand: <path d="M5.5 8V3.8a1 1 0 012 0V7m0-3.7a1 1 0 012 0V7m0-2.5a1 1 0 012 0V8m0-1.5a1 1 0 012 0v3.2c0 2.3-1.7 4.3-4 4.3H8.6a3.5 3.5 0 01-2.8-1.4L3.3 9.5a1 1 0 011.6-1.2L5.5 9" />,
  zoom: <><circle cx="7" cy="7" r="4.2" /><path d="M10.2 10.2L13.5 13.5" /></>,
  shape: <rect x="2.8" y="3.8" width="10.4" height="8.4" rx="1.6" />,
  ellipse: <ellipse cx="8" cy="8" rx="5.2" ry="4.2" />,
  star: <path d="M8 2.2l1.7 3.6 3.9.5-2.9 2.7.8 3.9L8 10.9l-3.5 2 .8-3.9L2.4 6.3l3.9-.5z" strokeLinejoin="round" />,
  pen: <><path d="M3 13l1-3.6 6.6-6.6a1.4 1.4 0 012 2L6 11.4z" strokeLinejoin="round" /><path d="M9.4 4l2.6 2.6" /></>,
  text: <><path d="M3.5 4.2V3h9v1.2M8 3v10M6.2 13h3.6" /></>,
  anchor: <><circle cx="8" cy="8" r="2.2" /><path d="M8 1.8v3.5M8 10.7v3.5M1.8 8h3.5M10.7 8h3.5" /></>,
  plus: <path d="M8 3.2v9.6M3.2 8h9.6" />,
  minus: <path d="M3.2 8h9.6" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  check: <path d="M3.5 8.5l3 3 6-6.5" />,
  chevronRight: <path d="M6 3.5L10.5 8 6 12.5" />,
  chevronDown: <path d="M3.5 6L8 10.5 12.5 6" />,
  more: <><circle cx="3.6" cy="8" r="1" fill="currentColor" /><circle cx="8" cy="8" r="1" fill="currentColor" /><circle cx="12.4" cy="8" r="1" fill="currentColor" /></>,
  eye: <><path d="M1.6 8s2.4-4.4 6.4-4.4S14.4 8 14.4 8s-2.4 4.4-6.4 4.4S1.6 8 1.6 8z" /><circle cx="8" cy="8" r="1.9" /></>,
  eyeOff: <><path d="M2.5 2.5l11 11M6.4 4a6.5 6.5 0 011.6-.4c4 0 6.4 4.4 6.4 4.4s-.7 1.3-1.9 2.5M4 5.7A9.6 9.6 0 001.6 8s2.4 4.4 6.4 4.4c1 0 2-.3 2.8-.7" /></>,
  lock: <><rect x="3.6" y="7.2" width="8.8" height="6" rx="1.4" /><path d="M5.6 7.2V5.4a2.4 2.4 0 014.8 0v1.8" /></>,
  unlock: <><rect x="3.6" y="7.2" width="8.8" height="6" rx="1.4" /><path d="M5.6 7.2V5.4a2.4 2.4 0 014.6-.9" /></>,
  solo: <circle cx="8" cy="8" r="3" fill="currentColor" />,
  diamond: <path d="M8 2.6L13.4 8 8 13.4 2.6 8z" strokeLinejoin="round" />,
  diamondFilled: <path d="M8 2.6L13.4 8 8 13.4 2.6 8z" fill="currentColor" strokeLinejoin="round" />,
  prev: <path d="M10 3.5L5.5 8l4.5 4.5" />,
  next: <path d="M6 3.5L10.5 8 6 12.5" />,
  reset: <><path d="M3.2 8a4.8 4.8 0 108-3.5" /><path d="M3 3v3.4h3.4" /></>,
  trash: <path d="M3 4.5h10M6.2 4.5V3h3.6v1.5M4.4 4.5l.6 8.5h6l.6-8.5" />,
  search: <><circle cx="7" cy="7" r="4.2" /><path d="M10.2 10.2l3.3 3.3" /></>,
  sparkle: <path d="M8 2l1.4 4.1L13.5 7.5 9.4 8.9 8 13 6.6 8.9 2.5 7.5l4.1-1.4zM12.6 11.2l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z" strokeLinejoin="round" />,
  sliders: <><path d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6" /><circle cx="10" cy="4.5" r="1.5" /><circle cx="6" cy="11.5" r="1.5" /></>,
  play: <path d="M5 3.2l7 4.8-7 4.8z" fill="currentColor" strokeLinejoin="round" />,
  pause: <><rect x="4.2" y="3.2" width="2.6" height="9.6" rx=".6" fill="currentColor" /><rect x="9.2" y="3.2" width="2.6" height="9.6" rx=".6" fill="currentColor" /></>,
  skipStart: <><path d="M4 3.5v9" /><path d="M12.5 3.5L6.5 8l6 4.5z" fill="currentColor" strokeLinejoin="round" /></>,
  skipEnd: <><path d="M12 3.5v9" /><path d="M3.5 3.5L9.5 8l-6 4.5z" fill="currentColor" strokeLinejoin="round" /></>,
  stepBack: <path d="M10.5 3.5L5 8l5.5 4.5z" fill="currentColor" strokeLinejoin="round" />,
  stepForward: <path d="M5.5 3.5L11 8l-5.5 4.5z" fill="currentColor" strokeLinejoin="round" />,
  loop: <><path d="M3 7.5V7a2.5 2.5 0 012.5-2.5H12M12 4.5L10.2 2.7M12 4.5l-1.8 1.8M13 8.5V9a2.5 2.5 0 01-2.5 2.5H4M4 11.5l1.8 1.8M4 11.5l1.8-1.8" /></>,
  grid: <path d="M2.5 2.5h11v11h-11zM2.5 8h11M8 2.5v11" />,
  safe: <><rect x="2.2" y="3.2" width="11.6" height="9.6" rx="1" /><rect x="4.4" y="5.2" width="7.2" height="5.6" rx=".6" strokeDasharray="1.6 1.4" /></>,
  copy: <><rect x="5.5" y="5.5" width="8" height="8" rx="1.4" /><path d="M10.5 5.5V4a1.5 1.5 0 00-1.5-1.5H4A1.5 1.5 0 002.5 4v5A1.5 1.5 0 004 10.5h1.5" /></>,
  layers: <><path d="M8 2.4l6 3.2-6 3.2-6-3.2z" strokeLinejoin="round" /><path d="M2 8.4l6 3.2 6-3.2M2 11.2l6 3.2 6-3.2" strokeLinejoin="round" /></>,
  image: <><rect x="2.4" y="3" width="11.2" height="10" rx="1.6" /><circle cx="6" cy="6.6" r="1.1" /><path d="M2.6 12l3.6-3.4 2.6 2.4 2-1.8 2.6 2.4" /></>,
  comp: <><rect x="2.4" y="3.4" width="11.2" height="9.2" rx="1.6" /><path d="M2.4 6.2h11.2" /></>,
  film: <><rect x="2.4" y="2.8" width="11.2" height="10.4" rx="1.6" /><path d="M5 2.8v10.4M11 2.8v10.4M2.4 6h2.6M2.4 10h2.6M11 6h2.6M11 10h2.6" /></>,
  download: <path d="M8 2.5v7.5M4.8 7.3L8 10.5l3.2-3.2M3 13h10" />,
  folder: <path d="M2.4 4.6a1.2 1.2 0 011.2-1.2h2.7l1.4 1.6h4.3a1.2 1.2 0 011.2 1.2v5.2a1.2 1.2 0 01-1.2 1.2H3.6a1.2 1.2 0 01-1.2-1.2z" strokeLinejoin="round" />,
  undo: <><path d="M3.5 6.5h6a3 3 0 010 6H6" /><path d="M6 3.8L3.3 6.5 6 9.2" /></>,
  redo: <><path d="M12.5 6.5h-6a3 3 0 000 6H10" /><path d="M10 3.8l2.7 2.7L10 9.2" /></>,
  link: <><path d="M6.8 9.2a2.6 2.6 0 003.7 0l2-2a2.6 2.6 0 00-3.7-3.7l-.9.9" /><path d="M9.2 6.8a2.6 2.6 0 00-3.7 0l-2 2a2.6 2.6 0 003.7 3.7l.9-.9" /></>,
  unlink: <><path d="M6.4 3.4l.4-.4a2.6 2.6 0 013.7 3.7l-1 1M9.6 12.6l-.4.4a2.6 2.6 0 01-3.7-3.7l1-1" /><path d="M2.5 2.5l11 11" /></>,
  ease: <><path d="M2.5 13.5C7 13.5 9 2.5 13.5 2.5" /><circle cx="2.5" cy="13.5" r="1" fill="currentColor" /><circle cx="13.5" cy="2.5" r="1" fill="currentColor" /></>,
  clock: <><circle cx="8" cy="8" r="5.4" /><path d="M8 4.8V8l2.2 1.4" /></>,
  blur: <><circle cx="8" cy="8" r="2.2" /><circle cx="8" cy="8" r="5" strokeDasharray="1.2 1.8" /></>,
  wand: <><path d="M3 13L9.5 6.5" /><path d="M10 3v2M9 4h2M13 7v2M12 8h2M6.5 2.5v1.4M5.8 3.2h1.4" /></>,
  fit: <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />,
  alignLeft: <><path d="M2.5 2v12" /><rect x="4.5" y="4" width="8" height="3" rx=".6" /><rect x="4.5" y="9" width="5" height="3" rx=".6" /></>,
  alignCenterH: <><path d="M8 2v12" /><rect x="3.5" y="4" width="9" height="3" rx=".6" /><rect x="5" y="9" width="6" height="3" rx=".6" /></>,
  alignRight: <><path d="M13.5 2v12" /><rect x="3.5" y="4" width="8" height="3" rx=".6" /><rect x="6.5" y="9" width="5" height="3" rx=".6" /></>,
  alignTop: <><path d="M2 2.5h12" /><rect x="4" y="4.5" width="3" height="8" rx=".6" /><rect x="9" y="4.5" width="3" height="5" rx=".6" /></>,
  alignMiddle: <><path d="M2 8h12" /><rect x="4" y="3.5" width="3" height="9" rx=".6" /><rect x="9" y="5" width="3" height="6" rx=".6" /></>,
  alignBottom: <><path d="M2 13.5h12" /><rect x="4" y="3.5" width="3" height="8" rx=".6" /><rect x="9" y="6.5" width="3" height="5" rx=".6" /></>,
  distributeH: <><path d="M2.5 2v12M13.5 2v12" /><rect x="6.5" y="4.5" width="3" height="7" rx=".6" /></>,
  distributeV: <><path d="M2 2.5h12M2 13.5h12" /><rect x="4.5" y="6.5" width="7" height="3" rx=".6" /></>,
  startOfLayer: <><path d="M3 2.5v11" /><path d="M5.5 8h7M9.5 5l3 3-3 3" /></>,
  endOfLayer: <><path d="M13 2.5v11" /><path d="M10.5 8h-7M6.5 5l-3 3 3 3" /></>,
  motionBlur: <><circle cx="10.5" cy="8" r="3.2" /><path d="M2.5 6h3M1.5 8h4M2.5 10h3" /></>,
  command: <path d="M5.5 5.5h5v5h-5zM5.5 5.5V4a1.5 1.5 0 10-1.5 1.5zM10.5 5.5V4A1.5 1.5 0 1112 5.5zM5.5 10.5V12A1.5 1.5 0 114 10.5zM10.5 10.5V12a1.5 1.5 0 101.5-1.5z" />,
  info: <><circle cx="8" cy="8" r="5.6" /><path d="M8 7.2v3.6M8 5v.2" /></>,
  arrowRight: <path d="M3 8h10M9.5 4.5L13 8l-3.5 3.5" />,
  keyboard: <><rect x="1.8" y="4" width="12.4" height="8" rx="1.6" /><path d="M4.4 6.6h.1M7 6.6h.1M9.6 6.6h.1M11.8 6.6h.1M5 9.4h6" /></>,
  fx: <path d="M3 12.5L7.4 3.5h1.2M5 8h3M9.5 8l3 4.5M12.5 8l-3 4.5" />,
  mask: <><rect x="2.4" y="2.4" width="11.2" height="11.2" rx="1.6" /><circle cx="8" cy="8" r="3.2" /></>,
  heart: <path d="M8 13.2S2.6 10 2.6 6.2A2.9 2.9 0 018 5a2.9 2.9 0 015.4 1.2C13.4 10 8 13.2 8 13.2z" strokeLinejoin="round" />,
  heartFilled: <path d="M8 13.2S2.6 10 2.6 6.2A2.9 2.9 0 018 5a2.9 2.9 0 015.4 1.2C13.4 10 8 13.2 8 13.2z" fill="currentColor" strokeLinejoin="round" />,
  dropper: <><path d="M10.6 2.6l2.8 2.8-1.6 1.6-2.8-2.8z" /><path d="M9 4.2L3.4 9.8v2.8h2.8l5.6-5.6" /></>,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg
      className={`icon ${className ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

/** Icon for a layer type, used in the timeline and the Inspector header. */
export const LAYER_ICON: Record<string, IconName> = {
  solid: 'shape',
  shape: 'star',
  text: 'text',
  image: 'image',
  precomp: 'comp',
  null: 'anchor',
  adjustment: 'sliders',
};
