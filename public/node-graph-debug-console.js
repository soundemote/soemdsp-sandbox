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
  const VISIBLE_CAP = 200;
  // Survives F5 in the same tab. localStorage keeps a "last unload" dump so a
  // hard crash / new tab can still recover the previous session's log.
  const STORAGE_SESSION = "seDebugLog.session.v1";
  const STORAGE_LAST_UNLOAD = "seDebugLog.lastUnload.v1";
  // Survives F5 / new tab. Missing key = paused (first-run default).
  const STORAGE_PAUSED = "seDebugPaused.v1";
  const entries = [];
  let seq = 0;
  let errorCount = 0;
  let paused = readPausedPreference();
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
    LIVE: { tag: "LIVE", color: "#6ee7b7", err: false },
    ERROR: { tag: "ERR", color: "#ff5555", err: true },
  };

  function seVerboseLog() {
    try {
      return localStorage.getItem("seDebug") === "1";
    } catch (_) {
      return false;
    }
  }

  /** Pause/resume of the live log UI. Default paused when nothing is stored. */
  function readPausedPreference() {
    try {
      const raw = localStorage.getItem(STORAGE_PAUSED);
      if (raw === "0") return false;
      if (raw === "1") return true;
    } catch (_) {}
    return true;
  }

  function writePausedPreference(value) {
    try {
      localStorage.setItem(STORAGE_PAUSED, value ? "1" : "0");
    } catch (_) {}
  }

  function syncPauseButton() {
    const btn = els.pauseBtn || els.panel?.querySelector("[data-se-pause]");
    if (!btn) return;
    btn.textContent = paused ? "Resume" : "Pause";
    btn.setAttribute("aria-pressed", paused ? "true" : "false");
    btn.title = paused
      ? "Paused — INFO/LIVE not recorded. ERROR/FAIL still land. Click to resume."
      : "Recording live entries — click to pause INFO/LIVE posts";
  }

  function setPaused(next) {
    paused = !!next;
    writePausedPreference(paused);
    syncPauseButton();
    if (!paused) rebuild();
  }

  function sePanelOpen() {
    return Boolean(els.panel?.classList.contains("se-open"));
  }

  /** ERROR/FAIL/LIVE always. INFO/LOG/WARN only with panel open or seDebug=1. */
  function seShouldRecord(level) {
    if (level === "ERROR" || level === "FAIL" || level === "LIVE") {
      return true;
    }
    return seVerboseLog() || sePanelOpen();
  }

  function push(level, msg, loc) {
    if (!seShouldRecord(level)) {
      return null;
    }
    if (paused && level !== "ERROR" && level !== "FAIL") {
      return null;
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
    // Persistence is opt-in via SE.dump() only. Auto-saving on every push made
    // F5 restore racey with clearLogOnStartup and confused "clear on refresh".
    if (reason !== "manual" && reason !== "dump") {
      return;
    }
    try {
      const payload = serializeLogPayload(reason);
      const text = JSON.stringify(payload);
      try { sessionStorage.setItem(STORAGE_SESSION, text); } catch (_) {}
      try { localStorage.setItem(STORAGE_LAST_UNLOAD, text); } catch (_) {}
    } catch (_) {}
  }

  function schedulePersist() {
    // No auto-persist — refresh must show an empty log.
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
    // Crash/dump only via SE.dump() — do NOT re-persist on pagehide/F5.
    // Refresh must start empty; writing here raced clearLogOnStartup and
    // left a recoverable dump that users saw as "log not clearing".
    // Optional: keep a last-unload dump only for explicit manual dump.
    window.addEventListener("pageshow", (event) => {
      // BFCache restores the full JS heap (entries + DOM) without re-running
      // init — force a wipe so refresh/back always looks empty.
      if (event.persisted) {
        clearLogOnStartup();
        try { rebuild(); updateBadge(); } catch (_) {}
        try {
          SE.INFO("log cleared after back-forward restore");
        } catch (_) {}
      }
    });
  }

  // ---- sehelper.hpp-style API ----------------------------------------------
  const SE = {
    LOG: (msg) => push("LOG", msg || "FAILURE: no error message provided", ""),
    INFO: (msg) => push("INFO", msg, ""),
    WARN: (cond, msg) => { if (!cond) push("WARN", msg, ""); return cond; },
    CHECK: (cond, msg) => { if (!cond) { push("FAIL", msg || "CHECK failed", callerLoc()); try { console.assert(false, msg); } catch (_) {} } return cond; },
    ERROR: (msg, loc = callerLoc()) => push("ERROR", msg || "ERROR", loc),
    FAIL: (msg) => push("FAIL", msg || "FAIL", callerLoc()),
    LIVE: (msg) => push("LIVE", msg || "", ""),
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
    liveDisplay: () => dumpLiveDisplay(),
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
        if (!text.includes("[se-debug]")) {
          push(k === "error" ? "ERROR" : "WARN", text, "console");
        }
      } catch (_) {}
      return orig(...args);
    };
  });
  function safeStringify(v) { try { return JSON.stringify(v); } catch (_) { return String(v); } }

  function dumpLiveDisplay() {
    const mvp = window.nodeGraphMvp;
    const live = mvp?.live || {};
    const slots = typeof nodeGraphVisibleModuleScopeSlots === "function"
      ? nodeGraphVisibleModuleScopeSlots()
      : [];
    const slotLines = slots.map((slot) => {
      const buf = typeof nodeGraphModuleScopeCapturedBufferForSlot === "function"
        ? nodeGraphModuleScopeCapturedBufferForSlot(slot)
        : null;
      const renderer = typeof nodeGraphModuleDisplayRendererForSlot === "function"
        ? nodeGraphModuleDisplayRendererForSlot(slot)
        : "";
      const lr = typeof nodeGraphStereoTraceLrWired === "function"
        ? nodeGraphStereoTraceLrWired(slot.nodeId, slot.type)
        : false;
      return `${slot.type} ${slot.nodeId} ${renderer} n=${buf?.length || 0} lr=${lr ? "1" : "0"}`;
    });
    const snap = {
      speed: live.speedMultiplier,
      paused: !(Number(live.speedMultiplier) > 0) && Boolean(live.node),
      outputMuted: live.outputMuted,
      hostGain: live.outputGain?.gain?.value,
      engine: Boolean(live.node),
      phosphorRaf: [...document.querySelectorAll("[data-phosphor-raf='1']")].map((el) => el.dataset.node),
      slots: slotLines,
    };
    push("LIVE", JSON.stringify(snap), "live-display");
    if (typeof window.SE?.INFO === "function") {
      // keep a second readable line
    }
    showPanel(true);
    return snap;
  }

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
        font-size:17px;line-height:1;border:1px solid #c0392b;border-radius:7px;cursor: var(--node-dot-cursor);
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
      #seDebugPanel button.se-bug{background:none;border:1px solid #c0392b;border-radius:7px;cursor: var(--node-dot-cursor);
        font-size:24px;line-height:1.15;padding:1px 5px;}
      #seDebugPanel button.se-bug:hover{background:#2a1518;filter:brightness(1.2);}
      #seDebugPanel button.se-bug:active{transform:scale(0.92);}
      #seDebugPanel button.se-tool{background:#232936;color:#cdd6e4;border:1px solid #313a4a;border-radius:5px;padding:2px 8px;cursor: var(--node-dot-cursor);font:inherit;}
      #seDebugPanel button.se-tool:hover{background:#2c3444;}
      #seDebugPanel .se-filters{display:flex;gap:4px;align-items:center;padding:5px 8px;background:#141821;border-bottom:1px solid #222834;flex-wrap:wrap;flex:0 0 auto;}
      #seDebugPanel .se-chip{cursor: var(--node-dot-cursor);padding:1px 8px;border-radius:10px;border:1px solid #2c3444;color:#9aa4b2;background:#191e28;font-size:11px;}
      #seDebugPanel .se-chip.on{color:#fff;border-color:#4b6;background:#1c2a22;}
      #seDebugPanel input.se-search{flex:1;min-width:80px;background:#0d1016;border:1px solid #2c3444;color:#cdd6e4;border-radius:5px;padding:2px 7px;font:inherit;}
      /* body { user-select:none } is global — force selectable text in the log. */
      #seDebugPanel .se-log,
      #seDebugPanel .se-log *,
      #seDebugPanel .se-row,
      #seDebugPanel .se-row *{
        -webkit-user-select:text !important;user-select:text !important;
        -moz-user-select:text !important;-ms-user-select:text !important;
      }
      #seDebugPanel .se-log{flex:1 1 auto;min-height:0;overflow:auto;padding:6px 10px;cursor:text;
        background:#0a0c0e;font-size:11px;line-height:1.45;overscroll-behavior:contain;}
      #seDebugPanel.se-resizing .se-log{overflow:hidden;pointer-events:none;}
      #seDebugPanel .se-resize-grip{position:absolute;right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;z-index:3;
        background:linear-gradient(135deg,transparent 0 48%,#3a4558 48% 52%,transparent 52% 68%,#3a4558 68% 72%,transparent 72%);
        touch-action:none;opacity:0;transition:opacity 120ms ease;}
      #seDebugPanel:hover > .se-resize-grip,
      #seDebugPanel .se-resize-grip:hover,
      #seDebugPanel.se-resizing .se-resize-grip{opacity:1;}
      #seDebugPanel .se-row{white-space:pre-wrap;word-break:break-word;padding:2px 0;
        border-bottom:1px solid #12151a;}
      /* ch4os-style: [#n 2:09:25 AM] [+12ms] LEVEL loc: msg */
      #seDebugPanel .se-row .se-meta{color:#64748b;}
      #seDebugPanel .se-row .se-t{color:#64748b;}
      #seDebugPanel .se-row .se-delta{margin:0 2px;}
      #seDebugPanel .se-row .se-lv{font-weight:700;margin:0 4px 0 2px;}
      #seDebugPanel .se-row .se-loc{color:#38bdf8;margin-right:4px;}
      #seDebugPanel .se-row .se-loc::after{content:":";color:#38bdf8;}
      #seDebugPanel .se-row .se-msg{color:#e2e8f0;}
      #seDebugPanel .se-empty{color:#5b6472;padding:10px;}
      #seDebugPanel input.se-search,
      #seDebugPanel button{
        -webkit-user-select:none !important;user-select:none !important;
      }
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
        <button class="se-tool" data-se-live title="Dump Output/pause/Music Player live-display snapshot">LIVE</button>
        <button class="se-tool" data-se-cats title="Copy module category list (emoji + name, one per line)" aria-label="Copy module category list">📋🎛️</button>
        <button class="se-tool" data-se-pause aria-pressed="true">Resume</button>
        <button class="se-tool" data-se-copy>Copy</button>
        <button class="se-tool" data-se-clear>Clear</button>
        <button class="se-tool" data-se-close>✕</button>
      </div>
      <div class="se-filters">
        ${["all","LOG","INFO","WARN","FAIL","SMOOTH","LIVE","ERROR"].map((f)=>`<span class="se-chip${f==="all"?" on":""}" data-se-filter="${f}">${f}</span>`).join("")}
        <input class="se-search" data-se-search placeholder="filter text…">
      </div>
      <div class="se-log node-text-selectable" data-se-list tabindex="0"><div class="se-empty">No log entries yet.</div></div>
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
    p.querySelector("[data-se-cats]")?.addEventListener("click", dumpModuleCategories);
    const pauseBtn = p.querySelector("[data-se-pause]");
    els.pauseBtn = pauseBtn;
    syncPauseButton();
    pauseBtn.addEventListener("click", () => setPaused(!paused));
    els.watchBtn.addEventListener("click", () => setSmoothingWatch(!smoothingWatch));
    p.querySelector("[data-se-live]")?.addEventListener("click", () => dumpLiveDisplay());
    p.querySelectorAll("[data-se-filter]").forEach((c) => c.addEventListener("click", () => {
      filter = c.dataset.seFilter;
      p.querySelectorAll("[data-se-filter]").forEach((x) => x.classList.toggle("on", x === c));
      rebuild();
    }));
    p.querySelector("[data-se-search]").addEventListener("input", (e) => { search = e.target.value.toLowerCase(); rebuild(); });

    // Keep selection/copy working inside the log: stop workspace/drag handlers
    // from eating pointer/selectstart, and don't clear ranges on mousedown.
    if (els.list) {
      const stopBubble = (e) => { e.stopPropagation(); };
      els.list.addEventListener("pointerdown", stopBubble);
      els.list.addEventListener("mousedown", stopBubble);
      els.list.addEventListener("click", stopBubble);
      els.list.addEventListener("selectstart", (e) => {
        e.stopPropagation();
      });
      // Ctrl/Cmd+C copies current selection when focus is in the log.
      els.list.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "c") {
          const selected = window.getSelection?.()?.toString?.() || "";
          if (selected) {
            // Let the browser handle native copy of the selection.
            return;
          }
          e.preventDefault();
          copyLog();
        }
      });
    }

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
    while (els.list.querySelectorAll(".se-row").length > VISIBLE_CAP) {
      const last = els.list.lastElementChild;
      if (!last || last.classList.contains("se-empty")) {
        break;
      }
      last.remove();
    }
    if (atTop) els.list.scrollTop = 0;
  }
  function rebuild() {
    if (!els.list) return;
    const rows = entries.filter(matches).slice(0, VISIBLE_CAP);
    els.list.innerHTML = rows.length ? rows.map(rowHtml).join("") : `<div class="se-empty">No matching entries.</div>`;
    els.list.scrollTop = 0;
  }
  function wipePersistedLogStorage() {
    try { sessionStorage.removeItem(STORAGE_SESSION); } catch (_) {}
    try { localStorage.removeItem(STORAGE_LAST_UNLOAD); } catch (_) {}
  }

  /** Fresh empty log for this page load (storage wiped so refresh does not restore). */
  function clearLogOnStartup() {
    entries.length = 0;
    errorCount = 0;
    lastPushTs = 0;
    seq = 0;
    wipePersistedLogStorage();
  }

  function clearLog() {
    entries.length = 0;
    errorCount = 0;
    lastPushTs = 0;
    wipePersistedLogStorage();
    updateBadge();
    rebuild();
    SE.INFO("log cleared (including persisted dump)");
  }
  function copyLog() {
    // Prefer the user's current selection when it sits inside the log.
    let text = "";
    try {
      const sel = window.getSelection?.();
      const selected = sel?.toString?.() || "";
      if (selected && els.list && sel.rangeCount > 0) {
        const anchor = sel.anchorNode;
        if (anchor && (els.list === anchor || els.list.contains(anchor.nodeType === 1 ? anchor : anchor.parentElement))) {
          text = selected;
        }
      }
    } catch (_) {}
    if (!text) {
      // Newest-first plain text, same shape as ch4os snapshot lines.
      text = entries.filter(matches).map(formatEntryLine).join("\n");
    }
    if (!text) {
      SE.INFO("nothing to copy");
      return;
    }
    const done = (ok) => {
      if (ok) SE.INFO(text.includes("\n") || text.length > 80 ? "log copied to clipboard" : "selection copied");
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => done(true), () => {
        try {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.setAttribute("readonly", "");
          ta.style.cssText = "position:fixed;left:-9999px;opacity:0";
          document.body.appendChild(ta);
          ta.select();
          const ok = document.execCommand("copy");
          ta.remove();
          done(ok);
        } catch (_) { done(false); }
      });
    } else {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:fixed;left:-9999px;opacity:0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        done(ok);
      } catch (_) { done(false); }
    }
  }

  /**
   * Module department list as one multi-line LOG entry (emoji + name per line).
   * Shape (easy select/copy of a single log row):
   *   [#2410 10:31:53 AM] [+0ms] LOG categories:
   *   🌐 Portals
   *   🕹️ Controllers
   *   〰️ Oscillator
   *   …
   */
  function dumpModuleCategories() {
    const deps = (typeof nodeGraphModuleStoreDepartments !== "undefined"
      && Array.isArray(nodeGraphModuleStoreDepartments))
      ? nodeGraphModuleStoreDepartments.filter((dep) => dep?.listed !== false)
      : [];
    if (!deps.length) {
      push("WARN", "no module categories available (store not loaded)", "debug-console");
      return;
    }
    const lines = deps.map((dep) => {
      const emoji = String(dep?.emoji || "").trim() || "·";
      const name = String(dep?.title || dep?.label || dep?.id || "").trim() || "?";
      return `${emoji} ${name}`;
    });
    // One entry: header + emoji lines. formatEntryLine → easy single-block copy.
    //   [#n t] [+0ms] LOG categories:
    //   🌐 Portals
    //   …
    const entry = push("LOG", `categories:\n${lines.join("\n")}`, "");
    const text = formatEntryLine(entry);
    try {
      navigator.clipboard?.writeText(text).then(
        () => SE.INFO("module categories copied (one log entry)"),
        () => {},
      );
    } catch (_) {
      // Clipboard may be denied; the multi-line entry is still in the log.
    }
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
    if (open) {
      if (typeof logNodeGraphSampleRateInfo === "function") {
        logNodeGraphSampleRateInfo("debug panel");
      }
      rebuild();
    }
  }

  // Always show the 🐞 button (localhost, release site, iframe deploy). Release
  // builds only change color (neutral via .se-release-build) — never hide the
  // button. SE.devMode(false) can still tear the UI down on demand; logging
  // and error capture stay active regardless.
  function seDevEnabled() {
    // 🐞 button always ships. Verbose recording is seDebug=1 or an open panel.
    return true;
  }
  function init() {
    try {
      installPersistLifecycle();
      // Fresh log every startup / refresh — never restore prior dump.
      clearLogOnStartup();
      // Drop any leftover dump from older builds that auto-persisted on hide.
      wipePersistedLogStorage();
      if (!seDevEnabled()) {
        return;
      }
      injectStyles();
      buildButton();
      buildPanel();
      rebuild();
    } catch (err) {
      try { console.error("[se-debug] init failed", err); } catch (_) {}
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
