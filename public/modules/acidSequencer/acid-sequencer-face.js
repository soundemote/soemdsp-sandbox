// Acid Sequencer face. Pattern lives on node.acidSequencer (not Sequencer).
// Gate 0=off, 1=on, 2=tie. Octave -1/0/+1. DSP is native only.

const ACID_SEQUENCER_STEP_COUNT = 32;
const ACID_SEQUENCER_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B", "C"];

function acidSequencerDefaultSteps() {
  const steps = [];
  for (let i = 0; i < ACID_SEQUENCER_STEP_COUNT; i += 1) {
    steps.push({ pitchIndex: 0, gate: 0, accent: false, slide: false, octave: 0 });
  }
  return steps;
}

function acidSequencerNormalize(raw) {
  const steps = acidSequencerDefaultSteps();
  const src = Array.isArray(raw?.steps) ? raw.steps : [];
  for (let i = 0; i < ACID_SEQUENCER_STEP_COUNT; i += 1) {
    const s = src[i] && typeof src[i] === "object" ? src[i] : {};
    let pitch = Math.round(Number(s.pitchIndex));
    if (!Number.isFinite(pitch)) pitch = 0;
    pitch = Math.max(0, Math.min(12, pitch));
    let gate = Math.round(Number(s.gate));
    if (gate !== 1 && gate !== 2) gate = 0;
    let octave = Math.round(Number(s.octave));
    if (octave !== -1 && octave !== 1) octave = 0;
    steps[i] = {
      pitchIndex: pitch,
      gate,
      accent: s.accent === true || s.accent === 1,
      slide: s.slide === true || s.slide === 1,
      octave,
    };
  }
  return { steps };
}

function acidSequencerRead(nodeId) {
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  return acidSequencerNormalize(patchNode?.acidSequencer);
}

function acidSequencerCommit(nodeId, pattern, status) {
  if (!nodeId || typeof cloneNodeGraphPatch !== "function" || typeof commitNodeGraphPatch !== "function") {
    return false;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const patchNode = (patch.nodes || []).find((n) => n.id === nodeId);
  if (!patchNode) return false;
  const next = acidSequencerNormalize(pattern);
  patchNode.acidSequencer = next;
  const live = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (live) live.acidSequencer = next;
  commitNodeGraphPatch(patch, { status: status || "acid sequencer", faceEdit: true, livePlan: true });
  return true;
}

function acidSequencerRotate(steps, direction) {
  const out = steps.slice();
  if (out.length < 2) return out;
  if (direction < 0) {
    out.push(out.shift());
  } else {
    out.unshift(out.pop());
  }
  return out;
}

function acidSequencerStepLength(nodeId) {
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  let n = Math.round(Number(patchNode?.params?.stepLength));
  if (!Number.isFinite(n)) n = 16;
  return Math.max(1, Math.min(ACID_SEQUENCER_STEP_COUNT, n));
}

function acidSequencerBpm(nodeId) {
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const bpm = Number(patchNode?.params?.bpm);
  return Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
}

function acidSequencerPlayhead(nodeId, bpm, length) {
  const native = typeof nodeGraphModuleScopeLatestOutputValue === "function"
    ? Number(nodeGraphModuleScopeLatestOutputValue(nodeId, "__AcidStep", Number.NaN))
    : Number.NaN;
  if (Number.isFinite(native)) {
    const i = Math.round(native);
    if (i >= 0 && i < length) return i;
  }
  const sec = typeof nodeGraphSequencerEngineSeconds === "function"
    ? Number(nodeGraphSequencerEngineSeconds())
    : 0;
  const b = Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
  const len = Math.max(1, length | 0);
  const sixteenths = (Number.isFinite(sec) ? sec : 0) * (b / 60) * 4;
  if (!(sixteenths >= 0)) return 0;
  return Math.floor(sixteenths) % len;
}

function createNodeGraphAcidSequencerFace(nodeId) {
  const id = String(nodeId || "");
  const face = document.createElement("div");
  face.className = "acid-seq-face node-light-source";
  face.dataset.node = id;
  face.dataset.nodeType = "acidSequencer";
  face.setAttribute("aria-label", "Acid sequencer");

  const bar = document.createElement("div");
  bar.className = "acid-seq-rotate";
  const left = document.createElement("button");
  left.type = "button";
  left.className = "acid-seq-arrow";
  left.textContent = "\u2190";
  left.setAttribute("aria-label", "Rotate pattern left");
  const right = document.createElement("button");
  right.type = "button";
  right.className = "acid-seq-arrow";
  right.textContent = "\u2192";
  right.setAttribute("aria-label", "Rotate pattern right");
  const title = document.createElement("span");
  title.className = "acid-seq-rotate-label";
  title.textContent = "Pattern";
  bar.append(left, title, right);

  const grid = document.createElement("div");
  grid.className = "acid-seq-grid";
  face.append(bar, grid);

  let pattern = acidSequencerRead(id);
  let shownLength = -1;

  const stop = (event) => {
    event.stopPropagation();
  };

  const commitSteps = (steps, status) => {
    pattern = acidSequencerNormalize({ steps });
    acidSequencerCommit(id, pattern, status);
    paint(true);
  };

  left.addEventListener("pointerdown", stop);
  right.addEventListener("pointerdown", stop);
  left.addEventListener("click", (event) => {
    stop(event);
    commitSteps(acidSequencerRotate(pattern.steps, -1), "acid rotate left");
  });
  right.addEventListener("click", (event) => {
    stop(event);
    commitSteps(acidSequencerRotate(pattern.steps, 1), "acid rotate right");
  });

  const cell = (text, className, onClick, label) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = className;
    b.textContent = text;
    if (label) b.setAttribute("aria-label", label);
    b.addEventListener("pointerdown", stop);
    b.addEventListener("click", (event) => {
      stop(event);
      onClick();
    });
    return b;
  };

  function paint(rebuild) {
    const live = acidSequencerRead(id);
    pattern = live;
    const length = acidSequencerStepLength(id);
    const bpm = acidSequencerBpm(id);
    const head = acidSequencerPlayhead(id, bpm, length);
    if (rebuild || length !== shownLength) {
      shownLength = length;
      grid.replaceChildren();
      grid.style.gridTemplateColumns = `3.2rem repeat(${length}, minmax(0, 1fr))`;
      const rows = [
        { key: "gate", label: "Gate" },
        { key: "accent", label: "Accent" },
        { key: "slide", label: "Slide" },
        { key: "octave", label: "Octave" },
      ];
      for (const row of rows) {
        const lab = document.createElement("div");
        lab.className = "acid-seq-label";
        lab.textContent = row.label;
        grid.append(lab);
        for (let i = 0; i < length; i += 1) {
          const step = pattern.steps[i];
          let text = "";
          let cls = "acid-seq-cell";
          if (row.key === "gate") {
            text = step.gate === 1 ? "on" : step.gate === 2 ? "tie" : "";
            if (step.gate === 1) cls += " is-on";
            if (step.gate === 2) cls += " is-tie";
          } else if (row.key === "accent") {
            text = step.accent ? "A" : "";
            if (step.accent) cls += " is-on";
          } else if (row.key === "slide") {
            text = step.slide ? "S" : "";
            if (step.slide) cls += " is-on";
          } else {
            text = step.octave > 0 ? "+1" : step.octave < 0 ? "-1" : "0";
            if (step.octave !== 0) cls += " is-on";
          }
          const b = cell(text, cls, () => {
            const steps = pattern.steps.map((s) => ({ ...s }));
            const s = steps[i];
            if (row.key === "gate") s.gate = (s.gate + 1) % 3;
            else if (row.key === "accent") s.accent = !s.accent;
            else if (row.key === "slide") s.slide = !s.slide;
            else s.octave = s.octave === -1 ? 0 : s.octave === 0 ? 1 : -1;
            commitSteps(steps, `acid ${row.key}`);
          }, `${row.label} step ${i + 1}`);
          b.dataset.acidCol = String(i);
          grid.append(b);
        }
      }
      for (let note = 12; note >= 0; note -= 1) {
        const lab = document.createElement("div");
        lab.className = "acid-seq-label acid-seq-note";
        lab.textContent = ACID_SEQUENCER_NOTES[note];
        grid.append(lab);
        const black = note !== 0 && note !== 12 && [1, 3, 6, 8, 10].includes(note);
        for (let i = 0; i < length; i += 1) {
          const on = pattern.steps[i].pitchIndex === note;
          const b = cell("", `acid-seq-key${black ? " is-black" : ""}${on ? " is-on" : ""}`, () => {
            const steps = pattern.steps.map((s) => ({ ...s }));
            steps[i].pitchIndex = note;
            commitSteps(steps, "acid pitch");
          }, `${ACID_SEQUENCER_NOTES[note]} step ${i + 1}`);
          b.dataset.acidCol = String(i);
          grid.append(b);
        }
      }
    } else {
      const buttons = grid.querySelectorAll("[data-acid-col]");
      buttons.forEach((b) => {
        const i = Number(b.dataset.acidCol);
        const step = pattern.steps[i];
        if (!step) return;
        if (b.classList.contains("acid-seq-key")) {
          b.classList.toggle("is-on", step.pitchIndex === acidKeyIndex(b));
        }
      });
    }
    paintHead(head);
  }

  function acidKeyIndex(button) {
    const keys = [];
    grid.querySelectorAll(".acid-seq-key").forEach((el) => {
      if (el.dataset.acidCol === "0") keys.push(el);
    });
    const col0 = button.dataset.acidCol === "0" ? button : null;
    if (!col0) {
      const col = button.dataset.acidCol;
      const same = grid.querySelectorAll(`.acid-seq-key[data-acid-col="${col}"]`);
      const allFirst = grid.querySelectorAll('.acid-seq-key[data-acid-col="0"]');
      for (let i = 0; i < same.length; i += 1) {
        if (same[i] === button) return 12 - i;
      }
      return -1;
    }
    const all = grid.querySelectorAll('.acid-seq-key[data-acid-col="0"]');
    for (let i = 0; i < all.length; i += 1) {
      if (all[i] === button) return 12 - i;
    }
    return -1;
  }

  function paintHead(head) {
    grid.querySelectorAll(".is-playhead").forEach((el) => el.classList.remove("is-playhead"));
    grid.querySelectorAll(`[data-acid-col="${head}"]`).forEach((el) => el.classList.add("is-playhead"));
  }

  paint(true);
  const tick = () => {
    if (!face.isConnected) return;
    const length = acidSequencerStepLength(id);
    if (length !== shownLength) paint(true);
    else paintHead(acidSequencerPlayhead(id, acidSequencerBpm(id), length));
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return face;
}