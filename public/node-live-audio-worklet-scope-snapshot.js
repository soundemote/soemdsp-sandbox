// Extracted from node-live-audio-worklet-core.js (Phase D mechanical split).
// Method: postModuleScopeSnapshot — load after core class, before registerProcessor.

NodeLiveAudioProcessor.prototype.postModuleScopeSnapshot = function postModuleScopeSnapshot() {
    const values = [];
    const engineSampleRate = Math.max(1, Number(this.engineSampleRate) || sampleRate || 44100);
    const scopeSampleStride = Math.max(1, Number(this.scopeSampleStride) || 1);
    const decimatedScopeSampleRate = engineSampleRate / scopeSampleStride;
    for (const [nodeId, samples] of this.scopeBuffers) {
      const length = samples instanceof Float32Array
        ? Math.min(samples.length, Number(samples.nodeGraphScopeLength) || 0)
        : samples?.length || 0;
      if (!length) {
        continue;
      }
      if (samples instanceof Float32Array) {
        const writeIndex = Number(samples.nodeGraphScopeWriteIndex) || 0;
        const ordered = new Float32Array(length);
        const start = (writeIndex - length + samples.length) % samples.length;
        for (let index = 0; index < length; index += 1) {
          ordered[index] = samples[(start + index) % samples.length] || 0;
        }
        // Monotonic absoluteFrame so main-thread Instant Trace / 1D Phosphor
        // undrawn windows advance every post (not only when visual-input rings
        // attach absoluteFrame).
        const totalPosted = (Number(samples.nodeGraphScopeTotalPosted) || 0) + length;
        samples.nodeGraphScopeTotalPosted = totalPosted;
        values.push([nodeId, ordered, {
          absoluteFrame: totalPosted,
          sampleRate: decimatedScopeSampleRate,
          sampleStride: scopeSampleStride,
          sourceSampleRate: engineSampleRate,
          startFrame: Math.max(0, totalPosted - length),
        }]);
      } else {
        const totalPosted = (Number(samples?.nodeGraphScopeTotalPosted) || 0) + length;
        if (samples && typeof samples === "object") {
          samples.nodeGraphScopeTotalPosted = totalPosted;
        }
        values.push([nodeId, samples, {
          absoluteFrame: totalPosted,
          sampleRate: decimatedScopeSampleRate,
          sampleStride: scopeSampleStride,
          sourceSampleRate: engineSampleRate,
          startFrame: Math.max(0, totalPosted - length),
        }]);
      }
    }
    for (const [key, state] of this.visualInputBuffers || []) {
      const length = Math.min(Number(state?.length) || 0, state?.capacity || state?.buffer?.length || 0);
      if (!state?.buffer?.length || length <= 0) {
        continue;
      }
      const absoluteFrame = Math.max(0, Math.floor(Number(state.absoluteFrame) || 0));
      const postedFrame = Math.max(0, Math.floor(Number(state.postedFrame) || 0));
      // Visual rings are hop-written (~12 kHz). absoluteFrame counts written
      // samples — sampleRate MUST be the effective write rate or Sweep(s) /
      // history windows run engineRate/writeRate too slow (e.g. 1 s → ~8 s @ 96k).
      const sampleStride = Math.max(1, Math.round(Number(state.sampleStride) || 1));
      const sourceSampleRate = Math.max(
        1,
        Number(state.sourceSampleRate) || engineSampleRate,
      );
      const writeSampleRate = Math.max(
        1,
        Number(state.writeSampleRate)
          || (sourceSampleRate / sampleStride)
          || (engineSampleRate / sampleStride),
      );
      const freshCount = postedFrame > 0
        ? Math.max(0, absoluteFrame - postedFrame)
        : Math.min(length, Math.ceil(writeSampleRate / 30));
      const count = Math.min(length, freshCount);
      if (count <= 0) {
        continue;
      }
      const ordered = new Float32Array(count);
      const start = ((Number(state.writeIndex) || 0) - count + state.capacity) % state.capacity;
      for (let index = 0; index < count; index += 1) {
        ordered[index] = state.buffer[(start + index) % state.capacity] || 0;
      }
      values.push([key, ordered, {
        absoluteFrame,
        sampleRate: writeSampleRate,
        sampleStride,
        sourceSampleRate,
        startFrame: absoluteFrame - count,
      }]);
      state.postedFrame = absoluteFrame;
    }
    // Data-plane relay: any dataOutputs port (Hypersaw's Phases/
    // Amplitudes/Pans today, more later) piggybacks on this same
    // periodic "scope" message instead of the per-sample signal graph --
    // see public/node-graph-data-bus.js for the receiving/read side.
    const dataPorts = [];
    for (const [nodeId, state] of this.hypersawStates) {
      if (Array.isArray(state?.lastVoicePhases) && state.lastVoicePhases.length) {
        dataPorts.push([nodeId, "Phases", state.lastVoicePhases]);
      }
      if (Array.isArray(state?.lastVoiceAmplitudes) && state.lastVoiceAmplitudes.length) {
        dataPorts.push([nodeId, "Amplitudes", state.lastVoiceAmplitudes]);
      }
      if (Array.isArray(state?.lastVoicePans) && state.lastVoicePans.length) {
        dataPorts.push([nodeId, "Pans", state.lastVoicePans]);
      }
    }
    for (const [nodeId, state] of this.videoscopeStates) {
      this.videoscopeCollectDisplayData(nodeId, state, dataPorts);
    }
    for (const [nodeId, state] of this.spectrogramStates) {
      this.spectrogramCollectDisplayData(nodeId, state, dataPorts);
    }
    if (!values.length && !dataPorts.length) {
      return;
    }
    this.port.postMessage({
      ...(dataPorts.length ? { dataPorts } : {}),
      patchFingerprint: this.patchFingerprint,
      sampleRate: engineSampleRate,
      sessionId: this.sessionId,
      type: "scope",
      values,
    });
    this.scopeBuffers = new Map();
};
