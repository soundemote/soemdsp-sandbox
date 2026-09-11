/**
 * Browser smoke for Metamodule S1a–S1c (group mount, shell ports, ungroup).
 * Requires server on :8765. Run: node scripts/_meta_s1_browser_smoke.mjs
 */
import { chromium } from "playwright";

const URL = process.env.SANDBOX_URL || "http://127.0.0.1:8765/";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(String(err.message || err)));

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
const start = page.locator("#nodeBootStartButton");
if (await start.count()) {
  await start.click();
}
await page.waitForFunction(
  () => document.body?.classList?.contains("node-boot-ready")
    && typeof createNodeGraphPatchNode === "function"
    && typeof groupNodeGraphSelectionIntoMetamodule === "function",
  null,
  { timeout: 120000 },
);

const result = await page.evaluate(() => {
  const out = { ok: false, steps: [], fail: "" };
  const push = (s) => out.steps.push(s);
  try {
    if (typeof createNodeGraphPatchNode !== "function") {
      out.fail = "createNodeGraphPatchNode missing";
      return out;
    }
    if (typeof groupNodeGraphSelectionIntoMetamodule !== "function") {
      out.fail = "groupNodeGraphSelectionIntoMetamodule missing";
      return out;
    }
    if (typeof ungroupNodeGraphMetamoduleInPlace !== "function") {
      out.fail = "ungroupNodeGraphMetamoduleInPlace missing";
      return out;
    }

    const patch = nodeGraphMvp.patch;
    // Minimal child + outside so portalize creates shell jacks.
    const child = createNodeGraphPatchNode("gain", {
      id: "meta-smoke-child",
      gx: 6,
      gy: 4,
      alias: "ChildGain",
    });
    const outside = createNodeGraphPatchNode("gain", {
      id: "meta-smoke-out",
      gx: 10,
      gy: 4,
      alias: "OutsideGain",
    });
    patch.nodes.push(child, outside);
    nodeGraphMvp.activeNodes.add(child.id);
    nodeGraphMvp.activeNodes.add(outside.id);
    if (!Array.isArray(patch.connections)) patch.connections = [];
    patch.connections.push({
      sourceNode: child.id,
      sourcePort: "Out",
      destinationNode: outside.id,
      destinationPort: "In",
    });
    if (typeof commitNodeGraphPatch === "function") {
      commitNodeGraphPatch(patch, { topologyEdit: true, status: "meta smoke seed" });
    } else if (typeof applyNodeGraphPatchToDom === "function") {
      applyNodeGraphPatchToDom();
    }
    push("seeded child+outside");

    if (typeof selectNodeGraphItem === "function") {
      selectNodeGraphItem({ type: "node", id: child.id });
    } else {
      nodeGraphMvp.selected = { type: "node", id: child.id };
    }

    const meta = groupNodeGraphSelectionIntoMetamodule();
    if (!meta?.id) {
      out.fail = "group returned null";
      return out;
    }
    push(`grouped ${meta.id}`);

    const shellEl = document.querySelector(`.dsp-node[data-node="${meta.id}"]`);
    if (!shellEl || shellEl.hidden) {
      out.fail = "metamodule shell missing or hidden after group";
      return out;
    }
    push("shell visible in DOM");

    const childEl = document.querySelector(`.dsp-node[data-node="${child.id}"]`);
    if (childEl && !childEl.hidden) {
      out.fail = "owned child still visible on Root";
      return out;
    }
    push("child hidden on Root");

    const shellPorts = typeof nodeGraphMetamoduleShellPorts === "function"
      ? nodeGraphMetamoduleShellPorts(meta)
      : { inputs: [], outputs: [] };
    if (!shellPorts.outputs.includes("Out") && !shellPorts.outputs.length) {
      out.fail = `expected shell outputs from boundary, got ${JSON.stringify(shellPorts)}`;
      return out;
    }
    push(`shell ports ${JSON.stringify(shellPorts)}`);

    const outJack = shellEl.querySelector(`.node-port.output[data-node="${meta.id}"]`);
    if (!outJack) {
      out.fail = "shell has no output jack in DOM";
      return out;
    }
    push("shell output jack mounted");

    // Delete shell → ungroup
    if (typeof selectNodeGraphItem === "function") {
      selectNodeGraphItem({ type: "node", id: meta.id });
    } else {
      nodeGraphMvp.selected = { type: "node", id: meta.id };
    }
    if (typeof performNodeGraphDeleteSelection === "function") {
      performNodeGraphDeleteSelection(nodeGraphMvp.selected);
    } else if (typeof deleteSelectedNodeGraphItem === "function") {
      deleteSelectedNodeGraphItem();
    } else {
      out.fail = "no delete entrypoint";
      return out;
    }
    push("deleted/ungrouped shell");

    const metaGone = !nodeGraphPatchNode(meta.id);
    const childFree = nodeGraphPatchNode(child.id);
    if (!metaGone) {
      out.fail = "metamodule still in patch after delete";
      return out;
    }
    if (!childFree || childFree.ownerMetamoduleId) {
      out.fail = "child missing or still owned after ungroup";
      return out;
    }
    push("child restored to Root");

    const childEl2 = document.querySelector(`.dsp-node[data-node="${child.id}"]`);
    if (!childEl2 || childEl2.hidden) {
      // commit should remount; visibility sync may need a tick
      if (typeof applyNodeGraphPatchToDom === "function") applyNodeGraphPatchToDom();
      if (typeof nodeGraphSyncMetamoduleVisibilityToDom === "function") {
        nodeGraphSyncMetamoduleVisibilityToDom();
      }
    }
    const childEl3 = document.querySelector(`.dsp-node[data-node="${child.id}"]`);
    if (!childEl3 || childEl3.hidden) {
      out.fail = "child DOM still hidden after ungroup";
      return out;
    }
    push("child visible after ungroup");

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
  if (errors.length) console.error("pageerrors", errors);
  process.exit(1);
}
console.log("meta S1 browser smoke OK");
console.log(result.steps.join(" → "));
if (errors.length) {
  console.warn("pageerrors (non-fatal):", errors.slice(0, 5));
}
