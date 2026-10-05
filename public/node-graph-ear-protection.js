// Speaker protection host. The ear-protect circuit is Speaker Protector 2.0 in
// native C++ (native_modules/speaker_protector2/speaker_protector2.cpp). Live:
// graph_engine runs it on the Output bus. Render Sample: the bounce goes through
// soemdsp_speaker_protector2_process_block on a main-thread instance of the
// combined wasm. This file holds no DSP: it hands buffers to that native pass
// and flags the Output face banner.

let nodeGraphEarProtectNativePromise = null;

function nodeGraphLoadEarProtectNative() {
  if (!nodeGraphEarProtectNativePromise) {
    nodeGraphEarProtectNativePromise = (async () => {
      const bytes = await fetchNodeGraphLiveNativeModuleBytes({ wasmUrl: nodeGraphLiveCombinedNativeModuleUrl });
      if (!(bytes instanceof ArrayBuffer)) {
        throw new Error("native Speaker Protector 2: combined wasm unavailable");
      }
      const { instance } = await WebAssembly.instantiate(bytes, {});
      const native = instance?.exports;
      if (!native?.memory || typeof native.soemdsp_speaker_protector2_process_block !== "function") {
        throw new Error("native Speaker Protector 2: process_block export missing");
      }
      return native;
    })();
    nodeGraphEarProtectNativePromise.catch(() => {
      nodeGraphEarProtectNativePromise = null;
    });
  }
  return nodeGraphEarProtectNativePromise;
}

/** Native Output ear protector for Render Sample. Throws when native is unavailable. */
async function createNodeGraphNativeEarProtector(sampleRate = nodeGraphMvp?.sampleRate) {
  const native = await nodeGraphLoadEarProtectNative();
  const rate = nodeGraphFiniteNumber(sampleRate, nodeGraphFiniteNumber(nodeGraphMvp?.sampleRate, 44100));
  const handle = native.soemdsp_speaker_protector2_create() | 0;
  if (handle <= 0) {
    throw new Error("native Speaker Protector 2: no free instance");
  }
  const capacity = native.soemdsp_speaker_protector2_max_block_frames() | 0;
  return {
    capacity,
    blockLeft: () => new Float64Array(native.memory.buffer, native.soemdsp_speaker_protector2_block_left_ptr(), capacity),
    blockRight: () => new Float64Array(native.memory.buffer, native.soemdsp_speaker_protector2_block_right_ptr(), capacity),
    /** Protects the first `frames` block samples in place; returns the protection mute count. */
    processBlock: (frames) => native.soemdsp_speaker_protector2_process_block(handle, frames, rate) | 0,
    destroy: () => native.soemdsp_speaker_protector2_destroy(handle),
  };
}

function nodeGraphEarProtectionIsTripped() {
  return false;
}

function nodeGraphEarProtectionIsHot() {
  return Boolean(document.body?.classList?.contains("node-ear-protection-engaged"));
}

function nodeGraphOutputProtectMuteAmount(gain) {
  const g = Number(gain);
  if (!Number.isFinite(g)) {
    return 0;
  }
  return Math.max(0, Math.min(1, 1 - g));
}

function nodeGraphSyncOutputProtectOverlay(muteAmount = globalThis.nodeGraphOutputProtectMute || 0, options = {}) {
  const mute = Math.max(0, Math.min(1, nodeGraphFiniteNumber(muteAmount)));
  const prev = Number(globalThis.nodeGraphOutputProtectMute);
  globalThis.nodeGraphOutputProtectMute = mute;
  const visible = mute > 0.001;
  if (
    !options.force
    && Math.abs((Number.isFinite(prev) ? prev : -1) - mute) < 0.002
    && document.body?.dataset.outputProtectReady === "1"
  ) {
    return mute;
  }
  if (document.body) {
    document.body.dataset.outputProtectReady = "1";
  }
  document.querySelectorAll(".dsp-node.output-node").forEach((node) => {
    node.style.removeProperty("--node-output-protect-alpha");
    node.style.removeProperty("--node-output-protect-color");
    node.querySelectorAll(".node-module-scope-window, .node-module-display-face").forEach((face) => {
      face.style.removeProperty("--node-output-protect-alpha");
      face.style.removeProperty("--node-output-protect-color");
    });
    node.classList.toggle("node-output-protect-visible", visible);
    node.classList.toggle("node-ear-protection-engaged", visible);
  });
  document.body?.classList.toggle("node-ear-protection-engaged", visible);
  if (typeof nodeGraphModuleScopeState?.waterfallDrawCache?.clear === "function") {
    nodeGraphModuleScopeState.waterfallDrawCache.clear();
  }
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw({ force: true });
  }
  return mute;
}

function nodeGraphSetEarProtectionEngaged(engaged, details = {}) {
  const gain = Number(details.protectionGain);
  const mute = Object.prototype.hasOwnProperty.call(details, "protectionGain")
    ? nodeGraphOutputProtectMuteAmount(gain)
    : (engaged ? 1 : 0);
  if (engaged || mute > 0) {
    globalThis.nodeGraphEarProtectionDetails = { ...details, mute };
  } else if (!details.keepDetails) {
    globalThis.nodeGraphEarProtectionDetails = null;
  }
  nodeGraphSyncOutputProtectOverlay(mute);
  if (typeof refreshNodeGraphSpeakerProtectionBodies === "function") {
    refreshNodeGraphSpeakerProtectionBodies();
  }
}

function closeNodeGraphEarProtectionFaultUi() {
  const fault = document.getElementById("nodeEarProtectionFault");
  if (fault) {
    fault.hidden = true;
  }
  document.body?.classList.remove("node-ear-protection-tripped");
}

function nodeGraphResetEarProtectionFault() {
  globalThis.nodeGraphEarProtectionTripped = false;
  closeNodeGraphEarProtectionFaultUi();
  nodeGraphSetEarProtectionEngaged(false);
}

function nodeGraphEarProtectionFaultVisible() {
  return false;
}

function bindNodeGraphEarProtectionFaultUi() {
  closeNodeGraphEarProtectionFaultUi();
}

/** Output-bus trip: banner on the Output face. Does not pause, mute-latch, or write volume. */
function nodeGraphTripEarProtection(details = {}) {
  globalThis.nodeGraphEarProtectionTripped = false;
  nodeGraphSetEarProtectionEngaged(true, details);
  return true;
}

function nodeGraphClampProtectedSample(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
