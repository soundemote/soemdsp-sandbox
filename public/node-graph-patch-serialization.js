/** Drop canvas pins / meta buckets for node ids that are no longer in the patch. */
function nodeGraphPruneViewCanvasesToExistingNodes(view, nodes) {
  if (!view || typeof view !== "object") return view;
  const nodeList = Array.isArray(nodes) ? nodes : [];
  const aliveIds = new Set(
    nodeList.map((n) => String(n?.id || "").trim()).filter(Boolean),
  );
  const aliveMetaIds = new Set(
    nodeList
      .filter((n) => {
        const t = String(n?.type || "");
        return typeof nodeGraphIsContainerShellType === "function"
          ? nodeGraphIsContainerShellType(t)
          : t === "metamodule" || t === "voices";
      })
      .map((n) => String(n.id || "").trim())
      .filter(Boolean),
  );
  const canvases = view.canvases;
  if (!canvases || typeof canvases !== "object") return view;
  const pruneBucket = (bucket) => {
    const els = Array.isArray(bucket?.elements) ? bucket.elements : [];
    return {
      elements: els.filter((el) => aliveIds.has(String(el?.nodeId || "").trim())),
    };
  };
  const root = pruneBucket(canvases.root);
  const byMetamodule = {};
  const src = canvases.byMetamodule && typeof canvases.byMetamodule === "object"
    ? canvases.byMetamodule
    : {};
  for (const [metaIdRaw, bucket] of Object.entries(src)) {
    const metaId = String(metaIdRaw || "").trim();
    if (!metaId || !aliveMetaIds.has(metaId)) continue;
    const next = pruneBucket(bucket);
    if (next.elements.length) byMetamodule[metaId] = next;
  }
  return {
    ...view,
    canvases: { root, byMetamodule },
  };
}

function serializeNodeGraphPatch(patch = nodeGraphMvp.patch, options = {}) {
  const cameraState = normalizeNodeGraphPatchCameras(patch.cameras, patch.activeCameraId);
  // Prefer live header FPS when serializing the active patch so save/share
  // always carries the value even if patch.view was not synced yet.
  const viewSource = (patch === nodeGraphMvp?.patch || patch === nodeGraphMvp?.workingPatch)
    && typeof nodeGraphMvp?.moduleScopeFramesPerSecond !== "undefined"
    ? {
      ...(patch.view || {}),
      moduleScopeFramesPerSecond: nodeGraphMvp.moduleScopeFramesPerSecond,
    }
    : patch.view;
  const nodesOut = Array.isArray(patch.nodes)
    ? patch.nodes.map((node) => {
      if (node?.type === "audioPlayer" && node.playlist && typeof nodeGraphAudioPlayerPlaylistForPersist === "function") {
        return { ...node, playlist: nodeGraphAudioPlayerPlaylistForPersist(node.playlist) };
      }
      return node;
    })
    : patch.nodes;
  const viewPruned = nodeGraphPruneViewCanvasesToExistingNodes(
    typeof normalizeNodeGraphPatchView === "function"
      ? normalizeNodeGraphPatchView(viewSource)
      : viewSource,
    nodesOut,
  );
  const payload = {
    activeCameraId: cameraState.activeCameraId,
    audio: normalizeNodeGraphPatchAudio(patch.audio),
    bypassedNodes: (patch.bypassedNodes || []).filter((id) =>
      (nodesOut || []).some((n) => String(n?.id) === String(id)),
    ),
    cameras: cameraState.cameras,
    codeScreen: typeof normalizeNodeGraphCodeScreen === "function"
      ? normalizeNodeGraphCodeScreen(patch.codeScreen)
      : patch.codeScreen,
    connections: patch.connections,
    format: { ...nodeGraphPatchFormat },
    graphConnections: patch.graphConnections || [],
    grid: patch.grid,
    info: normalizeNodeGraphPatchInfo(patch.info),
    modularOnlyControlsVisible: Boolean(patch.modularOnlyControlsVisible),
    modulations: patch.modulations || [],
    monitors: normalizeNodeGraphPatchMonitors(patch.monitors, patch),
    nodes: nodesOut,
    requiredAssets: typeof nodeGraphRequiredAssetsForPatch === "function"
      ? nodeGraphRequiredAssetsForPatch(patch)
      : [],
    samples: typeof nodeGraphPatchSamplesWithoutEmbeddedAudio === "function"
      ? nodeGraphPatchSamplesWithoutEmbeddedAudio(patch.samples)
      : (typeof normalizeNodeGraphPatchSamples === "function"
        ? normalizeNodeGraphPatchSamples(patch.samples)
        : []),
    timing: normalizeNodeGraphPatchTiming(patch.timing),
    uiItems: normalizeNodeGraphPatchUiItems(patch.uiItems, {
      nodeIds: new Set((nodesOut || []).map((n) => String(n?.id || "")).filter(Boolean)),
    }),
    view: viewPruned,
    visual: normalizeNodeGraphPatchVisual(patch.visual),
    windows: typeof normalizeNodeGraphPatchWindows === "function"
      ? normalizeNodeGraphPatchWindows(patch.windows)
      : patch.windows,
    // Gold Arp latch (ctrl+click) — patch-owned, not localStorage-only.
    keyboardLatch: (typeof nodeGraphMvp !== "undefined" && patch === nodeGraphMvp?.patch)
      ? {
        lowBitmask: Math.max(0, Math.floor(Number(nodeGraphMvp.midiKeyboardHeldKeysLowBitmask)) || 0),
        highBitmask: Math.max(0, Math.floor(Number(nodeGraphMvp.midiKeyboardHeldKeysHighBitmask)) || 0),
        velocities: nodeGraphMvp.midiKeyboardHeldKeyVelocities instanceof Uint8Array
          ? Array.from(nodeGraphMvp.midiKeyboardHeldKeyVelocities)
          : undefined,
      }
      : (patch.keyboardLatch && typeof patch.keyboardLatch === "object"
        ? {
          lowBitmask: Math.max(0, Math.floor(Number(patch.keyboardLatch.lowBitmask)) || 0),
          highBitmask: Math.max(0, Math.floor(Number(patch.keyboardLatch.highBitmask)) || 0),
          velocities: Array.isArray(patch.keyboardLatch.velocities)
            ? patch.keyboardLatch.velocities
            : undefined,
        }
        : undefined),
  };
  if (payload.keyboardLatch) {
    const vels = payload.keyboardLatch.velocities;
    if (Array.isArray(vels) && !vels.some((v) => (Number(v) || 0) > 0)) {
      delete payload.keyboardLatch.velocities;
    }
    if (!payload.keyboardLatch.lowBitmask
      && !payload.keyboardLatch.highBitmask) {
      delete payload.keyboardLatch;
    }
  }
  return options.pretty === false
    ? JSON.stringify(payload)
    : JSON.stringify(payload, null, 2);
}

function nodeGraphShareProjectData(patch = nodeGraphMvp.patch) {
  const patchToShare = typeof nodeGraphPatchWithLiveHeaderInfo === "function"
    ? nodeGraphPatchWithLiveHeaderInfo(patch)
    : patch;
  const info = normalizeNodeGraphPatchInfo(patchToShare.info);
  return {
    kind: "sandbox_patch",
    version: 1,
    title: info.name || "Untitled Project",
    bank_name: info.bankName || "",
    patch_data: JSON.parse(serializeNodeGraphPatch(patchToShare)),
    assets: typeof nodeGraphRequiredAssetsForPatch === "function"
      ? nodeGraphRequiredAssetsForPatch(patchToShare)
      : [],
    created_with: {
      app: "soemdsp-sandbox",
      patch_format: { ...nodeGraphPatchFormat },
    },
  };
}

function nodeGraphSharePayload(patch = nodeGraphMvp.patch) {
  const projectData = nodeGraphShareProjectData(patch);
  return {
    title: projectData.title,
    visibility: "unlisted",
    project_data: projectData,
  };
}

function nodeGraphEncodeSharePayload(payload) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function nodeGraphDecodeSharePayload(encoded = "") {
  const normalized = String(encoded || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function nodeGraphPatchFromShareProjectData(projectData = {}) {
  if (projectData?.kind !== "sandbox_patch") {
    throw new Error(`unsupported share kind: ${projectData?.kind || "unknown"}`);
  }
  if (!projectData.patch_data) {
    throw new Error("share payload is missing patch_data");
  }
  return loadNodeGraphPatchFromScript(JSON.stringify(projectData.patch_data));
}

function nodeGraphSharePayloadFromUrl(search = window.location.search) {
  const params = new URLSearchParams(search || "");
  const encoded = params.get("share");
  return encoded ? nodeGraphDecodeSharePayload(encoded) : null;
}

function nodeGraphShareLinkForPatch(patch = nodeGraphMvp.patch) {
  const payload = nodeGraphSharePayload(patch);
  const encoded = nodeGraphEncodeSharePayload(payload);
  const url = new URL(
    window.location.hostname === "soundemote.io"
      ? window.location.href
      : "https://soundemote.io/sandbox",
  );
  url.searchParams.set("share", encoded);
  url.hash = "";
  return url.toString();
}

function nodeGraphPatchFingerprint(patch = nodeGraphMvp.patch) {
  const text = typeof patch === "string" ? patch : serializeNodeGraphPatch(patch);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
