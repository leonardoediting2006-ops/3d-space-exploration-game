import { describe, expect, it } from 'vitest';
import { crc32, makeZip } from './zip';

describe('zip', () => {
  it('computes the standard CRC-32 check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('writes a well-formed archive', async () => {
    const blob = makeZip([
      { name: 'a.txt', data: new TextEncoder().encode('hello') },
      { name: 'dir/b.bin', data: new Uint8Array([1, 2, 3, 4]) },
    ]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const dv = new DataView(bytes.buffer);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    expect(dv.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
    expect(dv.getUint16(bytes.length - 22 + 10, true)).toBe(2);
  });
});
