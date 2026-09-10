NodeLiveAudioProcessor.prototype.createWirdoSpiralState = function createWirdoSpiralState() {
    return { phase: 0, splashPhase: 0, resetWasHigh: false, nativeHandle: 0 };
  };

// Shared stdlib (node-graph-phasor-helpers.js, first in worklet Blob).
NodeLiveAudioProcessor.prototype.wirdoSpiralWrap01 = function wirdoSpiralWrap01(v) {
    return nodeGraphWrap01(v);
  };

NodeLiveAudioProcessor.prototype.wirdoSpiralSample = function wirdoSpiralSample(state, options = {}) {
    const resetHigh = Number(options.reset) > 0.5;
    if (resetHigh && !state.resetWasHigh) {
      state.phase = 0;
      state.splashPhase = 0;
      if (state.nativeHandle && this.nativeWirdoSpiral?.soemdsp_jbwirdo_reset) {
        this.nativeWirdoSpiral.soemdsp_jbwirdo_reset(state.nativeHandle);
      }
    }
    state.resetWasHigh = resetHigh;
    if (
      this.nativeWirdoSpiralReady &&
      this.nativeWirdoSpiral?.soemdsp_jbwirdo_create &&
      this.nativeWirdoSpiral?.soemdsp_jbwirdo_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeWirdoSpiral.soemdsp_jbwirdo_create();
        }
        if (state.nativeHandle) {
          const sampleRateValue = Math.max(1, nodeGraphFiniteNumber(options.sampleRate, nodeGraphFiniteNumber(sampleRate, 44100)));
          this.nativeWirdoSpiral.soemdsp_jbwirdo_sample(
            state.nativeHandle,
            nodeGraphFiniteNumber(options.frequency),
            this.clampValue(nodeGraphFiniteNumber(options.sharp), 0, 1),
            nodeGraphFiniteNumber(options.cross),
            nodeGraphFiniteNumber(options.density),
            nodeGraphFiniteNumber(options.length),
            nodeGraphFiniteNumber(options.rotate),
            nodeGraphFiniteNumber(options.splashDepth),
            nodeGraphFiniteNumber(options.splashDensity),
            nodeGraphFiniteNumber(options.cut),
            nodeGraphFiniteNumber(options.scrap),
            nodeGraphFiniteNumber(options.ringCut),
            nodeGraphFiniteNumber(options.splashSpeed),
            nodeGraphFiniteNumber(options.syncCut),
            sampleRateValue,
          );
          return {
            x: this.safeFilterNumber(this.nativeWirdoSpiral.soemdsp_jbwirdo_x(state.nativeHandle), null),
            y: this.safeFilterNumber(this.nativeWirdoSpiral.soemdsp_jbwirdo_y(state.nativeHandle), null),
          };
        }
      } catch (error) {
        this.nativeWirdoSpiralReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "jerobeam_wirdo_spiral",
          status: "disabled",
          message: String(error?.message || error || "native Jerobeam WirdoSpiral failed"),
        });
      }
    }
    return 0;
  };

