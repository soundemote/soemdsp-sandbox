// Matrix Display renderer — waterfall-first phosphor cells.
// CPU cell residual (not GL PhosphorDrawer): energy + live/residual glyph per bin.

const matrixSimStates = new Map();

/**
 * Ensure phosphor sim for a node.
 * Density selects columns×rows (one readable glyph per cell). When the grid
 * size changes, energy/live/residual are remapped — not wiped — so residual
 * burns of other sizes remain artistically.
 *
 * @param {string} nodeId
 * @param {number|object} densityOrGrid density number or resolve result
 */
function matrixEnsureSim(nodeId, densityOrGrid) {
  const grid = (densityOrGrid && typeof densityOrGrid === "object" && densityOrGrid.columns)
    ? densityOrGrid
    : (typeof matrixResolveDensityGrid === "function"
      ? matrixResolveDensityGrid(densityOrGrid)
      : { density: 0.5, stamp: 1, stampX: 1, stampY: 1, columns: 40, rows: 22, bufColumns: 40, bufRows: 22 });
  const columns = Math.max(1, (grid.columns || grid.bufColumns) | 0);
  const rows = Math.max(1, (grid.rows || grid.bufRows) | 0);
  const n = columns * rows;

  let state = matrixSimStates.get(nodeId);
  if (!state) {
    const heads = new Float32Array(columns);
    const headSpeed = new Float32Array(columns);
    const headLife = new Float32Array(columns);
    const headCharSlot = new Float32Array(columns);
    const headCharPhase = new Float32Array(columns);
    for (let c = 0; c < columns; c += 1) {
      heads[c] = -1 - Math.random() * rows * 0.5;
      headSpeed[c] = 0.45 + Math.random() * 1.2;
      headLife[c] = Math.random() < 0.4 ? 0 : 1;
      headCharSlot[c] = 0;
      headCharPhase[c] = 0;
    }
    state = {
      columns,
      rows,
      stampX: 1,
      stampY: 1,
      stamp: 1,
      bufColumns: columns,
      bufRows: rows,
      energy: new Float32Array(n),
      tip: new Uint8Array(n),
      live: new Array(n).fill(" "),
      residual: new Array(n).fill(" "),
      heads,
      headSpeed,
      headLife,
      headCharSlot,
      headCharPhase,
      lastMs: 0,
      rng: (Math.random() * 1e9) | 1,
      serialCursor: 0,
      triggerWasHigh: false,
      resetWasHigh: false,
      serialBufRef: null,
      serialBufLen: 0,
    };
    matrixSimStates.set(nodeId, state);
    return state;
  }

  // Density change: remap phosphor + heads (do not wipe, do not spawn-burst).
  if (state.columns !== columns || state.rows !== rows || state.energy?.length !== n) {
    // Recover legacy stamp-buffer states where energy is buf-sized but columns were logical.
    if (state.bufColumns && state.bufRows
      && state.energy?.length === (state.bufColumns * state.bufRows)) {
      state.columns = state.bufColumns;
      state.rows = state.bufRows;
    } else if (state.energy?.length && state.columns > 0) {
      const inferred = Math.round(state.energy.length / state.columns);
      if (inferred > 0 && inferred * state.columns === state.energy.length) {
        state.rows = inferred;
      }
    }
    matrixRemapSimGrid(state, columns, rows);
  } else {
    state.stampX = 1;
    state.stampY = 1;
    state.stamp = 1;
    state.bufColumns = columns;
    state.bufRows = rows;
    if (!state.heads || state.heads.length !== columns) {
      matrixRemapHeadStreams(state, columns, rows);
    }
  }
  return state;
}

/**
 * Density retarget while keeping rain coherent:
 *  - Energy: nearest-neighbor sample (no max-pool flood across the plate)
 *  - Glyphs: always cleared — never stamp residual "." / first rain char into
 *    every bin (that filled the face with identical ｱ / dots when paused)
 *  - Heads: re-bin by UV so the same streams continue after unpause
 */
function matrixRemapSimGrid(state, newCols, newRows) {
  const oldCols = Math.max(1, state.columns | 0);
  const oldRows = Math.max(1, state.rows | 0);
  const oldE = state.energy;
  const n = newCols * newRows;
  const energy = new Float32Array(n);
  // Always blank glyphs on density change — waterfall only draws with a glyph,
  // so we will not paint a solid field of one character over remapped energy.
  const live = new Array(n).fill(" ");
  const residual = new Array(n).fill(" ");
  if (oldE && oldE.length && oldCols > 0 && oldRows > 0) {
    for (let r = 0; r < newRows; r += 1) {
      for (let c = 0; c < newCols; c += 1) {
        // Nearest old cell (center of new bin) — avoids max-pool spreading one
        // hot trail into a solid wall of residual glyphs.
        const oc = Math.min(oldCols - 1, Math.max(0, Math.floor(((c + 0.5) * oldCols) / newCols)));
        const or = Math.min(oldRows - 1, Math.max(0, Math.floor(((r + 0.5) * oldRows) / newRows)));
        energy[r * newCols + c] = oldE[or * oldCols + oc] || 0;
      }
    }
  }
  state.energy = energy;
  state.tip = new Uint8Array(n);
  state.live = live;
  state.residual = residual;
  matrixRemapHeadStreams(state, newCols, newRows, oldCols, oldRows);
  state.columns = newCols;
  state.rows = newRows;
  state.bufColumns = newCols;
  state.bufRows = newRows;
  state.stampX = 1;
  state.stampY = 1;
  state.stamp = 1;
  state.spawnSuppress = Math.max(state.spawnSuppress || 0, 12);
  if (state.stormHeads) {
    state.stormHeads.length = 0;
  }
}

/**
 * Re-bin live rain heads into a new column count by horizontal UV.
 * Does NOT invent new streams for empty columns (avoids density→spawn burst).
 */
function matrixRemapHeadStreams(state, newCols, newRows, oldCols = null, oldRows = null) {
  const prevCols = Math.max(1, (oldCols != null ? oldCols : state.heads?.length) | 0);
  const prevRows = Math.max(1, (oldRows != null ? oldRows : state.rows) | 0);
  const streams = [];
  if (state.heads && state.headLife) {
    for (let c = 0; c < state.heads.length; c += 1) {
      if ((state.headLife[c] || 0) <= 0) continue;
      streams.push({
        // Column center in 0..1 across the face
        u: (c + 0.5) / prevCols,
        // Row position in continuous row units, scaled to new height
        y: (Number(state.heads[c]) || 0) * (newRows / prevRows),
        speed: state.headSpeed?.[c] || 0.8,
        slot: state.headCharSlot?.[c] || 0,
        // headCharPhase stores last floor(head * charSpeed) mark (not 0..1).
        phase: state.headCharPhase?.[c] || 0,
      });
    }
  }
  const heads = new Float32Array(newCols);
  const headSpeed = new Float32Array(newCols);
  const headLife = new Float32Array(newCols);
  const headCharSlot = new Float32Array(newCols);
  const headCharPhase = new Float32Array(newCols);
  for (let c = 0; c < newCols; c += 1) {
    heads[c] = -1 - Math.random() * newRows * 0.25;
    headSpeed[c] = 0.5 + Math.random() * 0.9;
    headLife[c] = 0;
    headCharSlot[c] = 0;
    headCharPhase[c] = 0;
  }
  // Place each surviving stream on the nearest free column (by UV).
  for (const s of streams) {
    let c = Math.min(newCols - 1, Math.max(0, Math.floor(s.u * newCols)));
    if (headLife[c] > 0) {
      // Find nearest empty column.
      let placed = false;
      for (let d = 1; d < newCols; d += 1) {
        const L = c - d;
        const R = c + d;
        if (L >= 0 && headLife[L] <= 0) {
          c = L;
          placed = true;
          break;
        }
        if (R < newCols && headLife[R] <= 0) {
          c = R;
          placed = true;
          break;
        }
      }
      if (!placed) continue; // grid too dense — drop overflow stream
    }
    heads[c] = s.y;
    headSpeed[c] = s.speed;
    headLife[c] = 1;
    headCharSlot[c] = s.slot;
    headCharPhase[c] = s.phase;
  }
  state.heads = heads;
  state.headSpeed = headSpeed;
  state.headLife = headLife;
  state.headCharSlot = headCharSlot;
  state.headCharPhase = headCharPhase;
}

/** Ensure head array length matches columns without inventing live streams. */
function matrixSyncHeadArrays(state, logicalCols, logicalRows) {
  if (state.heads?.length === logicalCols && state.headCharSlot?.length === logicalCols) {
    return;
  }
  matrixRemapHeadStreams(state, logicalCols, logicalRows);
}

// Back-compat for clear-trails buttons / old names
const asciiscopeSimStates = matrixSimStates;

function matrixNextRng(state) {
  let x = state.rng | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.rng = x || 1;
  return (x >>> 0) / 4294967296;
}

/** @deprecated use matrixPhosphorBaseKeep — kept for any external callers. */
function matrixResidualKeep(trail) {
  return typeof matrixPhosphorBaseKeep === "function"
    ? matrixPhosphorBaseKeep(trail, 1 / 60)
    : 0.9;
}

/**
 * Fade phosphor energy (all matrix modes). Same PhosphorResidual step as
 * energy-GL drawers — one apply per display frame. No kill floor: that
 * erased the dim Ghost hang (long + dim). Brightness is present-only.
 */
function matrixDecayEnergy(state, params, dtSec = 1 / 60) {
  if (params.freeze) return;
  const Residual = typeof PhosphorResidual !== "undefined" ? PhosphorResidual : null;
  const trail = Number(params.trail);
  const t = Number.isFinite(trail) ? Math.max(0, Math.min(1, trail)) : (Residual?.DEFAULT_TRAIL ?? 0.5);
  const ghostAmt = Math.max(0, Math.min(1, Number(params.ghost) || 0));
  const burnAmt = Math.max(0, Math.min(1, Number(params.burn) || 0));
  const e = state.energy;
  if (Residual && typeof Residual.applyResidual === "function") {
    for (let i = 0; i < e.length; i += 1) {
      if (e[i] <= 0) continue;
      e[i] = Residual.applyResidual(e[i], t, ghostAmt, burnAmt);
    }
    return;
  }
  const baseKeep = typeof matrixPhosphorBaseKeep === "function"
    ? matrixPhosphorBaseKeep(t, dtSec)
    : 0.9;
  const applyHang = typeof matrixPhosphorApplyGhostHang === "function"
    ? matrixPhosphorApplyGhostHang
    : (energy, keep) => energy * keep;
  for (let i = 0; i < e.length; i += 1) {
    if (e[i] <= 0) continue;
    e[i] = applyHang(e[i], baseKeep, ghostAmt, burnAmt, t);
  }
}

/**
 * Write live glyph; on change, previous glyph burns residual energy.
 * deposit 0..1 = how hard the residual is excited (not display brightness).
 */
function matrixWriteCell(state, idx, nextGlyph, deposit = 1) {
  const n = state.live.length;
  const i = ((idx % n) + n) % n;
  const next = matrixSanitizeChar(nextGlyph);
  if (next === "\n") return false;
  const prev = state.live[i] || " ";
  if (next === prev) return false;
  if (prev !== " ") {
    state.residual[i] = prev;
    // Pure energy deposit — brightness is applied only when presenting.
    const d = Math.max(0, Math.min(1, Number(deposit) || 0));
    state.energy[i] = Math.max(state.energy[i], d);
  }
  state.live[i] = next;
  return true;
}

/**
 * Deposit rain energy + live glyph. One character per bin.
 * headEnergy is pure phosphor excitation 0..1 (not brightness).
 */
function matrixEnsureTipMask(state) {
  const n = state.energy?.length || 0;
  if (!state.tip || state.tip.length !== n) {
    state.tip = new Uint8Array(n);
  }
  return state.tip;
}

function matrixClearTipMask(state) {
  const tip = matrixEnsureTipMask(state);
  tip.fill(0);
}

function matrixRainDeposit(state, idx, glyph, headEnergy, isTip = false) {
  const n = state.live.length;
  const i = ((idx % n) + n) % n;
  let g = glyph;
  if (typeof g !== "string" || g.length !== 1) {
    g = matrixSanitizeChar(glyph);
  }
  // Keep glyph for trail; energy decays independently (CRT afterglow).
  state.residual[i] = " ";
  state.live[i] = g === " " ? (MATRIX_GLYPH_RAMP.charAt(1) || ".") : g;
  const d = Math.max(0, Number(headEnergy) || 0);
  state.energy[i] = Math.max(state.energy[i], d);
  const tip = matrixEnsureTipMask(state);
  if (isTip) {
    tip[i] = 1;
  }
}

/** One glyph per density cell (lc, lr). */
function matrixStampDeposit(state, lc, lr, glyph, headEnergy, isTip = false) {
  const cols = state.columns | 0;
  const rows = state.rows | 0;
  if (lc < 0 || lr < 0 || lc >= cols || lr >= rows) return;
  matrixRainDeposit(state, lr * cols + lc, glyph, headEnergy, isTip);
}

/** Plate write at density cell. */
function matrixStampWriteCell(state, lc, lr, nextGlyph, burn = 1) {
  const cols = state.columns | 0;
  const rows = state.rows | 0;
  if (lc < 0 || lr < 0 || lc >= cols || lr >= rows) return;
  matrixWriteCell(state, lr * cols + lc, nextGlyph, burn);
}

/** Wake cells painted behind the head (must clear view before the stream dies). */
const MATRIX_WATERFALL_WAKE_LEN = 3;

function matrixStampRainHead(state, col, y, glyph, depositPeak, step, wake) {
  const columns = state.columns | 0;
  const rows = state.rows | 0;
  const c = ((col % columns) + columns) % columns;
  const r0 = Math.floor(y);
  if (r0 < 0 || r0 >= rows) {
    return;
  }
  matrixStampDeposit(state, c, r0, glyph, depositPeak, true);
  for (let k = 1; k <= wake; k += 1) {
    const rr = r0 - step * k;
    if (rr < 0 || rr >= rows) {
      break;
    }
    const tIdx = rr * columns + c;
    const wakeE = depositPeak * Math.max(0.08, 0.55 / k);
    if (wakeE > state.energy[tIdx]) {
      if (matrixNextRng(state) < 0.28) {
        matrixStampDeposit(state, c, rr, glyph, wakeE, false);
      } else {
        state.energy[tIdx] = Math.max(state.energy[tIdx], wakeE);
      }
    }
  }
}

function matrixAdvanceRainGlyph(stream, prevY, charSpeed, slotMax, rngState) {
  if (!(charSpeed > 0)) {
    return;
  }
  let prevMark = stream.phase;
  if (!Number.isFinite(prevMark) || Math.abs(prevMark) > 1e6) {
    prevMark = Math.floor(prevY * charSpeed);
  }
  const nextMark = Math.floor(stream.y * charSpeed);
  let nFlips = Math.abs(nextMark - prevMark);
  if (nFlips > 32) {
    nFlips = 32;
  }
  for (let f = 0; f < nFlips; f += 1) {
    stream.slot = Math.floor(matrixNextRng(rngState) * slotMax);
  }
  stream.phase = nextMark;
}

function matrixEnsureStormHeads(state) {
  if (!Array.isArray(state.stormHeads)) {
    state.stormHeads = [];
  }
  return state.stormHeads;
}

/**
 * Column rain. Signed speed: +Fall (down), −Rise (up), 0 idle.
 *
 * streamDeath (0…1): same mid-stream roll as the original rain, remapped.
 *   0   = never die — streams wrap forever
 *   0.5 = original death rate
 *   1   = heavy die-off (short streams; still spawn)
 *
 * charSpeed = glyph flips per row of head travel (bin height = 1):
 *   0   = fixed glyph for the whole stream
 *   1   = flip once per bin change (synced to floor(head))
 *   2   = flip twice per bin (marks at …, n/2, n, …)
 *   1.5 = 1.5 flips per row — free-runs vs bin edges (unsynced)
 * Implementation: flip when floor(head * charSpeed) changes.
 */
function matrixStepWaterfall(state, params, glyphSlots, dtSec) {
  if (params.freeze) return;
  matrixDecayEnergy(state, params, dtSec);
  matrixClearTipMask(state);
  const depositPeak = typeof matrixPhosphorDepositPeak === "function"
    ? Math.min(1, matrixPhosphorDepositPeak(params))
    : 1;

  const columns = state.columns;
  const rows = state.rows;
  const { heads, headSpeed, headLife } = state;
  if (!state.headCharSlot || state.headCharSlot.length !== columns) {
    matrixSyncHeadArrays(state, columns, rows);
  }
  const { headCharSlot, headCharPhase } = state;
  const signedSpeed = Number(params.speed);
  const speedMag = Math.abs(Number.isFinite(signedSpeed) ? signedSpeed : 0);
  const spawnAmt = Math.max(0,
    Number.isFinite(Number(params.spawn)) ? Number(params.spawn) : 0.5,
  );
  const spawn01 = Math.min(1, spawnAmt);
  // Stream Death: original per-frame mid-stream roll. 0 none, 0.5 = orig,
  // 1 = high (still spawn — do not kill birth).
  const deathAmt = Math.max(0, Math.min(1,
    Number(params.streamDeath != null ? params.streamDeath : 0.5) || 0,
  ));
  const immortal = deathAmt <= 1e-6;
  const charRate = Number(params.charSpeed);
  // 0 = locked glyph; default 1 = one change per bin.
  const charSpeed = Number.isFinite(charRate) ? Math.max(0, charRate) : 1;
  const speedScale = speedMag * Math.max(0.12, dtSec * 60);
  const spawnRefCols = 40;
  const colFactor = spawnRefCols / Math.max(1, columns);
  // Column spawn: 0 = off, 0.5+ = original rain birth (one stream per column).
  const origSpawn = 0.755 * 0.055 * speedScale * colFactor;
  const spawn = spawn01 <= 1e-6
    ? 0
    : (spawn01 <= 0.5 ? origSpawn * (spawn01 / 0.5) : origSpawn);
  // 0.5 → 1: extra overlapping streams (downpour). Ease so 0.6 is still light.
  const stormT = spawn01 <= 0.5 ? 0 : (spawn01 - 0.5) / 0.5;
  const stormEase = stormT * stormT;
  // Higher spawn: keep the 0.5 floor, raise the random speed ceiling.
  const speedSpread = (0.9 + speedMag * 0.5) * (1 + stormEase * 2.4);
  const ORIG_STREAM_DEATH = 0.022;
  const origP = ORIG_STREAM_DEATH * speedScale;
  const highP = 0.32 * speedScale;
  let pMidDeath = 0;
  if (!immortal) {
    if (deathAmt <= 0.5) {
      pMidDeath = origP * (deathAmt / 0.5);
    } else {
      const u = (deathAmt - 0.5) / 0.5;
      pMidDeath = origP + (highP - origP) * (u * u);
    }
    pMidDeath = Math.max(0, Math.min(1, pMidDeath));
  }
  const slotMax = Math.max(1, glyphSlots.length | 0);
  const rise = signedSpeed < 0;
  const step = speedMag <= 0 ? 0 : (rise ? -1 : 1);
  const wake = MATRIX_WATERFALL_WAKE_LEN;
  if ((state.spawnSuppress | 0) > 0) {
    state.spawnSuppress -= 1;
  }
  const allowSpawn = step !== 0 && (state.spawnSuppress | 0) <= 0;

  for (let c = 0; c < columns; c += 1) {
    if (headLife[c] <= 0) {
      if (allowSpawn && matrixNextRng(state) < spawn) {
        if (rise) {
          heads[c] = rows + matrixNextRng(state) * 3;
        } else {
          heads[c] = -1 - matrixNextRng(state) * 3;
        }
        headSpeed[c] = 0.5 + matrixNextRng(state) * speedSpread;
        headLife[c] = 1;
        headCharSlot[c] = Math.floor(matrixNextRng(state) * slotMax);
        // Seed mark so we don't instantly flip on the first motion frame.
        headCharPhase[c] = charSpeed > 0
          ? Math.floor(heads[c] * charSpeed)
          : 0;
      }
      continue;
    }

    if (step === 0) {
      continue;
    }

    const prevHead = heads[c];
    heads[c] += step * headSpeed[c] * speedScale;

    // Glyph flips: count integer thresholds of (head × charSpeed) crossed this step.
    if (charSpeed > 0) {
      let prevMark = headCharPhase[c];
      // Recover if phase was left in the old 0..1 accumulator scheme.
      if (!Number.isFinite(prevMark) || Math.abs(prevMark) > 1e6) {
        prevMark = Math.floor(prevHead * charSpeed);
      }
      const nextMark = Math.floor(heads[c] * charSpeed);
      let nFlips = Math.abs(nextMark - prevMark);
      // Safety: huge speed jumps shouldn't reshuffle dozens of times in one frame.
      if (nFlips > 32) nFlips = 32;
      for (let f = 0; f < nFlips; f += 1) {
        headCharSlot[c] = Math.floor(matrixNextRng(state) * slotMax);
      }
      headCharPhase[c] = nextMark;
    }

    const glyph = asciiscopeGlyphAt(glyphSlots, headCharSlot[c]);
    matrixStampRainHead(state, c, heads[c], glyph, depositPeak, step, wake);
    if (Math.floor(heads[c]) >= 0 && Math.floor(heads[c]) < rows) {
      if (pMidDeath > 0 && matrixNextRng(state) < pMidDeath) {
        headLife[c] = 0;
        continue;
      }
    }

    // Off-plate end, or wrap forever when immortal (streamDeath = 0).
    if (rise) {
      if (heads[c] < -wake) {
        if (immortal) {
          heads[c] = rows + matrixNextRng(state) * 3;
          if (charSpeed > 0) {
            headCharPhase[c] = Math.floor(heads[c] * charSpeed);
          }
        } else {
          headLife[c] = 0;
        }
      }
    } else if (heads[c] > rows - 1 + wake) {
      if (immortal) {
        heads[c] = -1 - matrixNextRng(state) * 3;
        if (charSpeed > 0) {
          headCharPhase[c] = Math.floor(heads[c] * charSpeed);
        }
      } else {
        headLife[c] = 0;
      }
    }
  }

  // Downpour extras: lowering Spawn stops births only. Live streams run out.
  const storm = matrixEnsureStormHeads(state);
  if (allowSpawn && stormEase > 1e-6) {
    const maxStorm = Math.max(columns, Math.ceil(columns * rows * 0.42 * stormEase));
    const births = Math.max(1, Math.ceil(
      columns * (0.25 + rows * 0.055) * stormEase * Math.max(speedScale, 0.45),
    ));
    for (let b = 0; b < births && storm.length < maxStorm; b += 1) {
      const y = rise
        ? rows + matrixNextRng(state) * 3
        : -1 - matrixNextRng(state) * 3;
      storm.push({
        c: Math.floor(matrixNextRng(state) * columns),
        y,
        speed: 0.5 + matrixNextRng(state) * speedSpread,
        slot: Math.floor(matrixNextRng(state) * slotMax),
        phase: charSpeed > 0 ? Math.floor(y * charSpeed) : 0,
      });
    }
  }
  for (let i = storm.length - 1; i >= 0; i -= 1) {
    const stream = storm[i];
    if (step !== 0) {
      const prevY = stream.y;
      stream.y += step * stream.speed * speedScale;
      matrixAdvanceRainGlyph(stream, prevY, charSpeed, slotMax, state);
    }
    const glyph = asciiscopeGlyphAt(glyphSlots, stream.slot);
    matrixStampRainHead(state, stream.c, stream.y, glyph, depositPeak, step, wake);
    const r0 = Math.floor(stream.y);
    if (r0 >= 0 && r0 < rows && pMidDeath > 0 && matrixNextRng(state) < pMidDeath) {
      storm.splice(i, 1);
      continue;
    }
    if (rise ? stream.y < -wake : stream.y > rows - 1 + wake) {
      // Don't wrap extras after Spawn drops — that would look like new births.
      if (immortal && stormEase > 1e-6) {
        stream.y = rise ? rows + matrixNextRng(state) * 3 : -1 - matrixNextRng(state) * 3;
        stream.phase = charSpeed > 0 ? Math.floor(stream.y * charSpeed) : 0;
      } else {
        storm.splice(i, 1);
      }
    }
  }
}

/** drawFace style: 1 = rain energy phosphor, 0 = hard live (Info/Serial). */
function matrixDrawStyleRain() {
  return 1;
}
function matrixDrawStylePlate() {
  return 0;
}

function matrixBuildInfoGrid(columns, rows, message, valueLine) {
  const n = columns * rows;
  const grid = new Array(n).fill(" ");
  const lines = String(message || "").split("\n");
  const textRows = valueLine != null ? Math.max(1, rows - 1) : rows;
  let row = 0;
  for (let li = 0; li < lines.length && row < textRows; li += 1) {
    let col = 0;
    const line = lines[li];
    for (let i = 0; i < line.length && row < textRows; i += 1) {
      if (col >= columns) {
        col = 0;
        row += 1;
        if (row >= textRows) break;
      }
      grid[row * columns + col] = matrixSanitizeChar(line.charAt(i));
      col += 1;
    }
    row += 1;
  }
  if (valueLine != null && rows > 0) {
    const s = matrixSanitizeMessage(String(valueLine)).replace(/\n/g, "");
    const r = rows - 1;
    for (let c = 0; c < columns && c < s.length; c += 1) {
      grid[r * columns + c] = s.charAt(c);
    }
  }
  return grid;
}

function matrixApplyInfoGrid(state, grid, deposit = 1) {
  // Deposit = residual excitation on glyph change (0..1). Not brightness.
  const d = Math.max(0, Math.min(1, Number(deposit) || 0));
  const cols = state.columns;
  const rows = state.rows;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const g = grid[r * cols + c] || " ";
      if (typeof matrixStampWriteCell === "function") {
        matrixStampWriteCell(state, c, r, g, d);
      } else {
        matrixWriteCell(state, r * cols + c, g, d);
      }
    }
  }
}

/**
 * Mono energy → gradient RGB (2D fallback). Matches GPU path:
 * age/brightness is mono first; gradient is the last remap (no pre-colored alpha fade).
 */
/** mono is already present-space (film applied). Brightness scales display only. */
function matrixPhosphorColor(mono, brightness, gradientStops = null) {
  const bRaw = Number(brightness);
  const b = Number.isFinite(bRaw) ? Math.max(0, bRaw) : 1;
  const e = Math.max(0, Math.min(1, (Number(mono) || 0) * b));
  if (typeof matrixSampleGradientRgb === "function") {
    const c = matrixSampleGradientRgb(gradientStops, e);
    return { r: c.r, g: c.g, b: c.b, a: 1 };
  }
  const g = Math.floor(e * 255);
  return { r: 0, g, b: 0, a: 1 };
}

/**
 * 2D fallback only (no WebGL).
 * Must not run on a canvas that already has a WebGL context.
 * Reuses the same letterboxed fixed-cell-aspect layout as the GL path.
 */
function matrixSyncCanvasBacking2d(canvas, columns, rows, renderStyle = "vector") {
  if (!canvas) return null;
  // Prefer shared GL layout helper when present (same contain math).
  if (typeof matrixGlSyncCanvasSize === "function") {
    const fit = matrixGlSyncCanvasSize(canvas, columns, rows, renderStyle);
    if (fit) {
      const cols = Math.max(1, columns | 0);
      const rws = Math.max(1, rows | 0);
      return {
        bw: fit.w,
        bh: fit.h,
        cellW: fit.w / cols,
        cellH: fit.h / rws,
        cols,
        rws,
        style: fit.style,
      };
    }
  }
  const style = typeof matrixNormalizeRenderStyle === "function"
    ? matrixNormalizeRenderStyle(renderStyle)
    : (renderStyle === "pixel" ? "pixel" : "vector");
  const cellW = typeof MATRIX_GL_CELL_W === "number" ? MATRIX_GL_CELL_W : 8;
  const cellH = typeof MATRIX_GL_CELL_H === "number" ? MATRIX_GL_CELL_H : 12;
  const cols = Math.max(1, columns | 0);
  const rws = Math.max(1, rows | 0);
  const bw = cols * cellW;
  const bh = rws * cellH;
  if (canvas.width !== bw) canvas.width = bw;
  if (canvas.height !== bh) canvas.height = bh;
  canvas.style.display = "block";
  // Sharp: smooth. Pixel: hard blocks. Explicit so workspace zoom CSS cannot override.
  if (style === "pixel") {
    canvas.style.imageRendering = "pixelated";
    canvas.style.setProperty("image-rendering", "pixelated");
  } else {
    canvas.style.imageRendering = "auto";
    canvas.style.setProperty("image-rendering", "auto");
  }
  return { bw, bh, cellW, cellH, cols, rws, style };
}

function matrixDrawFace2d(canvas, state, params, mode) {
  if (!canvas || !state) return;
  let ctx = null;
  try {
    ctx = canvas.getContext("2d");
  } catch (_) {
    return;
  }
  if (!ctx) return;

  const columns = state.bufColumns || state.columns;
  const rows = state.bufRows || state.rows;
  const { energy } = state;
  const backing = matrixSyncCanvasBacking2d(canvas, columns, rows, params?.renderStyle);
  if (!backing) return;
  const { bw, bh, cellW, cellH } = backing;

  const stops = params?.gradientStops || null;
  const plate = typeof matrixSampleGradientRgb === "function"
    ? matrixSampleGradientRgb(stops, 0)
    : { r: 1, g: 4, b: 2 };
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = `rgb(${plate.r},${plate.g},${plate.b})`;
  ctx.fillRect(0, 0, bw, bh);

  const fontPx = Math.max(5, Math.min(cellW, cellH) * 0.82);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${fontPx}px ${MATRIX_FONT_STACK}`;
  ctx.shadowBlur = 0;
  // Match GL: Sharp soft text, Pixel hard edges — same cell size either way.
  const style = typeof matrixNormalizeRenderStyle === "function"
    ? matrixNormalizeRenderStyle(params?.renderStyle)
    : (params?.renderStyle === "pixel" ? "pixel" : "vector");
  ctx.imageSmoothingEnabled = style !== "pixel";
  if ("imageSmoothingQuality" in ctx) {
    ctx.imageSmoothingQuality = style === "pixel" ? "low" : "high";
  }

  const waterfall = mode === 1;
  const bRaw = Number(params?.brightness);
  const bright = Number.isFinite(bRaw) ? Math.max(0, bRaw) : 1;
  // Brightness 0: plate only (no glyphs).
  if (bright <= 0) {
    return;
  }

  // Gradient last: one glyph + mono per cell, then LUT once (matches GPU).
  // Waterfall: single live glyph (charSpeed replaces it). Plate: residual ghost + hard live.
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < columns; c += 1) {
      const idx = r * columns + c;
      const cx = (c + 0.5) * cellW;
      const cy = (r + 0.5) * cellH;
      const e = energy[idx];
      const resG = state.residual[idx] || " ";
      const live = state.live[idx] || " ";

      let mono = 0;
      let glyph = " ";
      if (waterfall) {
        // Live tip = full Bright (drawer LED). Residual = film(energy).
        glyph = live !== " " ? live : resG;
        if (glyph !== " " && (e > 0.001 || state.tip?.[idx])) {
          if (state.tip?.[idx]) {
            mono = 1;
          } else {
            const film = typeof matrixPhosphorFilm === "function"
              ? matrixPhosphorFilm(e)
              : Math.min(1, e);
            mono = film;
          }
        }
      } else {
        if (e > 0.001 && resG !== " ") {
          const film = typeof matrixPhosphorFilm === "function"
            ? matrixPhosphorFilm(e)
            : Math.min(1, e);
          mono = Math.max(mono, film * 0.85);
          glyph = resG;
        }
        if (live !== " ") {
          mono = 1;
          glyph = live;
        }
      }
      if (glyph === " " || mono < 0.008) continue;
      const col = matrixPhosphorColor(mono, bright, stops);
      ctx.fillStyle = `rgb(${col.r},${col.g},${col.b})`;
      ctx.fillText(glyph, cx, cy);
    }
  }
}

/** Prefer WebGL (one draw); fall back to cell-resolution 2D if GL missing. */
function matrixDrawFace(canvas, state, params, mode) {
  if (!canvas || !state) return;
  if (typeof matrixGlDrawFace === "function" && matrixGlDrawFace(canvas, state, params, mode)) {
    return;
  }
  matrixDrawFace2d(canvas, state, params, mode);
}

function matrixReadPortBuffer(nodeId, port) {
  try {
    const buffers = typeof nodeGraphModuleScopeState !== "undefined"
      ? nodeGraphModuleScopeState?.buffers
      : null;
    if (buffers?.get) {
      const b = buffers.get(`${nodeId}:${port}`);
      if (b?.length) return b;
    }
    if (typeof nodeGraphModuleScopeConnectedSourceBuffer === "function") {
      const b = nodeGraphModuleScopeConnectedSourceBuffer(nodeId, port);
      if (b?.length) return b;
    }
  } catch (_) { /* ignore */ }
  return null;
}

function matrixReadPortLast(nodeId, port) {
  const b = matrixReadPortBuffer(nodeId, port);
  if (b?.length) return Number(b[b.length - 1]) || 0;
  return 0;
}

function matrixPeakFromBuffer(buffer) {
  if (!buffer?.length) return null;
  const len = Math.min(buffer.length, 256);
  const start = Math.max(0, buffer.length - len);
  let peak = 0;
  let last = 0;
  for (let i = start; i < buffer.length; i += 1) {
    last = Number(buffer[i]) || 0;
    const a = Math.abs(last);
    if (a > peak) peak = a;
  }
  return { peak, last };
}

function matrixReadInputSample(nodeId) {
  const b = matrixReadPortBuffer(nodeId, "In");
  return matrixPeakFromBuffer(b);
}

function matrixFormatValue(sample) {
  if (!sample || !Number.isFinite(sample.last)) return null;
  const v = sample.last;
  const a = Math.abs(v);
  if (a >= 100) return v.toFixed(1);
  if (a >= 10) return v.toFixed(2);
  return v.toFixed(3);
}

function matrixSerialWriteOne(state, charCode) {
  const logicalN = Math.max(1, (state.columns | 0) * (state.rows | 0));
  const ch = matrixSanitizeChar(charCode);
  if (ch === "\n") {
    const col = state.serialCursor % state.columns;
    state.serialCursor += state.columns - col;
    if (state.serialCursor >= logicalN) state.serialCursor = 0;
    return;
  }
  const idx = state.serialCursor % logicalN;
  const lc = idx % state.columns;
  const lr = Math.floor(idx / state.columns) % state.rows;
  if (typeof matrixStampWriteCell === "function") {
    matrixStampWriteCell(state, lc, lr, ch, 1);
  } else {
    matrixWriteCell(state, idx, ch, 1);
  }
  state.serialCursor = (idx + 1) % logicalN;
}

function matrixStepSerial(state, params, nodeId) {
  if (params.freeze) return;
  const n = state.live.length;
  const resetLevel = matrixReadPortLast(nodeId, "Reset");
  const resetHigh = resetLevel > 0.5;
  if (resetHigh && !state.resetWasHigh) {
    state.live.fill(" ");
    state.residual.fill(" ");
    state.energy.fill(0);
    state.serialCursor = 0;
  }
  state.resetWasHigh = resetHigh;

  let charBuf = matrixReadPortBuffer(nodeId, "Char") || matrixReadPortBuffer(nodeId, "In");
  let trigBuf = matrixReadPortBuffer(nodeId, "Trigger");

  if (trigBuf?.length && charBuf?.length) {
    const len = Math.min(trigBuf.length, charBuf.length);
    if (state.serialBufRef !== trigBuf || state.serialBufLen > len) {
      state.serialBufRef = trigBuf;
      state.serialBufLen = Math.max(0, len - 1);
      state.triggerWasHigh = (Number(trigBuf[state.serialBufLen]) || 0) > 0.5;
    }
    let prev = state.triggerWasHigh ? 1 : 0;
    const start = Math.min(state.serialBufLen, len);
    for (let i = start; i < len; i += 1) {
      const high = (Number(trigBuf[i]) || 0) > 0.5 ? 1 : 0;
      if (high && !prev) {
        matrixSerialWriteOne(state, Number(charBuf[Math.min(i, charBuf.length - 1)]) || 32);
      }
      prev = high;
    }
    state.serialBufLen = len;
    state.triggerWasHigh = prev > 0;
    return;
  }

  const trigger = matrixReadPortLast(nodeId, "Trigger");
  const charCode = matrixReadPortLast(nodeId, "Char") || matrixReadPortLast(nodeId, "In");
  const triggerHigh = trigger > 0.5;
  if (triggerHigh && !state.triggerWasHigh) {
    matrixSerialWriteOne(state, charCode);
  }
  state.triggerWasHigh = triggerHigh;
}

/** Engine must be up for Matrix to animate (live audio node present). */
function matrixEngineIsOn() {
  try {
    return Boolean(typeof nodeGraphMvp !== "undefined" && nodeGraphMvp?.live?.node);
  } catch (_) {
    return false;
  }
}

/**
 * Transport / sim pause: speedMultiplier === 0 (Play/Pause).
 * Prefer the shared scope helper when present so Matrix matches phosphor faces.
 */
function matrixSimPaused() {
  try {
    if (typeof nodeGraphModuleScopeEnginePaused === "function") {
      return nodeGraphModuleScopeEnginePaused();
    }
    const speed = Number(typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.live?.speedMultiplier : 1);
    return Number.isFinite(speed) && speed <= 0;
  } catch (_) {
    return false;
  }
}

function matrixClearSim(state) {
  if (!state) return;
  state.live?.fill?.(" ");
  state.residual?.fill?.(" ");
  state.energy?.fill?.(0);
  state.serialCursor = 0;
  state.triggerWasHigh = false;
  state.serialBufRef = null;
  state.serialBufLen = 0;
  state.lastMs = 0;
  if (state.heads) {
    for (let c = 0; c < state.heads.length; c += 1) {
      state.heads[c] = -1 - Math.random() * 4;
      state.headLife[c] = 0;
    }
  }
}

function matrixDrawColdPlate(canvas, columns = 40, rows = 22, renderStyle = "vector", gradientStops = null) {
  if (!canvas) return;
  const style = typeof matrixNormalizeRenderStyle === "function"
    ? matrixNormalizeRenderStyle(renderStyle)
    : (renderStyle === "pixel" ? "pixel" : "vector");
  if (typeof matrixGlDrawColdPlate === "function"
    && matrixGlDrawColdPlate(canvas, columns, rows, style, gradientStops)) {
    return;
  }
  let ctx = null;
  try {
    ctx = canvas.getContext("2d");
  } catch (_) {
    return;
  }
  if (!ctx) return;
  const backing = matrixSyncCanvasBacking2d(canvas, columns, rows, style);
  if (!backing) return;
  const { bw, bh, cellW, cellH, cols, rws } = backing;
  const stops = gradientStops || null;
  const plate = typeof matrixSampleGradientRgb === "function"
    ? matrixSampleGradientRgb(stops, 0)
    : { r: 1, g: 4, b: 2 };
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = style !== "pixel";
  if ("imageSmoothingQuality" in ctx) {
    ctx.imageSmoothingQuality = style === "pixel" ? "low" : "high";
  }
  ctx.fillStyle = `rgb(${plate.r},${plate.g},${plate.b})`;
  ctx.fillRect(0, 0, bw, bh);
  // Same cell-stamped glyphs as the live face so Sharp/Pixel match rain text.
  const msg = "ENGINE OFF";
  const startC = Math.max(0, Math.floor((cols - msg.length) * 0.5));
  const row = Math.floor(rws * 0.5);
  const fontPx = Math.max(5, Math.min(cellW, cellH) * 0.82);
  const ink = typeof matrixPhosphorColor === "function"
    ? matrixPhosphorColor(0.47, 1, stops)
    : { r: 40, g: 90, b: 50 };
  ctx.fillStyle = `rgb(${ink.r},${ink.g},${ink.b})`;
  ctx.font = `700 ${fontPx}px ${typeof MATRIX_FONT_STACK === "string" ? MATRIX_FONT_STACK : "monospace"}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowBlur = 0;
  for (let i = 0; i < msg.length && startC + i < cols; i += 1) {
    const ch = msg.charAt(i);
    if (ch === " ") continue;
    const glyph = typeof matrixSanitizeChar === "function" ? matrixSanitizeChar(ch) : ch;
    ctx.fillText(glyph, (startC + i + 0.5) * cellW, (row + 0.5) * cellH);
  }
}

function matrixMarkLight(face, on) {
  if (!face) return;
  const s = on ? "1" : "0";
  if (face._matrixLightOn === s) {
    return;
  }
  face._matrixLightOn = s;
  const stage = face.querySelector?.(".node-asciiscope-stage");
  const canvas = face._matrixCanvas || face.querySelector?.(".node-asciiscope-canvas");
  for (const el of [stage, canvas]) {
    if (!el?.dataset) continue;
    el.dataset.lightStrength = s;
    el.dataset.lightSource = "screen";
    if (typeof setNodeGraphLightStrength === "function") {
      setNodeGraphLightStrength(el, on ? 1 : 0);
    }
  }
}

/** Scope system used to default this face to Trace and mount an absolute
 *  local-fallback canvas over the rain (grey centerline bar). Strip it. */
function matrixStripScopeOverlay(face) {
  if (!face || face._matrixOverlayStripped) return;
  face._matrixOverlayStripped = true;
  for (const overlay of face.querySelectorAll?.(
    ":scope > .node-module-scope-local-fallback-canvas",
  ) || []) {
    overlay.remove();
  }
  const nodeId = face.dataset?.node;
  if (nodeId && typeof nodeGraphModuleScopePersistentCanvases !== "undefined") {
    nodeGraphModuleScopePersistentCanvases.delete?.(nodeId);
  }
}

function matrixApplyWaterfallChrome(face, store) {
  if (!face?.style) {
    return;
  }
  const pad = Number(store?.screenPadding);
  const rounding = Number(store?.rounding);
  const box = typeof nodeGraphElementClientSize === "function"
    ? nodeGraphElementClientSize(face, 0, 0)
    : {
      width: face.clientWidth || 0,
      height: face.clientHeight || 0,
      skipped: false,
    };
  if (box.skipped) {
    return;
  }
  const cellW = box.width > 0 ? box.width : 0;
  const cellH = box.height > 0 ? box.height : 0;
  const shape = store?.screenShape === "squircle" ? "squircle" : "round";
  const chromeKey = `${cellW}|${cellH}|${pad}|${rounding}|${shape}`;
  if (face._matrixChromeKey === chromeKey) {
    return;
  }
  face._matrixChromeKey = chromeKey;
  const maxInset = Math.max(0, Math.min(cellW, cellH) / 2);
  const inset = Math.round((Number.isFinite(pad) ? Math.max(0, Math.min(1, pad)) : 0) * maxInset);
  const panelW = Math.max(0, cellW - inset * 2);
  const panelH = Math.max(0, cellH - inset * 2);
  const maxRadius = Math.max(0, Math.min(panelW, panelH) / 2);
  const radius = Math.round((Number.isFinite(rounding) ? Math.max(0, Math.min(100, rounding)) : 0) / 100 * maxRadius);
  face.style.setProperty("--matrix-face-inset", `${inset}px`);
  face.style.setProperty("--matrix-face-radius", `${radius}px`);
  face.style.setProperty("--matrix-face-corner-shape", shape);
  const stage = face.querySelector?.(".node-asciiscope-stage");
  const canvas = face.querySelector?.(".node-asciiscope-canvas");
  for (const el of [stage, canvas]) {
    if (!el?.style) continue;
    el.style.borderRadius = `${radius}px`;
    el.style.cornerShape = shape;
  }
}

function matrixResolveKind(face, node) {
  const kind = face?.dataset?.matrixKind;
  if (kind === "waterfall" || kind === "plate") return kind;
  if (node?.type === "matrixWaterfall") return "waterfall";
  if (face?.classList?.contains("node-matrix-waterfall-face")) return "waterfall";
  return "plate";
}

function matrixTickFace(face) {
  const nodeId = face?.dataset?.node;
  if (!nodeId || !face.isConnected) return;
  if (face.closest?.(".dsp-node")?.classList.contains("viewport-asleep")) {
    return;
  }
  const canvas = face._matrixCanvas?.isConnected
    ? face._matrixCanvas
    : (face._matrixCanvas = face.querySelector(".node-asciiscope-canvas, .node-matrix-canvas"));
  if (!canvas) return;

  matrixStripScopeOverlay(face);

  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const kind = matrixResolveKind(face, node);
  if (kind === "waterfall") {
    const chromeStore = typeof normalizeNodeGraphMatrixWaterfall === "function"
      ? normalizeNodeGraphMatrixWaterfall(node?.matrixWaterfall || node?.matrixDisplay)
      : node?.matrixWaterfall;
    matrixApplyWaterfallChrome(face, chromeStore);
  }

  // Engine-gated: cold plate when live audio node is down.
  if (!matrixEngineIsOn()) {
    matrixMarkLight(face, false);
    const params = kind === "waterfall"
      ? (typeof matrixWaterfallParamsFromNode === "function"
        ? matrixWaterfallParamsFromNode(node)
        : { columns: 40, rows: 22 })
      : (typeof matrixPlateParamsFromNode === "function"
        ? matrixPlateParamsFromNode(node)
        : { columns: 40, rows: 12 });
    const storeOff = kind === "waterfall"
      ? (typeof normalizeNodeGraphMatrixWaterfall === "function"
        ? normalizeNodeGraphMatrixWaterfall(node?.matrixWaterfall || node?.matrixDisplay)
        : { renderStyle: "vector" })
      : (typeof normalizeNodeGraphMatrixPlate === "function"
        ? normalizeNodeGraphMatrixPlate(node?.matrixDisplay)
        : { renderStyle: "vector" });
    const state = matrixEnsureSim(nodeId, params);
    if (!state.engineWasOff) {
      matrixClearSim(state);
      state.engineWasOff = true;
    }
    const offStyle = typeof matrixNormalizeRenderStyle === "function"
      ? matrixNormalizeRenderStyle(storeOff.renderStyle)
      : (storeOff.renderStyle === "pixel" ? "pixel" : "vector");
    const cols = state.bufColumns || params.bufColumns || 96;
    const rows = state.bufRows || params.bufRows || 64;
    const idleKey = `off|${cols}|${rows}|${offStyle}`;
    if (face._matrixIdleKey === idleKey) {
      return;
    }
    face._matrixIdleKey = idleKey;
    matrixDrawColdPlate(canvas, cols, rows, offStyle, storeOff.gradientStops || null);
    return;
  }
  face._matrixIdleKey = "";

  matrixMarkLight(face, true);

  try {
    if (kind === "waterfall") {
      matrixTickWaterfall(face, canvas, node, nodeId);
    } else {
      matrixTickPlate(face, canvas, node, nodeId);
    }
  } catch (error) {
    console.warn?.("[Matrix]", nodeId, kind, error);
    try {
      matrixDrawColdPlate(canvas, 40, 22);
    } catch (_) { /* ignore */ }
  }
}

function matrixTickWaterfall(face, canvas, node, nodeId) {
  const params = typeof matrixWaterfallParamsFromNode === "function"
    ? matrixWaterfallParamsFromNode(node)
    : asciiscopeParamsFromNode(node);
  const store = typeof normalizeNodeGraphMatrixWaterfall === "function"
    ? normalizeNodeGraphMatrixWaterfall(node?.matrixWaterfall || node?.matrixDisplay)
    : (typeof normalizeNodeGraphAsciiscope === "function"
      ? normalizeNodeGraphAsciiscope(node?.matrixDisplay)
      : { glyphTable: ".", renderStyle: "vector", gradientStops: null });
  params.renderStyle = store.renderStyle || "vector";
  params.gradientStops = store.gradientStops || null;
  if (matrixReadPortBuffer(nodeId, "Spawn")?.length) {
    params.spawn = Math.max(0, Number(matrixReadPortLast(nodeId, "Spawn")) || 0);
  }
  if (matrixReadPortBuffer(nodeId, "Speed")?.length) {
    params.speed = Number(matrixReadPortLast(nodeId, "Speed")) || 0;
  }
  const resetLevel = matrixReadPortLast(nodeId, "Reset");
  const resetHigh = resetLevel > 0.5;

  const glyphSlots = typeof asciiscopeParseGlyphTable === "function"
    ? asciiscopeParseGlyphTable(store.glyphTable)
    : ["."];
  // Resolve cols/rows from density + live face aspect so the grid fills the stage
  // (no permanent blank letterbox strip on the right).
  const stageAspect = typeof matrixStageAspectFromCanvas === "function"
    ? matrixStageAspectFromCanvas(canvas)
    : 1.2;
  const grid = typeof matrixResolveDensityGrid === "function"
    ? matrixResolveDensityGrid(params.density, stageAspect)
    : params;
  Object.assign(params, {
    columns: grid.columns,
    rows: grid.rows,
    bufColumns: grid.bufColumns || grid.columns,
    bufRows: grid.bufRows || grid.rows,
    stamp: 1,
    stampX: 1,
    stampY: 1,
  });
  const state = matrixEnsureSim(nodeId, params);
  const rise = (Number(params.speed) || 0) < 0;
  if (resetHigh && !state.resetWasHigh) {
    matrixClearSim(state);
    state.engineWasOff = true;
  }
  state.resetWasHigh = resetHigh;

  if (state.engineWasOff) {
    matrixClearSim(state);
    state.engineWasOff = false;
    if (state.heads) {
      for (let c = 0; c < state.heads.length; c += 1) {
        if (Math.random() < 0.75) {
          state.heads[c] = rise
            ? state.rows + Math.random() * state.rows * 0.35
            : -1 - Math.random() * state.rows * 0.35;
          // Active flag only — stream runs until fully off-screen.
          state.headLife[c] = 1;
          state.headSpeed[c] = 0.55 + Math.random() * 1.2;
          if (state.headCharSlot) {
            state.headCharSlot[c] = Math.floor(Math.random() * 16);
            // Seed mark from head position (charSpeed applied on first step).
            state.headCharPhase[c] = Math.floor(state.heads[c]);
          }
        }
      }
    }
  }

  const hold = matrixSimPaused() || Boolean(params.freeze);
  if (hold) {
    state.lastMs = 0;
    if (face._matrixHoldKey === "rain") {
      return;
    }
    face._matrixHoldKey = "rain";
    matrixDrawFace(canvas, state, params, matrixDrawStyleRain());
    return;
  }
  face._matrixHoldKey = "";

  const now = performance.now?.() || Date.now();
  const dt = state.lastMs > 0 ? Math.min(0.05, (now - state.lastMs) / 1000) : 1 / 60;
  state.lastMs = now;

  matrixStepWaterfall(state, params, glyphSlots, dt);
  matrixDrawFace(canvas, state, params, matrixDrawStyleRain());
}

function matrixTickPlate(face, canvas, node, nodeId) {
  const params = typeof matrixPlateParamsFromNode === "function"
    ? matrixPlateParamsFromNode(node)
    : asciiscopeParamsFromNode(node);
  const store = typeof normalizeNodeGraphMatrixPlate === "function"
    ? normalizeNodeGraphMatrixPlate(node?.matrixDisplay)
    : (typeof normalizeNodeGraphAsciiscope === "function"
      ? normalizeNodeGraphAsciiscope(node?.matrixDisplay)
      : { message: "READY", renderStyle: "vector", gradientStops: null });
  params.renderStyle = store.renderStyle || "vector";
  params.gradientStops = store.gradientStops || null;

  const stageAspect = typeof matrixStageAspectFromCanvas === "function"
    ? matrixStageAspectFromCanvas(canvas)
    : 1.2;
  const densGrid = typeof matrixResolveDensityGrid === "function"
    ? matrixResolveDensityGrid(params.density, stageAspect)
    : params;
  Object.assign(params, {
    columns: densGrid.columns,
    rows: densGrid.rows,
    bufColumns: densGrid.bufColumns || densGrid.columns,
    bufRows: densGrid.bufRows || densGrid.rows,
    stamp: 1,
    stampX: 1,
    stampY: 1,
  });
  const state = matrixEnsureSim(nodeId, params);
  if (state.engineWasOff) {
    matrixClearSim(state);
    state.engineWasOff = false;
  }

  const hold = matrixSimPaused() || Boolean(params.freeze);
  if (hold) {
    state.lastMs = 0;
    if (face._matrixHoldKey === "plate") {
      return;
    }
    face._matrixHoldKey = "plate";
    matrixDrawFace(canvas, state, params, matrixDrawStylePlate());
    return;
  }
  face._matrixHoldKey = "";

  const now = performance.now?.() || Date.now();
  const dt = state.lastMs > 0 ? Math.min(0.05, (now - state.lastMs) / 1000) : 1 / 60;
  state.lastMs = now;

  // 0 Info, 1 Serial — no rain
  if (params.mode === 1) {
    matrixDecayEnergy(state, params, dt);
    matrixStepSerial(state, params, nodeId);
    matrixDrawFace(canvas, state, params, matrixDrawStylePlate());
  } else {
    matrixDecayEnergy(state, params, dt);
    const sample = matrixReadInputSample(nodeId);
    const valueLine = matrixFormatValue(sample);
    const grid = matrixBuildInfoGrid(params.columns, params.rows, store.message, valueLine);
    const deposit = typeof matrixPhosphorDepositPeak === "function"
      ? Math.min(1, matrixPhosphorDepositPeak(params))
      : 1;
    matrixApplyInfoGrid(state, grid, deposit);
    matrixDrawFace(canvas, state, params, matrixDrawStylePlate());
  }
}

// Back-compat names for pump / UI
function asciiscopeTickFace(face) {
  matrixTickFace(face);
}

let matrixRaf = 0;
function asciiscopeSchedulePump() {
  if (matrixRaf) return;
  matrixRaf = window.requestAnimationFrame(() => {
    matrixRaf = 0;
    const faces = document.querySelectorAll(".node-asciiscope-face");
    if (!faces.length) return;
    // Respect Simulation FPS (same clock as scopes / phosphor / LCD / LED).
    const frameReady = typeof nodeGraphDisplayFrameReady === "function"
      ? nodeGraphDisplayFrameReady("asciiscope")
      : true;
    if (frameReady) {
      for (const face of faces) {
        if (face.closest?.(".dsp-node")?.classList.contains("viewport-asleep")) {
          continue;
        }
        if (typeof nodeGraphScreenSoloAllowsNode === "function"
          && !nodeGraphScreenSoloAllowsNode(face.closest?.(".dsp-node")?.dataset?.node)) {
          continue;
        }
        matrixTickFace(face);
      }
    }
    asciiscopeSchedulePump();
  });
}

function asciiscopeStartPump() {
  asciiscopeSchedulePump();
}

if (typeof window !== "undefined") {
  window.addEventListener("load", () => {
    asciiscopeStartPump();
  });
}
