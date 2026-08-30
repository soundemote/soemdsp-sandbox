// Realtime port of the room geometry (wall-delay-room-display.js) and DSP
// (wall-delay-live-evaluator.js) from the main thread into the
// AudioWorkletGlobalScope, which does not share globals with the window --
// every function below is a faithful 1:1 port, not a re-derivation. See the
// main-thread files' comments for the design rationale (X rays x Y bounces,
// Reflectivity blending specular/scattered bounce direction, the shared
// Sabrina-style diffusion cascade) and the verified surface-bias bugfix
// this already carries forward.

NodeLiveAudioProcessor.prototype.wallRoomHash01 = function wallRoomHash01(x, y, z, seed) {
    const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 12.9898) * 43758.5453;
    return s - Math.floor(s);
  };

NodeLiveAudioProcessor.prototype.wallRoomFibonacciSphere = function wallRoomFibonacciSphere(count) {
    const points = [];
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i += 1) {
      const y = count <= 1 ? 0 : 1 - (i / (count - 1)) * 2;
      const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = goldenAngle * i;
      points.push([Math.cos(theta) * radiusAtY, y, Math.sin(theta) * radiusAtY]);
    }
    return points;
  };

NodeLiveAudioProcessor.prototype.wallRoomEllipsoidRadiusFrom = function wallRoomEllipsoidRadiusFrom(listener, direction, width, height) {
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
      return 0.05;
    }
    const sqrtDiscriminant = Math.sqrt(discriminant);
    const farRoot = (-quadB + sqrtDiscriminant) / (2 * quadA);
    const nearRoot = (-quadB - sqrtDiscriminant) / (2 * quadA);
    const t = Math.max(farRoot, nearRoot);
    return t > 0 ? t : 0.05;
  };

NodeLiveAudioProcessor.prototype.wallRoomSquircleRadiusFrom = function wallRoomSquircleRadiusFrom(listener, direction, width, height, roundness) {
    const a = Math.max(0.05, width);
    const b = Math.max(0.05, height);
    const c = a;
    const n = 2 + this.clampValue(roundness, 0, 1) * 14;
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

    const [fAtListener] = evaluate(0);
    if (fAtListener >= 0) {
      return 0.05;
    }
    let tLow = 0;
    let tHigh = this.wallRoomEllipsoidRadiusFrom(listener, direction, width, height) + 2 * (a + b + c);
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
  };

NodeLiveAudioProcessor.prototype.wallRoomDistance = function wallRoomDistance(preset, listener, direction, seed, width, height, roundness) {
    if (preset === 0) {
      return this.wallRoomSquircleRadiusFrom(listener, direction, width, height, roundness);
    }
    const base = this.wallRoomEllipsoidRadiusFrom(listener, direction, width, height);
    const [x, y, z] = direction;
    if (preset === 1) {
      return base * (0.55 + 0.55 * this.wallRoomHash01(x, y, z, seed));
    }
    let radius = base * 0.75;
    let amplitude = base * 0.35;
    let frequency = 1;
    for (let octave = 0; octave < 4; octave += 1) {
      radius += (this.wallRoomHash01(x * frequency, y * frequency, z * frequency, seed + octave * 17.19) - 0.5) * amplitude;
      amplitude *= 0.5;
      frequency *= 2.17;
    }
    return Math.max(0.15 * base, radius);
  };

NodeLiveAudioProcessor.prototype.wallRoomSurfaceNormal = function wallRoomSurfaceNormal(point, width, height, roundness) {
    const a = Math.max(0.05, width);
    const b = Math.max(0.05, height);
    const c = a;
    const n = 2 + this.clampValue(roundness, 0, 1) * 14;
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
      return [1, 0, 0];
    }
    return [gx / length, gy / length, gz / length];
  };

NodeLiveAudioProcessor.prototype.wallRoomHashDirection = function wallRoomHashDirection(seed) {
    const u = this.wallRoomHash01(seed, 12.9, 78.2, 1.0);
    const v = this.wallRoomHash01(seed, 45.1, 33.6, 2.0);
    const z = 1 - 2 * u;
    const radius = Math.sqrt(Math.max(0, 1 - z * z));
    const phi = 2 * Math.PI * v;
    return [radius * Math.cos(phi), z, radius * Math.sin(phi)];
  };

// Ported from wall-delay-room-display.js's nodeGraphWallRoomNudgeAwayFromSurface
// -- see that function's comment for the full "shadow acne" explanation.
// Nudges a point that sits ON (or within float precision of) the room
// surface a tiny distance further along `direction`, so the next distance
// solve starts unambiguously inside the shape.
NodeLiveAudioProcessor.prototype.wallRoomNudgeAwayFromSurface = function wallRoomNudgeAwayFromSurface(point, direction, referenceSize) {
    const bias = Math.max(1e-4, referenceSize * 1e-5);
    return [
      point[0] + direction[0] * bias,
      point[1] + direction[1] * bias,
      point[2] + direction[2] * bias,
    ];
  };

NodeLiveAudioProcessor.prototype.wallDelayBounceDirection = function wallDelayBounceDirection(incomingDirection, normal, reflectivity, hashSeed) {
    const dot = incomingDirection[0] * normal[0] + incomingDirection[1] * normal[1] + incomingDirection[2] * normal[2];
    const specular = [
      incomingDirection[0] - 2 * dot * normal[0],
      incomingDirection[1] - 2 * dot * normal[1],
      incomingDirection[2] - 2 * dot * normal[2],
    ];
    const random = this.wallRoomHashDirection(hashSeed);
    const randomDot = random[0] * normal[0] + random[1] * normal[1] + random[2] * normal[2];
    const outwardRandom = randomDot < 0 ? [-random[0], -random[1], -random[2]] : random;
    const scatterAmount = this.clampValue(1 - reflectivity, 0, 1);
    const blended = [
      specular[0] * (1 - scatterAmount) + outwardRandom[0] * scatterAmount,
      specular[1] * (1 - scatterAmount) + outwardRandom[1] * scatterAmount,
      specular[2] * (1 - scatterAmount) + outwardRandom[2] * scatterAmount,
    ];
    const length = Math.hypot(blended[0], blended[1], blended[2]);
    return length > 1e-6 ? [blended[0] / length, blended[1] / length, blended[2] / length] : specular;
  };

NodeLiveAudioProcessor.prototype.wallDelayBuildTapPlan = function wallDelayBuildTapPlan(params, listener) {
    const rayCount = Math.max(1, Math.round(params.rayCount));
    const bounceCount = Math.max(1, Math.round(params.bounceCount));
    const reflectivity = this.clampValue(params.reflectivity, 0, 1);
    const roomWidthMeters = Math.max(0.05, params.roomWidth * params.roomScale);
    const roomHeightMeters = Math.max(0.05, params.roomHeight * params.roomScale);
    const normalRoundness = params.roomPreset === 0 ? params.roomRoundness : 0;
    const surfaceBiasReferenceSize = Math.min(roomWidthMeters, roomHeightMeters);
    const rays = this.wallRoomFibonacciSphere(rayCount);
    const taps = [];
    for (let rayIndex = 0; rayIndex < rayCount; rayIndex += 1) {
      let position = listener;
      let direction = rays[rayIndex];
      let cumulativeDistance = 0;
      let energy = 1;
      for (let bounce = 0; bounce < bounceCount; bounce += 1) {
        const hopDistance = this.wallRoomDistance(
          params.roomPreset, position, direction, params.roomSeed, roomWidthMeters, roomHeightMeters, params.roomRoundness,
        );
        cumulativeDistance += hopDistance;
        const hitPoint = [
          position[0] + direction[0] * hopDistance,
          position[1] + direction[1] * hopDistance,
          position[2] + direction[2] * hopDistance,
        ];
        energy *= reflectivity;
        const delaySeconds = cumulativeDistance / this.wallDelaySpeedOfSound;
        if (delaySeconds <= this.wallDelayMaxTotalSeconds && energy > 0.001) {
          taps.push({ delaySeconds, gain: energy });
        }
        const normal = this.wallRoomSurfaceNormal(hitPoint, roomWidthMeters, roomHeightMeters, normalRoundness);
        const hashSeed = params.roomSeed + rayIndex * 131.7 + bounce * 977.3;
        direction = this.wallDelayBounceDirection(direction, normal, reflectivity, hashSeed);
        position = this.wallRoomNudgeAwayFromSurface(hitPoint, direction, surfaceBiasReferenceSize);
      }
    }
    return taps;
  };

NodeLiveAudioProcessor.prototype.wallDelayCreateDiffuserCascade = function wallDelayCreateDiffuserCascade(sampleRate) {
    return this.wallDelayDiffuserOffsetsMs.map((ms) => {
      const offset = Math.max(1, Math.round((ms / 1000) * sampleRate));
      const bufferSize = offset * 2 + 4;
      return {
        buffer: new Float32Array(bufferSize),
        bufferSize,
        driver: 0,
        offset,
      };
    });
  };

// Direct port of Sabrina Reverb's diffuseSample (native_modules/sabrina_reverb/sabrina_reverb.cpp).
NodeLiveAudioProcessor.prototype.wallDelayDiffuseSample = function wallDelayDiffuseSample(stage, input, feedback) {
    const safeInput = Number.isFinite(input) ? input : 0;
    const readPosition = (stage.driver - stage.offset + stage.bufferSize * 4) % stage.bufferSize;
    stage.driver = (stage.driver + 1) % stage.bufferSize;
    const delayed = stage.buffer[readPosition];
    stage.buffer[stage.driver] = this.clampValue((0 - safeInput) - delayed * feedback, -16, 16);
    const output = safeInput * feedback - delayed * (1 - feedback * feedback);
    return Number.isFinite(output) ? output : 0;
  };

NodeLiveAudioProcessor.prototype.wallDelaySpeedOfSound = 343; // m/s
NodeLiveAudioProcessor.prototype.wallDelayMaxTotalSeconds = 3; // hard cap so the tap buffer stays bounded regardless of Rays/Bounces/room size
NodeLiveAudioProcessor.prototype.wallDelayDiffuserOffsetsMs = [2.3, 3.7, 5.9, 7.1];

NodeLiveAudioProcessor.prototype.createWallDelayState = function createWallDelayState() {
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
  };

NodeLiveAudioProcessor.prototype.wallDelaySample = function wallDelaySample(state, input, params, rateHz = sampleRate) {
    const safeRate = Math.max(1, nodeGraphFiniteNumber(rateHz, 44100));
    const requiredSize = Math.max(2, Math.ceil(safeRate * this.wallDelayMaxTotalSeconds) + 2);
    if (!state.bufferL || state.bufferSize !== requiredSize) {
      state.bufferL = new Float32Array(requiredSize);
      state.bufferR = new Float32Array(requiredSize);
      state.bufferSize = requiredSize;
      state.positionL = 0;
      state.positionR = 0;
    }

    const dry = this.safeFilterNumber(input, null);
    const mix = this.clampValue(this.safeFilterNumber(params.mix, null), 0, 1);
    const level = this.clampValue(this.safeFilterNumber(params.level, null), 0, 2);
    const reflectivity = this.clampValue(this.safeFilterNumber(params.reflectivity, null), 0, 1);

    const tapKey = [
      params.roomPreset, params.roomWidth, params.roomHeight, params.roomScale, params.roomRoundness,
      params.roomSeed, params.earDistance, params.rayCount, params.bounceCount, reflectivity,
    ].map((value) => Number(value).toFixed(4)).join(":");
    if (state.tapPlanKey !== tapKey) {
      state.tapPlanKey = tapKey;
      const earDistanceMeters = Math.max(0, Number(params.earDistance) || 0) / 100;
      const earOffset = earDistanceMeters * 0.5;
      state.tapsL = this.wallDelayBuildTapPlan({ ...params, reflectivity }, [-earOffset, 0, 0]);
      state.tapsR = this.wallDelayBuildTapPlan({ ...params, reflectivity }, [earOffset, 0, 0]);
    }
    if (!state.diffuserStagesL.length || state.diffuserSampleRate !== safeRate) {
      state.diffuserSampleRate = safeRate;
      state.diffuserStagesL = this.wallDelayCreateDiffuserCascade(safeRate);
      state.diffuserStagesR = this.wallDelayCreateDiffuserCascade(safeRate);
    }

    state.positionL = (state.positionL + 1) % state.bufferSize;
    state.positionR = (state.positionR + 1) % state.bufferSize;
    state.bufferL[state.positionL] = dry;
    state.bufferR[state.positionR] = dry;

    let sumL = 0;
    for (const tap of state.tapsL) {
      const delaySamples = this.clampValue(tap.delaySeconds * safeRate, 0, state.bufferSize - 2);
      const readPosition = (state.positionL - delaySamples + state.bufferSize * 4) % state.bufferSize;
      sumL += this.delayInterpolateLinear(state.bufferL, readPosition) * tap.gain;
    }
    let sumR = 0;
    for (const tap of state.tapsR) {
      const delaySamples = this.clampValue(tap.delaySeconds * safeRate, 0, state.bufferSize - 2);
      const readPosition = (state.positionR - delaySamples + state.bufferSize * 4) % state.bufferSize;
      sumR += this.delayInterpolateLinear(state.bufferR, readPosition) * tap.gain;
    }

    const diffusionFeedback = this.clampValue(1 - reflectivity, 0, 0.95);
    let wetL = sumL;
    for (const stage of state.diffuserStagesL) {
      wetL = this.wallDelayDiffuseSample(stage, wetL, diffusionFeedback);
    }
    let wetR = sumR;
    for (const stage of state.diffuserStagesR) {
      wetR = this.wallDelayDiffuseSample(stage, wetR, diffusionFeedback);
    }

    return {
      Left: (dry * (1 - mix) + wetL * mix) * level,
      Right: (dry * (1 - mix) + wetR * mix) * level,
    };
  };
