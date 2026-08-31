function clampNodeGraphRenderSeconds(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds)
    ? Math.max(0.05, Math.min(60, seconds))
    : 2;
}

function clampNodeGraphRenderStartSeconds(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.max(0, Math.min(3599, seconds)) : 0;
}

function clampNodeGraphRenderEndSeconds(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.max(0.05, Math.min(3600, seconds)) : 2;
}

function syncNodeGraphRenderSecondsFromInput(options = {}) {
  const input = document.getElementById("nodeRenderSecondsValue");
  if (!input) {
    return nodeGraphMvp.seconds;
  }
  const seconds = clampNodeGraphRenderSeconds(input.value);
  nodeGraphMvp.seconds = seconds;
  if (String(input.value).trim() === "" || options.normalize) {
    input.value = formatNodeSliderCompactNumber(seconds);
  }
  return seconds;
}

/** Canonical Start/End hosts — prefer Render Sample row, else document. */
function nodeGraphRenderRangeInputRoot() {
  return document.getElementById("nodeRenderDurationControl")
    || document.querySelector(".node-render-duration-control")
    || document;
}

function syncNodeGraphRenderRangeFromInputs() {
  if (nodeGraphMvp.renderStartSeconds == null) nodeGraphMvp.renderStartSeconds = 0;
  if (nodeGraphMvp.renderEndSeconds == null) nodeGraphMvp.renderEndSeconds = nodeGraphMvp.seconds ?? 2;
  const root = nodeGraphRenderRangeInputRoot();
  // One canonical field each — avoid duplicate toolbar leftovers overwriting edits.
  const startEl = root.querySelector(".node-header-render-start-input");
  const endEl = root.querySelector(".node-header-render-end-input");
  if (startEl) {
    const v = clampNodeGraphRenderStartSeconds(startEl.value);
    nodeGraphMvp.renderStartSeconds = v;
    startEl.value = formatNodeSliderCompactNumber(v);
  }
  if (endEl) {
    const v = clampNodeGraphRenderEndSeconds(endEl.value);
    nodeGraphMvp.renderEndSeconds = v;
    endEl.value = formatNodeSliderCompactNumber(v);
  }
  if (nodeGraphMvp.renderEndSeconds <= nodeGraphMvp.renderStartSeconds) {
    nodeGraphMvp.renderEndSeconds = nodeGraphMvp.renderStartSeconds + 0.05;
    if (endEl) {
      endEl.value = formatNodeSliderCompactNumber(nodeGraphMvp.renderEndSeconds);
    }
  }
}

function syncNodeGraphRenderRangeToUI() {
  if (nodeGraphMvp.renderStartSeconds == null) nodeGraphMvp.renderStartSeconds = 0;
  if (nodeGraphMvp.renderEndSeconds == null) nodeGraphMvp.renderEndSeconds = nodeGraphMvp.seconds ?? 2;
  const root = nodeGraphRenderRangeInputRoot();
  const startEl = root.querySelector(".node-header-render-start-input");
  const endEl = root.querySelector(".node-header-render-end-input");
  if (startEl) {
    startEl.value = formatNodeSliderCompactNumber(nodeGraphMvp.renderStartSeconds);
  }
  if (endEl) {
    endEl.value = formatNodeSliderCompactNumber(nodeGraphMvp.renderEndSeconds);
  }
}

function handleNodeGraphRenderSecondsInput(event) {
  syncNodeGraphRenderSecondsFromInput();
  markNodeGraphRenderPending(`Render length set to ${formatNodeSliderCompactNumber(nodeGraphMvp.seconds)} seconds.`);
  scheduleNodeGraphLiveParameterSync();
  event.stopPropagation();
}

function handleNodeGraphRenderRangeInput(event) {
  syncNodeGraphRenderRangeFromInputs();
  const dur = Math.max(0, (nodeGraphMvp.renderEndSeconds ?? 2) - (nodeGraphMvp.renderStartSeconds ?? 0));
  markNodeGraphRenderPending(`Render range ${formatNodeSliderCompactNumber(nodeGraphMvp.renderStartSeconds)}s – ${formatNodeSliderCompactNumber(nodeGraphMvp.renderEndSeconds)}s (${formatNodeSliderCompactNumber(dur)}s).`);
  scheduleNodeGraphLiveParameterSync();
  event?.stopPropagation?.();
}

/**
 * Start/End render range fields: always clickable/typeable (no dblclick gate).
 * Select-all on focus so a click replaces the value quickly; Enter commits.
 */
function bindNodeGraphRenderRangeDoubleClick() {
  for (const field of document.querySelectorAll(".node-header-render-range-field")) {
    if (field.dataset.dblClickBound) continue;
    field.dataset.dblClickBound = "1";

    const input = field.querySelector("input");
    if (!input) continue;

    // Drop legacy editing class if present from older CSS.
    field.classList.remove("editing");

    input.addEventListener("focus", () => {
      // Defer so the browser finishes focusing before select().
      window.requestAnimationFrame(() => {
        try {
          input.select();
        } catch (_error) {
          // ignore
        }
      });
    });
    input.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        input.blur();
      }
      e.stopPropagation();
    });
  }
}

window.addEventListener("load", () => {
  setTimeout(bindNodeGraphRenderRangeDoubleClick, 300);
});
