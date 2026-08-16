// Vectorscope Rotation — pure math (main thread + AudioWorklet).
//
// Classic audio vectorscope: Left/Right on orthogonal axes, rotated 45° so
// mono (L=R) plots vertical and anti-phase (L=−R) plots horizontal. Feed X/Y
// outs into any existing 2D scope; no scope code changes required.
//
//   X out (side) = (L − R) / √2
//   Y out (mid)  = (L + R) / √2
//
// `rotateDeg` is extra rotation after that 45° (0 = classic). Positive is
// counterclockwise on the X/Y plane.
//
// Polarity map: +L and +R are the two diagonals; −L/−R reverse them.
// Inputs are L / R; outputs stay X / Y for scopes.

const NODE_GRAPH_VECTORSCOPE_INV_SQRT2 = Math.SQRT1_2;
const NODE_GRAPH_VECTORSCOPE_DEG_TO_RAD = Math.PI / 180;

/**
 * @param {number} left  L channel
 * @param {number} right R channel
 * @param {number} [rotateDeg] extra rotation after the 45° vectorscope (degrees)
 * @returns {{ X: number, Y: number }}
 */
function nodeGraphVectorscopeTransform(left, right, rotateDeg) {
  const L = Number(left) || 0;
  const R = Number(right) || 0;
  const s = NODE_GRAPH_VECTORSCOPE_INV_SQRT2;
  let x = (L - R) * s;
  let y = (L + R) * s;
  const deg = Number(rotateDeg);
  if (Number.isFinite(deg) && deg !== 0) {
    const rad = deg * NODE_GRAPH_VECTORSCOPE_DEG_TO_RAD;
    const c = Math.cos(rad);
    const sn = Math.sin(rad);
    const rx = x * c - y * sn;
    const ry = x * sn + y * c;
    x = rx;
    y = ry;
  }
  return { X: x, Y: y };
}
