// Extracted from node-live-audio-worklet-core.js (Phase D mechanical split).
// Method: postModuleScopeSnapshot — load after core class, before registerProcessor.

NodeLiveAudioProcessor.prototype.postModuleScopeSnapshot = function postModuleScopeSnapshot() {
    const values = [];
    const transfer = [];
    const engineSampleRate = Math.max(1, Number(this.engineSampleRate) || sampleRate || 44100);
    const rates = this.scopeCaptureRates || Object.create(null);
    const captureRateForKey = (key) => {
      const raw = String(key || "");
      const colon = raw.indexOf(":");
      const nodeKey = colon >= 0 ? raw.slice(0, colon) : raw;
      const writeHz = Number(rates[nodeKey]);
      const stride = typeof this.visualWriteStride === "function"
        ? this.visualWriteStride(writeHz, engineSampleRate)
        : ((!Number.isFinite(writeHz) || writeHz <= 0 || writeHz >= engineSampleRate)
          ? 1
          : Math.max(1, Math.floor(engineSampleRate / writeHz)));
      return {
        sampleRate: engineSampleRate / stride,
        sampleStride: stride,
      };
    };
    for (const [nodeId, samples] of this.scopeBuffers) {
      if (!(samples instanceof Float32Array)) {
        continue;
      }
      const capacity = samples.length;
      if (!capacity) {
        continue;
      }
      const writeIndex = Number(samples.nodeGraphScopeWriteIndex) || 0;
      const totalWritten = Number(samples.nodeGraphScopeTotalWritten) || 0;
      const totalPosted = Number(samples.nodeGraphScopeTotalPosted) || 0;
      // Only ship samples written since the last post (was: full ring + wipe Map).
      const freshCount = Math.min(capacity, Math.max(0, totalWritten - totalPosted));
      if (freshCount <= 0) {
        continue;
      }
      const ordered = new Float32Array(freshCount);
      const start = (writeIndex - freshCount + capacity) % capacity;
      for (let index = 0; index < freshCount; index += 1) {
        ordered[index] = samples[(start + index) % capacity] || 0;
      }
      const nextPosted = totalPosted + freshCount;
      samples.nodeGraphScopeTotalPosted = nextPosted;
      const rateMeta = captureRateForKey(nodeId);
      values.push([nodeId, ordered, {
        absoluteFrame: nextPosted,
        sampleRate: rateMeta.sampleRate,
        sampleStride: rateMeta.sampleStride,
        sourceSampleRate: engineSampleRate,
        startFrame: Math.max(0, nextPosted - freshCount),
      }]);
      transfer.push(ordered.buffer);
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
      transfer.push(ordered.buffer);
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
    // Yellow Graph relay (Additive Generator / Effect / Out faces).
    if (this.additiveGraphPublish && this.additiveGraphPublish.size) {
      for (const [nodeId, graph] of this.additiveGraphPublish) {
        if (!graph || !graph.ratio) continue;
        const panArr = graph.pan && graph.pan.length
          ? Array.from(graph.pan)
          : null;
        // WhiteNoise recipes for face animation (no walks — display reseeds locally).
        const packNoise = (n) => (n && typeof n === "object"
          ? { mode: n.mode, amount: n.amount, seed: n.seed ?? 1 }
          : null);
        const noisePack = {
          ...(packNoise(graph.ratioNoise) ? { ratioNoise: packNoise(graph.ratioNoise) } : {}),
          ...(packNoise(graph.phaseNoise) ? { phaseNoise: packNoise(graph.phaseNoise) } : {}),
          ...(packNoise(graph.panNoise) ? { panNoise: packNoise(graph.panNoise) } : {}),
          ...(packNoise(graph.ampNoise) ? { ampNoise: packNoise(graph.ampNoise) } : {}),
        };
        const displayPhaseArr = graph.displayPhase && graph.displayPhase.length
          ? Array.from(graph.displayPhase)
          : null;
        const payload = {
          harmonics: graph.harmonics,
          ratio: Array.from(graph.ratio),
          phase: Array.from(graph.phase || []),
          amplitude: Array.from(graph.amplitude || []),
          ...(panArr ? { pan: panArr } : {}),
          ...(displayPhaseArr ? { displayPhase: displayPhaseArr } : {}),
          ...noisePack,
          frequencyHz: graph.frequencyHz,
          masterPhase: graph.masterPhase,
          masterAmp: graph.masterAmp,
        };
        dataPorts.push([nodeId, "Graph", payload]);
        if (graph.frequencyHz != null) {
          dataPorts.push([nodeId, "GraphView", { ...payload }]);
        }
      }
    }
    if (!values.length && !dataPorts.length) {
      return;
    }
    const message = {
      ...(dataPorts.length ? { dataPorts } : {}),
      patchFingerprint: this.patchFingerprint,
      sampleRate: engineSampleRate,
      sessionId: this.sessionId,
      type: "scope",
      values,
    };
    // Transfer sample buffers so the audio thread does not structured-clone them.
    // Keep scopeBuffers Map + rings — wiping the Map every post was GC + dropout fuel.
    if (transfer.length) {
      this.port.postMessage(message, transfer);
    } else {
      this.port.postMessage(message);
    }
};
