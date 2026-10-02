import { uid } from '../core/ids';
import { decodeAudio, readFileAsDataUrl, registerDataUrl, setAudioAsset } from '../render/assets';
import { disposeVideo, loadVideo } from '../render/video';
import { commit } from './store';

const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

/**
 * Add a video file to the project's footage: check the browser can play it, read its size and
 * length, and decode its sound track (if it has one) for mixing and export.
 */
export async function importVideo(file: File, mime: string): Promise<string> {
  if (file.size > MAX_VIDEO_BYTES) throw new Error(`"${file.name}" is larger than ${MAX_VIDEO_BYTES / 1024 / 1024} MB. Trim or compress it first: the whole file is kept in memory and saved inside the project.`);
  const id = uid('asset');
  const blob = new Blob([file], { type: mime });
  let info;
  try {
    info = await loadVideo(id, blob);
  } catch (e) {
    throw new Error(`${e instanceof Error ? e.message : 'Could not read the video.'} (${file.name})`);
  }
  let sound: AudioBuffer | null = null;
  try {
    sound = await decodeAudio(await file.arrayBuffer());
  } catch {
    sound = null; // no sound track, or a format the browser cannot extract sound from
  }
  let url: string;
  try {
    url = await readFileAsDataUrl(blob);
  } catch (e) {
    disposeVideo(id);
    throw e;
  }
  if (sound) setAudioAsset(id, url, sound);
  else registerDataUrl(id, url);
  commit((p) => {
    p.assets[id] = { id, name: file.name, kind: 'video', width: info.width, height: info.height, duration: info.duration, hasAudio: !!sound };
    p.assetOrder.push(id);
  });
  return id;
}
