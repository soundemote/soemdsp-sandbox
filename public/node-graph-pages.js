// Pages (📄) — list static soemdsp-sandbox/patches/*.json and load with confirm + undo.
const nodeGraphPagesPatchBase = "/soemdsp-sandbox/patches";

function applyNodeGraphPagesPageSize(size = {}, panelArg = null) {
  const panel = panelArg || document.getElementById("nodePagesPage");
  if (!panel) {
    return { width: 0, height: 0 };
  }
  const width = Math.round(Number(size.width) || 0);
  const height = Math.round(Number(size.height) || 0);
  if (width >= 24) {
    panel.style.width = `${width}px`;
  }
  if (height >= 120) {
    panel.style.height = `${height}px`;
  }
  return { width, height };
}

function setNodeGraphPagesPageOpen(open) {
  const panel = document.getElementById("nodePagesPage");
  if (!panel) {
    return;
  }
  const switching = Boolean(nodeGraphMvp?._unifiedWindowSwitching);
  if (open && !panel.hidden) {
    if (!switching && typeof openNodeGraphUnifiedWindowPage === "function") {
      openNodeGraphUnifiedWindowPage("pages");
      return;
    }
    if (typeof pulseNodeGraphFloatingWindowAttention === "function") {
      pulseNodeGraphFloatingWindowAttention(panel);
    }
    return;
  }
  if (open && !switching && typeof openNodeGraphUnifiedWindowPage === "function") {
    openNodeGraphUnifiedWindowPage("pages");
    return;
  }
  panel.hidden = !open;
  if (open) {
    panel.classList.add("node-unified-window");
    if (typeof markNodeGraphFloatingWindowSurface === "function") {
      markNodeGraphFloatingWindowSurface(panel);
    }
    if (typeof noteNodeGraphUnifiedWindowOpened === "function") {
      noteNodeGraphUnifiedWindowOpened("pages", panel);
    }
    renderNodeGraphPagesList();
  }
}

async function loadNodeGraphPagePatchCatalog() {
  // Prefer static catalog next to the embed (/soemdsp-sandbox/patches/index.json).
  // Also try ./patches when the HTML is served from the sandbox root.
  const catalogUrls = [
    `${nodeGraphPagesPatchBase}/index.json`,
    "./patches/index.json",
    "/patches/index.json",
  ];
  for (const catalogUrl of catalogUrls) {
    try {
      const res = await fetch(catalogUrl, { cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json();
      const list = Array.isArray(data)
        ? data
        : (Array.isArray(data?.patches) ? data.patches : []);
      const base = String(data?.base || nodeGraphPagesPatchBase).replace(/\/$/, "");
      return list
        .map((entry) => {
          if (typeof entry === "string") {
            const slug = entry.replace(/\.json$/i, "");
            return { slug, label: slug, url: `${base}/${slug}.json` };
          }
          const slug = String(entry?.slug || entry?.name || "").replace(/\.json$/i, "").trim();
          if (!slug) return null;
          return {
            slug,
            label: String(entry?.label || slug),
            url: String(entry?.url || `${base}/${slug}.json`),
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.label.localeCompare(b.label));
    } catch (_error) {
      // try next catalog URL
    }
  }

  // Local sandbox: saved-patches API.
  try {
    if (typeof loadNodeGraphDemoPatchEntries === "function") {
      const entries = await loadNodeGraphDemoPatchEntries();
      return (Array.isArray(entries) ? entries : [])
        .map((entry) => ({
          slug: String(entry?.filename || entry?.name || "").replace(/\.json$/i, ""),
          label: String(entry?.name || entry?.filename || "patch"),
          url: entry?.filename
            ? `/api/patches/file?name=${encodeURIComponent(entry.filename)}`
            : "",
          filename: entry?.filename || "",
        }))
        .filter((entry) => entry.slug && entry.url)
        .sort((a, b) => a.label.localeCompare(b.label));
    }
  } catch (_error) {
    // Empty list.
  }
  return [];
}

async function fetchNodeGraphPagePatchScriptText(entry) {
  const url = entry?.url
    || (entry?.slug ? `${nodeGraphPagesPatchBase}/${encodeURIComponent(entry.slug)}.json` : "");
  if (!url) {
    throw new Error("page patch has no URL");
  }
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`failed to load ${entry.slug || url}: HTTP ${res.status}`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (_error) {
    // Already a script string.
    return text;
  }
  if (data && typeof data === "object" && data.kind === "sandbox_patch" && data.patch_data) {
    return typeof data.patch_data === "string"
      ? data.patch_data
      : JSON.stringify(data.patch_data, null, 2);
  }
  return JSON.stringify(data, null, 2);
}

async function renderNodeGraphPagesList() {
  const body = document.getElementById("nodePagesPageBody");
  if (!body) {
    return;
  }
  body.replaceChildren();
  const status = document.createElement("div");
  status.className = "node-pages-status";
  status.textContent = "loading pages…";
  body.append(status);

  let catalog = [];
  try {
    catalog = await loadNodeGraphPagePatchCatalog();
  } catch (error) {
    status.textContent = error?.message || "failed to list pages";
    return;
  }

  body.replaceChildren();
  if (!catalog.length) {
    const empty = document.createElement("div");
    empty.className = "node-pages-status";
    empty.textContent = `no page patches found (${nodeGraphPagesPatchBase}/index.json)`;
    body.append(empty);
    return;
  }

  for (const entry of catalog) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "node-pages-entry scene-context-store-item";
    button.dataset.pageSlug = entry.slug;
    button.dataset.pageUrl = entry.url || "";
    button.setAttribute("role", "option");
    button.title = `Load /${entry.slug}`;
    const title = document.createElement("span");
    title.className = "node-pages-entry-title";
    title.textContent = entry.label || entry.slug;
    const path = document.createElement("span");
    path.className = "node-pages-entry-path";
    path.textContent = `/${entry.slug}`;
    button.append(title, path);
    button.addEventListener("click", (event) => handleNodeGraphPagePatchClick(event, entry));
    body.append(button);
  }
}

async function handleNodeGraphPagePatchClick(event, entry) {
  const button = event.currentTarget;
  if (!button || !entry?.slug) {
    return;
  }
  const confirming = Boolean(
    typeof nodeGraphMvp !== "undefined"
    && nodeGraphMvp.confirmDefaultButton === button
    && button.classList.contains("confirming-default"),
  );

  if (confirming) {
    const cached = nodeGraphMvp._pendingPagePatchText;
    const pendingSlug = nodeGraphMvp._pendingPagePatchSlug;
    if (typeof clearNodeGraphConfirmDefaultButton === "function") {
      clearNodeGraphConfirmDefaultButton(button);
    }
    delete nodeGraphMvp._pendingPagePatchText;
    delete nodeGraphMvp._pendingPagePatchSlug;
    if (!cached || pendingSlug !== entry.slug) {
      if (typeof setNodeGraphScriptStatus === "function") {
        setNodeGraphScriptStatus("page load expired: confirm again", false);
      }
      return;
    }
    if (typeof commitNodeGraphScript === "function") {
      const ok = commitNodeGraphScript(cached);
      if (ok && typeof setNodeGraphScriptStatus === "function") {
        setNodeGraphScriptStatus(`loaded page /${entry.slug}`, true);
      }
    }
    if (typeof flashNodeGraphDefaultButtonSaved === "function") {
      flashNodeGraphDefaultButtonSaved(button, "Loaded");
    }
    return;
  }

  try {
    const text = await fetchNodeGraphPagePatchScriptText(entry);
    // Validate before arming confirm.
    if (typeof loadNodeGraphPatchFromScript === "function") {
      loadNodeGraphPatchFromScript(text);
    }
    nodeGraphMvp._pendingPagePatchText = text;
    nodeGraphMvp._pendingPagePatchSlug = entry.slug;
    if (typeof confirmNodeGraphDefaultButtonClick === "function") {
      confirmNodeGraphDefaultButtonClick(button, () => {
        if (typeof setNodeGraphScriptStatus === "function") {
          setNodeGraphScriptStatus(`click again to load /${entry.slug}`, true);
        }
      }, { confirmText: "Confirm Load" });
      return;
    }
    if (typeof commitNodeGraphScript === "function") {
      commitNodeGraphScript(text);
    }
  } catch (error) {
    delete nodeGraphMvp._pendingPagePatchText;
    delete nodeGraphMvp._pendingPagePatchSlug;
    if (typeof setNodeGraphScriptStatus === "function") {
      setNodeGraphScriptStatus(error?.message || "page load failed", false);
    }
  }
}

function bindNodeGraphPagesPageEvents() {
  document.getElementById("nodePagesPageClose")?.addEventListener("click", () => {
    if (typeof closeNodeGraphUnifiedWindowPage === "function") {
      closeNodeGraphUnifiedWindowPage("pages");
      return;
    }
    setNodeGraphPagesPageOpen(false);
  });
  document
    .querySelector("#nodePagesPage .scene-context-heading")
    ?.addEventListener("pointerdown", (event) => {
      if (typeof beginNodeGraphRegisteredFloatingWindowDrag === "function") {
        beginNodeGraphRegisteredFloatingWindowDrag(event, "pages");
      }
    });
  document
    .getElementById("nodePagesPageResizeHandle")
    ?.addEventListener("pointerdown", (event) => {
      if (typeof beginNodeGraphRegisteredFloatingWindowResize === "function") {
        beginNodeGraphRegisteredFloatingWindowResize(event, "pages");
      }
    });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindNodeGraphPagesPageEvents, { once: true });
  } else {
    bindNodeGraphPagesPageEvents();
  }
}
