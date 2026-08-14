function setNodeGraphSettingsField(id, value) {
  const field = document.getElementById(id);
  if (field && document.activeElement !== field) {
    field.value = value;
  }
}

/**
 * Shared settings-range row used by waveform / LED / wire actions.
 * Same chrome as `.node-phosphor-waveform-settings-row`.
 *
 * @param {{
 *   id?: string,
 *   label?: string,
 *   min?: number,
 *   max?: number,
 *   step?: number,
 *   value?: number,
 *   suffix?: string,
 *   title?: string,
 *   ariaLabel?: string,
 *   rowClass?: string,
 * }} [options]
 * @returns {{ row: HTMLLabelElement, input: HTMLInputElement, label: HTMLSpanElement, suffix: HTMLSpanElement|null }}
 */
function createNodeGraphSettingsRangeRow(options = {}) {
  const row = document.createElement("label");
  row.className = "node-settings-range-row";
  if (options.rowClass) {
    row.classList.add(String(options.rowClass));
  }

  const label = document.createElement("span");
  label.textContent = options.label == null ? "" : String(options.label);

  const input = document.createElement("input");
  input.type = "range";
  input.min = String(options.min ?? 0);
  input.max = String(options.max ?? 1);
  input.step = String(options.step ?? 0.01);
  input.value = String(options.value ?? 0);
  if (options.id) {
    input.id = String(options.id);
  }
  if (options.title) {
    input.title = String(options.title);
  }
  input.setAttribute(
    "aria-label",
    String(options.ariaLabel || options.label || "Value"),
  );
  input.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });

  row.append(label, input);
  let suffix = null;
  if (options.suffix) {
    suffix = document.createElement("span");
    suffix.textContent = String(options.suffix);
    row.append(suffix);
  }
  return { row, input, label, suffix };
}

function mountNodeGraphSettingsRangeRow(host, options = {}) {
  const built = createNodeGraphSettingsRangeRow(options);
  host?.append?.(built.row);
  return built;
}

function nodeGraphSyncedFieldValue(ids) {
  const activeId = document.activeElement?.id || "";
  if (ids.includes(activeId)) {
    return document.getElementById(activeId)?.value;
  }
  for (const id of ids) {
    const field = document.getElementById(id);
    if (field) {
      return field.value;
    }
  }
  return "";
}
