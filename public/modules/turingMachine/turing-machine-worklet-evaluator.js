NodeLiveAudioProcessor.prototype.createTuringMachineState = function createTuringMachineState() {
    return { clockWasHigh: false, resetWasHigh: false, register: 0, nativeHandle: 0 };
  };

NodeLiveAudioProcessor.prototype.turingMachineSample = function turingMachineSample(state, options = {}) {
    if (this.nativeTuringMachineReady) {
      try {
        if (!state.nativeHandle) {
          const entropy = Math.floor(Math.random() * 0xffffffff) >>> 0;
          state.nativeHandle = this.nativeTuringMachine.soemdsp_turing_machine_create(entropy);
        }
        if (state.nativeHandle) {
          const length = Math.max(1, Math.min(16, Math.round(Number(options.length) || 8)));
          const probability = this.clampValue(Number(options.probability) || 0, 0, 1);
          const level = Number(options.level) || 0;
          const cv = this.nativeTuringMachine.soemdsp_turing_machine_sample(
            state.nativeHandle,
            Number(options.clock) > 0 ? 1 : 0,
            Number(options.reset) > 0 ? 1 : 0,
            length,
            probability,
            level,
          );
          return {
            CV: cv,
            Scale: this.nativeTuringMachine.soemdsp_turing_machine_scale(state.nativeHandle),
            Gate: this.nativeTuringMachine.soemdsp_turing_machine_gate(state.nativeHandle),
          };
        }
      } catch (error) {
        this.nativeTuringMachineReady = false;
        state.nativeHandle = 0;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "turing_machine",
          status: "disabled",
          message: String(error?.message || error || "native Turing Machine failed"),
        });
      }
    }
    return { CV: 0, Scale: 0, Gate: 0 };
  };

