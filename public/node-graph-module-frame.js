// Module chrome outline that gaps around in/out (and param) jacks so the
// stroke never paints over a port. DOM layout stays CSS; only the frame is SVG.

const nodeGraphModuleFrameNs = "http://www.w3.org/2000/svg";
/**
 * Screen pixels of air for the frame stroke (outset + jack-gap pad).
 * Converted to layout units via /zoom so it stays constant under CSS zoom.
 */
const nodeGraphModuleFrameBreathingScreenPx = 1;
let nodeGraphModuleFrameRaf = 0;
let nodeGraphModuleFrameObserver = null;

/** Workspace zoom for layout↔screen conversion (matches stroke-width invert). */
function nodeGraphModuleFrameZoom() {
  if (typeof nodeGraphZoom === "function") {
    const z = Number(nodeGraphZoom());
    if (Number.isFinite(z) && z > 0) {
      return z;
    }
  }
  return 1;
}

/** Breathing room in layout CSS px = screen px / zoom. */
function nodeGraphModuleFrameBreathingLayoutPx(nodeElement = null) {
  let zoom = nodeGraphModuleFrameZoom();
  if (nodeElement && zoom === 1) {
    const raw = getComputedStyle(nodeElement).getPropertyValue("--node-graph-zoom");
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      zoom = parsed;
    }
  }
  return nodeGraphModuleFrameBreathingScreenPx / Math.max(0.0001, zoom);
}

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
 * Layout offset of `el` inside `ancestor` (unzoomed CSS px).
 * Prefer offset chain over getBoundingClientRect so CSS `zoom` does not
 * inject subpixel noise into frame gaps (that made selection strokes jitter).
 */
function nodeGraphModuleFrameLayoutBoxInNode(el, ancestor) {
  if (!el || !ancestor) {
    return null;
  }
  let x = 0;
  let y = 0;
  let cur = el;
  // Walk offsetParent while staying under the module. Absolute ports still
  // report offsetLeft/Top relative to their offset parent.
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

/**
 * Vertical half-extent of the *visible* jack (crescent), not the full hit-box.
 * Param ports use a tall hit row but a scaled ::before half-disk; gaps must
 * hug that crescent so the module-edge stroke still runs between jacks.
 * Returns layout CSS px (not screen px) so CSS zoom does not rescale gaps.
 */
function nodeGraphModuleFramePortVisualHalfPx(port, nodeElement, layoutBox = null) {
  const hitHalf = Math.max(0.5, (layoutBox?.h || port.offsetHeight || 0) * 0.5);
  if (!port.classList.contains("node-param-port")) {
    // Signal ports: element size is already the half-disk.
    return hitHalf;
  }
  // Param jack face is ::before, scaled by --node-port-size-ratio from the
  // full 1gu band. Prefer that visual diameter over the tall hit target.
  const cs = getComputedStyle(nodeElement);
  const area = Number.parseFloat(cs.getPropertyValue("--node-port-area-size"))
    || Number.parseFloat(cs.getPropertyValue("--node-grid-height"))
    || hitHalf * 2;
  const ratio = Number.parseFloat(cs.getPropertyValue("--node-port-size-ratio"));
  const sizeRatio = Number.isFinite(ratio) && ratio > 0.05 && ratio <= 1 ? ratio : 0.57;
  const visualDiameter = Math.max(2, area * sizeRatio);
  return Math.max(1, visualDiameter * 0.5);
}

function nodeGraphModuleFrameCollectGaps(nodeElement, width, height, nodeRect) {
  const left = [];
  const right = [];
  if (!nodeElement || width < 2 || height < 2) {
    return { left, right };
  }
  // Gap past the jack face by 1 screen px of air (zoom-invariant).
  const pad = nodeGraphModuleFrameBreathingLayoutPx(nodeElement);
  const ports = nodeElement.querySelectorAll(
    ".node-port.input, .node-port.output, .node-param-port.modulation-input, .node-param-port.graph-input, .node-param-port.parameter-output, .node-io-proxy-port.input, .node-io-proxy-port.output",
  );
  // Fallback only: screen→layout scale if offset chain fails (rare).
  const scaleY = nodeRect?.height > 0.5 ? height / nodeRect.height : 1;
  for (const port of ports) {
    if (!port.isConnected || port.offsetParent === null) {
      // Hidden (io-hidden, display:none, etc.)
      continue;
    }
    const style = getComputedStyle(port);
    if (style.display === "none" || style.visibility === "hidden") {
      continue;
    }
    let cy;
    let half;
    const box = nodeGraphModuleFrameLayoutBoxInNode(port, nodeElement);
    if (box) {
      cy = box.cy;
      half = nodeGraphModuleFramePortVisualHalfPx(port, nodeElement, box) + pad;
      // If offset chain drifted vs screen geometry (zoom / nested grids), prefer rect.
      if (nodeRect?.height > 0.5) {
        const pr = port.getBoundingClientRect();
        if (pr.height >= 0.5) {
          const rectCy = ((pr.top + pr.height * 0.5) - nodeRect.top) * scaleY;
          if (Math.abs(rectCy - cy) > 1.5) {
            cy = rectCy;
            half = nodeGraphModuleFramePortVisualHalfPx(port, nodeElement) + pad;
          }
        }
      }
    } else if (nodeRect?.width) {
      const pr = port.getBoundingClientRect();
      if (pr.width < 0.5 || pr.height < 0.5) {
        continue;
      }
      // Screen → layout for center; half-size is already layout CSS px.
      cy = ((pr.top + pr.height * 0.5) - nodeRect.top) * scaleY;
      half = nodeGraphModuleFramePortVisualHalfPx(port, nodeElement) + pad;
    } else {
      continue;
    }
    // Snap to 0.25 layout px — kills subpixel fingerprint thrash / stroke jitter.
    cy = Math.round(cy * 4) / 4;
    half = Math.round(half * 4) / 4;
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

/**
 * Build the gapped frame path. `outset` > 0 places the stroke outside the
 * plate (breathing room outside the edge). Side edges open gaps at jacks.
 * Corners: round the top edge only; bottom corners are always square
 * (selected and unselected).
 */
function nodeGraphModuleFrameBuildPath(width, height, radius, leftGaps, rightGaps, outset = 0) {
  // Same units as the viewBox (live CSS box, not rounded).
  const w = Math.max(1, Number(width) || 0);
  const h = Math.max(1, Number(height) || 0);
  // Outset: expand path beyond the plate (negative would be inset — wrong).
  const s = Math.max(0, Number(outset) || 0);
  const left = -s;
  const top = -s;
  const right = w + s;
  const bottom = h + s;
  const innerW = right - left;
  const innerH = bottom - top;
  // Top corners only — bottom stays square (rBottom = 0).
  const rTop = Math.max(0, Math.min(Number(radius) || 0, innerW * 0.5, innerH * 0.5));
  const edgeTop = top + rTop;
  const edgeBottom = bottom;
  let d = "";
  // One decimal is enough; avoid float dust that walks the edge under zoom.
  const f = (n) => {
    const v = Math.round(Number(n) * 10) / 10;
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  };

  // Top edge + top-right corner (rounded)
  d += `M ${f(left + rTop)} ${f(top)}`;
  d += ` L ${f(right - rTop)} ${f(top)}`;
  if (rTop > 0.01) {
    d += ` A ${f(rTop)} ${f(rTop)} 0 0 1 ${f(right)} ${f(top + rTop)}`;
  } else {
    d += ` L ${f(right)} ${f(top)}`;
  }

  // Right edge (below top radius → bottom), gapped at output jacks
  for (const [y0, y1] of nodeGraphModuleFrameEdgeSegments(edgeTop, edgeBottom, rightGaps)) {
    d += ` M ${f(right)} ${f(y0)} L ${f(right)} ${f(y1)}`;
  }

  // Bottom-right → bottom edge → bottom-left (square corners, no arcs)
  d += ` M ${f(right)} ${f(bottom)}`;
  d += ` L ${f(left)} ${f(bottom)}`;

  // Left edge
  for (const [y0, y1] of nodeGraphModuleFrameEdgeSegments(edgeTop, edgeBottom, leftGaps)) {
    d += ` M ${f(left)} ${f(y0)} L ${f(left)} ${f(y1)}`;
  }

  // Top-left corner (rounded)
  d += ` M ${f(left)} ${f(top + rTop)}`;
  if (rTop > 0.01) {
    d += ` A ${f(rTop)} ${f(rTop)} 0 0 1 ${f(left + rTop)} ${f(top)}`;
  } else {
    d += ` L ${f(left)} ${f(top)}`;
  }

  return d;
}

/**
 * Resolve a CSS length (incl. calc/var on custom props) to layout px.
 * getPropertyValue("--foo") often returns unresolved "calc(...)" — parseFloat
 * of that is NaN, which left frame radius at 0 (square stroke forever).
 */
function nodeGraphModuleFrameResolveCssPx(element, cssValue, fallback = 0) {
  const raw = String(cssValue || "").trim();
  if (!raw || !element) {
    return fallback;
  }
  // Already a plain length: "12.6px" / "12.6"
  if (/^-?[\d.]+(px)?$/i.test(raw)) {
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : fallback;
  }
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = [
    "position:absolute",
    "left:0",
    "top:0",
    "height:0",
    "margin:0",
    "padding:0",
    "border:0",
    "overflow:hidden",
    "visibility:hidden",
    "pointer-events:none",
    `width:${raw}`,
  ].join(";");
  element.appendChild(probe);
  // offsetWidth is layout px (not zoomed screen px).
  const px = probe.offsetWidth;
  probe.remove();
  return Number.isFinite(px) && px > 0 ? px : fallback;
}

function nodeGraphModuleFrameGridSizePx(nodeElement) {
  const cs = getComputedStyle(nodeElement);
  const fromVar = nodeGraphModuleFrameResolveCssPx(
    nodeElement,
    cs.getPropertyValue("--node-grid-size").trim() || "28px",
    0,
  );
  if (fromVar > 0) {
    return fromVar;
  }
  const fromHeight = Number.parseFloat(cs.getPropertyValue("--node-grid-height"));
  return Number.isFinite(fromHeight) && fromHeight > 0 ? fromHeight : 28;
}

function nodeGraphModuleFrameRadiusPx(nodeElement) {
  // Stroke-only TOP corner radius (bottom corners are always square in the path).
  // Selected modules use a dedicated rounded top-edge stroke radius.
  const cs = getComputedStyle(nodeElement);
  const grid = nodeGraphModuleFrameGridSizePx(nodeElement);
  const selected = nodeElement.classList?.contains("selected");
  if (selected) {
    const selectedPx = nodeGraphModuleFrameResolveCssPx(
      nodeElement,
      cs.getPropertyValue("--node-module-selected-frame-radius"),
      grid * 0.5,
    );
    // Always show clear top rounding when selected (min ~8px at default grid).
    return Math.max(selectedPx, grid * 0.35, 8);
  }
  const framePx = nodeGraphModuleFrameResolveCssPx(
    nodeElement,
    cs.getPropertyValue("--node-module-frame-radius"),
    grid * 0.35,
  );
  if (framePx > 0.01) {
    return framePx;
  }
  // Fallback: plate border-radius when frame radius is unset/0.
  const first = String(cs.borderRadius || "").split(/\s+/)[0];
  return nodeGraphModuleFrameResolveCssPx(nodeElement, first, 0);
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
  // Use the live CSS box — do not round. Rounding + preserveAspectRatio
  // "none" stretched the path so the left wall walked faster than contents
  // (9gu lands on integers; 10gu often does not).
  const w = Math.max(1, Number(nodeElement.clientWidth) || 0);
  const h = Math.max(1, Number(nodeElement.clientHeight) || 0);
  if (w < 2 || h < 2) {
    return;
  }
  // Layout offsets first; getBoundingClientRect only if offset chain fails.
  const nodeRect = nodeElement.getBoundingClientRect();
  const { left, right } = nodeGraphModuleFrameCollectGaps(nodeElement, w, h, nodeRect);
  const radius = nodeGraphModuleFrameRadiusPx(nodeElement);
  // 1 screen px outside plate + past jacks, independent of workspace zoom.
  const breath = nodeGraphModuleFrameBreathingLayoutPx(nodeElement);
  const selected = nodeElement.classList.contains("selected") ? 1 : 0;
  const fingerprint = [
    w.toFixed(2),
    h.toFixed(2),
    radius.toFixed(2),
    breath.toFixed(4),
    selected,
    left.map((g) => `${g.cy.toFixed(2)}:${g.half.toFixed(2)}`).join(","),
    right.map((g) => `${g.cy.toFixed(2)}:${g.half.toFixed(2)}`).join(","),
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
  // Keep frame under jacks/content in DOM order (first child) + CSS z-index 0.
  if (svg !== nodeElement.firstChild) {
    nodeElement.insertBefore(svg, nodeElement.firstChild);
  }
  // Re-show after a previous face-art hide.
  svg.removeAttribute("hidden");
  svg.style.display = "";
  svg.style.visibility = "";
  svg.style.opacity = "";
  path.removeAttribute("stroke");
  // Pin 1:1 to the plate. Percentage 100% + a rounded viewBox used to
  // non-uniformly scale the path (left wall walked). xMinYMin keeps any
  // leftover px on the right/bottom, never the left edge.
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.style.width = `${w}px`;
  svg.style.height = `${h}px`;
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
  // 1 screen px outside the plate; side gaps open around jacks by the same.
  path.setAttribute(
    "d",
    nodeGraphModuleFrameBuildPath(w, h, radius, left, right, breath),
  );
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
  if (typeof nodeGraphViewportCullObserve === "function") {
    nodeGraphViewportCullObserve(nodeElement);
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
