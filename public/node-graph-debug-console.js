// In-app debug console for the sandbox. Adds a 🐞 button next to Download that
// opens a log panel. Red in debug builds, neutral in release (never hidden).
// Mirrors the C++ soemdsp::debug API from sehelper.hpp
// (LOG / WARN / CHECK / FAIL / STOP / BADVAL / WITHINRANGE / WITHINSIZE) as
// window.SE, captures uncaught errors + console.warn/error, and can watch the
// live-audio parameter stream to show what smoothing the engine actually gets.
//
// Self-contained on purpose: the only other edit is the <script> tag in
// index.html. Everything here is guarded so a failure never breaks the app.
(() => {
  "use strict";
  if (window.__seDebugConsole) return;

  const CAP = 4000;
  // Survives F5 in the same tab. localStorage keeps a "last unload" dump so a
  // hard crash / new tab can still recover the previous session's log.
  const STORAGE_SESSION = "seDebugLog.session.v1";
  const STORAGE_LAST_UNLOAD = "seDebugLog.lastUnload.v1";
  const entries = [];
  let seq = 0;
  let errorCount = 0;
  let paused = false;
  let filter = "all";
  let search = "";
  let persistTimer = 0;
  let restoring = false;
  // Wall-clock of last live push — drives ch4os-style [+Nms] deltas.
  let lastPushTs = 0;
  const els = {};

  /**
   * Human-readable clock (ch4os formatLogTime): "2:09:25 AM"
   * 12-hour, hour not zero-padded; seconds kept for dense bursts.
   */
  function formatLogTime(ts, sequence = 0) {
    const d = new Date(Number.isFinite(ts) ? ts : Date.now());
    if (Number.isNaN(d.getTime())) {
      return `t${sequence}`;
    }
    let h = d.getHours();
    const m = d.getMinutes();
    const s = d.getSeconds();
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12;
    if (h === 0) h = 12;
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    return `${h}:${mm}:${ss} ${ampm}`;
  }

  function formatDelta(deltaMs) {
    const d = Math.max(0, Number(deltaMs) || 0);
    return d >= 1000 ? `+${(d / 1000).toFixed(1)}s` : `+${Math.round(d)}ms`;
  }

  function deltaColor(deltaMs) {
    const d = Math.max(0, Number(deltaMs) || 0);
    if (d >= 1000) return "#f87171";
    if (d >= 100) return "#fbbf24";
    return "#4b5563";
  }

  function stampIso() {
    try { return new Date().toISOString(); } catch (_) { return String(Date.now()); }
  }

  // Parse the first stack frame outside this file -> "file:line".
  function callerLoc() {
    const stack = (new Error().stack || "").split("\n");
    for (let i = 2; i < stack.length; i++) {
      const line = stack[i] || "";
      if (line.includes("node-graph-debug-console")) continue;
      const m = line.match(/([^/\\ ()]+\.js):(\d+):\d+/);
      if (m) return `${m[1]}:${m[2]}`;
      return line.trim().replace(/^at\s+/, "").slice(0, 80);
    }
    return "";
  }

  const LEVELS = {
    LOG: { tag: "LOG", color: "#8fd0ff", err: false },
    INFO: { tag: "INFO", color: "#9aa4b2", err: false },
    WARN: { tag: "WARN", color: "#ffcf6b", err: false },
    FAIL: { tag: "FAIL", color: "#ff6b6b", err: true },
    SMOOTH: { tag: "SMTH", color: "#b184ff", err: false },
    ERROR: { tag: "ERR", color: "#ff5555", err: true },
  };

  function push(level, msg, loc) {
    if (paused && level !== "ERROR" && level !== "FAIL") {
      // Still persist critical failures even while paused? Keep old pause
      // semantics: push always records; pause only freezes live UI follow.
    }
    const lv = LEVELS[level] || LEVELS.LOG;
    const ts = Date.now();
    const delta = lastPushTs ? Math.max(0, ts - lastPushTs) : 0;
    lastPushTs = ts;
    const id = ++seq;
    const e = {
      id,
      // ch4os-style clock for display + copy (AM/PM).
      t: formatLogTime(ts, id),
      ts,
      delta,
      level,
      loc: loc || "",
      msg: String(msg),
    };
    // Newest first: unshift so the array and the panel read top→bottom as new→old.
    entries.unshift(e);
    if (entries.length > CAP) entries.length = CAP;
    if (lv.err) errorCount++;
    if (!restoring) {
      render(e);
      updateBadge();
      schedulePersist();
    }
    return e;
  }

  function serializeLogPayload(reason = "") {
    return {
      v: 2,
      reason: String(reason || ""),
      savedAt: stampIso(),
      seq,
      errorCount,
      entries: entries.slice(0, CAP).map((e) => ({
        id: e.id,
        t: e.t,
        ts: e.ts || 0,
        delta: e.delta || 0,
        level: e.level,
        loc: e.loc || "",
        msg: e.msg,
      })),
    };
  }

  function persistLogNow(reason = "tick") {
    try {
      const payload = serializeLogPayload(reason);
      const text = JSON.stringify(payload);
      try { sessionStorage.setItem(STORAGE_SESSION, text); } catch (_) {}
      // Always mirror to last-unload key on explicit flush reasons so a refresh
      // that nukes session mid-write still leaves a recoverable dump.
      if (reason === "pagehide" || reason === "beforeunload" || reason === "freeze" || reason === "manual") {
        try { localStorage.setItem(STORAGE_LAST_UNLOAD, text); } catch (_) {}
      }
    } catch (_) {}
  }

  function schedulePersist() {
    if (persistTimer || restoring) return;
    persistTimer = window.setTimeout(() => {
      persistTimer = 0;
      persistLogNow("tick");
    }, 250);
  }

  function readStoredLog(key, store) {
    try {
      const raw = store.getItem(key);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.entries)) return null;
      return data;
    } catch (_) {
      return null;
    }
  }

  function restorePersistedLog() {
    restoring = true;
    try {
      const session = readStoredLog(STORAGE_SESSION, sessionStorage);
      const lastUnload = readStoredLog(STORAGE_LAST_UNLOAD, localStorage);
      // Prefer same-tab session (continues across F5). Fall back to last unload.
      const data = (session?.entries?.length ? session : null)
        || (lastUnload?.entries?.length ? lastUnload : null);
      if (!data?.entries?.length) return 0;

      // Payload is newest-first. Map then recompute deltas oldest→newest so
      // [+Nms] stays meaningful after a restore without stored deltas.
      const restored = data.entries
        .filter((e) => e && typeof e.msg === "string")
        .slice(0, CAP)
        .map((e) => {
          const id = ++seq;
          const ts = Number(e.ts) || 0;
          return {
            id,
            t: e.t && /AM|PM/i.test(String(e.t))
              ? String(e.t)
              : (ts ? formatLogTime(ts, id) : String(e.t || "?")),
            ts,
            delta: Number(e.delta) || 0,
            level: LEVELS[e.level] ? e.level : "LOG",
            loc: String(e.loc || ""),
            msg: String(e.msg),
            restored: true,
          };
        });
      // Recompute deltas in chronological order (oldest first).
      const chrono = restored.slice().reverse();
      let prevTs = 0;
      for (const e of chrono) {
        if (e.ts) {
          e.delta = prevTs ? Math.max(0, e.ts - prevTs) : 0;
          e.t = formatLogTime(e.ts, e.id);
          prevTs = e.ts;
        }
      }
      if (prevTs) lastPushTs = prevTs;
      // Stored / restored list is newest-first for the panel.
      for (let i = restored.length - 1; i >= 0; i--) {
        entries.unshift(restored[i]);
      }
      if (entries.length > CAP) entries.length = CAP;
      errorCount = entries.reduce((n, e) => n + (LEVELS[e.level]?.err ? 1 : 0), 0);
      const from = session?.entries?.length ? "sessionStorage (same tab)" : "localStorage lastUnload";
      const when = data.savedAt || "?";
      const why = data.reason || "unknown";
      // Marker stays at top (newest).
      push(
        "INFO",
        `restored ${restored.length} log lines from before refresh — ${from}, savedAt=${when}, reason=${why}. Clear wipes storage.`,
        "debug-persist",
      );
      return restored.length;
    } catch (_) {
      return 0;
    } finally {
      restoring = false;
      updateBadge();
      // Don't schedulePersist during restore loop; one flush after.
      persistLogNow("restore");
    }
  }

  function installPersistLifecycle() {
    const flush = (reason) => {
      try {
        if (persistTimer) {
          window.clearTimeout(persistTimer);
          persistTimer = 0;
        }
        persistLogNow(reason);
      } catch (_) {}
    };
    // pagehide is the reliable one for refresh / tab close / mobile.
    window.addEventListener("pagehide", () => flush("pagehide"));
    window.addEventListener("beforeunload", () => flush("beforeunload"));
    window.addEventListener("freeze", () => flush("freeze"));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush("hidden");
    });
  }

  // ---- sehelper.hpp-style API ----------------------------------------------
  const SE = {
    LOG: (msg) => push("LOG", msg || "FAILURE: no error message provided", callerLoc()),
    INFO: (msg) => push("INFO", msg, callerLoc()),
    WARN: (cond, msg) => { if (!cond) push("WARN", msg, callerLoc()); return cond; },
    CHECK: (cond, msg) => { if (!cond) { push("FAIL", msg || "CHECK failed", callerLoc()); try { console.assert(false, msg); } catch (_) {} } return cond; },
    ERROR: (msg, loc = callerLoc()) => push("ERROR", msg || "ERROR", loc),
    FAIL: (msg) => push("FAIL", msg || "FAIL", callerLoc()),
    STOP: (msg) => push("FAIL", msg || "DEBUG BREAK", callerLoc()),
    WITHINSIZE: (value, container, msg) => {
      const n = container && container.length != null ? container.length : container && container.size;
      if (!(value >= 0 && value < n)) push("FAIL", msg || `Index out of bounds: ${value} / ${n}`, callerLoc());
    },
    WITHINRANGE: (value, min, max, name) => {
      if (!(value >= min && value <= max)) push("FAIL", `${name || "value"} out of range: ${value} not in [${min}, ${max}]`, callerLoc());
    },
    // exploded (>1e9) / inf / nan / denormal — matches BADVAL in sehelper.hpp
    BADVAL: (val, name) => {
      const v = Number(val);
      let bad = null;
      if (!(Math.abs(v) < 999999999)) bad = "exploded";
      else if (!Number.isFinite(v)) bad = Number.isNaN(v) ? "NaN" : "inf";
      else if (v !== 0 && Math.abs(v) < 2.2250738585072014e-308) bad = "denormalized";
      if (bad) push("FAIL", `${name || "number"} is ${bad}: ${val}`, callerLoc());
      return bad === null;
    },
    open: () => showPanel(true),
    close: () => showPanel(false),
    clear: clearLog,
    entries: () => entries.slice(),
    /** Force-write log to sessionStorage + localStorage (also runs on refresh). */
    dump: (reason = "manual") => {
      persistLogNow(reason || "manual");
      return { session: STORAGE_SESSION, lastUnload: STORAGE_LAST_UNLOAD, count: entries.length };
    },
    storageKeys: () => ({ session: STORAGE_SESSION, lastUnload: STORAGE_LAST_UNLOAD }),
    buildMode: () => seBuildMode(),
    smoothingWatch: (on) => setSmoothingWatch(on),
    devMode: (on) => {
      try { localStorage.setItem("seDebug", on ? "1" : "0"); } catch (_) {}
      if (on) { injectStyles(); buildButton(); buildPanel(); showPanel(true); }
      else if (els.panel) { els.panel.remove(); els.btn && els.btn.remove(); els.panel = null; els.btn = null; }
    },
  };
  window.SE = SE;
  window.__seDebugConsole = SE;

  // ---- capture uncaught errors + console warn/error ------------------------
  window.addEventListener("error", (ev) => {
    if (ev?.message) push("ERROR", `${ev.message}`, `${(ev.filename || "").split("/").pop()}:${ev.lineno || "?"}`);
  });
  window.addEventListener("unhandledrejection", (ev) => {
    push("ERROR", `unhandled rejection: ${ev?.reason?.message || ev?.reason || "?"}`, "");
  });
  ["warn", "error"].forEach((k) => {
    const orig = console[k].bind(console);
    console[k] = (...args) => {
      try {
        const text = args.map((a) => (typeof a === "string" ? a : safeStringify(a))).join(" ");
        // Skip our own re-logging noise.
        if (!text.includes("[se-debug]")) push(k === "error" ? "ERROR" : "WARN", text, "console");
      } catch (_) {}
      return orig(...args);
    };
  });
  function safeStringify(v) { try { return JSON.stringify(v); } catch (_) { return String(v); } }

  // ---- live-audio smoothing watch ------------------------------------------
  let smoothingWatch = false;
  let hookedPort = null;
  let origPost = null;
  let watchTimer = 0;

  function installPortHook() {
    const port = window.nodeGraphMvp?.live?.node?.port;
    if (!port || port === hookedPort) return;
    uninstallPortHook();
    hookedPort = port;
    origPost = port.postMessage.bind(port);
    port.postMessage = (msg, ...rest) => {
      try {
        if (smoothingWatch && msg) {
          if (msg.type === "setParams") summarizeSetParams(msg);
          else if (msg.type === "setPlan") {
            push("SMOOTH", "⚠ PLAN rebuild sent — every smoother is reset to its target (instant snap). If these flood while you drag, that is why smoothing is not heard.", "live-plan");
          }
        }
      } catch (_) {}
      return origPost(msg, ...rest);
    };
  }
  function uninstallPortHook() {
    if (hookedPort && origPost) { try { hookedPort.postMessage = origPost; } catch (_) {} }
    hookedPort = null; origPost = null;
  }
  let lastSummaryKey = "";
  function summarizeSetParams(msg) {
    const L = window.nodeGraphMvp?.live || {};
    const g = Number(msg.autoSmoothingSeconds);
    const snap = [];
    const modes = {};
    for (const n of msg.nodes || []) {
      for (const [k, m] of Object.entries(n.paramMeta || {})) {
        const mode = m && m.smoothingMode;
        modes[mode] = (modes[mode] || 0) + 1;
        if (mode === "off" || (m && m.linearSmoothing === false) || (mode === "internal" && !m.smoothingSeconds)) {
          snap.push(`${n.type}.${k}${m && m.linearSmoothing === false ? "(linOFF)" : `(${mode})`}`);
        }
      }
    }
    const modeStr = Object.entries(modes).map(([k, v]) => `${k}:${v}`).join(" ");
    const key = `${(g * 1000).toFixed(1)}|${modeStr}|${snap.length}`;
    if (key === lastSummaryKey) return; // only log when something changes
    lastSummaryKey = key;
    push("SMOOTH",
      `global=${(g * 1000).toFixed(1)}ms manual=${L.autoSmoothingManual} worklet=${L.usesWorklet} | modes{${modeStr}}` +
      (snap.length ? ` | SNAP: ${snap.slice(0, 8).join(", ")}${snap.length > 8 ? "…" : ""}` : ""),
      "live-params");
  }
  function setSmoothingWatch(on) {
    smoothingWatch = !!on;
    if (els.watchBtn) {
      els.watchBtn.setAttribute("aria-pressed", smoothingWatch ? "true" : "false");
      els.watchBtn.textContent = smoothingWatch ? "◉ smoothing" : "○ smoothing";
    }
    if (smoothingWatch) {
      lastSummaryKey = "";
      installPortHook();
      if (!watchTimer) watchTimer = window.setInterval(installPortHook, 1000); // re-hook if the engine restarts
      SE.INFO("smoothing watch ON — fine-tune a slider; a line prints when the sent smoothing changes.");
    } else {
      if (watchTimer) { window.clearInterval(watchTimer); watchTimer = 0; }
      uninstallPortHook();
      SE.INFO("smoothing watch OFF");
    }
  }

  // ---- UI -------------------------------------------------------------------
  function injectStyles() {
    if (document.getElementById("seDebugStyles")) return;
    const s = document.createElement("style");
    s.id = "seDebugStyles";
    s.textContent = `
      #seDebugButton{width:40px;height:auto;align-self:stretch;flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;
        font-size:17px;line-height:1;border:1px solid #c0392b;border-radius:7px;cursor:pointer;
        background:linear-gradient(#e74c3c,#c0392b);color:#fff;box-shadow:0 1px 3px rgba(0,0,0,.4);position:relative;padding:0;}
      #seDebugButton:hover{filter:brightness(1.12);}
      #seDebugButton[aria-pressed="true"]{outline:2px solid #fff3;}
      /* Release build: same button, neutral instead of alarm-red -- see seBuildMode(). */
      #seDebugButton.se-release-build{border-color:#3a4250;background:linear-gradient(#4a5262,#343b48);}
      #seDebugButton .se-badge{position:absolute;top:-6px;right:-6px;min-width:16px;height:16px;padding:0 3px;border-radius:9px;
        background:#000;color:#ff6b6b;font:700 10px/16px ui-monospace,monospace;text-align:center;display:none;border:1px solid #ff6b6b;}
      #seDebugPanel{position:fixed;z-index:2147483646;right:14px;bottom:14px;width:640px;height:380px;min-width:340px;min-height:200px;
        display:none;flex-direction:column;background:#11141a;color:#d8dee9;border:1px solid #2a2f3a;border-radius:10px;
        box-shadow:0 10px 40px rgba(0,0,0,.55);overflow:hidden;/* custom SE grip — not CSS resize (that scrolls the log) */
        font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;}
      #seDebugPanel.se-open{display:flex;}
      #seDebugPanel .se-head{display:flex;align-items:center;gap:6px;padding:6px 8px;background:#171b22;border-bottom:1px solid #2a2f3a;cursor:move;user-select:none;flex:0 0 auto;}
      #seDebugPanel .se-title{font-weight:700;color:#fff;margin-right:auto;font-size:17px;}
      #seDebugPanel button.se-bug{background:none;border:1px solid #c0392b;border-radius:7px;cursor:pointer;
        font-size:24px;line-height:1.15;padding:1px 5px;}
      #seDebugPanel button.se-bug:hover{background:#2a1518;filter:brightness(1.2);}
      #seDebugPanel button.se-bug:active{transform:scale(0.92);}
      #seDebugPanel button.se-tool{background:#232936;color:#cdd6e4;border:1px solid #313a4a;border-radius:5px;padding:2px 8px;cursor:pointer;font:inherit;}
      #seDebugPanel button.se-tool:hover{background:#2c3444;}
      #seDebugPanel .se-filters{display:flex;gap:4px;align-items:center;padding:5px 8px;background:#141821;border-bottom:1px solid #222834;flex-wrap:wrap;flex:0 0 auto;}
      #seDebugPanel .se-chip{cursor:pointer;padding:1px 8px;border-radius:10px;border:1px solid #2c3444;color:#9aa4b2;background:#191e28;font-size:11px;}
      #seDebugPanel .se-chip.on{color:#fff;border-color:#4b6;background:#1c2a22;}
      #seDebugPanel input.se-search{flex:1;min-width:80px;background:#0d1016;border:1px solid #2c3444;color:#cdd6e4;border-radius:5px;padding:2px 7px;font:inherit;}
      #seDebugPanel .se-log{flex:1 1 auto;min-height:0;overflow:auto;padding:6px 10px;-webkit-user-select:text;user-select:text;cursor:text;
        background:#0a0c0e;font-size:11px;line-height:1.45;overscroll-behavior:contain;}
      #seDebugPanel.se-resizing .se-log{overflow:hidden;pointer-events:none;}
      #seDebugPanel .se-resize-grip{position:absolute;right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;z-index:3;
        background:linear-gradient(135deg,transparent 0 48%,#3a4558 48% 52%,transparent 52% 68%,#3a4558 68% 72%,transparent 72%);
        touch-action:none;}
      #seDebugPanel .se-row{white-space:pre-wrap;word-break:break-word;padding:2px 0;
        border-bottom:1px solid #12151a;-webkit-user-select:text;user-select:text;}
      /* ch4os-style: [#n 2:09:25 AM] [+12ms] LEVEL loc: msg */
      #seDebugPanel .se-row .se-meta{color:#64748b;}
      #seDebugPanel .se-row .se-t{color:#64748b;}
      #seDebugPanel .se-row .se-delta{margin:0 2px;}
      #seDebugPanel .se-row .se-lv{font-weight:700;margin:0 4px 0 2px;}
      #seDebugPanel .se-row .se-loc{color:#38bdf8;margin-right:4px;}
      #seDebugPanel .se-row .se-loc::after{content:":";color:#38bdf8;}
      #seDebugPanel .se-row .se-msg{color:#e2e8f0;}
      #seDebugPanel .se-empty{color:#5b6472;padding:10px;}
    `;
    document.head.appendChild(s);
  }

  // server.py stamps {{BUILD_MODE}} ("debug" or "release", see BUILD_MODE
  // there) onto #nodeBuildNumberReadout's data-build-mode-value attribute.
  // Anything other than exactly "release" reads as "debug" -- a missing
  // attribute (older cached HTML, a template that didn't get the
  // replacement, etc.) fails toward the more-alarming red button rather
  // than silently looking like a vetted release build.
  function seBuildMode() {
    try {
      const value = document.getElementById("nodeBuildNumberReadout")?.dataset?.buildModeValue;
      return value === "release" ? "release" : "debug";
    } catch (_) {
      return "debug";
    }
  }

  function buildButton() {
    if (document.getElementById("seDebugButton")) return;
    const btn = document.createElement("button");
    btn.id = "seDebugButton";
    btn.type = "button";
    const mode = seBuildMode();
    btn.classList.toggle("se-release-build", mode === "release");
    btn.title = mode === "release" ? "Debug log (release build)" : "Debug log (soemdsp::debug)";
    btn.setAttribute("aria-label", "Open debug log");
    btn.setAttribute("aria-pressed", "false");
    btn.innerHTML = `🐞<span class="se-badge" data-se-badge>0</span>`;
    btn.addEventListener("click", () => showPanel(els.panel?.classList.contains("se-open") ? false : true));
    els.btn = btn;
    els.badge = btn.querySelector("[data-se-badge]");
    const anchor = document.getElementById("nodeDonateFiveButton");
    if (anchor && anchor.parentNode) anchor.insertAdjacentElement("afterend", btn);
    else (document.querySelector(".node-history-controls") || document.body).appendChild(btn);
  }

  function buildPanel() {
    if (document.getElementById("seDebugPanel")) return;
    const p = document.createElement("div");
    p.id = "seDebugPanel";
    p.innerHTML = `
      <div class="se-head" data-se-drag>
        <button class="se-bug" data-se-fake-err type="button" title="Click: generate a fake ERR entry (tests the log pipeline end to end)" aria-label="Generate a fake error">🐞</button>
        <span class="se-title">Debug Log</span>
        <button class="se-tool" data-se-watch aria-pressed="false">○ smoothing</button>
        <button class="se-tool" data-se-pause>Pause</button>
        <button class="se-tool" data-se-copy>Copy</button>
        <button class="se-tool" data-se-clear>Clear</button>
        <button class="se-tool" data-se-close>✕</button>
      </div>
      <div class="se-filters">
        ${["all","LOG","WARN","FAIL","SMOOTH","ERROR"].map((f)=>`<span class="se-chip${f==="all"?" on":""}" data-se-filter="${f}">${f}</span>`).join("")}
        <input class="se-search" data-se-search placeholder="filter text…">
      </div>
      <div class="se-log" data-se-list><div class="se-empty">No log entries yet.</div></div>
      <div class="se-resize-grip" data-se-resize title="Resize" aria-hidden="true"></div>`;
    document.body.appendChild(p);
    els.panel = p;
    els.list = p.querySelector("[data-se-list]");
    els.watchBtn = p.querySelector("[data-se-watch]");

    p.querySelector("[data-se-close]").addEventListener("click", () => showPanel(false));
    // 🐞 is a first-class button: clicking it generates a fake ERR entry,
    // exercising the full push -> render -> badge pipeline on demand.
    p.querySelector("[data-se-fake-err]").addEventListener("click", () => {
      push("ERROR", "ladybug", "debug-console");
    });
    p.querySelector("[data-se-clear]").addEventListener("click", clearLog);
    p.querySelector("[data-se-copy]").addEventListener("click", copyLog);
    const pauseBtn = p.querySelector("[data-se-pause]");
    pauseBtn.addEventListener("click", () => { paused = !paused; pauseBtn.textContent = paused ? "Resume" : "Pause"; if (!paused) rebuild(); });
    els.watchBtn.addEventListener("click", () => setSmoothingWatch(!smoothingWatch));
    p.querySelectorAll("[data-se-filter]").forEach((c) => c.addEventListener("click", () => {
      filter = c.dataset.seFilter;
      p.querySelectorAll("[data-se-filter]").forEach((x) => x.classList.toggle("on", x === c));
      rebuild();
    }));
    p.querySelector("[data-se-search]").addEventListener("input", (e) => { search = e.target.value.toLowerCase(); rebuild(); });

    makeDraggable(p, p.querySelector("[data-se-drag]"));
    makeResizable(p, p.querySelector("[data-se-resize]"), els.list);
  }

  function makeDraggable(panel, handle) {
    let sx = 0, sy = 0, ox = 0, oy = 0, on = false;
    handle.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      on = true; sx = e.clientX; sy = e.clientY;
      const r = panel.getBoundingClientRect();
      ox = r.left; oy = r.top;
      panel.style.right = "auto"; panel.style.bottom = "auto"; panel.style.left = ox + "px"; panel.style.top = oy + "px";
      handle.setPointerCapture?.(e.pointerId);
    });
    handle.addEventListener("pointermove", (e) => {
      if (!on) return;
      panel.style.left = (ox + e.clientX - sx) + "px";
      panel.style.top = Math.max(0, oy + e.clientY - sy) + "px";
    });
    const end = () => { on = false; };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  /**
   * Custom SE resize grip. Native CSS resize:both on the panel scrolls the
   * overflow:auto log while dragging; this grip freezes scroll + pointer-events
   * on the log for the duration of the resize.
   */
  function makeResizable(panel, grip, list) {
    if (!panel || !grip) return;
    const minW = 340;
    const minH = 200;
    let on = false;
    let sx = 0;
    let sy = 0;
    let startW = 0;
    let startH = 0;
    let startL = 0;
    let startT = 0;
    let frozenScroll = 0;

    const freezeLog = () => {
      if (!list) return;
      frozenScroll = list.scrollTop;
      panel.classList.add("se-resizing");
      list.scrollTop = frozenScroll;
    };
    const unfreezeLog = () => {
      panel.classList.remove("se-resizing");
      if (list) list.scrollTop = frozenScroll;
    };

    grip.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      on = true;
      sx = e.clientX;
      sy = e.clientY;
      const r = panel.getBoundingClientRect();
      startW = r.width;
      startH = r.height;
      startL = r.left;
      startT = r.top;
      // Pin top-left so SE-corner drag grows down/right and never pans content.
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.left = `${startL}px`;
      panel.style.top = `${startT}px`;
      freezeLog();
      grip.setPointerCapture?.(e.pointerId);
    });
    grip.addEventListener("pointermove", (e) => {
      if (!on) return;
      e.preventDefault();
      const nextW = Math.max(minW, startW + (e.clientX - sx));
      const nextH = Math.max(minH, startH + (e.clientY - sy));
      panel.style.width = `${nextW}px`;
      panel.style.height = `${nextH}px`;
      if (list) list.scrollTop = frozenScroll;
    });
    const end = (e) => {
      if (!on) return;
      on = false;
      unfreezeLog();
      try { grip.releasePointerCapture?.(e.pointerId); } catch (_) {}
    };
    grip.addEventListener("pointerup", end);
    grip.addEventListener("pointercancel", end);
    grip.addEventListener("lostpointercapture", () => {
      if (!on) return;
      on = false;
      unfreezeLog();
    });
  }

  function matches(e) {
    if (filter !== "all" && e.level !== filter) return false;
    if (search && !(`${e.loc} ${e.msg} ${e.t}`.toLowerCase().includes(search))) return false;
    return true;
  }

  /** Plain text line (copy / dump) — matches ch4os formatEntryLine shape. */
  function formatEntryLine(e) {
    const lv = LEVELS[e.level] || LEVELS.LOG;
    const t = e.t || formatLogTime(e.ts, e.id);
    const dStr = formatDelta(e.delta);
    const loc = e.loc ? ` ${e.loc}:` : "";
    return `[#${e.id} ${t}] [${dStr}] ${lv.tag}${loc} ${e.msg}`;
  }

  function rowHtml(e) {
    const lv = LEVELS[e.level] || LEVELS.LOG;
    const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const t = e.t || formatLogTime(e.ts, e.id);
    const dStr = formatDelta(e.delta);
    const dCol = deltaColor(e.delta);
    // [#42 2:09:25 AM] [+12ms] LOG loc: message
    return `<div class="se-row" data-id="${e.id}">`
      + `<span class="se-meta">[#${e.id} <span class="se-t">${esc(t)}</span>]</span> `
      + `<span class="se-delta" style="color:${dCol}">[${esc(dStr)}]</span> `
      + `<span class="se-lv" style="color:${lv.color}">${lv.tag}</span>`
      + (e.loc ? ` <span class="se-loc">${esc(e.loc)}</span> ` : " ")
      + `<span class="se-msg">${esc(e.msg)}</span></div>`;
  }
  function render(e) {
    if (!els.list || paused) return;
    const empty = els.list.querySelector(".se-empty");
    if (empty) empty.remove();
    if (!matches(e)) return;
    // Newest at top: stick to top when already near the top (following live feed).
    const atTop = els.list.scrollTop < 30;
    els.list.insertAdjacentHTML("afterbegin", rowHtml(e));
    if (atTop) els.list.scrollTop = 0;
  }
  function rebuild() {
    if (!els.list) return;
    // entries is already newest-first.
    const rows = entries.filter(matches);
    els.list.innerHTML = rows.length ? rows.map(rowHtml).join("") : `<div class="se-empty">No matching entries.</div>`;
    els.list.scrollTop = 0;
  }
  function clearLog() {
    entries.length = 0;
    errorCount = 0;
    lastPushTs = 0;
    try { sessionStorage.removeItem(STORAGE_SESSION); } catch (_) {}
    try { localStorage.removeItem(STORAGE_LAST_UNLOAD); } catch (_) {}
    updateBadge();
    rebuild();
    SE.INFO("log cleared (including persisted dump)");
  }
  function copyLog() {
    // Newest-first plain text, same shape as ch4os snapshot lines.
    const text = entries.filter(matches).map(formatEntryLine).join("\n");
    navigator.clipboard?.writeText(text).then(() => SE.INFO("log copied to clipboard"), () => {});
  }
  function updateBadge() {
    if (!els.badge) return;
    els.badge.textContent = String(errorCount);
    els.badge.style.display = errorCount > 0 ? "block" : "none";
  }
  function showPanel(open) {
    if (!els.panel) return;
    els.panel.classList.toggle("se-open", open);
    els.btn?.setAttribute("aria-pressed", open ? "true" : "false");
    if (open) { rebuild(); }
  }

  // Always show the 🐞 button (localhost, release site, iframe deploy). Release
  // builds only change color (neutral via .se-release-build) — never hide the
  // button. SE.devMode(false) can still tear the UI down on demand; logging
  // and error capture stay active regardless.
  function seDevEnabled() {
    try {
      // Explicit opt-out only (not the default on public/release pages).
      if (localStorage.getItem("seDebug") === "0") return false;
      return true;
    } catch (_) {
      return true;
    }
  }
  function init() {
    try {
      installPersistLifecycle();
      // Capture always (errors), even if UI is opted out — restore/persist still run.
      const n = restorePersistedLog();
      if (!seDevEnabled()) {
        // Keep logging + persistence without the panel.
        SE.INFO(`debug console (headless) — restored ${n} lines, build ${seBuildMode()}`);
        return;
      }
      injectStyles();
      buildButton();
      buildPanel();
      SE.INFO(
        `debug console ready — build ${(document.querySelector("[data-build-number-value]")?.textContent || "?")} (${seBuildMode()})`
        + (n ? ` · restored ${n} lines from before refresh` : " · no prior dump"),
      );
      SE.INFO(`log dump keys: sessionStorage["${STORAGE_SESSION}"], localStorage["${STORAGE_LAST_UNLOAD}"] · SE.dump()`);
      rebuild();
    } catch (err) {
      try { console.error("[se-debug] init failed", err); } catch (_) {}
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
