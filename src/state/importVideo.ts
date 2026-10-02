// Video import arrives with the video footage support; until then files are refused politely.
export async function importVideo(file: File, _mime: string): Promise<string> {
  throw new Error(`Video import is not available yet ("${file.name}").`);
}
