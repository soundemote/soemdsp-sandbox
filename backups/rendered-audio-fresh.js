function clearNodeGraphRenderedAudioElement() {
  const audio = document.getElementById("audioPlayer");
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  if (nodeGraphMvp.renderedAudioUrl) {
    URL.revokeObjectURL(nodeGraphMvp.renderedAudioUrl);
    nodeGraphMvp.renderedAudioUrl = "";
  }
}

function syncNodeGraphRenderedAudioElement() {
  const audio = document.getElementById("audioPlayer");
  if (nodeGraphEarProtectionIsTripped()) {
    clearNodeGraphRenderedAudioElement();
    labelPrimaryAudioTitle("Ear Protection tripped. Close the dialog to reset audio.", false);
    return;
  }
  if (!audio || !nodeGraphMvp.rendered?.samples?.length) {
    clearNodeGraphRenderedAudioElement();
    return;
  }
  if (nodeGraphMvp.renderedAudioUrl) {
    URL.revokeObjectURL(nodeGraphMvp.renderedAudioUrl);
  }
  nodeGraphMvp.renderedAudioUrl = URL.createObjectURL(renderedNodeGraphWavBlob(nodeGraphMvp.rendered));
  audio.src = nodeGraphMvp.renderedAudioUrl;
  audio.load();
  labelPrimaryAudio("rendered-sample.wav", true);
  labelPrimaryAudioTitle("Rendered sample ready", true);
}

function resetNodeGraphRenderedPlaybackCursor(redraw = true) {
  if (nodeGraphMvp.renderedPlayback?.timer) {
    window.clearTimeout(nodeGraphMvp.renderedPlayback.timer);
  }
  nodeGraphMvp.renderedPlayback = {
    durationSeconds: 0,
    frame: null,
    frames: nodeGraphMvp.rendered?.frames || 0,
    playing: false,
    progress: 0,
    startContextTime: 0,
    startPerformanceTime: 0,
    timer: 0,
  };
  if (redraw) {
    drawNodeRenderedVisualOutput();
  }
}

function nodeGraphRenderedPlaybackFrame(maxFrames = 0) {
  const frame = nodeGraphMvp.renderedPlayback?.frame;
  if (!Number.isFinite(frame) || frame < 0 || !maxFrames) {
    return null;
  }
  return Math.max(0, Math.min(maxFrames - 1, Math.round(frame)));
}

function stopNodeGraphRenderedPlayback() {
  resetNodeGraphRenderedPlaybackCursor(true);
  const source = nodeGraphMvp.bufferSource;
  if (!source) {
    return;
  }
  nodeGraphMvp.bufferSource = null;
  try {
    source.stop();
  } catch (_error) {
    // Already-ended render playback is harmless.
  }
  try {
    source.disconnect();
  } catch (_error) {
    // A disconnected source is already silent.
  }
}
