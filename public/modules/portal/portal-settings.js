function nodeGraphPortalDisplaySettingsForNode(node) {
  return {
    channel: typeof nodeGraphPortalChannelFromNode === "function"
      ? nodeGraphPortalChannelFromNode(node)
      : 0,
  };
}

function buildNodeGraphPortalDisplaySettingsBodyHtml() {
  return `
    <div class="node-led-display-settings-panel" data-portal-display-settings-panel>
      <label class="node-led-settings-row">
        <span>Channel</span>
        <input type="number" min="0" max="31" step="1" data-portal-field="channel" aria-label="Portal channel 0 Left, 1 Right, 2 Mono">
      </label>
    </div>`;
}

function syncNodeGraphPortalDisplaySettingsControls(root, settings) {
  if (!root || !settings) {
    return;
  }
  const input = root.querySelector?.(`[data-portal-field="channel"]`);
  if (input && document.activeElement !== input) {
    input.value = String(settings.channel ?? 0);
  }
}

function bindNodeGraphPortalDisplaySettingsBody(host) {
  if (!host || host.dataset.portalSettingsBound === "true") {
    return;
  }
  host.dataset.portalSettingsBound = "true";
  const apply = (persist, record) => {
    if (typeof markNodeGraphTraceDisplaySettingsDirty === "function") {
      markNodeGraphTraceDisplaySettingsDirty("*");
    }
    if (typeof applyNodeGraphTraceDisplaySettingsForm === "function") {
      applyNodeGraphTraceDisplaySettingsForm({ persist, record, commit: record });
    }
  };
  host.addEventListener("input", (event) => {
    if (event.target?.closest?.("[data-portal-field]")) {
      apply("none", false);
    }
  });
  host.addEventListener("change", (event) => {
    if (event.target?.closest?.("[data-portal-field]")) {
      apply("immediate", true);
    }
  });
}

function applyNodeGraphPortalDisplaySettingsToFace(node) {
  if (!node?.id || typeof syncNodeGraphPortalElement !== "function") {
    return;
  }
  const el = typeof nodeGraphNodeElement === "function"
    ? nodeGraphNodeElement(node.id)
    : document.querySelector(`.dsp-node[data-node="${CSS.escape(String(node.id))}"]`);
  if (el) {
    syncNodeGraphPortalElement(el, node);
  }
  if (typeof scheduleNodeGraphLivePlanSync === "function") {
    scheduleNodeGraphLivePlanSync();
  }
}
