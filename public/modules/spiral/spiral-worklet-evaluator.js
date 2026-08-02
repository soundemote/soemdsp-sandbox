NodeLiveAudioProcessor.prototype.createSpiralState = function createSpiralState() {
    return {
      morph: 0,
      phase: 0,
      position: 0,
      rotX: 0,
      rotY: 0,
      zHistory: 0,
      nativeHandle: 0,
    };
  };

// Shared stdlib (node-graph-phasor-helpers.js, first in worklet Blob).
NodeLiveAudioProcessor.prototype.spiralWrap01 = function spiralWrap01(value) {
    return nodeGraphWrap01(value);
  };

NodeLiveAudioProcessor.prototype.spiralFmod = function spiralFmod(value, divisor) {
    return value - Math.trunc(value / divisor) * divisor;
  };

NodeLiveAudioProcessor.prototype.spiralTrisaw = function spiralTrisaw(phase, sharp) {
    return nodeGraphTrisaw(phase, sharp);
  };

NodeLiveAudioProcessor.prototype.spiralNextPhasor = function spiralNextPhasor(state, key, frequency, offset, sampleRate, bipolar = false) {
    const base = Number(state[key]) || 0;
    const current = this.spiralWrap01(base + offset);
    state[key] = this.spiralWrap01(base + frequency / sampleRate);
    return bipolar ? current * 2 - 1 : current;
  };

NodeLiveAudioProcessor.prototype.spiralRotate = function spiralRotate(inX, inY, inZ, rotX, rotY) {
    const cosRotX = Math.cos(rotX);
    const sinRotX = Math.sin(rotX);
    const cosRotY = Math.cos(rotY);
    const sinRotY = Math.sin(rotY);
    const help11 = inX * cosRotX - inY * sinRotX;
    const help12 = inX * sinRotX + inY * cosRotX;
    const help21 = help11 * cosRotY - inZ * sinRotY;
    const help22 = help11 * sinRotY + inZ * cosRotY;
    return { x: help12, y: help21, z: help22 };
  };

NodeLiveAudioProcessor.prototype.spiralShape = function spiralShape(lophas, phasor, dense, div, morph) {
    const tau = Math.PI * 2;
    const piOver2 = Math.PI / 2;
    const piOver4 = Math.PI / 4;
    const clampMorph01 = this.clampValue(morph, 0, 1);
    const clampMorph02 = this.clampValue(morph, 0, 2);
    const formula001 = piOver2 * (lophas - 0.5) * clampMorph02 + piOver4;
    let loSin = Math.sin(formula001);
    let loCos = Math.cos(formula001);
    const formula002 = Math.pow(clampMorph01, 2);
    const oneZDiv = 1 / div;
    const loY = formula002 * (1 - oneZDiv * loSin);
    const loZ = formula002 * (1 - oneZDiv * loCos);
    const formula003 = Math.PI / (2 + 6 * (1 - clampMorph01)) * (lophas - 0.5) * clampMorph02 + piOver4;
    loSin = Math.sin(formula003);
    loCos = Math.cos(formula003);
    const tauPhasor = tau * phasor;
    const sp0Sin = Math.sin(tauPhasor);
    const sp0Cos = Math.cos(tauPhasor);
    const spiral0X = sp0Sin;
    const spiral0Y = sp0Cos * loSin;
    const spiral0Z = sp0Cos * loCos;
    let sp1Sin = Math.sin(dense * tauPhasor - piOver2);
    const sp1Cos = Math.cos(dense * tauPhasor - piOver2);
    sp1Sin *= -1;
    const sp1SinTimesSp0Sin = sp1Sin * sp0Sin;
    const spiral1X = div * sp1SinTimesSp0Sin;
    const spiral1Y = div * ((sp1Sin * sp0Cos) * loSin + sp1Cos * loCos);
    const spiral1Z = div * (sp1Cos * -loSin + (sp1Sin * sp0Cos) * loCos);
    let sp2Cos = Math.sin(dense * dense * tau * phasor);
    const sp2Sin = Math.cos(dense * dense * tau * phasor);
    sp2Cos *= -1;
    const divSquared = div * div;
    const spiral2X = divSquared * (sp2Cos * sp0Cos + sp2Sin * sp1SinTimesSp0Sin);
    const spiral2Y = divSquared * ((sp2Cos * -sp0Sin + sp2Sin * sp1Sin * sp0Cos) * loSin + (sp2Sin * sp1Cos) * loCos);
    const spiral2Z = divSquared * ((sp2Sin * sp1Cos) * -loSin + (sp2Cos * -sp0Sin + sp2Sin * sp1Sin * sp0Cos) * loCos);
    let waveX = spiral0X + spiral1X + spiral2X;
    let waveY = loY + spiral0Y + spiral1Y + spiral2Y;
    let waveZ = loZ + spiral0Z + spiral1Z + spiral2Z;
    let x = Math.exp(morph * Math.log(div));
    waveX *= x;
    waveY *= x;
    waveZ *= x;
    let y = 0;
    const formula004 = Math.exp(morph * Math.log(dense)) / 4;
    if (formula004 < 1) {
      y = Math.pow(1 - formula004, 2);
    }
    x = x * Math.sin(piOver4) * y;
    waveX -= x;
    waveY += x;
    return this.spiralRotate(waveX, waveY, waveZ, 0, 0);
  };

NodeLiveAudioProcessor.prototype.spiralRender = function spiralRender(inX, inY, inZ, zDepth) {
    const formula = zDepth * 1.25 * (inZ / 2 + 0.5);
    const multiplier = 1 + zDepth;
    return {
      left: (inX - formula * inX) * multiplier,
      right: (inY - formula * inY) * multiplier,
    };
  };

NodeLiveAudioProcessor.prototype.jerobeamSpiralSample = function jerobeamSpiralSample(options) {
    const state = options.state;
    if (
      this.nativeJerobeamSpiralReady &&
      this.nativeJerobeamSpiral?.soemdsp_jerobeam_spiral_create &&
      this.nativeJerobeamSpiral?.soemdsp_jerobeam_spiral_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeJerobeamSpiral.soemdsp_jerobeam_spiral_create();
        }
        if (state.nativeHandle) {
          const sampleRateValue = Math.max(1, Number(options.sampleRate) || sampleRate || 44100);
          this.nativeJerobeamSpiral.soemdsp_jerobeam_spiral_sample(
            state.nativeHandle,
            Number(options.frequency) || 0,
            Number(options.density) || 0,
            Number(options.size) || 0,
            Number(options.sharp) || 0,
            Number(options.sharpCurve) || 0,
            Number(options.sharpCurveMult) || 0,
            Number(options.morph) || 0,
            Number(options.morphSpeed) || 0,
            Number(options.position) || 0,
            Number(options.positionSpeed) || 0,
            Number(options.rotX) || 0,
            Number(options.rotXSpeed) || 0,
            Number(options.rotY) || 0,
            Number(options.rotYSpeed) || 0,
            Number(options.zAmount) || 0,
            Number(options.zDepth) || 0,
            sampleRateValue,
          );
          return {
            x: this.nativeJerobeamSpiral.soemdsp_jerobeam_spiral_x(state.nativeHandle),
            y: this.nativeJerobeamSpiral.soemdsp_jerobeam_spiral_y(state.nativeHandle),
            z: this.nativeJerobeamSpiral.soemdsp_jerobeam_spiral_z(state.nativeHandle),
            left: this.nativeJerobeamSpiral.soemdsp_jerobeam_spiral_left(state.nativeHandle),
            right: this.nativeJerobeamSpiral.soemdsp_jerobeam_spiral_right(state.nativeHandle),
          };
        }
      } catch (error) {
        this.nativeJerobeamSpiralReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "jerobeam_spiral",
          status: "disabled",
          message: String(error?.message || error || "native Jerobeam Spiral failed"),
        });
      }
    }
    return { x: 0, y: 0, z: 0 };
  };

