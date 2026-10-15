"""Pack projected province rings into a base64 delta blob.

Coordinates are already integer map pixels. Consecutive points differ by
less than 128 pixels, so each step is two signed bytes. The decoder in
js/rings.js restores the same closed rings used for hit testing and SVG.
"""

from __future__ import annotations

import base64
import struct


def pack_rings(rings: list) -> str:
    buf = bytearray()
    buf += struct.pack("<H", len(rings))
    for ring in rings:
        points = list(ring)
        if len(points) > 1 and points[0] == points[-1]:
            points = points[:-1]
        if len(points) < 3:
            raise ValueError("ring is too short to pack")
        if len(points) > 65535:
            raise ValueError("ring is too long to pack")
        buf += struct.pack("<H", len(points))
        x0, y0 = int(points[0][0]), int(points[0][1])
        buf += struct.pack("<hh", x0, y0)
        px, py = x0, y0
        for point in points[1:]:
            x, y = int(point[0]), int(point[1])
            dx, dy = x - px, y - py
            if not (-128 <= dx <= 127 and -128 <= dy <= 127):
                raise ValueError(f"delta does not fit in one byte: {dx},{dy}")
            buf += struct.pack("<bb", dx, dy)
            px, py = x, y
    return base64.b64encode(buf).decode("ascii")
