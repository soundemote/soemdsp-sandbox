NodeLiveAudioProcessor.prototype.createChordMemoryState = function createChordMemoryState() {
    return {
      latchWasHigh: false,
      clearWasHigh: false,
      advanceWasHigh: false,
      writeIndex: 0,
      arpIndex: 0,
      slots: [0, 0, 0, 0],
      slotsActive: [false, false, false, false],
      nativeHandle: 0,
    };
  };

NodeLiveAudioProcessor.prototype.chordMemorySample = function chordMemorySample(state, options = {}) {
    if (this.nativeChordMemoryReady) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeChordMemory.soemdsp_chord_memory_create();
        }
        if (state.nativeHandle) {
          const note1 = this.nativeChordMemory.soemdsp_chord_memory_sample(
            state.nativeHandle,
            Number(options.latch) > 0 ? 1 : 0,
            Number(options.clear) > 0 ? 1 : 0,
            Number(options.advance) > 0 ? 1 : 0,
            Number(options.pitch) || 0,
          );
          return {
            "Note 1": note1,
            "Note 2": this.nativeChordMemory.soemdsp_chord_memory_note2(state.nativeHandle),
            "Note 3": this.nativeChordMemory.soemdsp_chord_memory_note3(state.nativeHandle),
            "Note 4": this.nativeChordMemory.soemdsp_chord_memory_note4(state.nativeHandle),
            Arp: this.nativeChordMemory.soemdsp_chord_memory_arp(state.nativeHandle),
            Gate: this.nativeChordMemory.soemdsp_chord_memory_gate(state.nativeHandle),
          };
        }
      } catch (error) {
        this.nativeChordMemoryReady = false;
        state.nativeHandle = 0;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "chord_memory",
          status: "disabled",
          message: String(error?.message || error || "native Chord Memory failed"),
        });
      }
    }
    return { "Note 1": 0, "Note 2": 0, "Note 3": 0, "Note 4": 0, Arp: 0, Gate: 0 };
  };

