function nodeGraphSequencerReadClip(nodeId) {
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!patchNode) return typeof sequencerDefaultClip === "function" ? sequencerDefaultClip() : { notes: [] };
  const clip = patchNode.sequencer;
  if (clip && typeof clip === "object") return clip;
  return typeof sequencerDefaultClip === "function" ? sequencerDefaultClip() : { notes: [] };
}

function nodeGraphSequencerEnsureClip(nodeId) {
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!patchNode) return typeof sequencerDefaultClip === "function" ? sequencerDefaultClip() : { notes: [] };
  const next = typeof sequencerNormalizeClip === "function"
    ? sequencerNormalizeClip(patchNode.sequencer)
    : (patchNode.sequencer || { notes: [] });
  patchNode.sequencer = next;
  return next;
}

function nodeGraphSequencerCommitClip(nodeId, clip, status) {
  if (!nodeId || typeof cloneNodeGraphPatch !== "function" || typeof commitNodeGraphPatch !== "function") {
    return false;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const patchNode = patch.nodes.find((n) => n.id === nodeId);
  if (!patchNode) return false;
  patchNode.sequencer = typeof sequencerCloneClip === "function" ? sequencerCloneClip(clip) : clip;
  const live = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (live) live.sequencer = patchNode.sequencer;
  commitNodeGraphPatch(patch, { status: status || "sequencer", faceEdit: true, livePlan: true });
  return true;
}

function nodeGraphSequencerEngineSeconds() {
  const live = typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.live : null;
  const speed = Number(live?.speedMultiplier);
  const running = Boolean(live?.node) && Number.isFinite(speed) && speed > 0;
  const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  const session = live?.sessionId;
  if (nodeGraphMvp && nodeGraphMvp._seqLiveSession !== session) {
    nodeGraphMvp._seqLiveSession = session;
    nodeGraphMvp._seqEngineSec = 0;
    nodeGraphMvp._seqLastMs = now;
  }
  if (nodeGraphMvp && !(Number(nodeGraphMvp._seqLastMs) > 0)) {
    nodeGraphMvp._seqLastMs = now;
  }
  if (!running) {
    if (nodeGraphMvp) nodeGraphMvp._seqLastMs = now;
    return Number(nodeGraphMvp?._seqEngineSec) || 0;
  }
  const dt = Math.min(0.05, Math.max(0, (now - (nodeGraphMvp?._seqLastMs || now)) / 1000));
  if (nodeGraphMvp) nodeGraphMvp._seqLastMs = now;
  nodeGraphMvp._seqEngineSec = (Number(nodeGraphMvp._seqEngineSec) || 0) + dt * speed;
  return Number(nodeGraphMvp?._seqEngineSec) || 0;
}

function sequencerDeviceAlign(x, dpr) {
  return Math.round(Number(x) * dpr) / dpr;
}

function sequencerStrokeV(ctx, x, y0, y1, dpr, color, devPx = 1) {
  const odd = (devPx & 1) === 1;
  const ax = (Math.round(x * dpr) + (odd ? 0.5 : 0)) / dpr;
  ctx.strokeStyle = color;
  ctx.lineWidth = devPx / dpr;
  ctx.beginPath();
  ctx.moveTo(ax, y0);
  ctx.lineTo(ax, y1);
  ctx.stroke();
}

function sequencerStrokeH(ctx, x0, x1, y, dpr, color, devPx = 1) {
  const odd = (devPx & 1) === 1;
  const ay = (Math.round(y * dpr) + (odd ? 0.5 : 0)) / dpr;
  ctx.strokeStyle = color;
  ctx.lineWidth = devPx / dpr;
  ctx.beginPath();
  ctx.moveTo(x0, ay);
  ctx.lineTo(x1, ay);
  ctx.stroke();
}

function sequencerFillAligned(ctx, x, y, w, h, dpr) {
  const x0 = Math.round(x * dpr) / dpr;
  const y0 = Math.round(y * dpr) / dpr;
  const x1 = Math.round((x + w) * dpr) / dpr;
  const y1 = Math.round((y + h) * dpr) / dpr;
  let rw = x1 - x0;
  let rh = y1 - y0;
  if (rw * dpr < 1) rw = 1 / dpr;
  if (rh * dpr < 1) rh = 1 / dpr;
  ctx.fillRect(x0, y0, rw, rh);
  return { x: x0, y: y0, w: rw, h: rh };
}

/** Coarsen the drawn grid until one cell is at least `minPx` wide. Snap still governs placement. */
function sequencerDrawnGridStep(snap, tickW, minPx = 6) {
  const s = Math.max(1, snap | 0);
  if (s * tickW >= minPx) return s;
  const coarser = [1, 2, 4, 8, 16, 32, 64, 128];
  for (let i = 0; i < coarser.length; i += 1) {
    const c = coarser[i];
    if (c < s) continue;
    if (c * tickW >= minPx) return c;
  }
  return 128;
}

function nodeGraphSequencerBeatsNow() {
  const bpm = typeof nodeGraphPatchTimingValue === "function"
    ? Number(nodeGraphPatchTimingValue("tempoBpm"))
    : 120;
  const t = nodeGraphSequencerEngineSeconds();
  return typeof sequencerBeatsFromSeconds === "function"
    ? sequencerBeatsFromSeconds(t, bpm)
    : t * ((Number.isFinite(bpm) && bpm > 0 ? bpm : 120) / 60);
}

function createNodeGraphSequencerBody(node) {
  const nodeId = String(node || "");
  const section = document.createElement("section");
  section.className = "node-sequencer-panel node-module-face";
  section.dataset.node = nodeId;

  const chrome = document.createElement("div");
  chrome.className = "node-sequencer-chrome";

  const clip0 = nodeGraphSequencerEnsureClip(nodeId);

  function addSelect(label, key, options, current) {
    const wrap = document.createElement("label");
    wrap.textContent = label;
    const sel = document.createElement("select");
    sel.dataset.seqKey = key;
    for (const opt of options) {
      const o = document.createElement("option");
      o.value = String(opt.value);
      o.textContent = opt.label;
      if (String(opt.value) === String(current)) o.selected = true;
      sel.append(o);
    }
    sel.addEventListener("pointerdown", (e) => e.stopPropagation());
    sel.addEventListener("change", () => {
      const clip = nodeGraphSequencerEnsureClip(nodeId);
      if (key === "labelMode") {
        clip.labelMode = sel.value === "number" ? "number" : "name";
      } else {
        const n = Number(sel.value);
        if (key === "snap") clip.snap = n;
        else if (key === "keysVisible") clip.keysVisible = n;
        else if (key === "barsVisible") clip.barsVisible = n;
        else if (key === "loopBars") clip.loopTicks = n * 32;
      }
      nodeGraphSequencerCommitClip(nodeId, clip, `sequencer ${key}`);
      draw();
    });
    wrap.append(sel);
    chrome.append(wrap);
    return sel;
  }

  const snapLabels = typeof SEQUENCER_SNAP_LABELS !== "undefined" ? SEQUENCER_SNAP_LABELS : ["1/4"];
  const snapTicks = typeof SEQUENCER_SNAP_TICKS !== "undefined" ? SEQUENCER_SNAP_TICKS : { "1/4": 8 };
  addSelect("Snap", "snap", snapLabels.map((l) => ({ value: snapTicks[l], label: l })), clip0.snap);
  addSelect("Keys", "keysVisible", [12, 24, 36, 48, 88, 128].map((n) => ({ value: n, label: String(n) })), clip0.keysVisible);
  const barChoices = typeof SEQUENCER_BAR_CHOICES !== "undefined" ? SEQUENCER_BAR_CHOICES : [1, 2, 4, 8, 16, 32, 64];
  const barsSel = addSelect("Bars", "barsVisible", barChoices.map((n) => ({ value: n, label: String(n) })), clip0.barsVisible);
  barsSel.title = "How many bars are on screen (zoom). Does not change when the clip loops.";
  const lengthSel = addSelect(
    "Length",
    "loopBars",
    barChoices.map((n) => ({ value: n, label: `${n}` })),
    Math.round(clip0.loopTicks / 32) || 1,
  );
  lengthSel.title = "When the clip loops. Notes stay put if you change this — past the loop they are silent until you lengthen again.";
  addSelect("Labels", "labelMode", [
    { value: "name", label: "Names" },
    { value: "number", label: "Numbers" },
  ], clip0.labelMode || "name");

  const auditionBtn = document.createElement("button");
  auditionBtn.type = "button";
  auditionBtn.className = "node-sequencer-audition";
  auditionBtn.setAttribute("aria-label", "Audition notes while placing");
  function paintAuditionBtn() {
    const on = nodeGraphSequencerEnsureClip(nodeId).audition !== false;
    auditionBtn.textContent = on ? "🔊" : "🔇";
    auditionBtn.setAttribute("aria-pressed", on ? "true" : "false");
    auditionBtn.title = on
      ? "Audition on — hear notes as you place and drag. Click to mute."
      : "Audition off. Click to hear notes as you place and drag.";
  }
  paintAuditionBtn();
  auditionBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
  auditionBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const clip = nodeGraphSequencerEnsureClip(nodeId);
    clip.audition = clip.audition === false;
    nodeGraphSequencerCommitClip(nodeId, clip, clip.audition ? "sequencer audition on" : "sequencer audition off");
    paintAuditionBtn();
  });
  chrome.append(auditionBtn);

  let auditionMidi = -1;
  function sequencerAuditionStop() {
    if (auditionMidi >= 0 && typeof sendNodeGraphLiveVmNoteOff === "function") {
      sendNodeGraphLiveVmNoteOff(auditionMidi);
    }
    auditionMidi = -1;
  }
  function sequencerAuditionMidi(midi) {
    const clip = nodeGraphSequencerEnsureClip(nodeId);
    if (clip.audition === false) {
      sequencerAuditionStop();
      return;
    }
    const n = Math.max(0, Math.min(127, Math.round(Number(midi))));
    if (!Number.isFinite(n)) return;
    if (n === auditionMidi) return;
    sequencerAuditionStop();
    if (typeof sendNodeGraphLiveVmNoteOn === "function") {
      sendNodeGraphLiveVmNoteOn(n, (clip.notes?.[0]?.vel || 100) / 127);
    }
    auditionMidi = n;
  }

  function octaveBtn(octaves, label) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.title = octaves > 0
      ? "Transpose selected notes (or whole clip) up one octave"
      : "Transpose selected notes (or whole clip) down one octave";
    b.addEventListener("pointerdown", (e) => e.stopPropagation());
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const clip = nodeGraphSequencerEnsureClip(nodeId);
      const keys = selected.size ? selected : null;
      const next = typeof sequencerTransposeOctave === "function"
        ? sequencerTransposeOctave(clip, octaves, keys)
        : clip;
      if (keys) {
        const mapped = new Set();
        const shift = octaves * 12;
        for (const k of keys) {
          const parts = String(k).split(":");
          const midi = (Number(parts[0]) || 0) + shift;
          if (midi >= 0 && midi <= 127) mapped.add(`${midi}:${parts[1]}:${parts[2]}`);
          else mapped.add(k);
        }
        selected = mapped;
      }
      nodeGraphSequencerCommitClip(nodeId, next, octaves > 0 ? "sequencer octave +" : "sequencer octave −");
      draw();
    });
    chrome.append(b);
  }
  octaveBtn(-1, "Oct −");
  octaveBtn(1, "Oct +");

  function scaleBtn(factor, label) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("pointerdown", (e) => e.stopPropagation());
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const clip = nodeGraphSequencerEnsureClip(nodeId);
      const next = typeof sequencerScaleClip === "function" ? sequencerScaleClip(clip, factor) : clip;
      nodeGraphSequencerCommitClip(nodeId, next, factor === 2 ? "sequencer ×2" : "sequencer ÷2");
      draw();
    });
    chrome.append(b);
  }
  scaleBtn(2, "×2");
  scaleBtn(0.5, "÷2");

  const host = document.createElement("div");
  host.className = "node-sequencer-roll-host";
  const canvas = document.createElement("canvas");
  canvas.className = "node-sequencer-roll";
  host.append(canvas);
  section.append(chrome, host);

  let drag = null;
  let selected = new Set();

  function noteKey(n) {
    return typeof sequencerNoteKey === "function"
      ? sequencerNoteKey(n)
      : `${n.midi}:${n.start}:${n.length}`;
  }

  function selectedIndices(clip) {
    const notes = Array.isArray(clip?.notes) ? clip.notes : [];
    const out = [];
    for (let i = 0; i < notes.length; i += 1) {
      if (selected.has(noteKey(notes[i]))) out.push(i);
    }
    return out;
  }

  function marqueeHits(clip, L, x0, y0, x1, y1) {
    const left = Math.min(x0, x1);
    const right = Math.max(x0, x1);
    const top = Math.min(y0, y1);
    const bottom = Math.max(y0, y1);
    const hit = new Set();
    const notes = Array.isArray(clip.notes) ? clip.notes : [];
    for (let i = 0; i < notes.length; i += 1) {
      const r = noteScreenRect(notes[i], L);
      if (!r) continue;
      if (r.x < right && r.x + r.w > left && r.y < bottom && r.y + r.h > top) {
        hit.add(noteKey(notes[i]));
      }
    }
    return hit;
  }

  const pcBlack = new Set([1, 3, 6, 8, 10]);
  let layoutCache = null;
  let lastDrawnPlayTick = -1;
  let drawDirty = true;

  function layout(needBox) {
    const clip = nodeGraphSequencerReadClip(nodeId);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.max(1, canvas.clientWidth || 1);
    const h = Math.max(1, canvas.clientHeight || 1);
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    const resized = canvas.width !== bw || canvas.height !== bh;
    if (resized) {
      canvas.width = bw;
      canvas.height = bh;
    }
    const ctx = canvas.getContext("2d");
    if (resized || !layoutCache) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
    }
    const box = needBox || !layoutCache?.box
      ? canvas.getBoundingClientRect()
      : layoutCache.box;
    const gutter = Math.min(44, Math.max(28, Math.round(w * 0.12)));
    const keys = Math.max(1, Math.min(128, clip.keysVisible | 0));
    const rowH = h / keys;
    const bars = Math.max(1, clip.barsVisible | 0);
    const viewTicks = bars * 32;
    const gridW = Math.max(1, w - gutter);
    const tickW = gridW / viewTicks;
    const maxScroll = Math.max(0, 128 - keys);
    if (clip.scrollMidi > maxScroll) clip.scrollMidi = maxScroll;
    layoutCache = { ctx, w, h, clip, keys, viewTicks, gridW, rowH, tickW, box, gutter, dpr };
    return layoutCache;
  }

  function noteScreenRect(n, L) {
    const { clip, keys, tickW, rowH, gutter, viewTicks, dpr } = L;
    const row = rowOfMidi(clip, n.midi, keys);
    if (row < 0 || row >= keys) return null;
    if (n.start >= viewTicks) return null;
    const x = gutter + n.start * tickW;
    const y = row * rowH + 1;
    const h = Math.max(1 / dpr, rowH - 2);
    const x0 = Math.round(x * dpr) / dpr;
    const x1 = Math.round((x + n.length * tickW) * dpr) / dpr;
    let nw = x1 - x0;
    if (nw * dpr < 1) nw = 1 / dpr;
    return { x: x0, y, w: nw, h, row };
  }

  function noteHitRect(n, L, clip) {
    const r = noteScreenRect(n, L);
    if (!r) return null;
    const minHit = 6;
    let w = Math.max(r.w, minHit);
    const notes = Array.isArray(clip.notes) ? clip.notes : [];
    let nextX = Infinity;
    for (let i = 0; i < notes.length; i += 1) {
      const o = notes[i];
      if (o === n || o.midi !== n.midi) continue;
      if (!(o.start > n.start)) continue;
      const ox = L.gutter + o.start * L.tickW;
      if (ox < nextX) nextX = ox;
    }
    if (Number.isFinite(nextX) && r.x + w > nextX) {
      w = Math.max(r.w, nextX - r.x);
    }
    return { x: r.x, y: r.y, w, h: r.h, row: r.row };
  }

  function hitNoteAtPixel(clip, hit, L) {
    const notes = Array.isArray(clip.notes) ? clip.notes : [];
    for (let i = notes.length - 1; i >= 0; i -= 1) {
      const n = notes[i];
      if (n.midi !== hit.midi) continue;
      const r = noteHitRect(n, L, clip);
      if (r && hit.x >= r.x && hit.x < r.x + r.w) return i;
    }
    return -1;
  }

  function midiAtRow(clip, rowFromTop, keys) {
    const topMidi = clip.scrollMidi + keys - 1;
    return topMidi - rowFromTop;
  }

  function rowOfMidi(clip, midi, keys) {
    const topMidi = clip.scrollMidi + keys - 1;
    return topMidi - midi;
  }

  function eventToTickMidi(event) {
    const L = layout(true);
    const { h, clip, keys, tickW, rowH, box, w, gutter, viewTicks } = L;
    const sx = box.width > 0 ? w / box.width : 1;
    const sy = box.height > 0 ? h / box.height : 1;
    const x = (event.clientX - box.left) * sx;
    const y = (event.clientY - box.top) * sy;
    if (y < 0 || y > h) return null;
    const row = Math.max(0, Math.min(keys - 1, Math.floor(y / rowH)));
    const midi = midiAtRow(clip, row, keys);
    const inGutter = x < gutter;
    const rawTick = (x - gutter) / tickW;
    const tick = Math.max(0, Math.min(Math.max(0, viewTicks - 1), Math.floor(rawTick)));
    if (midi < 0 || midi > 127) return null;
    return { tick, rawTick, midi, x, y, tickW, inGutter, rowH, gutter, keys, L };
  }

  function currentPlayTick(clip) {
    const audioTick = Number(nodeGraphMvp?._seqPlayheadTick);
    if (Number.isFinite(audioTick)) return audioTick;
    return typeof sequencerTickFromBeats === "function"
      ? sequencerTickFromBeats(nodeGraphSequencerBeatsNow(), clip?.loopTicks)
      : 0;
  }

  function draw(force) {
    const clipPeek = nodeGraphSequencerReadClip(nodeId);
    const peekTick = currentPlayTick(clipPeek);
    if (force !== false) drawDirty = true;
    if (!drawDirty && !drag && peekTick === lastDrawnPlayTick) return;
    drawDirty = false;
    lastDrawnPlayTick = peekTick;
    const L = layout();
    const { ctx, w, h, clip, keys, viewTicks, tickW, rowH, gutter, dpr } = L;
    ctx.fillStyle = "#101014";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#1a1a20";
    ctx.fillRect(0, 0, gutter, h);
    for (let r = 0; r < keys; r += 1) {
      const midi = midiAtRow(clip, r, keys);
      const y0 = sequencerDeviceAlign(r * rowH, dpr);
      const y1 = sequencerDeviceAlign((r + 1) * rowH, dpr);
      const black = pcBlack.has(((midi % 12) + 12) % 12);
      ctx.fillStyle = black ? "#16161a" : "#202028";
      ctx.fillRect(gutter, y0, w - gutter, Math.max(1 / dpr, y1 - y0));
      ctx.fillStyle = black ? "#2a2a32" : "#d8d8de";
      sequencerFillAligned(ctx, 4, y0 + 1, gutter - 8, Math.max(1 / dpr, rowH - 2), dpr);
      if (rowH >= 9) {
        ctx.fillStyle = black ? "#ccc" : "#222";
        ctx.font = `${Math.max(8, Math.min(11, rowH - 4))}px sans-serif`;
        const label = clip.labelMode === "number"
          ? String(midi)
          : (typeof sequencerPitchLabel === "function" ? sequencerPitchLabel(midi) : String(midi));
        ctx.fillText(label, 5, y0 + Math.min(rowH - 2, 11));
      }
    }
    if (rowH * dpr >= 3) {
      for (let r = 0; r <= keys; r += 1) {
        sequencerStrokeH(ctx, gutter, w, r * rowH, dpr, "#18181e", 1);
      }
    }
    const phraseTicks = 32 * 4;
    for (let t = 0; t < viewTicks; t += phraseTicks) {
      const x = gutter + t * tickW;
      const bw = Math.min(32 * tickW, w - x);
      if (bw > 0) {
        ctx.fillStyle = "rgba(196, 176, 106, 0.07)";
        ctx.fillRect(sequencerDeviceAlign(x, dpr), 0, bw, h);
      }
    }
    const snap = Math.max(1, clip.snap | 0);
    const gridStep = sequencerDrawnGridStep(snap, tickW, 4);
    for (let t = 0; t <= viewTicks; t += gridStep) {
      const x = gutter + t * tickW;
      const phrase = t % phraseTicks === 0;
      const bar = t % 32 === 0;
      const beat = t % 8 === 0;
      if (phrase) continue;
      const color = bar ? "#7a7a88" : beat ? "#3a3a48" : "#2c2c36";
      sequencerStrokeV(ctx, x, 0, h, dpr, color, 1);
    }
    for (let t = 0; t <= viewTicks; t += phraseTicks) {
      sequencerStrokeV(ctx, gutter + t * tickW, 0, h, dpr, "#c4b06a", 2);
    }
    const loop = Math.max(1, clip.loopTicks | 0);
    if (loop < viewTicks) {
      const lx = gutter + loop * tickW;
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.fillRect(sequencerDeviceAlign(lx, dpr), 0, Math.max(0, w - lx), h);
      sequencerStrokeV(ctx, lx, 0, h, dpr, "#c8c86a", 2);
    }
    const notes = Array.isArray(clip.notes) ? clip.notes : [];
    for (let i = 0; i < notes.length; i += 1) {
      const n = notes[i];
      const r = noteScreenRect(n, L);
      if (!r) continue;
      const pastLoop = n.start >= loop;
      const isSel = selected.has(noteKey(n));
      ctx.fillStyle = pastLoop ? (isSel ? "#4a7ab8" : "#2a4a7a") : (isSel ? "#8ec2ff" : "#3d7dff");
      ctx.fillRect(r.x, r.y, r.w, r.h);
      if (isSel) {
        ctx.strokeStyle = "#e8f4ff";
        ctx.lineWidth = 1 / dpr;
        ctx.strokeRect(r.x + 0.5 / dpr, r.y + 0.5 / dpr, Math.max(0, r.w - 1 / dpr), Math.max(0, r.h - 1 / dpr));
      }
    }
    if (drag?.mode === "marquee") {
      const mx = Math.min(drag.x0, drag.x1);
      const my = Math.min(drag.y0, drag.y1);
      const mw = Math.abs(drag.x1 - drag.x0);
      const mh = Math.abs(drag.y1 - drag.y0);
      ctx.fillStyle = "rgba(61, 125, 255, 0.18)";
      ctx.fillRect(mx, my, mw, mh);
      ctx.strokeStyle = "#6aa0ff";
      ctx.lineWidth = 1 / dpr;
      ctx.strokeRect(mx + 0.5 / dpr, my + 0.5 / dpr, mw, mh);
    }
    const playTick = peekTick;
    if (playTick >= 0 && playTick <= viewTicks) {
      const px = gutter + playTick * tickW;
      sequencerStrokeV(ctx, px, 0, h, dpr, "rgba(255, 80, 80, 0.35)", 5);
      sequencerStrokeV(ctx, px, 0, h, dpr, "#ff3a3a", 2);
      ctx.fillStyle = "#ff3a3a";
      const ax = sequencerDeviceAlign(px, dpr);
      ctx.beginPath();
      ctx.moveTo(ax - 5, 0);
      ctx.lineTo(ax + 5, 0);
      ctx.lineTo(ax, 7);
      ctx.closePath();
      ctx.fill();
    }
  }

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  canvas.addEventListener("pointerdown", (event) => {
    const right = event.button === 2;
    if (event.button !== undefined && event.button !== 0 && !right) return;
    event.preventDefault();
    event.stopPropagation();
    try { section.focus({ preventScroll: true }); } catch (_e) { /* ignore */ }
    const hit = eventToTickMidi(event);
    if (!hit) return;
    const clip = nodeGraphSequencerEnsureClip(nodeId);
    if (right) {
      drag = {
        mode: "marquee",
        additive: Boolean(event.shiftKey),
        x0: hit.x,
        y0: hit.y,
        x1: hit.x,
        y1: hit.y,
        moved: false,
        prevSelected: event.shiftKey ? new Set(selected) : new Set(),
      };
      canvas.style.cursor = "crosshair";
      canvas.setPointerCapture(event.pointerId);
      draw();
      return;
    }
    if (hit.inGutter) {
      drag = {
        mode: "scroll",
        startY: event.clientY,
        startScroll: clip.scrollMidi,
        rowH: hit.rowH,
        moved: false,
      };
      canvas.style.cursor = "ns-resize";
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    const idx = hitNoteAtPixel(clip, hit, hit.L);
    if (idx >= 0) {
      const n = clip.notes[idx];
      const key = noteKey(n);
      if (!selected.has(key)) selected = new Set([key]);
      const r = noteScreenRect(n, hit.L);
      const nw = r ? r.w : n.length * hit.tickW;
      const noteRight = r ? r.x + r.w : hit.gutter + (n.start + n.length) * hit.tickW;
      const handle = nw < 16 ? 0 : Math.min(8, nw * 0.2);
      const resize = handle > 0 && hit.x >= noteRight - handle;
      const indices = selectedIndices(clip);
      const origins = indices.map((i) => {
        const note = clip.notes[i];
        return {
          index: i,
          midi: note.midi,
          start: note.start,
          length: note.length,
          vel: note.vel,
        };
      });
      drag = {
        mode: resize ? "resize" : "move",
        index: idx,
        indices,
        origins,
        startTick: n.start,
        grabTick: hit.tick,
        originX: event.clientX,
        originY: event.clientY,
        originStart: n.start,
        originMidi: n.midi,
        originLength: n.length,
        moved: false,
      };
      canvas.style.cursor = resize ? "ew-resize" : "grabbing";
      canvas.setPointerCapture(event.pointerId);
      if (!resize) sequencerAuditionMidi(n.midi);
      draw();
      return;
    }
    selected = new Set();
    const next = typeof sequencerAddNote === "function"
      ? sequencerAddNote(clip, hit.tick, hit.midi)
      : clip;
    const live = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
    if (live) live.sequencer = next;
    const placed = next.notes[next.notes.length - 1];
    drag = {
      mode: "place",
      index: next.notes.length - 1,
      startTick: placed?.start ?? hit.tick,
      originX: event.clientX,
      originY: event.clientY,
      originStart: placed?.start ?? hit.tick,
      originMidi: placed?.midi ?? hit.midi,
      originLength: placed?.length ?? clip.snap,
      moved: false,
    };
    canvas.style.cursor = "ew-resize";
    canvas.setPointerCapture(event.pointerId);
    sequencerAuditionMidi(placed?.midi ?? hit.midi);
    draw();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    const clip = nodeGraphSequencerEnsureClip(nodeId);
    if (drag.mode === "scroll") {
      const L = layout();
      const rowH = Math.max(1, drag.rowH || L.rowH || 8);
      const sy = L.box.height > 0 ? L.h / L.box.height : 1;
      const rows = ((event.clientY - drag.startY) * sy) / rowH;
      if (Math.abs(event.clientY - drag.startY) > 2) drag.moved = true;
      const maxScroll = Math.max(0, 128 - L.keys);
      clip.scrollMidi = Math.max(0, Math.min(maxScroll, Math.round(drag.startScroll + rows)));
      const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
      if (patchNode) patchNode.sequencer = clip;
      draw();
      return;
    }
    const hit = eventToTickMidi(event);
    if (!hit) return;
    if (drag.mode === "marquee") {
      if (Math.abs(hit.x - drag.x0) > 2 || Math.abs(hit.y - drag.y0) > 2) drag.moved = true;
      drag.x1 = hit.x;
      drag.y1 = hit.y;
      const boxed = marqueeHits(clip, hit.L, drag.x0, drag.y0, drag.x1, drag.y1);
      if (drag.additive) {
        selected = new Set([...drag.prevSelected, ...boxed]);
      } else {
        selected = boxed;
      }
      draw();
      return;
    }
    if (drag.mode === "place" && typeof sequencerResizeNote === "function") {
      const next = sequencerResizeNote(clip, drag.index, hit.rawTick);
      const n = next.notes[drag.index];
      if (!n || n.length === drag.originLength) return;
      drag.moved = true;
      const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
      if (patchNode) patchNode.sequencer = next;
      draw();
      return;
    }
    if (drag.mode === "resize" && Array.isArray(drag.origins) && drag.origins.length) {
      const snap = Math.max(1, clip.snap | 0);
      const end = typeof sequencerSnapCeil === "function"
        ? sequencerSnapCeil(hit.rawTick, snap)
        : Math.ceil(hit.rawTick);
      let length = end - drag.originStart;
      if (length < snap) length = snap;
      const dLen = length - drag.originLength;
      if (dLen === 0 && !drag.moved) return;
      const next = typeof sequencerCloneClip === "function" ? sequencerCloneClip(clip) : clip;
      const nextKeys = new Set();
      for (const o of drag.origins) {
        let len = o.length + dLen;
        if (len < snap) len = snap;
        const note = typeof sequencerNormalizeNote === "function"
          ? sequencerNormalizeNote({ midi: o.midi, start: o.start, length: len, vel: o.vel }, next.loopTicks)
          : { midi: o.midi, start: o.start, length: len, vel: o.vel };
        next.notes[o.index] = note;
        nextKeys.add(noteKey(note));
      }
      drag.moved = true;
      selected = nextKeys;
      const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
      if (patchNode) patchNode.sequencer = next;
      draw();
      return;
    }
    if (drag.mode === "move" && Array.isArray(drag.origins) && drag.origins.length) {
      const tick = hit.inGutter
        ? drag.originStart
        : (typeof sequencerSnapFloor === "function"
          ? sequencerSnapFloor(drag.originStart + (hit.tick - drag.grabTick), clip.snap)
          : drag.originStart + (hit.tick - drag.grabTick));
      let dStart = tick - drag.originStart;
      let dMidi = hit.inGutter ? 0 : (hit.midi - drag.originMidi);
      let minMidi = 127;
      let maxMidi = 0;
      let minStart = Infinity;
      for (const o of drag.origins) {
        if (o.midi < minMidi) minMidi = o.midi;
        if (o.midi > maxMidi) maxMidi = o.midi;
        if (o.start < minStart) minStart = o.start;
      }
      if (minMidi + dMidi < 0) dMidi = -minMidi;
      if (maxMidi + dMidi > 127) dMidi = 127 - maxMidi;
      if (minStart + dStart < 0) dStart = -minStart;
      if (dStart === 0 && dMidi === 0) {
        if (drag.moved) {
          /* keep live clip */
        } else {
          return;
        }
      }
      const next = typeof sequencerCloneClip === "function" ? sequencerCloneClip(clip) : clip;
      const nextKeys = new Set();
      let grabMidi = drag.originMidi + dMidi;
      for (const o of drag.origins) {
        const note = typeof sequencerNormalizeNote === "function"
          ? sequencerNormalizeNote({
            midi: o.midi + dMidi,
            start: o.start + dStart,
            length: o.length,
            vel: o.vel,
          }, next.loopTicks)
          : { midi: o.midi + dMidi, start: o.start + dStart, length: o.length, vel: o.vel };
        next.notes[o.index] = note;
        nextKeys.add(noteKey(note));
        if (o.index === drag.index) grabMidi = note.midi;
      }
      drag.moved = true;
      selected = nextKeys;
      const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
      if (patchNode) patchNode.sequencer = next;
      sequencerAuditionMidi(grabMidi);
      draw();
      return;
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    if (drag) return;
    const hit = eventToTickMidi(event);
    if (!hit || hit.inGutter) {
      canvas.style.cursor = hit?.inGutter ? "ns-resize" : "var(--node-dot-cursor)";
      return;
    }
    const clip = nodeGraphSequencerEnsureClip(nodeId);
    const idx = hitNoteAtPixel(clip, hit, hit.L);
    if (idx < 0) {
      canvas.style.cursor = "var(--node-dot-cursor)";
      return;
    }
    const n = clip.notes[idx];
    const r = noteScreenRect(n, hit.L);
    const nw = r ? r.w : n.length * hit.tickW;
    const noteRight = r ? r.x + r.w : hit.gutter + (n.start + n.length) * hit.tickW;
    const handle = nw < 16 ? 0 : Math.min(8, nw * 0.2);
    canvas.style.cursor = handle > 0 && hit.x >= noteRight - handle ? "ew-resize" : "grab";
  }, { passive: true });

  function endDrag(event) {
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    const clip = nodeGraphSequencerEnsureClip(nodeId);
    if (drag.mode === "scroll") {
      nodeGraphSequencerCommitClip(nodeId, clip, "sequencer scroll");
    } else if (drag.mode === "marquee") {
      if (!drag.moved) {
        const hit = eventToTickMidi(event);
        const idx = hit && !hit.inGutter ? hitNoteAtPixel(clip, hit, hit.L) : -1;
        if (idx >= 0) {
          const key = noteKey(clip.notes[idx]);
          if (drag.additive) {
            if (selected.has(key)) selected.delete(key);
            else selected.add(key);
          } else {
            selected = new Set([key]);
          }
        } else if (!drag.additive) {
          selected = new Set();
        }
      }
    } else if (!drag.moved && (drag.mode === "move" || drag.mode === "resize")) {
      const indices = Array.isArray(drag.indices) && drag.indices.length
        ? drag.indices
        : [drag.index];
      const next = typeof sequencerRemoveNotesAt === "function"
        ? sequencerRemoveNotesAt(clip, indices)
        : (typeof sequencerRemoveNoteAt === "function"
          ? sequencerRemoveNoteAt(clip, drag.index)
          : clip);
      selected = new Set();
      nodeGraphSequencerCommitClip(nodeId, next, "sequencer delete");
    } else if (drag.mode === "place") {
      nodeGraphSequencerCommitClip(nodeId, clip, "sequencer add");
    } else {
      nodeGraphSequencerCommitClip(nodeId, clip, "sequencer edit");
    }
    sequencerAuditionStop();
    drag = null;
    canvas.style.cursor = "var(--node-dot-cursor)";
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch (_e) { /* ignore */ }
    draw();
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  section.tabIndex = 0;
  section.addEventListener("keydown", (event) => {
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    if (!selected.size) return;
    event.preventDefault();
    event.stopPropagation();
    const clip = nodeGraphSequencerEnsureClip(nodeId);
    const indices = selectedIndices(clip);
    if (!indices.length) return;
    const next = typeof sequencerRemoveNotesAt === "function"
      ? sequencerRemoveNotesAt(clip, indices)
      : clip;
    selected = new Set();
    nodeGraphSequencerCommitClip(nodeId, next, "sequencer delete");
    draw();
  });

  const ro = new ResizeObserver(() => {
    layoutCache = null;
    draw();
  });
  ro.observe(host);
  section._sequencerDraw = draw;
  requestAnimationFrame(function tick() {
    if (!section.isConnected) return;
    draw(false);
    requestAnimationFrame(tick);
  });
  return section;
}
