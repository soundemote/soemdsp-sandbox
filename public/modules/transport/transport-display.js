// Bespoke display renderer for the Metronome module (displayType
// "transportBpm"). Reads this node's params.bpm on the main thread.
//
// Phosphor/LCD look: digits use DSEG7 Classic from keshikan/DSEG
// (https://github.com/keshikan/DSEG, SIL OFL 1.1 - public/fonts/DSEG7-Classic).
// Classic cut draws faint unlit ghost segments behind lit ones (LCD/LED plate,
// not plain bold). DSEG has no proper letter glyphs for "BPM", so the unit is
// monospace below the digits - standard digital-clock layout.
//
// Beat lamp: optional LED on the face (Display Settings "Gate blink").
// Off by default. When on, follows this metronome's BPM at one blink per beat.

let nodeGraphTransportBpmFontReady = false;
document.fonts.load('700 40px "DSEG7 Classic"').then(() => {
  nodeGraphTransportBpmFontReady = document.fonts.check('700 40px "DSEG7 Classic"');
}).catch(() => {
  // Falls back to the monospace stack below if the font fails to load.
});

const NODE_GRAPH_TRANSPORT_DISPLAY_DEFAULTS = Object.freeze({
  gateBlink: false,
});

function normalizeNodeGraphTransportSettings(settings) {
  const src = settings && typeof settings === "object" ? settings : {};
  return {
    gateBlink: src.gateBlink === true,
  };
}

function nodeGraphTransportSettingsForNode(node) {
  return normalizeNodeGraphTransportSettings(node?.transportSettings);
}

function buildNodeGraphTransportDisplaySettingsBodyHtml() {
  return `
    <div class="node-led-display-settings-panel" data-transport-display-settings-panel>
      <label class="metadata-checkbox-label" data-trace-display-control-row title="Blink an LED on the Metronome face once per this node's beat. Off by default.">
        <input type="checkbox" data-transport-field="gateBlink" id="nodeTransportGateBlinkToggle">
        Gate blink
      </label>
    </div>`;
}

function syncNodeGraphTransportDisplaySettingsControls(root, settings) {
  if (!root) {
    return;
  }
  const s = normalizeNodeGraphTransportSettings(settings);
  const toggle = root.querySelector?.('[data-transport-field="gateBlink"]')
    || document.getElementById("nodeTransportGateBlinkToggle");
  if (toggle) {
    toggle.checked = s.gateBlink === true;
  }
}

function bindNodeGraphTransportDisplaySettingsBody(host) {
  if (!host || host.dataset.transportSettingsBound === "true") {
    return;
  }
  host.dataset.transportSettingsBound = "true";
  const apply = (persist, record) => {
    if (typeof markNodeGraphTraceDisplaySettingsDirty === "function") {
      markNodeGraphTraceDisplaySettingsDirty("*");
    }
    if (typeof applyNodeGraphTraceDisplaySettingsForm === "function") {
      applyNodeGraphTraceDisplaySettingsForm({ persist, record, commit: record });
    }
  };
  host.addEventListener("change", (event) => {
    if (event.target?.closest?.("[data-transport-field]")) {
      apply("immediate", true);
    }
  });
}

function readNodeGraphTransportDisplaySettingsForm(root, current) {
  const panel = root?.querySelector?.("[data-transport-display-settings-panel]") || root;
  const next = { ...current };
  const toggle = panel?.querySelector?.('[data-transport-field="gateBlink"]')
    || document.getElementById("nodeTransportGateBlinkToggle");
  if (toggle) {
    next.gateBlink = toggle.checked === true;
  }
  return normalizeNodeGraphTransportSettings(next);
}

function nodeGraphTransportBeatLampLevel01(tempoBpm) {
  const bpm = Math.max(1, Number.isFinite(tempoBpm) && tempoBpm > 0 ? tempoBpm : 120);
  const sampleRate = Math.max(
    1,
    nodeGraphFiniteNumber(
      typeof nodeGraphModuleScopeState !== "undefined"
        ? nodeGraphModuleScopeState?.sampleRate
        : 0,
      nodeGraphFiniteNumber(typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.sampleRate : 0, 44100),
    ),
  );
  const ctx = typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.live?.context : null;
  const currentTime = Number(ctx?.currentTime);
  const absoluteFrame = Number.isFinite(currentTime) && currentTime >= 0
    ? Math.floor(currentTime * sampleRate)
    : 0;
  const phase = typeof nodeGraphTransportBeatPhase01 === "function"
    ? nodeGraphTransportBeatPhase01(absoluteFrame, sampleRate, bpm)
    : ((absoluteFrame / sampleRate) * (bpm / 60)) % 1;
  const wrapped = phase - Math.floor(phase);
  return wrapped < 0.5 ? 1 : 0;
}

function nodeGraphTransportFaceBpm(node) {
  const nodeId = node?.id;
  const meta = (typeof nodeGraphReadPatchParameterMetadata === "function" && nodeId
    ? nodeGraphReadPatchParameterMetadata(nodeId, "bpm")
    : node?.paramMeta?.bpm) || {};
  const stored = Number(node?.params?.bpm);
  const base = Number.isFinite(stored) ? stored : 120;
  const ghost = typeof nodeGraphParameterGhostSignal === "function" && nodeId
    ? nodeGraphParameterGhostSignal(nodeId, "bpm")
    : null;
  const ghostN = Number(ghost?.effectiveDomain);
  if (Number.isFinite(ghostN)) {
    return Math.max(1, Math.round(ghostN));
  }
  if (typeof nodeGraphParamFoldOrBase === "function") {
    const folded = Number(nodeGraphParamFoldOrBase(base, [], meta));
    if (Number.isFinite(folded)) {
      return Math.max(1, Math.round(folded));
    }
  }
  if (meta && meta.outputDomain === true) {
    const off = Number(meta.domainOffset);
    const sum = base + (Number.isFinite(off) ? off : 0);
    if (Number.isFinite(sum)) {
      return Math.max(1, Math.round(sum));
    }
  }
  return Math.max(1, Math.round(base > 0 ? base : 120));
}

function drawNodeGraphTransportBpmItem(renderer, item, pixelRatio) {
  const nodeId = item?.slot?.nodeId;
  if (!nodeId) {
    return;
  }
  const canvas = nodeGraphModuleScopeLocalFallbackCanvas(item?.slot);
  const screenElement = item?.screenElement || item?.slot?.scopeElement;
  if (!canvas || !syncNodeGraphModuleScopeLocalFallbackCanvas(canvas, screenElement, pixelRatio)) {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const node = typeof nodeGraphModuleScopeNodeForSlot === "function"
    ? nodeGraphModuleScopeNodeForSlot(item.slot)
    : (typeof nodeGraphMvp !== "undefined"
      ? nodeGraphMvp?.patch?.nodes?.find?.((n) => n?.id === nodeId)
      : null);
  const bpm = nodeGraphTransportFaceBpm(node);
  const digits = String(bpm);
  const gateBlinkOn = nodeGraphTransportSettingsForNode(node).gateBlink === true;
  const gate01 = gateBlinkOn ? nodeGraphTransportBeatLampLevel01(bpm) : 0;
  const gateLit = gate01 > 0.001 ? 1 : 0;
  const frozen = typeof nodeGraphModuleScopePhosphorFrozen === "function"
    && nodeGraphModuleScopePhosphorFrozen();

  // While frozen, keep the last gate lamp state so pause doesn't flicker.
  let drawGate = gateLit;
  if (frozen && canvas._nodeGraphTransportGateLit != null) {
    drawGate = canvas._nodeGraphTransportGateLit;
  } else {
    canvas._nodeGraphTransportGateLit = gateLit;
  }

  // Always repaint. Scope wipe / plate fills clear pixels but used to leave
  // stale cache keys, which made the Metronome face stay blank forever.
  canvas._nodeGraphTransportBpmDigits = digits;
  canvas._nodeGraphTransportBpmFontReady = nodeGraphTransportBpmFontReady;
  canvas._nodeGraphTransportBpmWidth = canvas.width;
  canvas._nodeGraphTransportBpmHeight = canvas.height;
  canvas._nodeGraphTransportGateDrawn = drawGate;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#020a06";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const digitFontFamily = nodeGraphTransportBpmFontReady
    ? '"DSEG7 Classic", "Consolas", monospace'
    : '"Consolas", "Courier New", monospace';
  const labelHeight = canvas.height * 0.22;
  const digitAreaHeight = canvas.height - labelHeight;
  // Fit digits inside the plate, then draw at an explicit centered x so 1–3
  // digit tempos (and DSEG side bearings) stay optically centered every frame.
  const digitPadX = Math.max(2, canvas.width * 0.06);
  const maxDigitWidth = Math.max(1, canvas.width - digitPadX * 2);
  let digitFontSize = Math.max(1, digitAreaHeight * 0.82);
  ctx.font = `${digitFontSize}px ${digitFontFamily}`;
  let digitWidth = nodeGraphFiniteNumber(ctx.measureText(digits).width);
  if (digitWidth > maxDigitWidth && digitWidth > 0) {
    digitFontSize = Math.max(1, digitFontSize * (maxDigitWidth / digitWidth));
    ctx.font = `${digitFontSize}px ${digitFontFamily}`;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(120, 255, 170, 0.92)";
  ctx.fillText(digits, canvas.width * 0.5, digitAreaHeight * 0.5);

  const labelFontSize = Math.max(1, Math.min(labelHeight * 0.7, canvas.width * 0.14));
  ctx.font = `${labelFontSize}px "Consolas", "Courier New", monospace`;
  ctx.fillStyle = "rgba(120, 255, 170, 0.55)";
  ctx.fillText("BPM", canvas.width * 0.5, digitAreaHeight + labelHeight * 0.5);

  if (gateBlinkOn) {
    // Beat lamp — this metronome's BPM, one blink per beat.
    const lampR = Math.max(2, Math.min(canvas.width, canvas.height) * 0.07);
    const lampX = canvas.width - lampR * 1.6;
    const lampY = lampR * 1.4;
    ctx.beginPath();
    ctx.arc(lampX, lampY, lampR, 0, Math.PI * 2);
    if (drawGate) {
      ctx.fillStyle = "rgba(120, 255, 170, 0.95)";
      ctx.shadowColor = "rgba(120, 255, 170, 0.85)";
      ctx.shadowBlur = lampR * 1.8;
    } else {
      ctx.fillStyle = "rgba(120, 255, 170, 0.12)";
      ctx.shadowBlur = 0;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

if (typeof nodeGraphModuleScopeCustomRenderers === "object" && nodeGraphModuleScopeCustomRenderers) {
  nodeGraphModuleScopeCustomRenderers.transportBpm = drawNodeGraphTransportBpmItem;
}
