NodeLiveAudioProcessor.prototype.unpackPhosphorDrawSampleXY = function unpackPhosphorDrawSampleXY(sample) {
    if (!this.phosphorDrawSampleView) {
      const buffer = new ArrayBuffer(8);
      this.phosphorDrawSampleView = {
        f64: new Float64Array(buffer),
        f32: new Float32Array(buffer),
      };
    }
    const view = this.phosphorDrawSampleView;
    view.f64[0] = sample;
    return { x: view.f32[0], y: view.f32[1] };
  };

NodeLiveAudioProcessor.prototype.createPhosphillatorPlaybackState = function createPhosphillatorPlaybackState() {
    return { lastReset: false, phase: 0, nativeHandle: 0, nativePathRef: null, nativePathTooLong: false };
  };

NodeLiveAudioProcessor.prototype.phosphillatorDecodedPath = function phosphillatorDecodedPath(nodeId, node) {
    const points = node?.drawnPath?.points;
    if (!Array.isArray(points) || points.length < 2) {
      this.phosphillatorDecodedPathCache.delete(nodeId);
      return null;
    }
    const cached = this.phosphillatorDecodedPathCache.get(nodeId);
    if (cached && cached.pointsRef === points) {
      return cached;
    }
    const decodedX = new Float32Array(points.length);
    const decodedY = new Float32Array(points.length);
    for (let i = 0; i < points.length; i += 1) {
      const unpacked = this.unpackPhosphorDrawSampleXY(points[i]);
      decodedX[i] = unpacked.x;
      decodedY[i] = unpacked.y;
    }
    const decoded = { count: points.length, decodedX, decodedY, pointsRef: points };
    this.phosphillatorDecodedPathCache.set(nodeId, decoded);
    return decoded;
  };

// Open-path index: pathPos 0 = first point, 1 = last. No last→first wrap.
// Trisaw / phase / pitch come from node-graph-phasor-helpers.js (worklet Blob).
NodeLiveAudioProcessor.prototype.phosphillatorPathSample = function phosphillatorPathSample(decoded, pathPos) {
    const n = decoded.count;
    if (n < 2) {
      return { x: decoded.decodedX[0] || 0, y: decoded.decodedY[0] || 0 };
    }
    const pos = Math.min(1, Math.max(0, Number(pathPos) || 0));
    const index = pos * (n - 1);
    const i0 = Math.min(n - 2, Math.floor(index));
    const i1 = i0 + 1;
    const t = index - i0;
    return {
      x: decoded.decodedX[i0] + (decoded.decodedX[i1] - decoded.decodedX[i0]) * t,
      y: decoded.decodedY[i0] + (decoded.decodedY[i1] - decoded.decodedY[i0]) * t,
    };
  };

NodeLiveAudioProcessor.prototype.phosphillatorLoopSample = function phosphillatorLoopSample(decoded, phase, sharpness) {
    const pathPos = nodeGraphTrisaw(phase, sharpness);
    return this.phosphillatorPathSample(decoded, pathPos);
  };

NodeLiveAudioProcessor.prototype.phosphillatorJsPlaybackSample = function phosphillatorJsPlaybackSample(state, node, nodeId, cvInput, frequency, phaseOffset, reset, rate, sharpness) {
    const phase = nodeGraphAdvancePitchedPhase01(state, frequency, cvInput, rate, reset);
    const decoded = this.phosphillatorDecodedPath(nodeId, node);
    if (!decoded) {
      return { X: 0, Y: 0 };
    }
    const effectivePhase = nodeGraphWrap01((Number(phase) || 0) + (Number(phaseOffset) || 0));
    const sharp = Number.isFinite(Number(sharpness)) ? Number(sharpness) : 0.5;
    const point = this.phosphillatorLoopSample(decoded, effectivePhase, sharp);
    // Finite-only filter (not safeFilterNumber): packed pen/intensity LSBs can
    // make near-zero samples denormal and would otherwise hard-zero the output.
    const x = Number(point.x);
    const y = Number(point.y);
    return {
      X: Number.isFinite(x) ? x : 0,
      Y: Number.isFinite(y) ? y : 0,
    };
  };

// Native path pushes the drawn path into wasm memory when the points array
// identity changes. Sharpness needs native v2+ (open-path + trisaw); older
// builds fall back to the JS open-path implementation.
NodeLiveAudioProcessor.prototype.phosphillatorPlaybackSample = function phosphillatorPlaybackSample(state, node, nodeId, cvInput, frequency, phaseOffset, reset, rate, sharpness) {
    const sharp = Number.isFinite(Number(sharpness)) ? Number(sharpness) : 0.5;
    const memory = this.nativePhosphillator?.memory;
    if (this.nativePhosphillatorReady && !state.nativePathTooLong && memory?.buffer) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativePhosphillator.soemdsp_phosphillator_create();
        }
        if (state.nativeHandle) {
          const nativeVersion = Number(this.nativePhosphillator.soemdsp_phosphillator_version?.() || 0);
          // v2+: open path + sharpness. Older native still jumps last→first.
          if (nativeVersion < 2) {
            return this.phosphillatorJsPlaybackSample(state, node, nodeId, cvInput, frequency, phaseOffset, reset, rate, sharp);
          }
          const decoded = this.phosphillatorDecodedPath(nodeId, node);
          if (!decoded) {
            state.nativePathRef = null;
            this.nativePhosphillator.soemdsp_phosphillator_clear_path(state.nativeHandle);
          } else if (state.nativePathRef !== decoded.pointsRef) {
            const maxPoints = this.nativePhosphillator.soemdsp_phosphillator_max_path_points();
            if (decoded.count > maxPoints) {
              state.nativePathTooLong = true;
              return this.phosphillatorJsPlaybackSample(state, node, nodeId, cvInput, frequency, phaseOffset, reset, rate, sharp);
            }
            const xPtr = this.nativePhosphillator.soemdsp_phosphillator_path_x_ptr(state.nativeHandle);
            const yPtr = this.nativePhosphillator.soemdsp_phosphillator_path_y_ptr(state.nativeHandle);
            if (!(xPtr > 0) || !(yPtr > 0)) {
              return this.phosphillatorJsPlaybackSample(state, node, nodeId, cvInput, frequency, phaseOffset, reset, rate, sharp);
            }
            // Re-read memory.buffer each upload — growth can detach old buffers.
            new Float32Array(this.nativePhosphillator.memory.buffer, xPtr, decoded.count).set(decoded.decodedX);
            new Float32Array(this.nativePhosphillator.memory.buffer, yPtr, decoded.count).set(decoded.decodedY);
            this.nativePhosphillator.soemdsp_phosphillator_set_path(state.nativeHandle, decoded.count);
            state.nativePathRef = decoded.pointsRef;
          }
          const x = this.nativePhosphillator.soemdsp_phosphillator_sample(
            state.nativeHandle,
            this.safeFilterNumber(cvInput, null),
            this.safeFilterNumber(frequency, null),
            this.safeFilterNumber(phaseOffset, null),
            this.safeFilterNumber(reset, null),
            this.safeFilterNumber(rate, null),
            this.safeFilterNumber(sharp, null),
          );
          // Path XY is already in [-1,1]; skip denormal BADVAL zeroing so pen-bit
          // LSBs near zero still pass as ~0 rather than tripping the filter.
          const y = this.nativePhosphillator.soemdsp_phosphillator_y(state.nativeHandle);
          return {
            X: Number.isFinite(x) ? x : 0,
            Y: Number.isFinite(y) ? y : 0,
          };
        }
      } catch (error) {
        this.nativePhosphillatorReady = false;
        state.nativeHandle = 0;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "phosphillator",
          status: "disabled",
          message: String(error?.message || error || "native Phosphillator failed"),
        });
      }
    }
    return this.phosphillatorJsPlaybackSample(state, node, nodeId, cvInput, frequency, phaseOffset, reset, rate, sharp);
  };
