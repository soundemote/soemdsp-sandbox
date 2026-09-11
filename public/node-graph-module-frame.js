// Module chrome: plate stroke is CSS ::before. This file removes any leftover
// SVG frame nodes and schedules plate-clip updates. Workspace/module faces stay
// layout CSS px; displays/canvases use 0–1 scale elsewhere.

let nodeGraphModuleFrameRaf = 0;
let nodeGraphModuleFrameObserver = null;

/**
 * Layout offset of `el` inside `ancestor` (unzoomed CSS px).
 * Prefer offset chain over getBoundingClientRect so CSS `zoom` does not
 * inject subpixel noise (used by plate clip).
 */
function nodeGraphModuleFrameLayoutBoxInNode(el, ancestor) {
  if (!el || !ancestor) {
    return null;
  }
  let x = 0;
  let y = 0;
  let cur = el;
  // Walk offsetParent while staying under the module. Absolute ports still
  // report offsetLeft/Top relative to their offsetParent.
  while (cur && cur !== ancestor) {
    x += cur.offsetLeft || 0;
    y += cur.offsetTop || 0;
    const parent = cur.offsetParent;
    if (!parent || parent === cur) {
      return null;
    }
    // offsetParent can jump past intermediate wrappers; if it left the node,
    // fall back to client rects.
    if (parent !== ancestor && !ancestor.contains(parent)) {
      return null;
    }
    cur = parent;
  }
  if (cur !== ancestor) {
    return null;
  }
  const w = el.offsetWidth || 0;
  const h = el.offsetHeight || 0;
  if (w < 0.5 || h < 0.5) {
    return null;
  }
  return { x, y, w, h, cy: y + h * 0.5 };
}

function nodeGraphModuleFrameHide(nodeElement) {
  if (!nodeElement) {
    return;
  }
  // Already cleaned — do not querySelector on the hot path.
  if (nodeElement.dataset.moduleFrameFp === "hidden") {
    return;
  }
  const svg = nodeElement.querySelector(":scope > .node-module-frame");
  if (svg) {
    svg.remove();
  }
  nodeElement.dataset.moduleFrameFp = "hidden";
}

function nodeGraphModuleFrameRestoreStrokeVars(nodeElement) {
  if (!nodeElement?.style) {
    return;
  }
  nodeElement.style.removeProperty("--node-module-stroke");
  nodeElement.style.removeProperty("--node-module-selected-stroke");
  nodeElement.style.removeProperty("--node-module-drag-stroke");
}

/**
 * Drop leftover SVG chrome and refresh plate clip. Safe to call often.
 */
function updateNodeGraphModuleFrame(nodeElement) {
  if (!nodeElement?.classList?.contains("dsp-node")) {
    return;
  }
  // Retired: gapped 1px breathing-room SVG. Plate stroke is CSS ::before.
  nodeGraphModuleFrameHide(nodeElement);
  if (typeof applyNodeGraphModulePlateClip === "function") {
    applyNodeGraphModulePlateClip(nodeElement);
  }
}

function updateAllNodeGraphModuleFrames(options = {}) {
  const force = Boolean(options.force);
  for (const node of document.querySelectorAll(".dsp-node")) {
    if (force) {
      delete node.dataset.moduleFrameFp;
      delete node.dataset.plateClipFp;
    }
    updateNodeGraphModuleFrame(node);
  }
}

let nodeGraphModuleFramePendingNodes = null;

function scheduleNodeGraphModuleFramesUpdate(options = {}) {
  const force = Boolean(options.force);
  const onlyNode = options.nodeElement || null;
  if (onlyNode) {
    if (!nodeGraphModuleFramePendingNodes) {
      nodeGraphModuleFramePendingNodes = new Set();
    }
    nodeGraphModuleFramePendingNodes.add(onlyNode);
  } else {
    // Full update requested — clear partial set so we refresh everything.
    nodeGraphModuleFramePendingNodes = null;
  }
  if (force) {
    // Drop any coalesced non-force frame so the forced pass always runs.
    if (nodeGraphModuleFrameRaf) {
      window.cancelAnimationFrame(nodeGraphModuleFrameRaf);
      nodeGraphModuleFrameRaf = 0;
    }
  } else if (nodeGraphModuleFrameRaf) {
    return;
  }
  nodeGraphModuleFrameRaf = window.requestAnimationFrame(() => {
    nodeGraphModuleFrameRaf = 0;
    const pending = nodeGraphModuleFramePendingNodes;
    nodeGraphModuleFramePendingNodes = null;
    if (pending?.size) {
      for (const node of pending) {
        if (force) {
          delete node.dataset?.moduleFrameFp;
          delete node.dataset?.plateClipFp;
        }
        if (node?.isConnected) {
          updateNodeGraphModuleFrame(node);
        }
      }
      return;
    }
    updateAllNodeGraphModuleFrames({ force });
  });
}

/**
 * Jacks often finish layout one frame after the module shell. Double-rAF
 * remasures after ports exist so plate clip settles.
 */
function scheduleNodeGraphModuleFramesSettledUpdate() {
  scheduleNodeGraphModuleFramesUpdate({ force: true });
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      scheduleNodeGraphModuleFramesUpdate({ force: true });
    });
  });
}

function nodeGraphModuleFrameObserve(nodeElement) {
  if (!nodeElement || typeof ResizeObserver !== "function") {
    return;
  }
  if (!nodeGraphModuleFrameObserver) {
    nodeGraphModuleFrameObserver = new ResizeObserver((entries) => {
      // Only rebuild frames for modules that actually resized — not the whole graph.
      const nodes = new Set();
      for (const entry of entries) {
        const target = entry?.target;
        if (!(target instanceof Element)) {
          continue;
        }
        const node = target.classList.contains("dsp-node")
          ? target
          : target.closest?.(".dsp-node");
        if (node) {
          nodes.add(node);
        }
      }
      if (!nodes.size) {
        scheduleNodeGraphModuleFramesUpdate({ force: true });
        return;
      }
      for (const node of nodes) {
        scheduleNodeGraphModuleFramesUpdate({ force: true, nodeElement: node });
      }
    });
  }
  try {
    nodeGraphModuleFrameObserver.observe(nodeElement);
  } catch (_error) {
    // Ignore double-observe / detached.
  }
  if (typeof nodeGraphViewportCullObserve === "function") {
    nodeGraphViewportCullObserve(nodeElement);
  }
  // Port rows can change size without the module box resizing (label toggle,
  // solid-shell reflow). Observe jacks so plate clip refreshes without a manual resize.
  for (const port of nodeElement.querySelectorAll(
    ".node-port, .node-param-port, .node-io-row, .node-solid-module-shell",
  )) {
    try {
      nodeGraphModuleFrameObserver.observe(port);
    } catch (_error) {
      // Ignore.
    }
  }
}

function syncNodeGraphModuleFramesAfterDom() {
  for (const node of document.querySelectorAll(".dsp-node")) {
    nodeGraphModuleFrameObserve(node);
  }
  scheduleNodeGraphModuleFramesSettledUpdate();
}
