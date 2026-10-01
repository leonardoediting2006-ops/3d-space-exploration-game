// Footage bytes live outside the (undoable, cloned) project document: they are large,
// immutable, and only referenced by id. This module owns them and decodes them to images.

const dataUrls = new Map<string, string>();
const images = new Map<string, HTMLImageElement>();
const listeners = new Set<() => void>();

export function setAssetData(id: string, dataUrl: string): Promise<void> {
  dataUrls.set(id, dataUrl);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      images.set(id, img);
      listeners.forEach((fn) => fn());
      resolve();
    };
    img.onerror = () => resolve();
    img.src = dataUrl;
  });
}

export const getAssetImage = (id: string): HTMLImageElement | undefined => images.get(id);
export const getAssetData = (id: string): string | undefined => dataUrls.get(id);
export const allAssetData = (): Record<string, string> => Object.fromEntries(dataUrls);

export function clearAssets(): void {
  dataUrls.clear();
  images.clear();
}

/** Subscribe to "an image finished decoding" so the viewer can redraw. */
export function onAssetsChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = dataUrl;
  });
}
