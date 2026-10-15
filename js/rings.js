/** Inverse of scripts/ringpack.py. Restores closed integer rings. */

export function decodeRings(encoded) {
  const binary = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  let offset = 0;
  const ringCount = view.getUint16(offset, true);
  offset += 2;
  const rings = new Array(ringCount);
  for (let ringIndex = 0; ringIndex < ringCount; ringIndex += 1) {
    const count = view.getUint16(offset, true);
    offset += 2;
    let x = view.getInt16(offset, true);
    offset += 2;
    let y = view.getInt16(offset, true);
    offset += 2;
    const ring = new Array(count + 1);
    ring[0] = [x, y];
    for (let point = 1; point < count; point += 1) {
      x += view.getInt8(offset);
      offset += 1;
      y += view.getInt8(offset);
      offset += 1;
      ring[point] = [x, y];
    }
    ring[count] = ring[0];
    rings[ringIndex] = ring;
  }
  return rings;
}
