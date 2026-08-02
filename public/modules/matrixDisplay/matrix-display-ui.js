// Asciiscope XY face: canvas + glyph-ramp editor (phosphor tail).
// Layout id remains "matrixDisplay" historically; module type is asciiscope.

function createNodeGraphMatrixDisplayFace(node) {
  const type = "asciiscope";
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(node) : null;
  // Prefer asciiscope.glyphRamp; fall back to matrixDisplay.glyphRamp from early builds.
  const rawStore = patchNode?.asciiscope?.glyphRamp != null
    ? patchNode.asciiscope
    : (patchNode?.matrixDisplay?.glyphRamp != null ? patchNode.matrixDisplay : patchNode?.asciiscope);
  const store = typeof normalizeNodeGraphMatrixDisplay === "function"
    ? normalizeNodeGraphMatrixDisplay(rawStore)
    : { glyphRamp: MATRIX_DISPLAY_DEFAULT_GLYPH_RAMP };

  const face = document.createElement("div");
  face.className = "node-matrix-display-face node-light-source";
  face.dataset.node = node;
  face.dataset.nodeType = type;
  face.setAttribute("aria-label", "Asciiscope XY character grid");

  const stage = document.createElement("div");
  stage.className = "node-matrix-display-stage";

  const canvas = document.createElement("canvas");
  canvas.className = "node-matrix-display-canvas";
  canvas.setAttribute("aria-hidden", "true");
  stage.append(canvas);

  const side = document.createElement("div");
  side.className = "node-matrix-display-side";

  const label = document.createElement("div");
  label.className = "node-matrix-display-ramp-label";
  label.innerHTML = '<span>Glyph ramp</span><span class="node-matrix-display-ramp-hint">tail → tip (display settings)</span>';

  const ramp = document.createElement("textarea");
  ramp.className = "node-matrix-display-glyph-ramp";
  ramp.spellcheck = false;
  ramp.autocomplete = "off";
  ramp.rows = 3;
  ramp.value = store.glyphRamp || MATRIX_DISPLAY_DEFAULT_GLYPH_RAMP;
  ramp.title = "Character series used as phosphor tail. Left = cold/dim, right = hot tip.";
  ramp.setAttribute("aria-label", "Glyph ramp characters");

  let rampTimer = 0;
  const commitRamp = () => {
    commitNodeGraphMatrixDisplayGlyphRamp(node, ramp.value);
  };
  ramp.addEventListener("input", () => {
    window.clearTimeout(rampTimer);
    rampTimer = window.setTimeout(commitRamp, 280);
  });
  ramp.addEventListener("change", commitRamp);

  const tools = document.createElement("div");
  tools.className = "node-matrix-display-tools";
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "node-matrix-display-tool";
  resetBtn.textContent = "Default ramp";
  resetBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    ramp.value = MATRIX_DISPLAY_DEFAULT_GLYPH_RAMP;
    commitRamp();
  });
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "node-matrix-display-tool";
  clearBtn.textContent = "Clear trails";
  clearBtn.title = "Zero the age grid";
  clearBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const sim = matrixDisplaySimStates?.get?.(node);
    if (sim?.ages) {
      sim.ages.fill(0);
    }
  });
  tools.append(resetBtn, clearBtn);

  side.append(label, ramp, tools);
  face.append(stage, side);

  if (typeof matrixDisplayStartPump === "function") {
    matrixDisplayStartPump();
  }
  return face;
}

function commitNodeGraphMatrixDisplayGlyphRamp(nodeId, rampText) {
  if (typeof nodeGraphScriptReadyForGraphAction === "function"
    && !nodeGraphScriptReadyForGraphAction("asciiscope")
    && !nodeGraphScriptReadyForGraphAction("matrixDisplay")) {
    return;
  }
  const patch = typeof cloneNodeGraphPatch === "function"
    ? cloneNodeGraphPatch(nodeGraphMvp.patch)
    : null;
  if (!patch) return;
  const patchNode = patch.nodes.find((n) => n.id === nodeId);
  if (!patchNode) return;
  const next = typeof normalizeNodeGraphMatrixDisplay === "function"
    ? normalizeNodeGraphMatrixDisplay({ glyphRamp: rampText })
    : { glyphRamp: String(rampText || "") };
  // XY phosphor lives on Asciiscope now.
  patchNode.asciiscope = {
    ...(patchNode.asciiscope && typeof patchNode.asciiscope === "object" ? patchNode.asciiscope : {}),
    ...next,
  };
  commitNodeGraphPatch(patch, {
    status: "Asciiscope glyph ramp",
  });
}
