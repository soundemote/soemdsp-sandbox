NodeLiveAudioProcessor.prototype.createRobinSupersawDitherVoice = function createRobinSupersawDitherVoice() {
    return { sampleCount: 0, lenNow: 100, lenMid: 100, probShort: 0, probMid: 1, phaseSlope: 1 / 99 };
  };

NodeLiveAudioProcessor.prototype.createRobinSupersawState = function createRobinSupersawState() {
    const left = [];
    const right = [];
    for (let i = 0; i < 9; i++) {
      left.push(this.createRobinSupersawDitherVoice());
      right.push(this.createRobinSupersawDitherVoice());
    }
    return { left, right, nativeHandle: 0 };
  };

NodeLiveAudioProcessor.prototype.robinSupersawCalcCycleDistribution = function robinSupersawCalcCycleDistribution(c) {
    const ci = Math.floor(c);
    const cf = c - ci;
    let c2 = ci;
    if (cf >= 0.5) c2 += 1;
    const c1 = c2 - 1;
    const c3 = c2 + 1;
    const e1 = c1 - c;
    const e2 = c2 - c;
    const e3 = c3 - c;
    const v1 = e1 * e1;
    const v2 = e2 * e2;
    const v3 = e3 * e3;
    const v = 0.25;
    const d1 = v - v1;
    const d2 = v - v2;
    const d3 = v - v3;
    const s = 1 / (e3 * (v1 - v2) - e2 * (v1 - v3) + e1 * (v2 - v3));
    return { lenMid: c2, probShort: (d2 * e3 - d3 * e2) * s, probMid: (d3 * e1 - d1 * e3) * s };
  };

NodeLiveAudioProcessor.prototype.robinSupersawUpdateCycleLength = function robinSupersawUpdateCycleLength(voice) {
    const r = Math.random();
    if (r < voice.probShort) {
      voice.lenNow = voice.lenMid - 1;
    } else if (r < voice.probShort + voice.probMid) {
      voice.lenNow = voice.lenMid;
    } else {
      voice.lenNow = voice.lenMid + 1;
    }
    voice.phaseSlope = 1 / Math.max(1, voice.lenNow - 1);  // phasorRangeClosed = true
  };

NodeLiveAudioProcessor.prototype.robinSupersawGetSamplePhasor = function robinSupersawGetSamplePhasor(voice) {
    const p = voice.phaseSlope * voice.sampleCount;
    voice.sampleCount += 1;
    if (voice.sampleCount >= voice.lenNow) {
      voice.sampleCount = 0;
      this.robinSupersawUpdateCycleLength(voice);
    }
    return p;
  };

NodeLiveAudioProcessor.prototype.robinSupersawSample = function robinSupersawSample(state, options = {}) {
    if (
      this.nativeRobinSupersawReady &&
      this.nativeRobinSupersaw?.soemdsp_robin_supersaw_create &&
      this.nativeRobinSupersaw?.soemdsp_robin_supersaw_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeRobinSupersaw.soemdsp_robin_supersaw_create();
        }
        if (state.nativeHandle) {
          const sampleRate = Number(options.sampleRate) > 1 ? Number(options.sampleRate) : 48000;
          const frequencyHz = Number(options.frequencyHz) || 0;
          const detuneCents = Number(options.detuneCents) || 0;
          const voices = Math.round(Number(options.voices) || 1);
          const level = Number(options.level) || 0;
          this.nativeRobinSupersaw.soemdsp_robin_supersaw_sample(
            state.nativeHandle,
            frequencyHz,
            sampleRate,
            detuneCents,
            voices,
            level,
          );
          return {
            Mono: Number(this.nativeRobinSupersaw.soemdsp_robin_supersaw_mono(state.nativeHandle)) || 0,
            Left: Number(this.nativeRobinSupersaw.soemdsp_robin_supersaw_left(state.nativeHandle)) || 0,
            Right: Number(this.nativeRobinSupersaw.soemdsp_robin_supersaw_right(state.nativeHandle)) || 0,
          };
        }
      } catch (error) {
        this.nativeRobinSupersawReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "robin_supersaw",
          status: "disabled",
          message: String(error?.message || error || "native RobinSupersaw failed"),
        });
      }
    }
    return { Mono: 0, Left: 0, Right: 0 };
  };

