// Real DSP: room geometry -> delay taps -> shared diffusion cascade -> mix.
// The room model itself (superellipsoid distance/normal math, two-ear
// sampling) lives in wall-delay-room-display.js and is reused here as-is,
// not duplicated -- both files load into the same main-thread scope.
//
// Design (X rays, Y bounces, Reflectivity):
// - X*Y delay taps per ear. Each ray walks Y bounces; at each bounce the hop
//   distance (room wall distance from the current position, in the current
//   direction) accumulates into that tap's total travel distance, which
//   becomes delayTime = distance / speed of sound.
// - Reflectivity blends each bounce's outgoing direction between a true
//   specular reflection (off the room's real analytic surface normal --
//   nodeGraphWallRoomSurfaceNormal) and a randomized scatter direction
//   (nodeGraphWallRoomHashDirection): 1 = coherent mirror bounces that keep
//   going in a predictable line and lose little energy, 0 = each bounce
//   scatters into a new random direction and loses energy fast. Same knob
//   also sets the shared diffusion cascade's feedback (1 - Reflectivity),
//   so "more reflective" audibly means both sparser echoes AND less smear.
// - The summed taps pass through a small shared allpass diffusion cascade,
//   a direct port of Sabrina Reverb's diffuseSample (native
//   sabrina_reverb.cpp) -- reusing proven-good diffusion math rather than
//   inventing a new smoothing algorithm.
//
// Not yet done: wiring this into the realtime AudioWorklet (still a plain
// gain passthrough there) and a native C++/WASM port -- this offline/
// preview path is the first working version, verify here before porting.

const nodeGraphWallDelaySpeedOfSound = 343; // m/s
const nodeGraphWallDelayMaxTotalSeconds = 3; // hard cap so the tap buffer stays bounded regardless of Rays/Bounces/room size
const nodeGraphWallDelayDiffuserOffsetsMs = [2.3, 3.7, 5.9, 7.1]; // decorrelated short taps, same spirit as Sabrina's diffusion stage spacing

function nodeGraphWallDelayBounceDirection(incomingDirection, normal, reflectivity, hashSeed) {
  const dot = incomingDirection[0] * normal[0] + incomingDirection[1] * normal[1] + incomingDirection[2] * normal[2];
  const specular = [
    incomingDirection[0] - 2 * dot * normal[0],
    incomingDirection[1] - 2 * dot * normal[1],
    incomingDirection[2] - 2 * dot * normal[2],
  ];
  const random = nodeGraphWallRoomHashDirection(hashSeed);
  // Keep the scatter direction in the outward hemisphere from the wall so a
  // rough bounce doesn't send the ray straight back into the surface.
  const randomDot = random[0] * normal[0] + random[1] * normal[1] + random[2] * normal[2];
  const outwardRandom = randomDot < 0 ? [-random[0], -random[1], -random[2]] : random;
  const scatterAmount = clampNodeSliderValue(1 - reflectivity, 0, 1);
  const blended = [
    specular[0] * (1 - scatterAmount) + outwardRandom[0] * scatterAmount,
    specular[1] * (1 - scatterAmount) + outwardRandom[1] * scatterAmount,
    specular[2] * (1 - scatterAmount) + outwardRandom[2] * scatterAmount,
  ];
  const length = Math.hypot(blended[0], blended[1], blended[2]);
  return length > 1e-6 ? [blended[0] / length, blended[1] / length, blended[2] / length] : specular;
}

// Walks Rays x Bounces from one ear's listener position, returning a flat
// list of {delaySeconds, gain} taps. Deterministic given the same params
// and seed -- callers cache this keyed by a signature of everything it
// reads, since it's too heavy to redo every sample.
function nodeGraphWallDelayBuildTapPlan(params, listener) {
  const rayCount = Math.max(1, Math.round(params.rayCount));
  const bounceCount = Math.max(1, Math.round(params.bounceCount));
  const reflectivity = clampNodeSliderValue(params.reflectivity, 0, 1);
  const roomWidthMeters = Math.max(0.05, params.roomWidth * params.roomScale);
  const roomHeightMeters = Math.max(0.05, params.roomHeight * params.roomScale);
  const normalRoundness = params.roomPreset === 0 ? params.roomRoundness : 0;
  const surfaceBiasReferenceSize = Math.min(roomWidthMeters, roomHeightMeters);
  const rays = nodeGraphWallRoomFibonacciSphere(rayCount);
  const taps = [];
  for (let rayIndex = 0; rayIndex < rayCount; rayIndex += 1) {
    let position = listener;
    let direction = rays[rayIndex];
    let cumulativeDistance = 0;
    let energy = 1;
    for (let bounce = 0; bounce < bounceCount; bounce += 1) {
      const hopDistance = nodeGraphWallRoomDistance(
        params.roomPreset, position, direction, params.roomSeed, roomWidthMeters, roomHeightMeters, params.roomRoundness,
      );
      cumulativeDistance += hopDistance;
      const hitPoint = [
        position[0] + direction[0] * hopDistance,
        position[1] + direction[1] * hopDistance,
        position[2] + direction[2] * hopDistance,
      ];
      energy *= reflectivity;
      const delaySeconds = cumulativeDistance / nodeGraphWallDelaySpeedOfSound;
      if (delaySeconds <= nodeGraphWallDelayMaxTotalSeconds && energy > 0.001) {
        taps.push({ delaySeconds, gain: energy });
      }
      const normal = nodeGraphWallRoomSurfaceNormal(hitPoint, roomWidthMeters, roomHeightMeters, normalRoundness);
      const hashSeed = params.roomSeed + rayIndex * 131.7 + bounce * 977.3;
      direction = nodeGraphWallDelayBounceDirection(direction, normal, reflectivity, hashSeed);
      position = nodeGraphWallRoomNudgeAwayFromSurface(hitPoint, direction, surfaceBiasReferenceSize);
    }
  }
  return taps;
}

function nodeGraphWallDelayCreateDiffuserCascade(sampleRate) {
  return nodeGraphWallDelayDiffuserOffsetsMs.map((ms) => {
    const offset = Math.max(1, Math.round((ms / 1000) * sampleRate));
    const bufferSize = offset * 2 + 4;
    return {
      buffer: new Float32Array(bufferSize),
      bufferSize,
      driver: 0,
      offset,
    };
  });
}

// Direct port of Sabrina Reverb's diffuseSample (native_modules/sabrina_reverb/sabrina_reverb.cpp)
// -- a Schroeder allpass diffuser. `feedback` is the diffusion coefficient:
// higher = more smearing/coloration. Read position is computed from the
// pre-increment driver (matching the native order exactly) so the delayed
// sample and the write both land where the native version puts them.
function nodeGraphWallDelayDiffuseSample(stage, input, feedback) {
  const safeInput = Number.isFinite(input) ? input : 0;
  const readPosition = (stage.driver - stage.offset + stage.bufferSize * 4) % stage.bufferSize;
  stage.driver = (stage.driver + 1) % stage.bufferSize;
  const delayed = stage.buffer[readPosition];
  stage.buffer[stage.driver] = clampNodeSliderValue((0 - safeInput) - delayed * feedback, -16, 16);
  const output = safeInput * feedback - delayed * (1 - feedback * feedback);
  return Number.isFinite(output) ? output : 0;
}

function createNodeGraphWallDelayState() {
  return {
    bufferL: new Float32Array(1),
    bufferR: new Float32Array(1),
    bufferSize: 1,
    positionL: 0,
    positionR: 0,
    tapPlanKey: "",
    tapsL: [],
    tapsR: [],
    diffuserStagesL: [],
    diffuserStagesR: [],
  };
}

function nodeGraphWallDelaySample(state, input, params, sampleRate, runtime = null, nodeId = "") {
  const safeRate = Math.max(1, Number(sampleRate) || 44100);
  const requiredSize = Math.max(2, Math.ceil(safeRate * nodeGraphWallDelayMaxTotalSeconds) + 2);
  if (!state.bufferL || state.bufferSize !== requiredSize) {
    state.bufferL = new Float32Array(requiredSize);
    state.bufferR = new Float32Array(requiredSize);
    state.bufferSize = requiredSize;
    state.positionL = 0;
    state.positionR = 0;
  }

  const dry = nodeGraphSafeFilterNumber(input, runtime, nodeId, null, "wall delay input");
  const mix = clampNodeSliderValue(nodeGraphSafeFilterNumber(params.mix, runtime, nodeId, null, "wall delay mix"), 0, 1);
  const level = Math.max(0, Math.min(2, nodeGraphSafeFilterNumber(params.level, runtime, nodeId, null, "wall delay level")));
  const reflectivity = clampNodeSliderValue(nodeGraphSafeFilterNumber(params.reflectivity, runtime, nodeId, null, "wall delay reflectivity"), 0, 1);

  // Tap plan (and the room geometry it depends on) only needs recomputing
  // when a relevant parameter actually changes -- same dirty-check pattern
  // Sabrina's native binding uses for soemdsp_sabrina_reverb_set_params.
  const tapKey = [
    params.roomPreset, params.roomWidth, params.roomHeight, params.roomScale, params.roomRoundness,
    params.roomSeed, params.earDistance, params.rayCount, params.bounceCount, reflectivity,
  ].map((value) => Number(value).toFixed(4)).join(":");
  if (state.tapPlanKey !== tapKey) {
    state.tapPlanKey = tapKey;
    const earDistanceMeters = Math.max(0, Number(params.earDistance) || 0) / 100;
    const earOffset = earDistanceMeters * 0.5;
    state.tapsL = nodeGraphWallDelayBuildTapPlan({ ...params, reflectivity }, [-earOffset, 0, 0]);
    state.tapsR = nodeGraphWallDelayBuildTapPlan({ ...params, reflectivity }, [earOffset, 0, 0]);
  }
  if (!state.diffuserStagesL.length || state.diffuserSampleRate !== safeRate) {
    state.diffuserSampleRate = safeRate;
    state.diffuserStagesL = nodeGraphWallDelayCreateDiffuserCascade(safeRate);
    state.diffuserStagesR = nodeGraphWallDelayCreateDiffuserCascade(safeRate);
  }

  state.positionL = (state.positionL + 1) % state.bufferSize;
  state.positionR = (state.positionR + 1) % state.bufferSize;
  state.bufferL[state.positionL] = dry;
  state.bufferR[state.positionR] = dry;

  let sumL = 0;
  for (const tap of state.tapsL) {
    const delaySamples = clampNodeSliderValue(tap.delaySeconds * safeRate, 0, state.bufferSize - 2);
    const readPosition = (state.positionL - delaySamples + state.bufferSize * 4) % state.bufferSize;
    sumL += nodeGraphDelayInterpolateLinear(state.bufferL, readPosition) * tap.gain;
  }
  let sumR = 0;
  for (const tap of state.tapsR) {
    const delaySamples = clampNodeSliderValue(tap.delaySeconds * safeRate, 0, state.bufferSize - 2);
    const readPosition = (state.positionR - delaySamples + state.bufferSize * 4) % state.bufferSize;
    sumR += nodeGraphDelayInterpolateLinear(state.bufferR, readPosition) * tap.gain;
  }

  const diffusionFeedback = clampNodeSliderValue(1 - reflectivity, 0, 0.95);
  let wetL = sumL;
  for (const stage of state.diffuserStagesL) {
    wetL = nodeGraphWallDelayDiffuseSample(stage, wetL, diffusionFeedback);
  }
  let wetR = sumR;
  for (const stage of state.diffuserStagesR) {
    wetR = nodeGraphWallDelayDiffuseSample(stage, wetR, diffusionFeedback);
  }

  return {
    Left: (dry * (1 - mix) + wetL * mix) * level,
    Right: (dry * (1 - mix) + wetR * mix) * level,
  };
}

// Registers the offline/render-time dispatch handler for wallDelay into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
nodeGraphLiveModuleEvaluators.wallDelay = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.wallDelayStates.get(nodeId) || createNodeGraphWallDelayState();
  runtime.wallDelayStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphWallDelaySample(
    state,
    mixInput(nodeId),
    {
      bounceCount: read("bounceCount", 3),
      earDistance: read("earDistance", 17),
      level: read("level", 1),
      mix: read("mix", 0.5),
      rayCount: read("rayCount", 6),
      reflectivity: read("reflectivity", 0.6),
      roomHeight: read("roomHeight", 1),
      roomPreset: read("roomPreset", 0),
      roomRoundness: read("roomRoundness", 0.3),
      roomScale: read("roomScale", 4),
      roomSeed: read("roomSeed", 0),
      roomWidth: read("roomWidth", 1),
    },
    sampleRate,
    runtime,
    nodeId,
  );
};
