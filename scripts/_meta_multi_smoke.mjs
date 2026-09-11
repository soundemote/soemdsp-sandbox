/**
 * Browser smoke: two independent metamodules stay separate; copy refused; repair non-stealing.
 * Requires :8765. Run: node scripts/_meta_multi_smoke.mjs
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
    && typeof nodeGraphRepairMetamoduleOwnership === "function",
  null,
  { timeout: 120000 },
);

const result = await page.evaluate(() => {
  const out = { ok: false, steps: [], fail: "" };
  const push = (s) => out.steps.push(s);
  try {
    const makeChild = (id, gx) => {
      const n = createNodeGraphPatchNode("gain", { id, gx, gy: 4, alias: id });
      nodeGraphMvp.patch.nodes.push(n);
      nodeGraphMvp.activeNodes.add(id);
      return n;
    };
    makeChild("multi-a", 2);
    makeChild("multi-b", 8);
    commitNodeGraphPatch(nodeGraphMvp.patch, { topologyEdit: true, record: false, status: "seed" });

    const select = (id) => {
      if (typeof setNodeGraphSelection === "function") setNodeGraphSelection({ type: "node", id });
      else nodeGraphMvp.selected = { type: "node", id };
    };

    select("multi-a");
    const metaA = groupNodeGraphSelectionIntoMetamodule();
    if (!metaA?.id) {
      out.fail = "group A failed";
      return out;
    }
    push(`metaA ${metaA.id}`);

    select("multi-b");
    const metaB = groupNodeGraphSelectionIntoMetamodule();
    if (!metaB?.id || metaB.id === metaA.id) {
      out.fail = `group B failed: ${metaB?.id}`;
      return out;
    }
    push(`metaB ${metaB.id}`);

    const childA = nodeGraphPatchNode("multi-a");
    const childB = nodeGraphPatchNode("multi-b");
    if (childA.ownerMetamoduleId !== metaA.id || childB.ownerMetamoduleId !== metaB.id) {
      out.fail = `owners wrong: A=${childA.ownerMetamoduleId} B=${childB.ownerMetamoduleId}`;
      return out;
    }
    push("owners distinct");

    enterNodeGraphMetamoduleView(metaA.id);
    const visA = (id) => {
      const n = nodeGraphPatchNode(id);
      return typeof nodeGraphModuleShouldBeVisible === "function"
        ? nodeGraphModuleShouldBeVisible(n)
        : true;
    };
    if (!visA("multi-a") || visA("multi-b")) {
      out.fail = "inside A: visibility wrong";
      return out;
    }
    push("enter A ok");

    exitNodeGraphMetamoduleViewToRoot();
    enterNodeGraphMetamoduleView(metaB.id);
    if (visA("multi-a") || !visA("multi-b")) {
      out.fail = "inside B: visibility wrong";
      return out;
    }
    push("enter B ok");
    exitNodeGraphMetamoduleViewToRoot();

    // Copy shell must refuse
    const before = nodeGraphMvp.patch.nodes.length;
    const copied = copyNodeGraphModule(nodeGraphPatchNode(metaA.id));
    if (copied) {
      out.fail = `copy metamodule should refuse, got ${copied}`;
      return out;
    }
    if (nodeGraphMvp.patch.nodes.length !== before) {
      out.fail = "copy mutated patch";
      return out;
    }
    push("copy refused");

    // Corrupt: metaB also lists multi-a in displays — repair must not steal
    const metaBNode = nodeGraphPatchNode(metaB.id);
    nodeGraphEnsureMetamodulePayload(metaBNode).displays.push({
      childId: "multi-a",
      enabled: false,
      order: 99,
    });
    nodeGraphRepairMetamoduleOwnership();
    if (nodeGraphPatchNode("multi-a").ownerMetamoduleId !== metaA.id) {
      out.fail = "repair stole multi-a to metaB";
      return out;
    }
    const stillLists = (metaBNode.metamodule.displays || []).some((d) => d?.childId === "multi-a");
    if (stillLists) {
      out.fail = "repair left duplicate display listing on metaB";
      return out;
    }
    push("repair non-stealing");

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
console.log("meta multi smoke OK");
console.log(result.steps.join(" → "));
