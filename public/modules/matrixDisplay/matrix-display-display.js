// Matrix Display face — XY sample plot into age grid + glyph ramp (asciiscope-style).

const matrixDisplaySimStates = new Map();

/**
 * Density selects columns×rows (one glyph per cell). On resize, ages remap
 * (max age in covered region) — not wiped — so residual burns persist.
 */
function matrixDisplayEnsureSim(nodeId, paramsOrCols, maybeRows) {
  let grid;
  if (paramsOrCols && typeof paramsOrCols === "object" && paramsOrCols.columns) {
    grid = paramsOrCols;
  } else if (typeof matrixResolveDensityGrid === "function") {
    const dens = typeof paramsOrCols === "number" ? paramsOrCols : 0.7;
    grid = matrixResolveDensityGrid(dens);
  } else {
    const columns = Math.max(1, (paramsOrCols | 0) || 64);
    const rows = Math.max(1, (maybeRows | 0) || 36);
    grid = { columns, rows, stamp: 1, bufColumns: columns, bufRows: rows };
  }
  const columns = Math.max(1, (grid.columns || grid.bufColumns) | 0);
  const rows = Math.max(1, (grid.rows || grid.bufRows) | 0);
  const n = columns * rows;
  let state = matrixDisplaySimStates.get(nodeId);
  if (!state) {
    state = {
      columns,
      rows,
      stamp: 1,
      stampX: 1,
      stampY: 1,
      bufColumns: columns,
      bufRows: rows,
      ages: new Uint8Array(n),
      lastMs: 0,
      xRead: 0,
      yRead: 0,
      lastXBuf: null,
      lastYBuf: null,
    };
    matrixDisplaySimStates.set(nodeId, state);
    return state;
  }
  if (state.columns !== columns || state.rows !== rows || state.ages?.length !== n) {
    // Remap ages into new density grid without wipe.
    const oldCols = Math.max(1, state.columns | 0);
    const oldRows = Math.max(1, state.rows | 0);
    const oldAges = state.ages;
    const ages = new Uint8Array(n);
    if (oldAges?.length) {
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < columns; c += 1) {
          const c0 = Math.floor((c * oldCols) / columns);
          const c1 = Math.max(c0 + 1, Math.ceil(((c + 1) * oldCols) / columns));
          const r0 = Math.floor((r * oldRows) / rows);
          const r1 = Math.max(r0 + 1, Math.ceil(((r + 1) * oldRows) / rows));
          let best = 0;
          for (let rr = r0; rr < Math.min(oldRows, r1); rr += 1) {
            for (let cc = c0; cc < Math.min(oldCols, c1); cc += 1) {
              const a = oldAges[rr * oldCols + cc] || 0;
              if (a > best) best = a;
            }
          }
          ages[r * columns + c] = best;
        }
      }
    }
    state.ages = ages;
    state.columns = columns;
    state.rows = rows;
  }
  state.stamp = 1;
  state.stampX = 1;
  state.stampY = 1;
  state.bufColumns = columns;
  state.bufRows = rows;
  return state;
}

/**
 * Phosphor fade for age grid. Trail 0 = pure Ghost path weight; 1 ≈ freeze.
 * Ghost = extreme analog hang. Burn = sticky residual floor (0 = off).
 * Frame-rate independent.
 */
function matrixDisplayFade(ages, trail, dtSec = 1 / 60, maxAge = 32, ghost = 0, burn = 0) {
  const t = Math.max(0, Math.min(1, Number(trail) || 0));
  const baseKeep = typeof matrixPhosphorBaseKeep === "function"
    ? matrixPhosphorBaseKeep(t, dtSec)
    : Math.exp(-(dtSec || 1 / 60) / 0.3);
  const kill = typeof matrixPhosphorKillFloor === "function"
    ? matrixPhosphorKillFloor(t)
    : 0.015;
  const ghostAmt = Math.max(0, Math.min(1, Number(ghost) || 0));
  const burnAmt = Math.max(0, Math.min(1, Number(burn) || 0));
  const killFloor = burnAmt >= 0.999
    ? 0
    : kill * (1 - Math.max(ghostAmt, burnAmt) * 0.85);
  const ma = Math.max(1, maxAge);
  const applyHang = typeof matrixPhosphorApplyGhostHang === "function"
    ? matrixPhosphorApplyGhostHang
    : (energy, keep) => energy * keep;
  for (let i = 0; i < ages.length; i += 1) {
    const a = ages[i];
    if (a <= 0) continue;
    const e0 = a / ma;
    const e1 = applyHang(e0, baseKeep, ghostAmt, burnAmt, t);
    if (killFloor > 0 && e1 < killFloor && !(burnAmt > 0.001 && e1 >= burnAmt * 0.999)) {
      ages[i] = 0;
    } else {
      ages[i] = Math.max(1, Math.min(ma, Math.round(e1 * ma)));
    }
  }
}

function matrixDisplayPlot(state, x, y, intensity, maxAge) {
  // intensity = brightness deposit 0..1 (single light axis).
  const cols = state.columns | 0;
  const rows = state.rows | 0;
  const px = Math.round((x * 0.5 + 0.5) * (cols - 1));
  const py = Math.round((0.5 - y * 0.5) * (rows - 1));
  if (px < 0 || px >= cols || py < 0 || py >= rows) {
    return;
  }
  const dep = Math.max(0, Math.min(1, Number(intensity) || 0));
  if (dep <= 0) return;
  const age = Math.max(1, Math.min(maxAge, Math.round(maxAge * dep)));
  const idx = py * cols + px;
  if (age > state.ages[idx]) {
    state.ages[idx] = age;
  }
}

function matrixDisplayReadPortBuffer(nodeId, port) {
  try {
    const buffers = typeof nodeGraphModuleScopeState !== "undefined"
      ? nodeGraphModuleScopeState?.buffers
      : null;
    if (buffers?.get) {
      const keyed = buffers.get(`${nodeId}:${port}`);
      if (keyed?.length) return keyed;
    }
    // Same path as scope2d: follow wire to source node's output buffer.
    if (typeof nodeGraphModuleScopeConnectedSourceBuffer === "function") {
      const connected = nodeGraphModuleScopeConnectedSourceBuffer(nodeId, port);
      if (connected?.length) return connected;
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

/**
 * Plot new samples from X/Y ring buffers. If only one buffer exists, treat as
 * mono and use a phase saw for the other axis so something still moves.
 */
function matrixDisplayIngestBuffers(state, maxAge, brightness) {
  const xBuf = matrixDisplayReadPortBuffer(state.nodeId || "", "X")
    || matrixDisplayReadPortBuffer(state.nodeId || "", "In");
  const yBuf = matrixDisplayReadPortBuffer(state.nodeId || "", "Y");

  // Store nodeId on state from caller
  const xb = xBuf;
  const yb = yBuf;

  if (!xb?.length && !yb?.length) {
    return 0;
  }

  // Prefer paired capture: walk the shorter new-tail window.
  const xArr = xb || null;
  const yArr = yb || null;
  const len = Math.min(xArr?.length || 0, yArr?.length || Infinity);
  const mono = xArr && !yArr ? xArr : (!xArr && yArr ? yArr : null);

  let plotted = 0;
  // Burn = deposit gain only. 0 is valid (no write). Brightness is display-only.
  const intensity = Math.max(0, Math.min(1, Number(burn) || 0));

  if (xArr && yArr && Number.isFinite(len) && len > 0) {
    // Plot up to last N samples for frame budget
    const budget = Math.min(len, 2048);
    const start = len - budget;
    for (let i = start; i < len; i += 1) {
      const x = Number(xArr[i]) || 0;
      const y = Number(yArr[i]) || 0;
      matrixDisplayPlot(state, x, y, intensity, maxAge);
      plotted += 1;
    }
    return plotted;
  }

  if (mono?.length) {
    const budget = Math.min(mono.length, 2048);
    const start = mono.length - budget;
    for (let i = start; i < mono.length; i += 1) {
      const v = Number(mono[i]) || 0;
      // Lissajous-ish fallback: v vs delayed self
      const d = Number(mono[Math.max(start, i - 32)]) || 0;
      matrixDisplayPlot(state, v, d, intensity, maxAge);
      plotted += 1;
    }
  }
  return plotted;
}

function matrixDisplayDrawFace(canvas, state, glyphRamp, params) {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const box = typeof nodeGraphElementClientSize === "function"
    ? nodeGraphElementClientSize(canvas, canvas.width || 1, canvas.height || 1)
    : {
      width: Math.max(1, canvas.clientWidth || canvas.width || 1),
      height: Math.max(1, canvas.clientHeight || canvas.height || 1),
      skipped: false,
    };
  if (box.skipped) {
    return;
  }
  const cssW = Math.max(1, box.width);
  const cssH = Math.max(1, box.height);
  const pw = Math.round(cssW * dpr);
  const ph = Math.round(cssH * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const cols = state.columns;
  const rows = state.rows;
  const cellW = pw / cols;
  const cellH = ph / rows;
  const fontPx = Math.max(4, Math.min(cellW, cellH) * 0.92);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#010104";
  ctx.fillRect(0, 0, pw, ph);
  // Brightness 0: plate only, no glyphs.
  const bRaw = Number(params?.brightness);
  const bright = Number.isFinite(bRaw) ? bRaw : 1;
  if (bright <= 0) {
    return;
  }
  ctx.font = `600 ${fontPx}px "Cascadia Mono", Consolas, "Courier New", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const maxAge = MATRIX_DISPLAY_MAX_AGE;
  const floor = params.blackFloor || 0;
  const ages = state.ages;

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const age = ages[r * cols + c];
      if (age <= floor) continue;
      const glyph = matrixDisplayGlyphForAge(glyphRamp, age, maxAge);
      if (glyph === " ") continue;
      ctx.fillStyle = matrixDisplayColorForAge(age, maxAge, params.brightness);
      // No ad-hoc shadow glow — brightness/decay only.
      ctx.fillText(glyph, (c + 0.5) * cellW, (r + 0.5) * cellH);
    }
  }
}

function matrixDisplayTickFace(face) {
  const nodeId = face?.dataset?.node;
  if (!nodeId || !face.isConnected) return;
  if (
    typeof nodeGraphElementInSkippedContentVisibility === "function"
    && nodeGraphElementInSkippedContentVisibility(face)
  ) {
    return;
  }
  // Scope system must not leave a Trace local-fallback canvas over this face.
  for (const overlay of face.querySelectorAll?.(
    ":scope > .node-module-scope-local-fallback-canvas",
  ) || []) {
    overlay.remove();
  }
  if (typeof nodeGraphModuleScopePersistentCanvases !== "undefined") {
    nodeGraphModuleScopePersistentCanvases.delete?.(nodeId);
  }
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const params = matrixDisplayParamsFromNode(node);
  const canvas = face.querySelector(".node-matrix-display-canvas");
  if (!canvas) return;

  const rawStore = node?.asciiscope?.glyphRamp != null
    ? node.asciiscope
    : (node?.matrixDisplay?.glyphRamp != null ? node.matrixDisplay : node?.asciiscope);
  const store = typeof normalizeNodeGraphMatrixDisplay === "function"
    ? normalizeNodeGraphMatrixDisplay(rawStore)
    : { glyphRamp: MATRIX_DISPLAY_DEFAULT_GLYPH_RAMP };
  const state = matrixDisplayEnsureSim(nodeId, params);
  state.nodeId = nodeId;

  const now = performance.now?.() || Date.now();
  const dt = state.lastMs > 0 ? Math.min(0.05, (now - state.lastMs) / 1000) : 1 / 60;
  state.lastMs = now;

  if (!params.freeze) {
    // One exponential step per frame (dt-aware) — not N discrete age chops.
    matrixDisplayFade(state.ages, params.trail, dt, MATRIX_DISPLAY_MAX_AGE, params.ghost, params.burn);
    // Deposit from brightness; ghost only affects residual hang in fade.
    matrixDisplayIngestBuffers(state, MATRIX_DISPLAY_MAX_AGE, params.brightness);
  }

  matrixDisplayDrawFace(canvas, state, store.glyphRamp, params);
}

let matrixDisplayRaf = 0;
function matrixDisplaySchedulePump() {
  if (matrixDisplayRaf) return;
  matrixDisplayRaf = window.requestAnimationFrame(() => {
    matrixDisplayRaf = 0;
    const faces = document.querySelectorAll(".node-matrix-display-face");
    if (!faces.length) return;
    // Respect Simulation FPS (same clock as scopes / phosphor / LCD / LED).
    const frameReady = typeof nodeGraphDisplayFrameReady === "function"
      ? nodeGraphDisplayFrameReady("matrixDisplay")
      : true;
    if (frameReady) {
      for (const face of faces) {
        if (typeof nodeGraphScreenSoloAllowsNode === "function"
          && !nodeGraphScreenSoloAllowsNode(face.closest?.(".dsp-node")?.dataset?.node)) {
          continue;
        }
        matrixDisplayTickFace(face);
      }
    }
    matrixDisplaySchedulePump();
  });
}

function matrixDisplayStartPump() {
  matrixDisplaySchedulePump();
}

if (typeof window !== "undefined") {
  window.addEventListener("load", () => {
    matrixDisplayStartPump();
  });
}
