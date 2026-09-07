import { chromium } from "playwright";

const BASE = process.env.SANDBOX_URL || "http://127.0.0.1:8765/";

function fieldSnapshot(page) {
  return page.evaluate(() => {
    const pop = document.getElementById("nodeTraceDisplaySettingsPopover");
    if (!pop || pop.hidden) {
      return { open: false, fields: [] };
    }
    const fields = [...pop.querySelectorAll("[data-trace-display-field]")].map((el) => ({
      key: el.getAttribute("data-trace-display-field") || "",
      value: String(el.value ?? ""),
      readOnly: Boolean(el.readOnly),
      editing: el.classList.contains("trace-display-field-editing"),
      hasReadonlyAttr: el.hasAttribute("readonly"),
    }));
    return {
      open: true,
      blank: pop.dataset.inspectorBlank === "true",
      formType: pop.dataset.displaySettingsType || "",
      target: pop.dataset.displaySettingsTargetNode || "",
      fields,
      emptyCount: fields.filter((f) => f.value === "").length,
      writableIdleCount: fields.filter((f) => !f.readOnly && !f.editing).length,
      missingReadonlyAttr: fields.filter((f) => !f.hasReadonlyAttr && !f.editing).map((f) => f.key),
    };
  });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(String(err.message || err)));

await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 120000 });
const start = page.locator("#nodeBootStartButton");
if (await start.count()) {
  await start.click().catch(() => {});
}

// Wait until boot session restore has finished applying workspace windows.
await page.waitForFunction(
  () => typeof window.openNodeGraphTraceDisplaySettings === "function"
    && Array.isArray(window.nodeGraphMvp?.patch?.nodes)
    && window.nodeGraphMvp.patch.nodes.length > 0
    && window.nodeGraphMvp?._bootSessionApplied !== false,
  null,
  { timeout: 120000 },
);
await page.waitForTimeout(800);

const pick = await page.evaluate(() => {
  const nodes = window.nodeGraphMvp.patch.nodes || [];
  const poly = nodes.find((n) => n.type === "polyBlep")
    || nodes.find((n) => window.nodeGraphNodeCanOpenDisplaySettings?.(n));
  if (!poly) {
    return { ok: false, reason: "no displayable node" };
  }
  // Mimic a face right-click: pin scene/action context + selection.
  window.nodeGraphMvp.sceneContextTargetNode = poly.id;
  window.nodeGraphMvp.lastModuleActionTargetNode = poly.id;
  if (typeof window.selectNodeGraphNodes === "function") {
    window.selectNodeGraphNodes([poly.id]);
  } else if (typeof window.setNodeGraphSelection === "function") {
    window.setNodeGraphSelection([poly.id]);
  } else {
    window.nodeGraphMvp.selectedNodeIds = new Set([poly.id]);
  }
  const ok = window.openNodeGraphTraceDisplaySettings(poly.id, {
    clientX: 480,
    clientY: 280,
  });
  return {
    ok: Boolean(ok),
    nodeId: poly.id,
    type: poly.type,
    schema: window.nodeGraphModuleDisplaySettingsSchemaForNode?.(poly) || "",
  };
});

if (!pick.ok) {
  console.log(JSON.stringify({ fail: "open", pick, errors }, null, 2));
  await browser.close();
  process.exit(1);
}

await page.waitForTimeout(400);
const first = await fieldSnapshot(page);

// Pointerdowns on the popover chrome used to "commit" the next idle
// non-readonly field one-by-one. Click the header instead of outside
// (outside closes the floating window).
const header = page.locator("#nodeTraceDisplaySettingsPopover .metadata-popover-header, #nodeTraceDisplaySettingsPopover .node-floating-window-header, #nodeTraceDisplaySettingsPopover").first();
for (let i = 0; i < Math.max(first.fields?.length || 0, 5); i += 1) {
  await header.click({ position: { x: 8, y: 8 } }).catch(() => {});
  await page.waitForTimeout(30);
}
const afterClicks = await fieldSnapshot(page);

// Force remount seed path.
await page.evaluate((nodeId) => {
  const pop = document.getElementById("nodeTraceDisplaySettingsPopover");
  if (pop) {
    delete pop.dataset.displaySettingsBodyType;
    delete pop.dataset.displaySettingsTargetNode;
    delete pop.dataset.displaySettingsType;
  }
  window.nodeGraphMvp.traceDisplaySettingsTargetNode = null;
  window.nodeGraphMvp.sceneContextTargetNode = nodeId;
  window.openNodeGraphTraceDisplaySettings(nodeId, { clientX: 500, clientY: 300 });
}, pick.nodeId);
await page.waitForTimeout(400);
const remount = await fieldSnapshot(page);

const regressionGuard = await page.evaluate(() => {
  const pop = document.getElementById("nodeTraceDisplaySettingsPopover");
  const input = pop?.querySelector?.("[data-trace-display-field]");
  if (!input) {
    return { ok: false, reason: "no field" };
  }
  const helper = window.nodeGraphTraceDisplayFieldIsEditing?.(input);
  const oldConfused = input.classList.contains("trace-display-field-editing")
    || input.readOnly === false;
  return {
    ok: true,
    helperEditing: helper,
    oldConfusedWouldSkipSeed: oldConfused,
    readOnly: input.readOnly,
  };
});

const pass = Boolean(
  first.open
  && !first.blank
  && first.fields.length > 0
  && first.emptyCount === 0
  && first.writableIdleCount === 0
  && first.missingReadonlyAttr.length === 0
  && afterClicks.emptyCount === 0
  && !afterClicks.blank
  && remount.emptyCount === 0
  && remount.writableIdleCount === 0
  && remount.fields.length > 0
  && regressionGuard.ok
  && regressionGuard.helperEditing === false
  && regressionGuard.oldConfusedWouldSkipSeed === false,
);

const report = { pick, first, afterClicks, remount, regressionGuard, errors, pass };
console.log(JSON.stringify(report, null, 2));
await browser.close();
process.exit(pass ? 0 : 1);
