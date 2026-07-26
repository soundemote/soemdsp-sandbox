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

function syncNodeGraphRenderRangeFromInputs() {
  if (nodeGraphMvp.renderStartSeconds == null) nodeGraphMvp.renderStartSeconds = 0;
  if (nodeGraphMvp.renderEndSeconds == null) nodeGraphMvp.renderEndSeconds = nodeGraphMvp.seconds ?? 2;
  for (const el of document.querySelectorAll(".node-header-render-start-input")) {
    const v = clampNodeGraphRenderStartSeconds(el.value);
    nodeGraphMvp.renderStartSeconds = v;
    el.value = formatNodeSliderCompactNumber(v);
  }
  for (const el of document.querySelectorAll(".node-header-render-end-input")) {
    const v = clampNodeGraphRenderEndSeconds(el.value);
    nodeGraphMvp.renderEndSeconds = v;
    el.value = formatNodeSliderCompactNumber(v);
  }
  if (nodeGraphMvp.renderEndSeconds <= nodeGraphMvp.renderStartSeconds) {
    nodeGraphMvp.renderEndSeconds = nodeGraphMvp.renderStartSeconds + 0.05;
    for (const el of document.querySelectorAll(".node-header-render-end-input")) {
      el.value = formatNodeSliderCompactNumber(nodeGraphMvp.renderEndSeconds);
    }
  }
}

function syncNodeGraphRenderRangeToUI() {
  if (nodeGraphMvp.renderStartSeconds == null) nodeGraphMvp.renderStartSeconds = 0;
  if (nodeGraphMvp.renderEndSeconds == null) nodeGraphMvp.renderEndSeconds = nodeGraphMvp.seconds ?? 2;
  for (const el of document.querySelectorAll(".node-header-render-start-input")) {
    el.value = formatNodeSliderCompactNumber(nodeGraphMvp.renderStartSeconds);
  }
  for (const el of document.querySelectorAll(".node-header-render-end-input")) {
    el.value = formatNodeSliderCompactNumber(nodeGraphMvp.renderEndSeconds);
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

function bindNodeGraphRenderRangeDoubleClick() {
  for (const field of document.querySelectorAll(".node-header-render-range-field")) {
    if (field.dataset.dblClickBound) continue;
    field.dataset.dblClickBound = "1";

    const input = field.querySelector("input");
    if (!input) continue;

    field.addEventListener("dblclick", () => {
      field.classList.add("editing");
      input.focus();
      input.select();
    });

    const finish = () => {
      field.classList.remove("editing");
    };
    input.addEventListener("blur", finish);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { input.blur(); }
      e.stopPropagation();
    });
  }
}

window.addEventListener("load", () => {
  setTimeout(bindNodeGraphRenderRangeDoubleClick, 300);
});
