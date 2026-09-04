function clearNodeGraphConfirmDefaultButton(button = nodeGraphMvp.confirmDefaultButton) {
  if (!button) {
    return;
  }
  if (nodeGraphMvp.confirmDefaultButtonTimer) {
    window.clearTimeout(nodeGraphMvp.confirmDefaultButtonTimer);
    nodeGraphMvp.confirmDefaultButtonTimer = 0;
  }
  button.classList.remove("confirming-default");
  button.removeAttribute("aria-pressed");
  if (button.dataset.confirmDefaultHtml) {
    button.innerHTML = button.dataset.confirmDefaultHtml;
    delete button.dataset.confirmDefaultHtml;
  }
  if (button.dataset.confirmDefaultText) {
    delete button.dataset.confirmDefaultText;
  }
  if (nodeGraphMvp.confirmDefaultButton === button) {
    nodeGraphMvp.confirmDefaultButton = null;
  }
  if (button?.id === "nodeToolbarPastePatchButton" || button?.dataset?.pendingPasteClear === "true") {
    delete nodeGraphMvp._pendingPastePatchText;
  }
  if (button?.classList?.contains("node-pages-entry") || button?.dataset?.pageSlug) {
    delete nodeGraphMvp._pendingPagePatchText;
    delete nodeGraphMvp._pendingPagePatchSlug;
  }
}

function nodeGraphDefaultButtonLabel(button) {
  const spanText = button
    ? [...button.querySelectorAll(":scope > span")]
      .map((span) => span.textContent.trim())
      .filter(Boolean)
      .join(" ")
    : "";
  return button?.dataset.defaultButtonLabel || spanText || button?.textContent.trim() || "Update Default";
}

function nodeGraphDefaultButtonHtml(button) {
  return button?.dataset.defaultButtonHtml || button?.innerHTML || nodeGraphDefaultButtonLabel(button);
}

function confirmNodeGraphDefaultButtonClick(button, statusCallback, options = {}) {
  if (!button) {
    return false;
  }
  button.dataset.defaultButtonLabel = nodeGraphDefaultButtonLabel(button);
  button.dataset.defaultButtonHtml = nodeGraphDefaultButtonHtml(button);
  if (nodeGraphMvp.confirmDefaultButton === button && button.classList.contains("confirming-default")) {
    clearNodeGraphConfirmDefaultButton(button);
    return true;
  }
  clearNodeGraphConfirmDefaultButton();
  button.dataset.confirmDefaultText = nodeGraphDefaultButtonLabel(button);
  button.dataset.confirmDefaultHtml = nodeGraphDefaultButtonHtml(button);
  button.textContent = options.confirmText || "Confirm Default";
  button.title = options.confirmText || "Confirm Default";
  button.setAttribute("aria-label", options.confirmText || "Confirm Default");
  button.classList.add("confirming-default");
  button.setAttribute("aria-pressed", "true");
  nodeGraphMvp.confirmDefaultButton = button;
  nodeGraphMvp.confirmDefaultButtonTimer = window.setTimeout(() => {
    clearNodeGraphConfirmDefaultButton(button);
    button.title = button.dataset.defaultButtonLabel || "";
  }, 2000);
  statusCallback?.();
  return false;
}

function flashNodeGraphDefaultButtonSaved(button, label = "Saved") {
  if (!button) {
    return;
  }
  const originalText = nodeGraphDefaultButtonLabel(button);
  const originalHtml = nodeGraphDefaultButtonHtml(button);
  button.classList.remove("saved-default");
  void button.offsetWidth;
  button.textContent = label;
  button.classList.add("saved-default");
  window.setTimeout(() => {
    button.classList.remove("saved-default");
    button.innerHTML = originalHtml || originalText;
    if (button.dataset.defaultButtonLabel) {
      button.title = button.dataset.defaultButtonLabel;
      button.setAttribute("aria-label", button.dataset.defaultButtonLabel);
    }
  }, 1000);
}
