/**
 * Browser smoke: TitleBarAndPorts Meta In/Out + place-inside ownership.
 * Requires :8765. Run: node scripts/_meta_title_bar_ports_smoke.mjs
 */
import { chromium } from "playwright";

const URL = process.env.SANDBOX_URL || "http://127.0.0.1:8765/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(String(err.message || err)));

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
const start = page.locator("#nodeBootStartButton");
if (await start.count()) await start.click();
await page.waitForFunction(
  () => document.body?.classList?.contains("node-boot-ready")
    && typeof showNodeGraphModule === "function"
    && typeof groupNodeGraphSelectionIntoMetamodule === "function",
  null,
  { timeout: 120000 },
);

const result = await page.evaluate(() => {
  const out = { ok: false, steps: [], fail: "" };
  const push = (s) => out.steps.push(s);
  try {
    const chrome = typeof nodeGraphModuleChromeLayoutForType === "function"
      ? nodeGraphModuleChromeLayoutForType("metamoduleIn")
      : "";
    if (chrome !== "TitleBarAndPorts") {
      out.fail = `metamoduleIn chrome=${chrome}, expected TitleBarAndPorts`;
      return out;
    }
    push("chrome TitleBarAndPorts");

    // Root refuse
    const refused = showNodeGraphModule("metamoduleIn");
    if (refused) {
      out.fail = "Meta In should refuse on Root";
      return out;
    }
    push("Root refuse Meta In");

    const child = createNodeGraphPatchNode("gain", {
      id: "tbp-child",
      gx: 6,
      gy: 4,
      alias: "Child",
    });
    nodeGraphMvp.patch.nodes.push(child);
    nodeGraphMvp.activeNodes.add(child.id);
    commitNodeGraphPatch(nodeGraphMvp.patch, { topologyEdit: true, status: "tbp seed" });
    if (typeof setNodeGraphSelection === "function") {
      setNodeGraphSelection({ type: "node", id: child.id });
    } else if (typeof selectNodeGraphItem === "function") {
      selectNodeGraphItem({ type: "node", id: child.id });
    } else {
      nodeGraphMvp.selected = { type: "node", id: child.id };
    }
    const meta = groupNodeGraphSelectionIntoMetamodule();
    if (!meta?.id) {
      out.fail = "group failed";
      return out;
    }
    push(`grouped ${meta.id}`);
    enterNodeGraphMetamoduleView(meta.id);
    push("entered meta");

    const portalId = showNodeGraphModule("metamoduleIn", null, {
      status: "meta in added",
      record: false,
    });
    if (!portalId) {
      out.fail = "Meta In place inside returned empty";
      return out;
    }
    const portal = nodeGraphPatchNode(portalId);
    if (!portal || portal.ownerMetamoduleId !== meta.id) {
      out.fail = `portal ownership missing: ${JSON.stringify(portal)}`;
      return out;
    }
    push(`placed ${portalId} owned`);

    const el = document.querySelector(`.dsp-node[data-node="${portalId}"]`);
    if (!el || el.hidden) {
      out.fail = "Meta In DOM hidden after place inside";
      return out;
    }
    if (!el.classList.contains("chrome-layout-title-bar-and-ports")
      && !el.classList.contains("chrome-layout-c")) {
      out.fail = `missing TitleBarAndPorts class: ${el.className}`;
      return out;
    }
    const io = el.querySelector(".dsp-node-io-section");
    if (!io) {
      out.fail = "no .dsp-node-io-section on Meta In";
      return out;
    }
    const facePorts = el.querySelector(".node-metamodule-boundary-face .node-port");
    if (facePorts) {
      out.fail = "legacy boundary-face ports still present";
      return out;
    }
    const rect = el.getBoundingClientRect();
    if (!(rect.height > 24)) {
      out.fail = `Meta In height too small: ${rect.height}`;
      return out;
    }
    push(`layout ok h=${Math.round(rect.height)}`);

    const metaNow = nodeGraphPatchNode(meta.id);
    const boundary = metaNow?.metamodule?.boundary || [];
    if (!boundary.some((b) => b && b.id === portalId)) {
      out.fail = `boundary missing shop Meta In: ${JSON.stringify(boundary)}`;
      return out;
    }
    push("boundary registered");

    out.ok = true;
    return out;
  } catch (err) {
    out.fail = String(err?.stack || err);
    return out;
  }
});

await browser.close();
if (!result.ok) {
  console.error("FAIL", result.fail);
  console.error("steps", result.steps);
  if (errors.length) console.error("pageerrors", errors.slice(0, 8));
  process.exit(1);
}
console.log("TitleBarAndPorts Meta In smoke OK");
console.log(result.steps.join(" → "));
if (errors.length) console.warn("pageerrors", errors.slice(0, 5));
