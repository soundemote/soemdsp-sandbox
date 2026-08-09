// Module chrome outline that gaps around in/out (and param) jacks so the
// stroke never paints over a port. DOM layout stays CSS; only the frame is SVG.

const nodeGraphModuleFrameNs = "http://www.w3.org/2000/svg";
let nodeGraphModuleFrameRaf = 0;
let nodeGraphModuleFrameObserver = null;

function nodeGraphModuleFrameEnsureSvg(nodeElement) {
  if (!nodeElement) {
    return null;
  }
  let svg = nodeElement.querySelector(":scope > .node-module-frame");
  if (svg) {
    return svg;
  }
  svg = document.createElementNS(nodeGraphModuleFrameNs, "svg");
  svg.classList.add("node-module-frame");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS(nodeGraphModuleFrameNs, "path");
  path.classList.add("node-module-frame-path");
  svg.append(path);
  // First child so it sits under interactive content in paint order where
  // possible; CSS z-index also pins it below ports.
  nodeElement.insertBefore(svg, nodeElement.firstChild);
  return svg;
}

function nodeGraphModuleFrameMergeGaps(gaps) {
  if (!gaps.length) {
    return [];
  }
  const sorted = gaps
    .map((g) => ({
      a: Number(g.cy) - Number(g.half),
      b: Number(g.cy) + Number(g.half),
    }))
    .filter((g) => Number.isFinite(g.a) && Number.isFinite(g.b) && g.b > g.a)
    .sort((x, y) => x.a - y.a);
  if (!sorted.length) {
    return [];
  }
  const merged = [{ a: sorted[0].a, b: sorted[0].b }];
  for (let i = 1; i < sorted.length; i += 1) {
    const cur = sorted[i];
    const last = merged[merged.length - 1];
    if (cur.a <= last.b + 0.5) {
      last.b = Math.max(last.b, cur.b);
    } else {
      merged.push({ a: cur.a, b: cur.b });
    }
  }
  return merged;
}

/** Continuous y-segments on an edge, skipping gap intervals. */
function nodeGraphModuleFrameEdgeSegments(y0, y1, gaps) {
  const lo = Math.min(y0, y1);
  const hi = Math.max(y0, y1);
  if (hi - lo < 0.25) {
    return [];
  }
  const merged = nodeGraphModuleFrameMergeGaps(gaps);
  const segs = [];
  let cursor = lo;
  for (const gap of merged) {
    const a = Math.max(lo, gap.a);
    const b = Math.min(hi, gap.b);
    if (b <= cursor) {
      continue;
    }
    if (a > cursor) {
      segs.push([cursor, Math.min(a, hi)]);
    }
    cursor = Math.max(cursor, b);
    if (cursor >= hi) {
      break;
    }
  }
  if (cursor < hi) {
    segs.push([cursor, hi]);
  }
  return segs.filter(([a, b]) => b - a > 0.25);
}

/**
 * Vertical half-extent of the *visible* jack (crescent), not the full hit-box.
 * Param ports use a tall hit row but a scaled ::before half-disk; gaps must
 * hug that crescent so the module-edge stroke still runs between jacks.
 */
function nodeGraphModuleFramePortVisualHalfPx(port, nodeElement) {
  const pr = port.getBoundingClientRect();
  const hitHalf = Math.max(0.5, pr.height * 0.5);
  if (!port.classList.contains("node-param-port")) {
    // Signal ports: element size is already the half-disk.
    return hitHalf;
  }
  // Param jack face is ::before, scaled by --node-port-size-ratio from the
  // full 1gu band. Prefer that visual diameter over the tall hit target.
  const cs = getComputedStyle(nodeElement);
  const area = Number.parseFloat(cs.getPropertyValue("--node-port-area-size"))
    || Number.parseFloat(cs.getPropertyValue("--node-grid-height"))
    || pr.height;
  const ratio = Number.parseFloat(cs.getPropertyValue("--node-port-size-ratio"));
  const sizeRatio = Number.isFinite(ratio) && ratio > 0.05 && ratio <= 1 ? ratio : 0.57;
  const visualDiameter = Math.max(2, area * sizeRatio);
  // Screen px: area is CSS px (layout); hit box may be zoomed via transform.
  // Scale visual diameter by the same zoom as the hit rect.
  const layoutH = port.offsetHeight || area;
  const zoom = layoutH > 0.5 ? pr.height / layoutH : 1;
  return Math.max(1, (visualDiameter * 0.5) * zoom);
}

function nodeGraphModuleFrameCollectGaps(nodeElement, width, height, nodeRect) {
  const left = [];
  const right = [];
  if (!nodeElement || width < 2 || height < 2 || !nodeRect?.width) {
    return { left, right };
  }
  const scaleY = height / nodeRect.height;
  // Clear the jack diameter (+ a little) so the frame stroke never crosses
  // the wire→inlet join (a dark hairline between wire end and half-jack).
  const pad = 1.5;
  const ports = nodeElement.querySelectorAll(
    ".node-port.input, .node-port.output, .node-param-port.modulation-input, .node-param-port.graph-input, .node-param-port.parameter-output, .node-io-proxy-port.input, .node-io-proxy-port.output",
  );
  for (const port of ports) {
    if (!port.isConnected || port.offsetParent === null) {
      // Hidden (io-hidden, display:none, etc.)
      continue;
    }
    const style = getComputedStyle(port);
    if (style.display === "none" || style.visibility === "hidden") {
      continue;
    }
    const pr = port.getBoundingClientRect();
    if (pr.width < 0.5 || pr.height < 0.5) {
      continue;
    }
    const cy = ((pr.top + pr.height * 0.5) - nodeRect.top) * scaleY;
    const halfPx = nodeGraphModuleFramePortVisualHalfPx(port, nodeElement);
    const half = halfPx * scaleY + pad;
    const isOutput = port.classList.contains("output")
      || port.classList.contains("parameter-output");
    if (isOutput) {
      right.push({ cy, half });
    } else {
      left.push({ cy, half });
    }
  }
  return { left, right };
}

function nodeGraphModuleFrameBuildPath(width, height, radius, leftGaps, rightGaps) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const r = Math.max(0, Math.min(radius, w * 0.5, h * 0.5));
  const edgeTop = r;
  const edgeBottom = h - r;
  let d = "";

  // Top edge + top-right corner
  d += `M ${r.toFixed(2)} 0`;
  d += ` L ${(w - r).toFixed(2)} 0`;
  if (r > 0.01) {
    d += ` A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${w.toFixed(2)} ${r.toFixed(2)}`;
  }

  // Right edge (top → bottom), gapped at output jacks
  for (const [y0, y1] of nodeGraphModuleFrameEdgeSegments(edgeTop, edgeBottom, rightGaps)) {
    d += ` M ${w.toFixed(2)} ${y0.toFixed(2)} L ${w.toFixed(2)} ${y1.toFixed(2)}`;
  }

  // Bottom-right corner + bottom edge + bottom-left corner
  d += ` M ${w.toFixed(2)} ${(h - r).toFixed(2)}`;
  if (r > 0.01) {
    d += ` A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${(w - r).toFixed(2)} ${h.toFixed(2)}`;
  }
  d += ` L ${r.toFixed(2)} ${h.toFixed(2)}`;
  if (r > 0.01) {
    d += ` A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 0 ${(h - r).toFixed(2)}`;
  }

  // Left edge (bottom → top segments still drawn as top→bottom pairs)
  for (const [y0, y1] of nodeGraphModuleFrameEdgeSegments(edgeTop, edgeBottom, leftGaps)) {
    d += ` M 0 ${y0.toFixed(2)} L 0 ${y1.toFixed(2)}`;
  }

  // Top-left corner
  d += ` M 0 ${r.toFixed(2)}`;
  if (r > 0.01) {
    d += ` A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${r.toFixed(2)} 0`;
  }

  return d;
}

function nodeGraphModuleFrameRadiusPx(nodeElement) {
  // Stroke corner radius is independent of the module plate (which stays square).
  // Prefer --node-module-frame-radius so the outline can stay rounded at all zooms
  // while .dsp-node border-radius remains 0 (sharp front plate).
  const cs = getComputedStyle(nodeElement);
  const frameRaw = cs.getPropertyValue("--node-module-frame-radius").trim();
  const frameN = Number.parseFloat(frameRaw);
  if (Number.isFinite(frameN) && frameN > 0) {
    return frameN;
  }
  // Fallback: computed border-radius (UI Dev module roundness / legacy).
  const raw = cs.borderRadius;
  const first = String(raw || "").split(/\s+/)[0];
  const n = Number.parseFloat(first);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Knob (and similar) with face art: no chrome outline at all.
 * Class / dataset set by renderNodeGraphKnobFace after the face is mounted.
 */
function nodeGraphModuleFrameShouldHide(nodeElement) {
  if (!nodeElement?.classList) {
    return false;
  }
  if (nodeElement.classList.contains("knob-face-has-image")) {
    return true;
  }
  if (nodeElement.dataset?.hideModuleFrame === "1" || nodeElement.dataset?.hideModuleFrame === "true") {
    return true;
  }
// Knob with face art: hide module frame so images read full-bleed.
  if (nodeElement.querySelector?.(".node-knob-face.has-image")) {
    return true;
  }
  return false;
}

function nodeGraphModuleFrameHide(nodeElement) {
  if (!nodeElement) {
    return;
  }
  const svg = nodeElement.querySelector(":scope > .node-module-frame");
  if (svg) {
    // Remove from DOM so nothing can repaint a stroke around the face/image.
    svg.remove();
  }
  nodeElement.dataset.moduleFrameFp = "hidden";
  // Even if a frame is recreated before the next hide, paint nothing.
  nodeElement.style.setProperty("--node-module-stroke", "transparent");
  nodeElement.style.setProperty("--node-module-selected-stroke", "transparent");
  nodeElement.style.setProperty("--node-module-drag-stroke", "transparent");
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
 * Rebuild one module's gapped outline. Safe to call often; skips when
 * geometry fingerprint is unchanged.
 */
function updateNodeGraphModuleFrame(nodeElement) {
  if (!nodeElement?.classList?.contains("dsp-node") || nodeElement.hidden) {
    return;
  }
  // Face art: drop outline (CSS alone was not reliable for all states).
  if (nodeGraphModuleFrameShouldHide(nodeElement)) {
    nodeGraphModuleFrameHide(nodeElement);
    return;
  }
  nodeGraphModuleFrameRestoreStrokeVars(nodeElement);
  const w = nodeElement.clientWidth;
  const h = nodeElement.clientHeight;
  if (w < 2 || h < 2) {
    return;
  }
  const nodeRect = nodeElement.getBoundingClientRect();
  const { left, right } = nodeGraphModuleFrameCollectGaps(nodeElement, w, h, nodeRect);
  const radius = nodeGraphModuleFrameRadiusPx(nodeElement);
  const fingerprint = [
    w,
    h,
    radius.toFixed(2),
    left.map((g) => `${g.cy.toFixed(1)}:${g.half.toFixed(1)}`).join(","),
    right.map((g) => `${g.cy.toFixed(1)}:${g.half.toFixed(1)}`).join(","),
  ].join("|");
  if (nodeElement.dataset.moduleFrameFp === fingerprint) {
    return;
  }
  nodeElement.dataset.moduleFrameFp = fingerprint;

  const svg = nodeGraphModuleFrameEnsureSvg(nodeElement);
  const path = svg?.querySelector(".node-module-frame-path");
  if (!svg || !path) {
    return;
  }
  // Re-show after a previous face-art hide.
  svg.removeAttribute("hidden");
  svg.style.display = "";
  svg.style.visibility = "";
  svg.style.opacity = "";
  path.removeAttribute("stroke");
  svg.setAttribute("width", String(w));
  svg.setAttribute("height", String(h));
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  path.setAttribute("d", nodeGraphModuleFrameBuildPath(w, h, radius, left, right));
}

function updateAllNodeGraphModuleFrames(options = {}) {
  const force = Boolean(options.force);
  for (const node of document.querySelectorAll(".dsp-node")) {
    if (force) {
      delete node.dataset.moduleFrameFp;
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
 * Jacks often finish layout one frame after the module shell. Without a
 * settle pass the first fingerprint locks full side strokes over inlets;
 * resizing later "magically" fixes it. Double-rAF remasures after ports exist.
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
  // Port rows can change size without the module box resizing (label toggle,
  // solid-shell reflow). Observe jacks so gaps recompute without a manual resize.
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
