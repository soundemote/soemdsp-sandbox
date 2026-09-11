/**
 * Browser smoke: Meta In/Out → Root shell jacks + naming.
 * Requires :8765. Run: node scripts/_meta_shell_ports_smoke.mjs
 */
import { chromium } from "playwright";

const URL = process.env.SANDBOX_URL || "http://127.0.0.1:8765/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("pageerror", (err) => console.warn("pageerror", err.message));

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
const start = page.locator("#nodeBootStartButton");
if (await start.count()) await start.click();
await page.waitForFunction(
  () => document.body?.classList?.contains("node-boot-ready")
    && typeof groupNodeGraphSelectionIntoMetamodule === "function"
    && typeof nodeGraphMetamoduleRefreshShellFromBoundary === "function",
  null,
  { timeout: 120000 },
);

const result = await page.evaluate(() => {
  const out = { ok: false, steps: [], fail: "" };
  const push = (s) => out.steps.push(s);
  try {
    const child = createNodeGraphPatchNode("gain", {
      id: "shell-smoke-child",
      gx: 6,
      gy: 4,
      alias: "Child",
    });
    nodeGraphMvp.patch.nodes.push(child);
    nodeGraphMvp.activeNodes.add(child.id);
    commitNodeGraphPatch(nodeGraphMvp.patch, { topologyEdit: true, record: false, status: "seed" });
    if (typeof setNodeGraphSelection === "function") {
      setNodeGraphSelection({ type: "node", id: child.id });
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

    const portalId = showNodeGraphModule("metamoduleOut", null, {
      status: "meta out",
      record: false,
    });
    if (!portalId) {
      out.fail = "place Meta Out failed";
      return out;
    }
    push(`placed ${portalId}`);

    // Wire child Out → Meta Out In (inner).
    const okWire = connectNodeGraphPorts(child.id, "Out", portalId, "In", { autoPair: false });
    if (!okWire) {
      out.fail = "wire child→Meta Out failed";
      return out;
    }
    push("wired child→portal");

    exitNodeGraphMetamoduleViewToRoot();
    push("exited root");

    const metaNow = nodeGraphPatchNode(meta.id);
    const ports = nodeGraphMetamoduleShellPorts(metaNow);
    if (!ports.outputs.includes("Out") && !ports.outputs.length) {
      out.fail = `expected shell outputs, got ${JSON.stringify(ports)}`;
      return out;
    }
    // Connected child port is Out → shell should prefer "Out" (or alias).
    if (!ports.outputs.some((p) => p === "Out" || p.startsWith("Out"))) {
      out.fail = `shell outputs missing Out-derived name: ${ports.outputs.join(",")}`;
      return out;
    }
    push(`shell outs ${ports.outputs.join(",")}`);

    const shellEl = document.querySelector(`.dsp-node[data-node="${meta.id}"]`);
    if (!shellEl || shellEl.hidden) {
      out.fail = "shell hidden on Root";
      return out;
    }
    const jack = shellEl.querySelector(`.node-port.output[data-port="Out"]`)
      || [...shellEl.querySelectorAll(".node-port.output")].find((el) =>
        el.dataset.port && el.dataset.port !== "Poly"
      );
    if (!jack) {
      out.fail = "no boundary output jack on shell DOM";
      return out;
    }
    push(`jack ${jack.dataset.port}`);

    // Alias mirror
    const portal = nodeGraphPatchNode(portalId);
    portal.alias = "Cutoff";
    nodeGraphMetamoduleRefreshShellFromBoundary(meta.id);
    const ports2 = nodeGraphMetamoduleShellPorts(nodeGraphPatchNode(meta.id));
    if (!ports2.outputs.includes("Cutoff")) {
      out.fail = `alias not mirrored: ${ports2.outputs.join(",")}`;
      return out;
    }
    push("alias Cutoff mirrored");

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
  console.error(result.steps);
  process.exit(1);
}
console.log("meta shell ports smoke OK");
console.log(result.steps.join(" → "));
