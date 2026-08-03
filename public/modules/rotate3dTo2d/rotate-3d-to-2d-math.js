// Rotate 3D → 2D — pure math (main thread + AudioWorklet).
// Applies sequential Rx, Ry, Rz rotations (angles in cycles 0…1 → radians),
// then returns the projected X/Y (Z discarded).

/**
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} rotateXCycles angle about X in cycles [0,1)
 * @param {number} rotateYCycles angle about Y in cycles [0,1)
 * @param {number} rotateZCycles angle about Z in cycles [0,1)
 * @returns {{ X: number, Y: number }}
 */
function nodeGraphRotate3dTo2d(x, y, z, rotateXCycles, rotateYCycles, rotateZCycles) {
  let px = Number(x) || 0;
  let py = Number(y) || 0;
  let pz = Number(z) || 0;
  const angleX = (Number(rotateXCycles) || 0) * Math.PI * 2;
  const angleY = (Number(rotateYCycles) || 0) * Math.PI * 2;
  const angleZ = (Number(rotateZCycles) || 0) * Math.PI * 2;

  const sinX = Math.sin(angleX);
  const cosX = Math.cos(angleX);
  const nextY = py * cosX - pz * sinX;
  const nextZ = py * sinX + pz * cosX;
  py = nextY;
  pz = nextZ;

  const sinY = Math.sin(angleY);
  const cosY = Math.cos(angleY);
  const nextX = px * cosY + pz * sinY;
  pz = -px * sinY + pz * cosY;
  px = nextX;

  const sinZ = Math.sin(angleZ);
  const cosZ = Math.cos(angleZ);
  return {
    X: px * cosZ - py * sinZ,
    Y: px * sinZ + py * cosZ,
  };
}
