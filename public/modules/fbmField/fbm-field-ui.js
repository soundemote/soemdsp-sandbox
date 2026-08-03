// FBM Field Layout B body. Face paint is driven by scope buffers (X/Y samples),
// not an independent rAF field simulation.

function createNodeGraphFbmFieldBody(node, type) {
  const face = document.createElement("div");
  face.className = "node-module-scope-window node-fbm-field-face node-light-source";
  face.dataset.node = node;
  face.dataset.nodeType = type;
  face.dataset.lightSource = "screen";
  face.dataset.lightStrength = "0";
  face.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} FBM field`);
  face.style.cssText = "position:relative;width:100%;height:100%;overflow:hidden;background:#000000;";
  // Scope2d burn creates/attaches its own .node-module-scope-local-fallback-canvas.
  return face;
}

function nodeGraphFbmFieldStopLoop(face) {
  if (!face) {
    return;
  }
  if (face._fbmFieldRaf) {
    cancelAnimationFrame(face._fbmFieldRaf);
    face._fbmFieldRaf = 0;
  }
  face._fbmFieldRunning = false;
}

/**
 * Lightweight rAF: only enforces black plate when audio is stopped.
 * Sample deposits happen on the scope paint path (same buffers as jacks).
 */
function nodeGraphFbmFieldStartLoop(face, nodeId) {
  if (!face || face._fbmFieldRunning) {
    return;
  }
  face._fbmFieldRunning = true;

  const tick = () => {
    if (!face.isConnected) {
      nodeGraphFbmFieldStopLoop(face);
      return;
    }
    let running = false;
    try {
      if (typeof nodeGraphModuleScopeCircuitRunning === "function") {
        running = nodeGraphModuleScopeCircuitRunning();
      } else {
        const live = typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.live : null;
        running = Boolean(live?.outputEnabled && live?.node);
      }
    } catch (_) {
      running = false;
    }
    if (!running && !face._fbmFieldBlack && typeof nodeGraphFbmFieldFillBlack === "function") {
      const canvas = face.querySelector?.("canvas");
      nodeGraphFbmFieldFillBlack(canvas, face);
    }
    face._fbmFieldRaf = requestAnimationFrame(tick);
  };
  face._fbmFieldRaf = requestAnimationFrame(tick);
}

registerNodeGraphChromelessModuleUi("fbmField", {
  createBody: createNodeGraphFbmFieldBody,
  afterMount(article, body, node, type) {
    if (typeof registerNodeGraphModuleScopeSlot === "function") {
      registerNodeGraphModuleScopeSlot(article, {
        nodeId: node,
        scopeElement: body,
        type,
        viewDrag: false,
      });
    }
    nodeGraphFbmFieldStartLoop(body, node);
  },
});
