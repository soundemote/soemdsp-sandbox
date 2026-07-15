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

NodeLiveAudioProcessor.prototype.chordMemorySampleJs = function chordMemorySampleJs(state, options = {}) {
    const latchHigh = Number(options.latch) > 0;
    const clearHigh = Number(options.clear) > 0;
    const advanceHigh = Number(options.advance) > 0;
    const pitch = Number(options.pitch) || 0;
    if (clearHigh && !state.clearWasHigh) {
      state.slots = [0, 0, 0, 0];
      state.slotsActive = [false, false, false, false];
      state.writeIndex = 0;
      state.arpIndex = 0;
    }
    state.clearWasHigh = clearHigh;
    if (latchHigh && !state.latchWasHigh) {
      state.slots[state.writeIndex] = pitch;
      state.slotsActive[state.writeIndex] = true;
      state.writeIndex = (state.writeIndex + 1) % 4;
    }
    state.latchWasHigh = latchHigh;
    const activeIndices = [];
    for (let i = 0; i < 4; i += 1) {
      if (state.slotsActive[i]) activeIndices.push(i);
    }
    if (advanceHigh && !state.advanceWasHigh && activeIndices.length > 0) {
      const currentPos = activeIndices.indexOf(state.arpIndex);
      const nextPos = currentPos === -1 ? 0 : (currentPos + 1) % activeIndices.length;
      state.arpIndex = activeIndices[nextPos];
    }
    state.advanceWasHigh = advanceHigh;
    const arp = activeIndices.length > 0 ? state.slots[state.arpIndex] : 0;
    const gate = activeIndices.length > 0 ? 1 : 0;
    return {
      "Note 1": state.slots[0],
      "Note 2": state.slots[1],
      "Note 3": state.slots[2],
      "Note 4": state.slots[3],
      Arp: arp,
      Gate: gate,
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
    return this.chordMemorySampleJs(state, options);
  };

