/** Font stacks that exist everywhere, as a fallback and a safe default. */
export const GENERIC_FONTS = [
  { name: 'Sans-serif', css: 'Inter, Helvetica, Arial, sans-serif' },
  { name: 'Serif', css: 'Georgia, "Times New Roman", serif' },
  { name: 'Monospace', css: '"SF Mono", Menlo, Consolas, monospace' },
  { name: 'Impact', css: 'Impact, "Arial Black", sans-serif' },
  { name: 'Rounded', css: '"Trebuchet MS", "Segoe UI", sans-serif' },
  { name: 'Cursive', css: '"Comic Sans MS", "Brush Script MT", cursive' },
];

const CANDIDATES = [
  'Arial', 'Arial Black', 'Helvetica', 'Helvetica Neue', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Segoe UI', 'Calibri', 'Candara', 'Century Gothic',
  'Franklin Gothic Medium', 'Futura', 'Gill Sans', 'Optima', 'Avenir', 'Avenir Next', 'SF Pro Display', 'Roboto', 'Inter', 'Open Sans', 'Montserrat',
  'Lato', 'Poppins', 'Oswald', 'Bebas Neue', 'Impact', 'Georgia', 'Times New Roman', 'Palatino', 'Garamond', 'Baskerville', 'Didot', 'Cambria',
  'Playfair Display', 'Rockwell', 'Copperplate', 'Courier New', 'Menlo', 'Monaco', 'Consolas', 'Lucida Console', 'Comic Sans MS', 'Brush Script MT', 'Papyrus',
];

let cache: { name: string; css: string }[] | null = null;

/** Fonts from a well-known list that are actually installed here, found by measuring text against two fallbacks. */
export function installedFonts(): { name: string; css: string }[] {
  if (cache) return cache;
  const found: { name: string; css: string }[] = [];
  try {
    const ctx = document.createElement('canvas').getContext('2d')!;
    const sample = 'mmmmmmmmmmlliWWW0123';
    const width = (font: string) => {
      ctx.font = `72px ${font}`;
      return ctx.measureText(sample).width;
    };
    const base = { mono: width('monospace'), serif: width('serif'), sans: width('sans-serif') };
    for (const name of CANDIDATES) {
      const quoted = `"${name}"`;
      const here = [width(`${quoted}, monospace`), width(`${quoted}, serif`), width(`${quoted}, sans-serif`)];
      if (here[0] !== base.mono || here[1] !== base.serif || here[2] !== base.sans) found.push({ name, css: `${quoted}, sans-serif` });
    }
  } catch {
    /* no canvas (tests): only the generic stacks */
  }
  cache = found;
  return found;
}
