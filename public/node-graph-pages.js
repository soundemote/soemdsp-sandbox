// Pages — list static soemdsp-sandbox/patches (root + one folder deep) and load with confirm + undo.
const nodeGraphPagesPatchBase = "/soemdsp-sandbox/patches";

/** Encode each path segment of a page-patch slug for /patches/{slug}.json URLs. */
function nodeGraphPagesPatchFileUrl(slug, base = nodeGraphPagesPatchBase) {
  const clean = String(slug || "").replace(/\.json$/i, "").replace(/^\/+|\/+$/g, "");
  if (!clean) return "";
  const parts = clean.split("/").filter(Boolean).map((part) => encodeURIComponent(part));
  // One folder deep max.
  if (parts.length > 2) {
    return "";
  }
  return `${String(base).replace(/\/$/, "")}/${parts.join("/")}.json`;
}


function applyNodeGraphPagesPageSize(size = {}, panelArg = null) {
  const panel = panelArg || document.getElementById("nodePagesPage");
  if (!panel) {
    return { width: 0, height: 0 };
  }
  const width = Math.round(nodeGraphFiniteNumber(size.width));
  const height = Math.round(nodeGraphFiniteNumber(size.height));
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
    if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp && !switching) {
      nodeGraphMvp.pagesFolder = "";
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
            const slug = entry.replace(/\.json$/i, "").replace(/^\/+|\/+$/g, "");
            if (!slug || slug.split("/").length > 2) return null;
            const folder = slug.includes("/") ? slug.split("/")[0] : "";
            const label = slug.includes("/") ? slug.split("/").slice(1).join("/") : slug;
            return {
              slug,
              label,
              folder,
              url: nodeGraphPagesPatchFileUrl(slug, base),
            };
          }
          const slug = String(entry?.slug || entry?.name || "")
            .replace(/\.json$/i, "")
            .replace(/^\/+|\/+$/g, "")
            .trim();
          if (!slug || slug.split("/").length > 2) return null;
          const folder = String(entry?.folder || (slug.includes("/") ? slug.split("/")[0] : "")).trim();
          const name = String(entry?.name || "").trim();
          const stem = typeof nodeGraphPatchFileStem === "function"
            ? nodeGraphPatchFileStem(slug)
            : (slug.includes("/") ? slug.split("/").slice(1).join("/") : slug);
          const label = typeof nodeGraphPatchDisplayTitle === "function"
            ? nodeGraphPatchDisplayTitle(name, slug)
            : (name || stem);
          return {
            slug,
            label,
            name,
            folder,
            url: String(entry?.url || nodeGraphPagesPatchFileUrl(slug, base)),
            author: String(entry?.author || "").trim(),
            tags: String(entry?.tags || "").trim(),
            emoji: String(entry?.emoji || "").trim(),
          };
        })
        .filter(Boolean)
        .sort((a, b) => {
          const af = String(a.folder || "");
          const bf = String(b.folder || "");
          // filter* folders on top of everything, then other folders, then root.
          const tier = (folder) => {
            if (/^filter\b/i.test(folder)) return 0;
            if (folder) return 1;
            return 2;
          };
          const at = tier(af);
          const bt = tier(bf);
          if (at !== bt) return at - bt;
          if (af !== bf) {
            const folderCmp = af.localeCompare(bf);
            if (folderCmp) return folderCmp;
          }
          return a.label.localeCompare(b.label);
        });
    } catch (_error) {
      // try next catalog URL
    }
  }

  // Local sandbox: saved-patches API.
  try {
    if (typeof loadNodeGraphDemoPatchEntries === "function") {
      const entries = await loadNodeGraphDemoPatchEntries();
      return (Array.isArray(entries) ? entries : [])
        .map((entry) => {
          const filename = entry?.filename || "";
          const slug = String(filename || entry?.name || "").replace(/\.json$/i, "");
          const name = String(entry?.name || "").trim();
          const label = typeof nodeGraphPatchDisplayTitle === "function"
            ? nodeGraphPatchDisplayTitle(name, filename || slug)
            : (name || slug || "patch");
          return {
            slug,
            label,
            name,
            url: filename
              ? `/api/patches/file?name=${encodeURIComponent(filename)}`
              : "",
            filename,
          };
        })
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
    || (entry?.slug ? nodeGraphPagesPatchFileUrl(entry.slug) : "");
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

  let catalog = Array.isArray(nodeGraphMvp?._pagesCatalog) ? nodeGraphMvp._pagesCatalog : null;
  if (!catalog) {
    try {
      catalog = await loadNodeGraphPagePatchCatalog();
      if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp) {
        nodeGraphMvp._pagesCatalog = catalog;
      }
    } catch (error) {
      status.textContent = error?.message || "failed to list pages";
      return;
    }
  }

  body.replaceChildren();
  if (!catalog.length) {
    const empty = document.createElement("div");
    empty.className = "node-pages-status";
    empty.textContent = `no page patches found (${nodeGraphPagesPatchBase}/index.json)`;
    body.append(empty);
    return;
  }

  const openFolder = String(nodeGraphMvp?.pagesFolder || "").trim();

  const appendPatchButton = (entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "node-pages-entry scene-context-store-item";
    button.dataset.pageSlug = entry.slug;
    button.dataset.pageUrl = entry.url || "";
    if (entry.folder) button.dataset.pageFolder = entry.folder;
    button.setAttribute("role", "option");
    button.title = `Load /${entry.slug}`;
    const main = document.createElement("span");
    main.className = "node-pages-entry-main";
    const title = document.createElement("span");
    title.className = "node-pages-entry-title";
    const emoji = String(entry.emoji || "").trim();
    const customName = String(entry.name || "").trim();
    const named = typeof nodeGraphPatchNameIsFilled === "function"
      ? nodeGraphPatchNameIsFilled(customName)
      : Boolean(customName);
    const label = named
      ? customName
      : (typeof nodeGraphPatchFileStem === "function"
        ? nodeGraphPatchFileStem(entry.slug || entry.label || "")
        : (entry.label || entry.slug || ""));
    title.textContent = (emoji ? `${emoji} ` : "") + label;
    title.classList.toggle("is-custom-name", named);
    main.append(title);
    const author = String(entry.author || "").trim();
    const tags = String(entry.tags || "").trim();
    if (author || tags) {
      const meta = document.createElement("span");
      meta.className = "node-pages-entry-meta";
      if (author) {
        const authorEl = document.createElement("span");
        authorEl.className = "node-pages-entry-author";
        authorEl.textContent = author;
        meta.append(authorEl);
      }
      if (tags) {
        const tagsEl = document.createElement("span");
        tagsEl.className = "node-pages-entry-tags";
        tagsEl.textContent = tags;
        meta.append(tagsEl);
      }
      main.append(meta);
    }
    button.append(main);
    button.addEventListener("click", (event) => handleNodeGraphPagePatchClick(event, entry));
    body.append(button);
  };

  if (openFolder) {
    const back = document.createElement("button");
    back.type = "button";
    back.className = "node-pages-back scene-context-store-item";
    back.setAttribute("aria-label", "Back to all pages");
    back.textContent = "← All pages";
    back.addEventListener("click", (event) => {
      event.stopPropagation();
      if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp) {
        nodeGraphMvp.pagesFolder = "";
      }
      renderNodeGraphPagesList();
    });
    body.append(back);

    const heading = document.createElement("div");
    heading.className = "node-pages-folder";
    heading.textContent = openFolder;
    heading.setAttribute("role", "presentation");
    body.append(heading);

    const inFolder = catalog.filter((entry) => String(entry.folder || "") === openFolder);
    if (!inFolder.length) {
      const empty = document.createElement("div");
      empty.className = "node-pages-status";
      empty.textContent = "no patches in this folder";
      body.append(empty);
      return;
    }
    for (const entry of inFolder) {
      appendPatchButton(entry);
    }
    return;
  }

  // Root view: folder categories (filter* first), then top-level patches listed as today.
  const folderNames = [];
  const seen = new Set();
  for (const entry of catalog) {
    const folder = String(entry.folder || "").trim();
    if (!folder || seen.has(folder)) continue;
    seen.add(folder);
    folderNames.push(folder);
  }
  folderNames.sort((a, b) => {
    const at = /^filter\b/i.test(a) ? 0 : 1;
    const bt = /^filter\b/i.test(b) ? 0 : 1;
    if (at !== bt) return at - bt;
    return a.localeCompare(b);
  });

  for (const folder of folderNames) {
    const count = catalog.filter((entry) => String(entry.folder || "") === folder).length;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "node-pages-folder-card node-pages-entry";
    button.dataset.pageFolder = folder;
    button.title = `${folder}: open folder`;
    button.setAttribute("aria-label", `Open ${folder} folder`);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp) {
        nodeGraphMvp.pagesFolder = folder;
      }
      renderNodeGraphPagesList();
    });
    const title = document.createElement("span");
    title.className = "node-pages-entry-title";
    title.textContent = "📁 " + folder;
    const countEl = document.createElement("span");
    countEl.className = "node-pages-folder-count";
    countEl.textContent = String(count);
    button.append(title, countEl);
    body.append(button);
  }

  const roots = catalog.filter((entry) => !entry.folder);
  for (const entry of roots) {
    appendPatchButton(entry);
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
      if (ok) {
        if (typeof setNodeGraphCurrentSavedPatch === "function") {
          setNodeGraphCurrentSavedPatch(`${entry.slug}.json`);
        }
        if (typeof syncNodeGraphHeaderPatchTitle === "function") {
          syncNodeGraphHeaderPatchTitle();
        }
        if (typeof setNodeGraphScriptStatus === "function") {
          setNodeGraphScriptStatus(`loaded page /${entry.slug}`, true);
        }
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
