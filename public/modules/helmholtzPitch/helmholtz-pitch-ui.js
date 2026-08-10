// Pitch Detector face: plain DOM text (cheapest possible live readout).
// No canvas, no phosphor, no Number Readout face — just two monospace lines
// updated from scope port samples (~30 Hz).

function createNodeGraphPitchDetectorBody(nodeId) {
  const body = document.createElement("div");
  body.className = "node-pitch-detector-face";
  body.dataset.node = String(nodeId || "");
  body.dataset.pitchDetectorFace = "true";
  body.setAttribute("aria-label", "Pitch detector frequency and fidelity");

  const freqRow = document.createElement("div");
  freqRow.className = "node-pitch-detector-row";
  freqRow.dataset.pitchMetric = "frequency";
  const freqKey = document.createElement("span");
  freqKey.className = "node-pitch-detector-k";
  freqKey.textContent = "Hz";
  const freqVal = document.createElement("strong");
  freqVal.className = "node-pitch-detector-v";
  freqVal.dataset.pitchValue = "frequency";
  freqVal.textContent = "—";
  freqRow.append(freqKey, freqVal);

  const fidRow = document.createElement("div");
  fidRow.className = "node-pitch-detector-row";
  fidRow.dataset.pitchMetric = "fidelity";
  const fidKey = document.createElement("span");
  fidKey.className = "node-pitch-detector-k";
  fidKey.textContent = "Fid";
  const fidVal = document.createElement("strong");
  fidVal.className = "node-pitch-detector-v";
  fidVal.dataset.pitchValue = "fidelity";
  fidVal.textContent = "—";
  fidRow.append(fidKey, fidVal);

  body.append(freqRow, fidRow);
  return body;
}

function nodeGraphPitchDetectorFormatHz(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return "—";
  }
  if (n >= 1000) {
    return n.toFixed(0);
  }
  if (n >= 100) {
    return n.toFixed(1);
  }
  return n.toFixed(2);
}

function nodeGraphPitchDetectorFormatFid(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return "—";
  }
  return Math.max(0, Math.min(1, n)).toFixed(2);
}

function renderNodeGraphPitchDetectorFace(body, frequencyHz, fidelity) {
  if (!body) {
    return;
  }
  const freqEl = body.querySelector('[data-pitch-value="frequency"]');
  const fidEl = body.querySelector('[data-pitch-value="fidelity"]');
  if (freqEl) {
    freqEl.textContent = nodeGraphPitchDetectorFormatHz(frequencyHz);
  }
  if (fidEl) {
    fidEl.textContent = nodeGraphPitchDetectorFormatFid(fidelity);
  }
}

/**
 * Update pitch-detector faces from a live scope snapshot payload
 * (array of [id, samples, meta] where id may be "nodeId" or "nodeId:Port").
 */
function updateNodeGraphPitchDetectorFacesFromScopeValues(values) {
  if (!values || !values.length) {
    return;
  }
  const byNode = new Map();
  for (const entry of values) {
    if (!entry) {
      continue;
    }
    const key = String(entry[0] || "");
    const samples = entry[1];
    if (!key || !samples) {
      continue;
    }
    const colon = key.indexOf(":");
    if (colon <= 0) {
      continue;
    }
    const nodeId = key.slice(0, colon);
    const port = key.slice(colon + 1);
    if (port !== "Frequency" && port !== "Fidelity") {
      continue;
    }
    const length = samples instanceof Float32Array
      ? samples.length
      : (Array.isArray(samples) ? samples.length : 0);
    if (!length) {
      continue;
    }
    const last = Number(samples[length - 1]);
    if (!Number.isFinite(last)) {
      continue;
    }
    let pack = byNode.get(nodeId);
    if (!pack) {
      pack = { frequency: null, fidelity: null };
      byNode.set(nodeId, pack);
    }
    if (port === "Frequency") {
      pack.frequency = last;
    } else {
      pack.fidelity = last;
    }
  }
  if (!byNode.size) {
    return;
  }
  for (const [nodeId, pack] of byNode) {
    // Avoid CSS.escape for older engines; node ids are sandbox-safe tokens.
    const body = document.querySelector(`.node-pitch-detector-face[data-node="${nodeId}"]`);
    if (!body) {
      continue;
    }
    // Only rewrite fields we received this frame (avoid flicker to —).
    const freqEl = body.querySelector('[data-pitch-value="frequency"]');
    const fidEl = body.querySelector('[data-pitch-value="fidelity"]');
    if (pack.frequency != null && freqEl) {
      freqEl.textContent = nodeGraphPitchDetectorFormatHz(pack.frequency);
    }
    if (pack.fidelity != null && fidEl) {
      fidEl.textContent = nodeGraphPitchDetectorFormatFid(pack.fidelity);
    }
  }
}
