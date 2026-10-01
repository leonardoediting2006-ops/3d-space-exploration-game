let counter = 0;

/** Short, collision-resistant ids for layers, keyframes, effects and so on. */
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1_679_616;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}
