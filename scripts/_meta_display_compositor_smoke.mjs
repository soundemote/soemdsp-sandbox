/**
 * Smoke: DisplayLayerCompositor additive blit + F-inside-meta toggle API.
 * Requires :8765. Run: node scripts/_meta_display_compositor_smoke.mjs
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
    && typeof createDisplayLayerCompositor === "function"
    && typeof nodeGraphMetamoduleToggleDisplays === "function"
    && typeof groupNodeGraphSelectionIntoMetamodule === "function",
  null,
  { timeout: 120000 },
);

const result = await page.evaluate(() => {
  const out = { ok: false, steps: [], fail: "" };
  const push = (s) => out.steps.push(s);
  try {
    const present = document.createElement("canvas");
    present.width = 64;
    present.height = 32;
    const a = document.createElement("canvas");
    a.width = 16;
    a.height = 16;
    const ac = a.getContext("2d");
    ac.fillStyle = "#ff0000";
    ac.fillRect(0, 0, 16, 16);
    const b = document.createElement("canvas");
    b.width = 16;
    b.height = 16;
    const bc = b.getContext("2d");
    bc.fillStyle = "#0000ff";
    bc.fillRect(0, 0, 16, 16);

    const comp = createDisplayLayerCompositor(present, { blend: "lighter", fit: "contain" });
    comp.setLayers([
      { id: "a", source: a, order: 0, blend: "lighter" },
      { id: "b", source: b, order: 1, blend: "lighter" },
    ]);
    const drawn = comp.paint();
    push(`compositor drew ${drawn}`);
    if (drawn !== 2) {
      out.fail = `expected 2 layers drawn, got ${drawn}`;
      return out;
    }
    const px = present.getContext("2d").getImageData(32, 16, 1, 1).data;
    push(`center rgba=${[...px].join(",")}`);
    // lighter red+blue → magenta-ish (both channels high)
    if (!(px[0] > 100 && px[2] > 100)) {
      out.fail = `expected additive magenta-ish pixel, got ${[...px]}`;
      return out;
    }

    // Synthetic meta + owned children — exercise toggle + subscribe without group UI.
    const patch = {
      nodes: [
        {
          id: "meta-disp-shell",
          type: "metamodule",
          metamodule: {
            boundary: [],
            displays: [
              { childId: "meta-disp-a", enabled: false, order: 0 },
              { childId: "meta-disp-b", enabled: false, order: 1 },
            ],
            paramVisibility: {},
          },
        },
        { id: "meta-disp-a", type: "gain", ownerMetamoduleId: "meta-disp-shell" },
        { id: "meta-disp-b", type: "gain", ownerMetamoduleId: "meta-disp-shell" },
      ],
      connections: [],
    };
    const toggled = nodeGraphMetamoduleToggleDisplays("meta-disp-shell", ["meta-disp-a", "meta-disp-b"], patch);
    push(`toggled changed=${toggled.changed} enabled=${toggled.enabledIds.join(",")}`);
    if (toggled.changed !== 2 || toggled.enabledIds.length !== 2) {
      out.fail = `toggle failed: ${JSON.stringify(toggled)}`;
      return out;
    }
    if (!nodeGraphMetamoduleChildIsMirrorSubscribed("meta-disp-a", patch)) {
      out.fail = "mirror subscribe miss for a";
      return out;
    }
    const toggled2 = nodeGraphMetamoduleToggleDisplays("meta-disp-shell", ["meta-disp-a"], patch);
    if (toggled2.enabledIds.length !== 1 || toggled2.enabledIds[0] !== "meta-disp-b") {
      out.fail = `expected only b enabled, got ${toggled2.enabledIds}`;
      return out;
    }
    push("toggle off ok");

    out.ok = true;
    return out;
  } catch (err) {
    out.fail = err?.stack || err?.message || String(err);
    return out;
  }
});

await browser.close();
console.log(JSON.stringify(result, null, 2));
if (!result.ok) {
  console.error("FAIL:", result.fail);
  process.exit(1);
}
console.log("OK");
