// Metamodule interior view → worklet preview (voice 0 always runs for faces).
// Load after native-graph.js (uses NodeLiveAudioProcessor.prototype).

/**
 * Apply / clear Meta interior preview.
 * metaId non-empty → inside that Metamodule: native previewVoiceSlot=0 so voice 0
 * keeps processing while Available; Hypersaw face publishes voiceIds[0].
 * metaId empty → Root: preview off.
 */
NodeLiveAudioProcessor.prototype.applyMetaViewPreview = function applyMetaViewPreview(metaId) {
  const id = String(metaId || "");
  this._metaViewId = id;
  const slot = id ? 0 : -1;
  const native = this.nativeGraph;
  const handle = this.nativeGraphHandle | 0;
  if (native?.soemdsp_graph_set_preview_voice_slot && handle > 0) {
    try {
      native.soemdsp_graph_set_preview_voice_slot(handle, slot);
    } catch (_e) { /* keep audio */ }
  }
  // Ensure lane tags exist so voiceIds[0] resolves for publish.
  if (id) {
    try {
      this.bindNativeMetaVoiceProcessSlots?.(false);
    } catch (_e) { /* ignore */ }
  }
};

/**
 * True when this Meta is the one currently being edited (interior view).
 */
NodeLiveAudioProcessor.prototype.isMetaViewPreview = function isMetaViewPreview(metaId) {
  const view = String(this._metaViewId || "");
  return Boolean(view && view === String(metaId || ""));
};

/**
 * Audition frequency for voice 0 while Available inside Meta (face needs pitch).
 * Prefer last held Hz for this meta; else middle C × Meta transpose.
 */
NodeLiveAudioProcessor.prototype.metaViewPreviewHz = function metaViewPreviewHz(metaId, metaNode) {
  if (!this._metaVoiceLastHz) this._metaVoiceLastHz = new Map();
  const prefix = `${String(metaId)}:0:`;
  for (const [key, hz] of this._metaVoiceLastHz) {
    if (String(key).startsWith(prefix) && Number(hz) > 0) return Number(hz);
  }
  let midi = 60;
  try {
    if (typeof voiceHz === "function") {
      // voiceHz is local inside syncNativeMetaPolyphonyVoiceGates — compute here.
    }
  } catch (_e) { /* fall through */ }
  const octave = Number(metaNode?.params?.octave) || 0;
  const semitones = Number(metaNode?.params?.semitones) || 0;
  const cents = Number(metaNode?.params?.cents) || 0;
  const freqOff = Number(metaNode?.params?.frequency) || 0;
  const totalSemis = octave * 12 + semitones + cents / 100;
  return 440 * Math.pow(2, (midi - 69 + totalSemis) / 12) + freqOff;
};
