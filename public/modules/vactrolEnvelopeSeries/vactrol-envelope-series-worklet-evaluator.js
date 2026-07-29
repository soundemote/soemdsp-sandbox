// Duplicated from node-graph-module-definitions.js -- the AudioWorkletGlobalScope
// doesn't share globals with the main thread, so the vactrolEnvelopeSeries "Part"
// spec table has to be redeclared here for the realtime DSP path. Keep in sync.
//
// Easter egg: VTL5C5 below is NOT a real PerkinElmer part -- see the matching
// comment in node-graph-module-definitions.js for the full (fictional) story.
const nodeGraphVactrolSeriesSpecs = Object.freeze([
  { attack: 0.0025, darkKohm: 50000, label: "VTL5C1", litKohm: 0.2, release: 0.035 },
  { attack: 0.0035, darkKohm: 1000, label: "VTL5C2", litKohm: 0.2, release: 0.5 },
  { attack: 0.0025, darkKohm: 10000, label: "VTL5C3", litKohm: 0.0015, release: 0.035 },
  { attack: 0.006, darkKohm: 400, label: "VTL5C4", litKohm: 0.075, release: 1.5 },
  { attack: 0.005, darkKohm: 6000, label: "VTL5C5", litKohm: 0.4, release: 0.2 },
  { attack: 0.0035, darkKohm: 100000, label: "VTL5C6", litKohm: 2, release: 0.05 },
  { attack: 0.006, darkKohm: 1000, label: "VTL5C7", litKohm: 1.1, release: 1.0 },
  { attack: 0.004, darkKohm: 10000, label: "VTL5C8", litKohm: 1, release: 0.06 },
  { attack: 0.004, darkKohm: 50000, label: "VTL5C9", litKohm: 0.63, release: 0.05 },
  { attack: 0.001, darkKohm: 400, label: "VTL5C10", litKohm: 0.4, release: 1.5 },
]);

function nodeGraphVactrolSeriesSpec(partIndex) {
  const index = Math.round(Number(partIndex));
  return nodeGraphVactrolSeriesSpecs[index] || nodeGraphVactrolSeriesSpecs[0];
}

NodeLiveAudioProcessor.prototype.createVactrolEnvelopeState = function createVactrolEnvelopeState() {
    return {
      nativeHandle: 0,
      out: 0,
      raw: 0,
    };
  };

NodeLiveAudioProcessor.prototype.vactrolEnvelopeSample = function vactrolEnvelopeSample(state, light, params, rate = sampleRate) {
    const safeRate = Math.max(1, rate || sampleRate || 44100);
    if (this.nativeVactrolEnvelopeReady) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeVactrolEnvelope.soemdsp_vactrol_envelope_create();
        }
        if (state.nativeHandle) {
          const out = this.nativeVactrolEnvelope.soemdsp_vactrol_envelope_sample(
            state.nativeHandle,
            this.safeFilterNumber(light, null),
            Math.max(0, this.safeFilterNumber(params.attack, null)),
            Math.max(0, this.safeFilterNumber(params.release, null)),
            Math.max(0.001, this.safeFilterNumber(params.curve, null)),
            Math.max(0, this.safeFilterNumber(params.sensitivity, null)),
            this.clampValue(this.safeFilterNumber(params.lightOffset, null), 0, 1),
            this.clampValue(this.safeFilterNumber(params.darkCurrent, null), 0, 1),
            safeRate,
          );
          state.out = this.safeFilterNumber(out, null);
          return state.out;
        }
      } catch (error) {
        this.nativeVactrolEnvelopeReady = false;
        state.nativeHandle = 0;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "vactrol_envelope",
          status: "disabled",
          message: String(error?.message || error || "native Vactrol Envelope failed"),
        });
      }
    }
    return 0;
  };

