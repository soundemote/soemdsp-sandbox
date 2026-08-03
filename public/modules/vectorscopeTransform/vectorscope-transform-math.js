// Vectorscope / goniometer transform — pure math (main thread + AudioWorklet).
//
// Classic audio vectorscope: Left/Right on orthogonal axes, rotated 45° so
// mono (L=R) plots vertical and anti-phase (L=−R) plots horizontal. Feed X/Y
// into any existing 2D scope; no scope code changes required.
//
//   X out (side) = (L − R) / √2
//   Y out (mid)  = (L + R) / √2
//
// Polarity map: +L and +R are the two diagonals; −L/−R reverse them.
// Inputs are labeled X/Y (Layout A); treat X as L and Y as R.

const NODE_GRAPH_VECTORSCOPE_INV_SQRT2 = Math.SQRT1_2;

/**
 * @param {number} left  L channel (X in)
 * @param {number} right R channel (Y in)
 * @returns {{ X: number, Y: number }}
 */
function nodeGraphVectorscopeTransform(left, right) {
  const L = Number(left) || 0;
  const R = Number(right) || 0;
  const s = NODE_GRAPH_VECTORSCOPE_INV_SQRT2;
  return {
    X: (L - R) * s,
    Y: (L + R) * s,
  };
}
