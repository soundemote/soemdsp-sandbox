// Modal hard-fail UI when a patch (or startup working patch) cannot load.
// Pattern mirrors ear protection: full-screen latch, one recovery action.
//
// Recovery: copy the failed script (clipboard or select the box), then
// "Initialize patch" to clear working-patch state and load the init/default graph.

let nodeGraphPatchLoadFaultScript = "";
let nodeGraphPatchLoadFaultBound = false;

function nodeGraphPatchLoadFaultIsOpen() {
  const fault = document.getElementById("nodePatchLoadFault");
  return Boolean(fault) && !fault.hidden;
}

function bindNodeGraphPatchLoadFaultUi() {
  if (nodeGraphPatchLoadFaultBound) {
    return;
  }
  nodeGraphPatchLoadFaultBound = true;
  document
    .getElementById("nodePatchLoadFaultCopy")
    ?.addEventListener("click", () => nodeGraphCopyPatchLoadFaultScript());
  document
    .getElementById("nodePatchLoadFaultInit")
    ?.addEventListener("click", () => nodeGraphInitAfterPatchLoadFault());
}

/**
 * Show the load-failure dialog.
 * @param {{ message?: string, script?: string, title?: string }} options
 */
function nodeGraphShowPatchLoadFault(options = {}) {
  bindNodeGraphPatchLoadFaultUi();
  const message = String(options.message || "failed to load patch").trim();
  const script = String(options.script ?? options.patchScript ?? "");
  nodeGraphPatchLoadFaultScript = script;

  const detail = document.getElementById("nodePatchLoadFaultDetail");
  if (detail) {
    detail.textContent = message;
  }
  const title = document.getElementById("nodePatchLoadFaultTitle");
  if (title && options.title) {
    title.textContent = String(options.title);
  }
  const box = document.getElementById("nodePatchLoadFaultScript");
  if (box) {
    box.value = script;
    // Keep failed line near the top when message cites "line N:".
    const lineMatch = message.match(/\bline\s+(\d+)\b/i);
    if (lineMatch) {
      const lineNo = Math.max(1, Number(lineMatch[1]) || 1);
      const lines = script.split(/\r?\n/);
      // Rough scroll: ~14px per line in mono UI.
      box.scrollTop = Math.max(0, (lineNo - 2) * 14);
      try {
        const start = lines.slice(0, lineNo - 1).join("\n").length + (lineNo > 1 ? 1 : 0);
        const end = start + (lines[lineNo - 1] || "").length;
        box.focus({ preventScroll: true });
        box.setSelectionRange(start, end);
      } catch (_error) {
        // Selection optional.
      }
    }
  }

  const fault = document.getElementById("nodePatchLoadFault");
  if (fault) {
    fault.hidden = false;
  }
  document.body?.classList.add("node-patch-load-fault-open");

  try {
    if (typeof setNodeGraphScriptStatus === "function") {
      setNodeGraphScriptStatus(message.split("\n")[0] || message, false);
    }
  } catch (_error) {
    // Status pill optional.
  }
  try {
    if (typeof window !== "undefined" && window.SE?.ERROR) {
      window.SE.ERROR(message, "patch-load");
    }
  } catch (_error) {
    // Debug console optional.
  }
  console.error(message);
}

function nodeGraphClosePatchLoadFaultUi() {
  const fault = document.getElementById("nodePatchLoadFault");
  if (fault) {
    fault.hidden = true;
  }
  document.body?.classList.remove("node-patch-load-fault-open");
  const box = document.getElementById("nodePatchLoadFaultScript");
  if (box) {
    box.value = "";
  }
  nodeGraphPatchLoadFaultScript = "";
}

function nodeGraphCopyPatchLoadFaultScript() {
  const box = document.getElementById("nodePatchLoadFaultScript");
  const text = box?.value != null ? String(box.value) : nodeGraphPatchLoadFaultScript;
  if (!text) {
    return false;
  }
  const done = (ok) => {
    const btn = document.getElementById("nodePatchLoadFaultCopy");
    if (btn) {
      const prev = btn.textContent;
      btn.textContent = ok ? "Copied" : "Copy failed — select text";
      window.setTimeout(() => {
        if (btn) {
          btn.textContent = prev || "Copy script";
        }
      }, 1400);
    }
  };
  try {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => done(true),
        () => {
          // Fallback: select the box so the user can Ctrl+C.
          try {
            box?.focus();
            box?.select();
          } catch (_error) {
            // ignore
          }
          done(false);
        },
      );
      return true;
    }
  } catch (_error) {
    // fall through
  }
  try {
    box?.focus();
    box?.select();
  } catch (_error) {
    // ignore
  }
  done(false);
  return false;
}

/**
 * Only recovery path: wipe working-patch latch and load the init/default graph.
 */
function nodeGraphInitAfterPatchLoadFault() {
  try {
    if (typeof clearNodeGraphWorkingPatchFromUserSettings === "function") {
      clearNodeGraphWorkingPatchFromUserSettings();
    } else if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp) {
      nodeGraphMvp.workingPatch = null;
      nodeGraphMvp.patchDirtyState = "untouched";
    }
  } catch (_error) {
    // best effort clear
  }
  try {
    if (typeof initNodeGraphPatchFromDefault === "function") {
      initNodeGraphPatchFromDefault();
    } else if (typeof commitNodeGraphPatch === "function" && typeof cloneNodeGraphPatch === "function") {
      const fallback = typeof nodeGraphMvp !== "undefined" && nodeGraphMvp?.defaultPatch
        ? nodeGraphMvp.defaultPatch
        : (typeof nodeGraphDefaultPatch !== "undefined" ? nodeGraphDefaultPatch : { nodes: [], connections: [] });
      commitNodeGraphPatch(cloneNodeGraphPatch(fallback), {
        autosaveWorkingPatch: false,
        record: true,
        patchDirtyState: "untouched",
        status: "init patch loaded after load fault",
      });
    }
  } catch (error) {
    console.error("[soemdsp] Initialize after patch load fault failed", error);
    if (typeof setNodeGraphScriptStatus === "function") {
      setNodeGraphScriptStatus(String(error?.message || error), false);
    }
    return false;
  }
  nodeGraphClosePatchLoadFaultUi();
  if (typeof setNodeGraphScriptStatus === "function") {
    setNodeGraphScriptStatus("init patch loaded", true);
  }
  return true;
}

// Global aliases for inline onclick + throw sites.
if (typeof globalThis !== "undefined") {
  globalThis.nodeGraphShowPatchLoadFault = nodeGraphShowPatchLoadFault;
  globalThis.nodeGraphCopyPatchLoadFaultScript = nodeGraphCopyPatchLoadFaultScript;
  globalThis.nodeGraphInitAfterPatchLoadFault = nodeGraphInitAfterPatchLoadFault;
  globalThis.nodeGraphClosePatchLoadFaultUi = nodeGraphClosePatchLoadFaultUi;
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindNodeGraphPatchLoadFaultUi, { once: true });
  } else {
    bindNodeGraphPatchLoadFaultUi();
  }
}
