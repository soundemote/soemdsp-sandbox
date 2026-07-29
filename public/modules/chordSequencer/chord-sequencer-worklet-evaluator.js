NodeLiveAudioProcessor.prototype.createChordSequencerState = function createChordSequencerState() {
    return { clockWasHigh: false, resetWasHigh: false, stepIndex: 0, nativeHandle: 0 };
  };

NodeLiveAudioProcessor.prototype.chordSequencerSample = function chordSequencerSample(state, options = {}) {
    if (
      this.nativeChordSequencerReady &&
      this.nativeChordSequencer?.soemdsp_chord_sequencer_create &&
      this.nativeChordSequencer?.soemdsp_chord_sequencer_sample &&
      this.nativeChordSequencer?.soemdsp_chord_sequencer_scale &&
      this.nativeChordSequencer?.soemdsp_chord_sequencer_root
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeChordSequencer.soemdsp_chord_sequencer_create();
        }
        if (state.nativeHandle) {
          const clockHigh = Number(options.clock) > 0 ? 1 : 0;
          const resetHigh = Number(options.reset) > 0 ? 1 : 0;
          const progression = Math.max(0, Math.min(5, Math.round(Number(options.progression) || 0)));
          const level = Number(options.level) || 0;
          this.nativeChordSequencer.soemdsp_chord_sequencer_sample(
            state.nativeHandle,
            clockHigh,
            resetHigh,
            progression,
          );
          const scale = this.nativeChordSequencer.soemdsp_chord_sequencer_scale(state.nativeHandle, progression);
          const root = this.nativeChordSequencer.soemdsp_chord_sequencer_root(state.nativeHandle, progression);
          return {
            Scale: scale,
            Root: root,
            Gate: clockHigh * level,
          };
        }
      } catch (error) {
        this.nativeChordSequencerReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "chord_sequencer",
          status: "disabled",
          message: String(error?.message || error || "native Chord Sequencer failed"),
        });
      }
    }
    return { Scale: 0, Root: 0, Gate: 0 };
  };

