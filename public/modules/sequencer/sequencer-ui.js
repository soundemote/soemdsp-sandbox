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
  const debugEl = document.createElement("span");
  debugEl.className = "node-sequencer-debug";
  chrome.append(debugEl);

  function octaveBtn(octaves, label) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.title = octaves > 0 ? "Transpose clip up one octave" : "Transpose clip down one octave";
    b.addEventListener("pointerdown", (e) => e.stopPropagation());
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const clip = nodeGraphSequencerEnsureClip(nodeId);
      const next = typeof sequencerTransposeOctave === "function"
        ? sequencerTransposeOctave(clip, octaves)
        : clip;
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

  function layout() {
    const clip = nodeGraphSequencerEnsureClip(nodeId);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.max(1, canvas.clientWidth || 1);
    const h = Math.max(1, canvas.clientHeight || 1);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const box = canvas.getBoundingClientRect();
    const gutter = Math.min(44, Math.max(28, Math.round(w * 0.12)));
    const keys = Math.max(1, Math.min(128, clip.keysVisible | 0));
    const rowH = h / keys;
    const bars = Math.max(1, clip.barsVisible | 0);
    const viewTicks = bars * 32;
    const gridW = Math.max(1, w - gutter);
    const tickW = gridW / viewTicks;
    const maxScroll = Math.max(0, 128 - keys);
    if (clip.scrollMidi > maxScroll) clip.scrollMidi = maxScroll;
    return { ctx, w, h, clip, keys, viewTicks, gridW, rowH, tickW, box, gutter };
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
    const L = layout();
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
    return { tick, rawTick, midi, x, y, tickW, inGutter, rowH, gutter, keys };
  }

  function draw() {
    const L = layout();
    const { ctx, w, h, clip, keys, viewTicks, tickW, rowH, gutter } = L;
    ctx.fillStyle = "#101014";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#1a1a20";
    ctx.fillRect(0, 0, gutter, h);
    const pcBlack = new Set([1, 3, 6, 8, 10]);
    for (let r = 0; r < keys; r += 1) {
      const midi = midiAtRow(clip, r, keys);
      const y = r * rowH;
      const black = pcBlack.has(((midi % 12) + 12) % 12);
      ctx.fillStyle = black ? "#16161a" : "#202028";
      ctx.fillRect(gutter, y, w - gutter, rowH);
      ctx.fillStyle = black ? "#2a2a32" : "#d8d8de";
      ctx.fillRect(4, y + 1, gutter - 8, Math.max(1, rowH - 2));
      if (rowH >= 9) {
        ctx.fillStyle = black ? "#ccc" : "#222";
        ctx.font = `${Math.max(8, Math.min(11, rowH - 4))}px sans-serif`;
        const label = clip.labelMode === "number"
          ? String(midi)
          : (typeof sequencerPitchLabel === "function" ? sequencerPitchLabel(midi) : String(midi));
        ctx.fillText(label, 5, y + Math.min(rowH - 2, 11));
      }
    }
    const snap = Math.max(1, clip.snap | 0);
    ctx.lineWidth = 1;
    for (let t = 0; t <= viewTicks; t += snap) {
      const x = gutter + t * tickW;
      const bar = t % 32 === 0;
      ctx.strokeStyle = bar ? "#6a6a78" : "#2c2c36";
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    const loop = Math.max(1, clip.loopTicks | 0);
    if (loop < viewTicks) {
      const lx = gutter + loop * tickW;
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.fillRect(lx, 0, Math.max(0, w - lx), h);
      ctx.strokeStyle = "#c8c86a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lx + 0.5, 0);
      ctx.lineTo(lx + 0.5, h);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    const notes = Array.isArray(clip.notes) ? clip.notes : [];
    for (let i = 0; i < notes.length; i += 1) {
      const n = notes[i];
      const row = rowOfMidi(clip, n.midi, keys);
      if (row < 0 || row >= keys) continue;
      if (n.start >= viewTicks) continue;
      const x = gutter + n.start * tickW;
      const nw = Math.max(2, n.length * tickW);
      const y = row * rowH + 1;
      const pastLoop = n.start >= loop;
      ctx.fillStyle = pastLoop ? "#2a4a7a" : "#3d7dff";
      ctx.fillRect(x, y, nw - 1, Math.max(2, rowH - 2));
    }
    const beats = nodeGraphSequencerBeatsNow();
    const playTick = typeof sequencerTickFromBeats === "function"
      ? sequencerTickFromBeats(beats, clip.loopTicks)
      : 0;
    const dbg = nodeGraphMvp?._seqWorkletDebug;
    const uiTick = playTick;
    debugEl.textContent = dbg
      ? `ui ${uiTick}/${clip.loopTicks}  audio ${Math.floor(Number(dbg.tick) || 0)}  play[${(dbg.playBits || []).join(",")}]  chord[${(dbg.chordBits || []).join(",")}]  bpm ${dbg.bpm || "?"}  sr ${dbg.sr || "?"}  ${dbg.bypassed ? "BYPASS" : ""}`
      : `ui ${uiTick}/${clip.loopTicks}  audio —`;
    if (playTick >= 0 && playTick <= viewTicks) {
      const px = gutter + playTick * tickW + 0.5;
      ctx.strokeStyle = "rgba(255, 80, 80, 0.35)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
      ctx.strokeStyle = "#ff3a3a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
      ctx.fillStyle = "#ff3a3a";
      ctx.beginPath();
      ctx.moveTo(px - 5, 0);
      ctx.lineTo(px + 5, 0);
      ctx.lineTo(px, 7);
      ctx.closePath();
      ctx.fill();
    }
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const hit = eventToTickMidi(event);
    if (!hit) return;
    const clip = nodeGraphSequencerEnsureClip(nodeId);
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
    const idx = typeof sequencerHitNote === "function"
      ? sequencerHitNote(clip, hit.tick, hit.midi)
      : -1;
    if (idx >= 0) {
      const n = clip.notes[idx];
      const nw = Math.max(2, n.length * hit.tickW);
      const noteRight = hit.gutter + (n.start + n.length) * hit.tickW;
      const handle = nw < 16 ? 0 : Math.min(8, nw * 0.2);
      const resize = handle > 0 && hit.x >= noteRight - handle;
      drag = {
        mode: resize ? "resize" : "move",
        index: idx,
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
      return;
    }
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
    if ((drag.mode === "resize" || drag.mode === "place") && typeof sequencerResizeNote === "function") {
      const next = sequencerResizeNote(clip, drag.index, hit.rawTick);
      const n = next.notes[drag.index];
      if (!n || n.length === drag.originLength) return;
      drag.moved = true;
      const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
      if (patchNode) patchNode.sequencer = next;
      draw();
      return;
    }
    if (drag.mode === "move" && typeof sequencerMoveNote === "function") {
      const tick = hit.inGutter ? drag.startTick - drag.grabTick : drag.startTick + (hit.tick - drag.grabTick);
      const next = sequencerMoveNote(clip, drag.index, tick, hit.midi);
      const n = next.notes[drag.index];
      if (!n || (n.start === drag.originStart && n.midi === drag.originMidi)) return;
      drag.moved = true;
      const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
      if (patchNode) patchNode.sequencer = next;
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
    const idx = typeof sequencerHitNote === "function"
      ? sequencerHitNote(clip, hit.tick, hit.midi)
      : -1;
    if (idx < 0) {
      canvas.style.cursor = "var(--node-dot-cursor)";
      return;
    }
    const n = clip.notes[idx];
    const nw = Math.max(2, n.length * hit.tickW);
    const noteRight = hit.gutter + (n.start + n.length) * hit.tickW;
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
    } else if (!drag.moved && (drag.mode === "move" || drag.mode === "resize")) {
      const next = typeof sequencerRemoveNoteAt === "function"
        ? sequencerRemoveNoteAt(clip, drag.index)
        : clip;
      nodeGraphSequencerCommitClip(nodeId, next, "sequencer delete");
    } else if (drag.mode === "place") {
      nodeGraphSequencerCommitClip(nodeId, clip, "sequencer add");
    } else {
      nodeGraphSequencerCommitClip(nodeId, clip, "sequencer edit");
    }
    drag = null;
    canvas.style.cursor = "var(--node-dot-cursor)";
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch (_e) { /* ignore */ }
    draw();
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  const ro = new ResizeObserver(() => draw());
  ro.observe(host);
  section._sequencerDraw = draw;
  requestAnimationFrame(function tick() {
    if (!section.isConnected) return;
    draw();
    requestAnimationFrame(tick);
  });
  return section;
}
