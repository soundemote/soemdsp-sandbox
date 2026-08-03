NodeLiveAudioProcessor.prototype.createStepSequencerState = function createStepSequencerState() {
    return {
      gate: 0,
      index: 0,
      lastReset: 0,
      lastTrigger: 0,
      out: 0,
      nativeHandle: 0,
    };
  };

NodeLiveAudioProcessor.prototype.stepSequencerSample = function stepSequencerSample(state, trigger, reset, params) {
    if (this.nativeStepSequencerReady) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeStepSequencer.soemdsp_step_sequencer_create();
        }
        if (state.nativeHandle) {
          const values = (params.values || []).map((value) => this.safeFilterNumber(value, null));
          while (values.length < 8) values.push(0);
          const out = this.nativeStepSequencer.soemdsp_step_sequencer_sample(
            state.nativeHandle,
            this.safeFilterNumber(trigger, null),
            this.safeFilterNumber(reset, null),
            this.safeFilterNumber(params.threshold, null),
            Math.max(1, Math.min(8, Math.round(this.safeFilterNumber(params.steps, null)))),
            this.safeFilterNumber(params.level, null),
            values[0], values[1], values[2], values[3],
            values[4], values[5], values[6], values[7],
          );
          return {
            Gate: this.nativeStepSequencer.soemdsp_step_sequencer_gate(state.nativeHandle),
            Out: this.safeFilterNumber(out, null),
          };
        }
      } catch (error) {
        this.nativeStepSequencerReady = false;
        state.nativeHandle = 0;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "step_sequencer",
          status: "disabled",
          message: String(error?.message || error || "native Step Sequencer failed"),
        });
      }
    }
    // JS path: pure math (step-sequencer-math.js).
    if (typeof nodeGraphStepSequencerCore === "function") {
      const out = nodeGraphStepSequencerCore(
        state,
        this.safeFilterNumber(trigger, null),
        this.safeFilterNumber(reset, null),
        {
          level: this.safeFilterNumber(params?.level, null),
          steps: this.safeFilterNumber(params?.steps, null),
          threshold: this.safeFilterNumber(params?.threshold, null),
          values: (params?.values || []).map((v) => this.safeFilterNumber(v, null)),
        },
      );
      return {
        Gate: this.safeFilterNumber(out.Gate, null),
        Out: this.safeFilterNumber(out.Out, null),
      };
    }
    return { Gate: 0, Out: 0 };
  };

