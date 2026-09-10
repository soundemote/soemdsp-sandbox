// Phosphor Draw Sample v1 — one float64 encodes one complete drawing-head
// instruction (X, Y, pen up/down, intensity) for Phosphillator's digital
// signal output.
//
// Format: the float64's 8 bytes are aliased as two float32 lanes (X, Y) —
// NOT arithmetic mantissa-packing. A Float64Array and a Float32Array over
// the same ArrayBuffer are the same bytes at 2x the element count, so this
// is exactly the memory shape a native/SIMD backend already wants: no
// translation layer, ever, between the JS wire format and a packed buffer
// of doubles read as float32 pairs.
//
//   X lane (float32): real IEEE X position. Low 3 mantissa bits stolen:
//     bit 0 - pen (1 = draw, 0 = teleport / no light)
//     bits 1-2 - reserved
//   Y lane (float32): real IEEE Y position. Low 5 mantissa bits stolen:
//     bits 0-4 - intensity (0-31, feeds brightness-dependent decay)
//
// Stealing mantissa LSBs is a noise-floor hijack, not a value corruption in
// any way that matters visually: float32 has 23 mantissa bits, losing 3-5
// of them is far below any screen's positional resolution.

const nodeGraphPhosphorDrawSampleBuffer = new ArrayBuffer(8);
const nodeGraphPhosphorDrawSampleF64 = new Float64Array(nodeGraphPhosphorDrawSampleBuffer);
const nodeGraphPhosphorDrawSampleF32 = new Float32Array(nodeGraphPhosphorDrawSampleBuffer);
const nodeGraphPhosphorDrawSampleU32 = new Uint32Array(nodeGraphPhosphorDrawSampleBuffer);

const nodeGraphPhosphorDrawSampleXMask = 0xfffffff8 >>> 0; // clears low 3 bits
const nodeGraphPhosphorDrawSampleYMask = 0xffffffe0 >>> 0; // clears low 5 bits

function packNodeGraphPhosphorDrawSample(x, y, pen, intensity) {
  nodeGraphPhosphorDrawSampleF32[0] = x;
  nodeGraphPhosphorDrawSampleF32[1] = y;

  const penBit = pen ? 1 : 0;
  const xBits = (nodeGraphPhosphorDrawSampleU32[0] & nodeGraphPhosphorDrawSampleXMask) | penBit;
  nodeGraphPhosphorDrawSampleU32[0] = xBits >>> 0;

  const intensityBits = Math.max(0, Math.min(31, Math.round(nodeGraphFiniteNumber(intensity))));
  const yBits = (nodeGraphPhosphorDrawSampleU32[1] & nodeGraphPhosphorDrawSampleYMask) | intensityBits;
  nodeGraphPhosphorDrawSampleU32[1] = yBits >>> 0;

  return nodeGraphPhosphorDrawSampleF64[0];
}

function unpackNodeGraphPhosphorDrawSample(sample) {
  nodeGraphPhosphorDrawSampleF64[0] = sample;
  const xBits = nodeGraphPhosphorDrawSampleU32[0];
  const yBits = nodeGraphPhosphorDrawSampleU32[1];
  const pen = (xBits & 1) === 1;
  const intensity = yBits & 0x1f;
  return {
    intensity,
    intensityNormalized: intensity / 31,
    pen,
    x: nodeGraphPhosphorDrawSampleF32[0],
    y: nodeGraphPhosphorDrawSampleF32[1],
  };
}
