const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const logs = [];
  page.on("console", (msg) => {
    const t = msg.type();
    if (t === "error" || t === "warning") {
      const line = `[console.${t}] ${msg.text()}`;
      logs.push(line);
      console.log(line);
    }
  });
  page.on("pageerror", (err) => {
    const line = `[pageerror] ${err.message}`;
    logs.push(line);
    console.log(line);
  });

  await page.goto("http://127.0.0.1:8765/", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  // Boot gate: click Start so deferred scripts activate.
  const start = page.locator("#nodeBootStartButton");
  if (await start.count()) {
    await start.click({ timeout: 10000 });
  } else {
    await page.evaluate(() => {
      if (typeof beginNodeBootLoadSequence === "function") {
        beginNodeBootLoadSequence();
      }
    });
  }

  await page.waitForFunction(
    () =>
      document.body?.dataset?.nodeBootFinished
      || typeof window.createNodeGraphExpoPluckEnvelopeDisplay === "function",
    null,
    { timeout: 120000 },
  );
  await page.waitForTimeout(1500);

  const boot = await page.evaluate(() => {
    // nodeGraphModuleDefinitions is a page-global const (not on window).
    let layout = null;
    let hasDef = false;
    try {
      // eslint-disable-next-line no-undef
      hasDef = !!(typeof nodeGraphModuleDefinitions !== "undefined"
        && nodeGraphModuleDefinitions
        && nodeGraphModuleDefinitions.expoPluckEnvelope);
      // eslint-disable-next-line no-undef
      layout = nodeGraphModuleDefinitions?.expoPluckEnvelope?.layout || null;
    } catch (_) {
      hasDef = false;
    }
    return {
      finished: document.body?.dataset?.nodeBootFinished || null,
      hasCreate: typeof window.createNodeGraphExpoPluckEnvelopeDisplay === "function",
      hasDraw: typeof window.drawNodeGraphExpoPluckEnvelopeDisplay === "function",
      hasPreview: typeof window.expoPluckEnvelopePreviewCurve === "function",
      hasShow: typeof window.showNodeGraphModule === "function",
      hasDef,
      layout,
    };
  });
  console.log("BOOT", JSON.stringify(boot));
  if (!boot.hasCreate || !boot.hasShow) {
    throw new Error(`boot incomplete: ${JSON.stringify(boot)}`);
  }

  const added = await page.evaluate(() => {
    try {
      if (typeof window.showNodeGraphModule !== "function") {
        return { ok: false, err: "no showNodeGraphModule" };
      }
      const id = window.showNodeGraphModule("expoPluckEnvelope", null, {
        status: "verify expo pluck face",
        record: false,
        skipLivePlan: true,
      });
      return { ok: Boolean(id), id: String(id || "") };
    } catch (e) {
      return { ok: false, err: String(e && e.message || e) };
    }
  });
  console.log("ADD", JSON.stringify(added));
  if (!added.ok) throw new Error(`add failed: ${JSON.stringify(added)}`);

  await page.waitForSelector(".node-expo-pluck-display", { timeout: 15000 });
  await page.waitForTimeout(800);

  // Force a paint in case layout settled late.
  await page.evaluate(() => {
    const el = document.querySelector(".node-expo-pluck-display");
    if (el && typeof window.drawNodeGraphExpoPluckEnvelopeDisplay === "function") {
      el._expoPluckForceDraw = true;
      el._expoPluckLaidOut = false;
      el._expoPluckCurveSig = "";
      window.drawNodeGraphExpoPluckEnvelopeDisplay(el);
    }
  });
  await page.waitForTimeout(200);

  const face = await page.evaluate(() => {
    const el = document.querySelector(".node-expo-pluck-display");
    const canvas = document.querySelector(".node-expo-pluck-canvas");
    let pixels = null;
    if (canvas && canvas.width > 0 && canvas.height > 0) {
      const ctx = canvas.getContext("2d");
      const w = canvas.width;
      const h = canvas.height;
      const data = ctx.getImageData(0, 0, w, h).data;
      let nonZero = 0;
      let whiteish = 0;
      let cyanish = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        if (a > 10 && r + g + b > 20) nonZero += 1;
        if (a > 200 && r > 220 && g > 220 && b > 220) whiteish += 1;
        if (a > 100 && b > 180 && g > 150 && r < 120) cyanish += 1;
      }
      pixels = { w, h, nonZero, whiteish, cyanish };
    }
    return {
      faceCount: document.querySelectorAll(".node-expo-pluck-display").length,
      canvasCount: document.querySelectorAll(".node-expo-pluck-canvas").length,
      cssW: el ? el.clientWidth : 0,
      cssH: el ? el.clientHeight : 0,
      laidOut: el ? !!el._expoPluckLaidOut : false,
      hasCurve: el ? !!el._expoPluckCurveCanvas : false,
      previewPts: el?._expoPluckPreview?.points?.length || 0,
      pixels,
      nodeCount: document.querySelectorAll(
        '.dsp-node[data-type="expoPluckEnvelope"]',
      ).length,
    };
  });
  console.log("FACE", JSON.stringify(face));

  const preview = await page.evaluate(() => {
    const t0 = performance.now();
    const out = window.expoPluckEnvelopePreviewCurve(
      { attack: 0.01, decay: 5, frequency: 110, damping: 0.2, level: 1 },
      128,
      800,
    );
    return {
      ms: performance.now() - t0,
      points: out?.points?.length || 0,
      attackEndT: out?.attackEndT,
      y0: out?.points?.[0]?.y,
      yPeak: Math.max(...(out?.points || []).map((p) => p.y)),
      yEnd: out?.points?.[out.points.length - 1]?.y,
    };
  });
  console.log("PREVIEW", JSON.stringify(preview));

  await page.screenshot({
    path: "C:/Users/argit/Documents/_PROGRAMMING/soemdsp-sandbox/expo-pluck-face-verify.png",
    fullPage: false,
  });
  console.log("SCREENSHOT ok");

  const ok =
    face.faceCount >= 1
    && face.canvasCount >= 1
    && face.cssW >= 8
    && face.cssH >= 8
    && face.laidOut
    && face.hasCurve
    && face.previewPts >= 48
    && face.pixels
    && face.pixels.cyanish > 10
    && preview.points >= 48
    && preview.yPeak > 0.9
    && preview.ms < 50;

  if (!ok) {
    throw new Error(`verify failed face=${JSON.stringify(face)} preview=${JSON.stringify(preview)}`);
  }
  console.log("PASS expo pluck face curve+cache+dot plumbing");
  await browser.close();
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
