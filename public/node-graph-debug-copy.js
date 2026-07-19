function fallbackCopyTextToClipboard(text) {
  const fallback = document.createElement("textarea");
  fallback.value = text;
  fallback.setAttribute("readonly", "");
  fallback.style.position = "fixed";
  fallback.style.left = "-9999px";
  fallback.style.opacity = "0";
  document.body.append(fallback);
  fallback.focus();
  fallback.select();
  fallback.setSelectionRange(0, fallback.value.length);
  const copied = document.execCommand("copy");
  fallback.remove();
  if (!copied) {
    throw new Error("clipboard fallback failed");
  }
}

async function copyTextToClipboard(text) {
  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard API unavailable");
    }
    await navigator.clipboard.writeText(text);
  } catch (_error) {
    fallbackCopyTextToClipboard(text);
  }
}

async function copyNodeGraphRuntimeSketch() {
  const sketch = document.getElementById("nodeRuntimeSketch");
  const sketchStatus = document.getElementById("nodeRuntimeSketchStatus");
  const text = sketch?.textContent || "";
  if (!text || text === "waiting for graph") {
    if (sketchStatus) {
      sketchStatus.textContent = "nothing to copy";
      sketchStatus.className = "pill warn";
    }
    return;
  }
  try {
    await copyTextToClipboard(text);
    if (sketchStatus) {
      sketchStatus.textContent = "copied";
      sketchStatus.className = "pill good";
    }
  } catch (error) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(sketch);
    selection.removeAllRanges();
    selection.addRange(range);
    if (sketchStatus) {
      sketchStatus.textContent = "selected";
      sketchStatus.title = error.message;
      sketchStatus.className = "pill good";
    }
  }
}

// nodeGraphBuildLivePlan() (node-graph-live-plan-runtime.js) is the exact
// flattened, closure-free JSON shape already sent to the browser's
// AudioWorklet (see setPlan in node-live-audio-worklet-core.js) -- the
// same shape a native C++ graph interpreter (soemdsp-sandbox-native's
// clap-plugin/graph-engine/) is meant to consume, so it can be tested
// against a real exported patch instead of only synthetic fixtures.
function downloadNodeGraphLivePlanJson() {
  const status = document.getElementById("nodeLivePlanExportStatus");
  let plan;
  try {
    plan = nodeGraphBuildLivePlan();
  } catch (error) {
    if (status) {
      status.textContent = "blocked";
      status.title = String(error?.issues?.join(", ") || error?.message || error);
      status.className = "pill warn";
    }
    return;
  }
  const json = JSON.stringify(plan, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const patchName = String(nodeGraphMvp?.patch?.info?.name || "patch")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "patch";
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${patchName}.live-plan.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  if (status) {
    status.textContent = "downloaded";
    status.title = `${plan.nodes.length} nodes, ${plan.order.length} in execution order`;
    status.className = "pill good";
  }
}

async function copyNodeGraphExecutionJson() {
  const debug = document.getElementById("nodeExecutionPlanDebug");
  const jsonStatus = document.getElementById("nodeExecutionJsonStatus");
  const text = debug?.textContent || "";
  if (!text || text === "waiting for graph") {
    if (jsonStatus) {
      jsonStatus.textContent = "nothing to copy";
      jsonStatus.className = "pill warn";
    }
    return;
  }
  try {
    await copyTextToClipboard(text);
    if (jsonStatus) {
      jsonStatus.textContent = "copied";
      jsonStatus.className = "pill good";
    }
  } catch (error) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(debug);
    selection.removeAllRanges();
    selection.addRange(range);
    if (jsonStatus) {
      jsonStatus.textContent = "selected";
      jsonStatus.title = error.message;
      jsonStatus.className = "pill good";
    }
  }
}
