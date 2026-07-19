// Wall Delay's room-shape display: NOT a real 3D renderer -- a static,
// parameter-driven point-cloud/ray canvas, same category as the filter
// modules' frequency-response curve (node-graph-cookbook-filter.js), just
// drawing a room shape instead of a curve. Redrawn on patch/slider changes
// via drawNodeGraphFilterCurveDisplays() picking up ".node-wall-room-display"
// alongside the filter curves and pulse curves it already redraws.
//
// This previews the room a future wall-geometry delay would sample from (see
// wall-delay-live-evaluator.js's header comment) -- it does not yet drive the
// delay taps. Distances are computed per direction the same way the eventual
// DSP would: sample a fixed set of directions around each of two ears (a
// Fibonacci sphere, the 3D generalization of the shadertoy radial-distance-
// field trick this design is based on -- https://www.shadertoy.com/view/XsK3RR
// samples angles around a point in 2D, this samples directions around a
// point in 3D) and evaluate each preset's distance function along it. The
// two ears sit at their own offset positions (Ear Distance), so the
// distance/surface solve has to work from an arbitrary listener position,
// not just the room's center -- see nodeGraphWallRoomEllipsoidRadiusFrom and
// nodeGraphWallRoomSquircleRadiusFrom below.

const nodeGraphWallRoomDirectionCount = 28;
const nodeGraphWallRoomPresetLabels = ["Squircle", "Random", "Fractal"];

function nodeGraphWallRoomFibonacciSphere(count) {
  const points = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i += 1) {
    const y = count <= 1 ? 0 : 1 - (i / (count - 1)) * 2;
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    points.push([Math.cos(theta) * radiusAtY, y, Math.sin(theta) * radiusAtY]);
  }
  return points;
}
const nodeGraphWallRoomDirections = nodeGraphWallRoomFibonacciSphere(nodeGraphWallRoomDirectionCount);

// Classic "sin hash" -- same trick as GLSL's fract(sin(dot(...)) * big number),
// fittingly the same family of cheap deterministic noise the inspiration
// shader would use, just evaluated in JS instead of a fragment shader.
function nodeGraphWallRoomHash01(x, y, z, seed) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

// Ellipsoid (X/a)^2+(Y/b)^2+(Z/c)^2=1, solved for how far along a unit
// direction from an arbitrary listener position (not just the center) you
// travel before hitting the surface. Substituting the ray
// listener + t*direction into the ellipsoid equation and expanding gives a
// plain quadratic in t (A*t^2+B*t+C=0) -- still closed-form even off-center,
// which is what makes a two-ear listener cheap: no raymarching needed, just
// the quadratic formula per ear per direction. Width scales X/Z (the floor
// footprint), Height scales Y (ceiling height).
function nodeGraphWallRoomEllipsoidRadiusFrom(listener, direction, width, height) {
  const a = Math.max(0.05, width);
  const b = Math.max(0.05, height);
  const c = a;
  const [lx, ly, lz] = listener;
  const [dx, dy, dz] = direction;
  const invA2 = 1 / (a * a);
  const invB2 = 1 / (b * b);
  const invC2 = 1 / (c * c);
  const quadA = dx * dx * invA2 + dy * dy * invB2 + dz * dz * invC2;
  const quadB = 2 * (lx * dx * invA2 + ly * dy * invB2 + lz * dz * invC2);
  const quadC = lx * lx * invA2 + ly * ly * invB2 + lz * lz * invC2 - 1;
  if (quadA <= 1e-9) {
    return 0.05;
  }
  const discriminant = quadB * quadB - 4 * quadA * quadC;
  if (discriminant < 0) {
    // Ray from this ear, in this direction, misses the ellipsoid entirely
    // (only possible if the ear is already outside the room) -- fall back
    // to a small positive distance rather than propagate a NaN.
    return 0.05;
  }
  const sqrtDiscriminant = Math.sqrt(discriminant);
  const farRoot = (-quadB + sqrtDiscriminant) / (2 * quadA);
  const nearRoot = (-quadB - sqrtDiscriminant) / (2 * quadA);
  const t = Math.max(farRoot, nearRoot);
  return t > 0 ? t : 0.05;
}

// Superellipsoid |X/a|^n+|Y/b|^n+|Z/c|^n=1 version of the same off-center
// solve. Unlike the ellipsoid (n=2) above, there's no closed form once both
// n!=2 and the listener isn't at the origin.
//
// A first version of this Newton-iterated from the ellipsoid solve as a
// starting guess. That's WRONG off-axis: verified against the surface
// equation directly (plug the solved point back in, check it equals 1) and
// found cases -- e.g. an ear offset with direction (0.6, 0.8, 0) at high
// Roundness -- where the ellipsoid guess sits in a very flat region of the
// superellipsoid's f(t), so the first Newton step overshoots by more than
// 2x and it fails to reconverge within a small fixed iteration budget
// (traced it: still off by 1.37 at iteration 8, needs ~13 to actually
// settle). Fixed with a safeguarded Newton (Newton step when it stays
// inside a maintained [tLow, tHigh] bracket around the root, bisection step
// otherwise) -- this is the standard fix for exactly this failure mode and
// guarantees convergence regardless of how flat/misleading the local
// derivative is.
function nodeGraphWallRoomSquircleRadiusFrom(listener, direction, width, height, roundness) {
  const a = Math.max(0.05, width);
  const b = Math.max(0.05, height);
  const c = a;
  const n = 2 + clampNodeSliderValue(roundness, 0, 1) * 14;
  const [lx, ly, lz] = listener;
  const [dx, dy, dz] = direction;

  const evaluate = (t) => {
    const px = (lx + t * dx) / a;
    const py = (ly + t * dy) / b;
    const pz = (lz + t * dz) / c;
    const ax = Math.abs(px);
    const ay = Math.abs(py);
    const az = Math.abs(pz);
    const f = ax ** n + ay ** n + az ** n - 1;
    const dfdt = n * (
      (ax > 1e-9 ? ax ** (n - 1) * Math.sign(px) * (dx / a) : 0) +
      (ay > 1e-9 ? ay ** (n - 1) * Math.sign(py) * (dy / b) : 0) +
      (az > 1e-9 ? az ** (n - 1) * Math.sign(pz) * (dz / c) : 0)
    );
    return [f, dfdt];
  };

  // t=0 (at the listener) is inside the shape (f<0) for any sane ear
  // position; if not, the ear is already outside the room in this
  // direction, so just nudge forward rather than solve a degenerate root.
  const [fAtListener] = evaluate(0);
  if (fAtListener >= 0) {
    return 0.05;
  }
  let tLow = 0;
  let tHigh = nodeGraphWallRoomEllipsoidRadiusFrom(listener, direction, width, height) + 2 * (a + b + c);
  let [fHigh] = evaluate(tHigh);
  for (let guard = 0; fHigh < 0 && guard < 8; guard += 1) {
    tHigh *= 2;
    [fHigh] = evaluate(tHigh);
  }

  let t = (tLow + tHigh) * 0.5;
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const [f, dfdt] = evaluate(t);
    if (Math.abs(f) < 1e-9) {
      break;
    }
    if (f < 0) {
      tLow = t;
    } else {
      tHigh = t;
    }
    const newtonStep = Math.abs(dfdt) > 1e-9 ? t - f / dfdt : NaN;
    t = Number.isFinite(newtonStep) && newtonStep > tLow && newtonStep < tHigh
      ? newtonStep
      : (tLow + tHigh) * 0.5;
  }
  return t > 0 ? t : 0.05;
}

function nodeGraphWallRoomDistance(preset, listener, direction, seed, width, height, roundness) {
  if (preset === 0) {
    // Squircle: continuously blends sphere<->cube (at Width=Height) via
    // Roundness, ellipse<->box otherwise.
    return nodeGraphWallRoomSquircleRadiusFrom(listener, direction, width, height, roundness);
  }
  const base = nodeGraphWallRoomEllipsoidRadiusFrom(listener, direction, width, height);
  // The wall-roughness hash is keyed by direction only, not listener -- it's
  // a property of the room, so both ears see the same bumpy wall, just at a
  // different distance depending on where each ear sits relative to it.
  const [x, y, z] = direction;
  if (preset === 1) {
    // Random: single-octave hash jitter of the elliptical base radius.
    return base * (0.55 + 0.55 * nodeGraphWallRoomHash01(x, y, z, seed));
  }
  // Fractal: a few octaves of the same hash at increasing frequency and
  // decreasing amplitude -- self-similar-looking displacement, not a real
  // fractal surface, same "emulate the look, not the math" approach as the
  // rest of this design.
  let radius = base * 0.75;
  let amplitude = base * 0.35;
  let frequency = 1;
  for (let octave = 0; octave < 4; octave += 1) {
    radius += (nodeGraphWallRoomHash01(x * frequency, y * frequency, z * frequency, seed + octave * 17.19) - 0.5) * amplitude;
    amplitude *= 0.5;
    frequency *= 2.17;
  }
  return Math.max(0.15 * base, radius);
}

// Analytic outward surface normal of the superellipsoid |x/a|^n+|y/b|^n+
// |z/c|^n=1 at a point on its surface -- the gradient of that implicit
// function, same per-axis terms already used inside
// nodeGraphWallRoomSquircleRadiusFrom's Newton derivative above, just
// assembled into a normalized direction instead of a scalar dot product.
// This is what makes a real (not approximated) specular bounce direction
// cheap: no numerical differentiation needed. Random/Fractal don't have a
// well-defined analytic normal (their bumps are a hash jitter, not a real
// implicit surface) so callers should pass roundness=0 for those presets,
// which reduces this to the underlying ellipsoid's normal -- a reasonable
// stand-in since the bumps are meant to read as roughness, not sharp facets.
function nodeGraphWallRoomSurfaceNormal(point, width, height, roundness) {
  const a = Math.max(0.05, width);
  const b = Math.max(0.05, height);
  const c = a;
  const n = 2 + clampNodeSliderValue(roundness, 0, 1) * 14;
  const [px, py, pz] = point;
  const gradientTerm = (value, scale) => {
    const normalized = Math.abs(value) / scale;
    return normalized > 1e-9 ? (n / scale) * normalized ** (n - 1) * Math.sign(value) : 0;
  };
  const gx = gradientTerm(px, a);
  const gy = gradientTerm(py, b);
  const gz = gradientTerm(pz, c);
  const length = Math.hypot(gx, gy, gz);
  if (length < 1e-9) {
    return [1, 0, 0]; // degenerate (point at the exact center) -- arbitrary fallback
  }
  return [gx / length, gy / length, gz / length];
}

// Deterministic pseudo-random unit direction from a single hash seed --
// used to pick each bounce's scattered/diffuse outgoing direction. Two
// independent hash01 calls feed the standard uniform-point-on-a-sphere
// technique (z = 1-2u, phi = 2*pi*v).
function nodeGraphWallRoomHashDirection(seed) {
  const u = nodeGraphWallRoomHash01(seed, 12.9, 78.2, 1.0);
  const v = nodeGraphWallRoomHash01(seed, 45.1, 33.6, 2.0);
  const z = 1 - 2 * u;
  const radius = Math.sqrt(Math.max(0, 1 - z * z));
  const phi = 2 * Math.PI * v;
  return [radius * Math.cos(phi), z, radius * Math.sin(phi)];
}

// Nudges a point that sits ON (or within float precision of) the room
// surface a tiny distance further along `direction`, so it's unambiguously
// inside the shape rather than sitting on the float-precision boundary.
// Needed any time you compute a new ray origin FROM a point a previous
// distance solve just landed on -- e.g. each bounce in a ray-tracing walk
// (see wall-delay-live-evaluator.js's nodeGraphWallDelayBuildTapPlan).
// Without this, the next solve's "am I already outside?" check can trip on
// pure floating-point noise (verified directly: f(point) came back ~1e-10
// instead of a clean negative, not the honest 0) and silently return a
// near-zero fallback distance instead of the correct one -- a reflectivity=1
// ray from room center was landing at hop distances of ~4.00m, 4.05m, 4.10m
// (every bounce after the first clamped to the fallback) instead of the
// correct ~4m, ~8m, ~8m. Classic ray-tracing self-intersection bug, aka
// "shadow acne" -- this is the standard fix, so reach for this helper
// rather than re-deriving the nudge inline for any future ray-marching
// feature. `referenceSize` should be a rough room-scale distance (e.g.
// min(roomWidthMeters, roomHeightMeters)) so the nudge stays proportionally
// tiny regardless of how big the room is.
function nodeGraphWallRoomNudgeAwayFromSurface(point, direction, referenceSize) {
  const bias = Math.max(1e-4, referenceSize * 1e-5);
  return [
    point[0] + direction[0] * bias,
    point[1] + direction[1] * bias,
    point[2] + direction[2] * bias,
  ];
}

function nodeGraphWallRoomRotateX(point, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [point[0], point[1] * cos - point[2] * sin, point[1] * sin + point[2] * cos];
}

function nodeGraphWallRoomRotateY(point, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [point[0] * cos + point[2] * sin, point[1], -point[0] * sin + point[2] * cos];
}

function createNodeGraphWallRoomDisplay(nodeId, type) {
  const section = document.createElement("section");
  section.className = "node-wall-room-display";
  section.dataset.node = nodeId;
  section.dataset.nodeType = type;
  const canvas = document.createElement("canvas");
  canvas.className = "node-wall-room-canvas";
  section.append(canvas);
  requestAnimationFrame(() => drawNodeGraphWallRoomDisplay(section));
  return section;
}

function drawNodeGraphWallRoomDisplay(section) {
  const node = nodeGraphPatchNode(section?.dataset?.node || "");
  const canvas = section?.querySelector?.(".node-wall-room-canvas");
  if (!node || !canvas) {
    return;
  }
  const pixelRatio = window.devicePixelRatio || 1;
  const zoom = Math.max(0.01, Number(nodeGraphMvp?.zoom) || 1);
  const rect = section.getBoundingClientRect();
  const width = Math.max(1, Number(section.clientWidth || section.offsetWidth || 0) || rect.width / zoom);
  const height = Math.max(1, Number(section.clientHeight || section.offsetHeight || 0) || rect.height / zoom);
  const canvasWidth = Math.max(1, Math.round(width * pixelRatio));
  const canvasHeight = Math.max(1, Math.round(height * pixelRatio));
  if (canvas.width !== canvasWidth) {
    canvas.width = canvasWidth;
  }
  if (canvas.height !== canvasHeight) {
    canvas.height = canvasHeight;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(2, 6, 9, 0.88)";
  context.fillRect(0, 0, width, height);

  const preset = clampNodeSliderValue(Math.round(Number(node.params?.roomPreset) || 0), 0, 2);
  const seed = Number(node.params?.roomSeed) || 0;
  const roomWidth = Math.max(0.05, Number(node.params?.roomWidth) || 1);
  const roomHeight = Math.max(0.05, Number(node.params?.roomHeight) || 1);
  const roomScale = Math.max(0.05, Number(node.params?.roomScale) || 4);
  const roomRoundness = clampNodeSliderValue(Number(node.params?.roomRoundness) || 0, 0, 1);
  // Width/Height are proportions; Scale (meters) converts them to the actual
  // center-to-wall distance the shape math operates on.
  const roomWidthMeters = roomWidth * roomScale;
  const roomHeightMeters = roomHeight * roomScale;

  // Two ears, offset symmetrically along X (matching the Left/Right
  // convention used everywhere else in this codebase), earDistance is in
  // centimeters like a real head measurement -- convert to the same meters
  // units as the room before doing any geometry with it.
  const earDistanceMeters = Math.max(0, Number(node.params?.earDistance) || 0) / 100;
  const earOffset = earDistanceMeters * 0.5;
  const ears = [
    { color: [61, 224, 255], listener: [-earOffset, 0, 0] }, // Left
    { color: [255, 158, 61], listener: [earOffset, 0, 0] }, // Right
  ];

  const rotateProject = (point) => nodeGraphWallRoomRotateY(nodeGraphWallRoomRotateX(point, -0.4), 0.6);
  const earSamples = ears.map((ear) => {
    const rotatedListener = rotateProject(ear.listener);
    const rotatedPoints = nodeGraphWallRoomDirections.map((direction) => {
      const distance = nodeGraphWallRoomDistance(preset, ear.listener, direction, seed, roomWidthMeters, roomHeightMeters, roomRoundness);
      const point = [
        ear.listener[0] + direction[0] * distance,
        ear.listener[1] + direction[1] * distance,
        ear.listener[2] + direction[2] * distance,
      ];
      return rotateProject(point);
    });
    return { ...ear, rotatedListener, rotatedPoints };
  });

  const centerX = width * 0.5;
  const centerY = height * 0.5;
  // Auto-fit: Width/Height/earDistance can push the shape well past a unit
  // sphere, so scale to the actual extent this frame rather than assuming a
  // fixed radius.
  const maxExtent = earSamples.reduce(
    (max, ear) => ear.rotatedPoints.reduce((innerMax, point) => Math.max(innerMax, Math.hypot(point[0], point[1])), max),
    0.1,
  );
  const scale = (Math.min(width, height) * 0.38) / maxExtent;
  const project = (point) => [centerX + point[0] * scale, centerY - point[1] * scale];

  for (const ear of earSamples) {
    const [r, g, b] = ear.color;
    const earOrigin = project(ear.rotatedListener);
    const order = ear.rotatedPoints.map((point, index) => index).sort((a, b2) => ear.rotatedPoints[a][2] - ear.rotatedPoints[b2][2]);

    context.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.16)`;
    context.lineWidth = 1;
    for (const index of order) {
      const [x, y] = project(ear.rotatedPoints[index]);
      context.beginPath();
      context.moveTo(earOrigin[0], earOrigin[1]);
      context.lineTo(x, y);
      context.stroke();
    }

    for (const index of order) {
      const point = ear.rotatedPoints[index];
      const [x, y] = project(point);
      const depth = clampNodeSliderValue((point[2] + 1.3) / 2.6, 0, 1);
      const radius = 1 + depth * 1.5;
      context.fillStyle = `rgba(${r}, ${g}, ${b}, ${(0.4 + depth * 0.5).toFixed(3)})`;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }

    // Ear marker itself, drawn brighter and larger so it reads as the
    // listener position rather than just another wall sample.
    context.fillStyle = `rgb(${r}, ${g}, ${b})`;
    context.beginPath();
    context.arc(earOrigin[0], earOrigin[1], 2.5, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = "rgba(229, 238, 242, 0.74)";
  context.font = "600 10px system-ui, sans-serif";
  const roomLabel = nodeGraphWallRoomPresetLabels[preset] || "Room";
  const widthMeters = (roomWidthMeters * 2).toFixed(1);
  const heightMeters = (roomHeightMeters * 2).toFixed(1);
  context.fillText(`${roomLabel} · ${widthMeters}m × ${heightMeters}m`, 8, 14);
}
