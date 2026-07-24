async function bindNodeGraphMvpEventGroup(label, binder) {
  try {
    await binder();
    return true;
  } catch (error) {
    console.error(`Node graph event binding failed: ${label}`, error);
    document.documentElement.dataset.nodeGraphEventBindingError = label;
    document.documentElement.dataset.nodeGraphEventBindingErrorMessage = error?.message || String(error);
    return false;
  }
}

async function bindNodeGraphMvpEvents() {
  await bindNodeGraphMvpEventGroup("help", bindNodeGraphHelpAndPaletteEvents);
  await bindNodeGraphMvpEventGroup("workspace", bindNodeGraphWorkspaceInteractionEvents);
  await bindNodeGraphMvpEventGroup("keyboard", () => {
    bindNodeGraphFloatingWindowLockHandles();
    document.addEventListener("keydown", handleNodeGraphFloatingWindowKeyboardNudge, true);
    document.addEventListener("keyup", handleNodeGraphFloatingWindowKeyboardRelease, true);
    document.addEventListener("keydown", handleNodeGraphKeydown);
    // Space must never scroll the page or a focused panel. handleNodeGraphKeydown
    // already prevents this for events that reach it, but a focused scrollable
    // element can scroll first -- so guard Space in the capture phase too,
    // except inside real text-editing fields where a space is legitimate.
    document.addEventListener("keydown", (event) => {
      if (event.code !== "Space" && event.key !== " ") {
        return;
      }
      const target = event.target;
      if (!target) {
        return;
      }
      if (target.isContentEditable) {
        return;
      }
      const tag = target.tagName;
      if (tag === "TEXTAREA") {
        return;
      }
      if (tag === "INPUT") {
        const type = (target.type || "text").toLowerCase();
        const textual = type === "text" || type === "search" || type === "email" || type === "url" || type === "password" || type === "tel";
        if (textual && !target.readOnly) {
          return;
        }
      }
      event.preventDefault();
    }, true);
    // When embedded in an iframe (e.g. the soundemote-site sandbox page),
    // clicking a module selects it via mouse events (hit-testing, no focus
    // needed) but keyboard shortcuts -- Delete included -- only ever reach
    // whichever document currently holds focus. A click alone doesn't
    // guarantee that's us, so explicitly claim window focus on interaction.
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (!nodeGraphEventTargetIsEditable(event.target)) {
          window.focus();
        }
      },
      true,
    );
  });
  await bindNodeGraphMvpEventGroup("scene-menu", bindNodeGraphSceneMenuEvents);
  await bindNodeGraphMvpEventGroup("header", bindNodeGraphHeaderControlEvents);
  await bindNodeGraphMvpEventGroup("render-live", bindNodeGraphRenderLiveControlEvents);
  // "ui-view" (bindNodeGraphUiViewEvents) bound the now-removed Patch Control
  // Surface / WYSIWYG UI-item editor -- node-graph-ui-view.js was emptied out
  // when that feature was retired (see its header comment), but this call
  // site was never cleaned up, so every startup threw an uncaught
  // ReferenceError here before this fix.
  await bindNodeGraphMvpEventGroup("ui-dev", bindNodeGraphUiDevSettingsEvents);
  await bindNodeGraphMvpEventGroup("settings", bindNodeGraphSettingsFormEvents);
  await bindNodeGraphMvpEventGroup("sliders", bindNodeGraphSliderDragEvents);
}
