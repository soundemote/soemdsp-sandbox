const nodeGraphResourcesManifestUrl = "./public/resources/manifest.json";

function normalizeNodeGraphResourcePath(path = "") {
  const text = String(path || "").trim().replace(/\\/g, "/").slice(0, 512);
  if (!text) {
    return "";
  }
  if (/^(?:https?:|data:|blob:)/i.test(text)) {
    return text;
  }
  if (text.startsWith("./") || text.startsWith("/")) {
    return text;
  }
  return `./public/resources/${text.replace(/^public\/resources\//, "")}`;
}

function normalizeNodeGraphResourceExternalPath(path = "") {
  return String(path || "").trim().replace(/\\/g, "/").slice(0, 512);
}

function normalizeNodeGraphResourceMetadataSummary(summary = null) {
  if (summary === null || summary === undefined || summary === "") {
    return null;
  }
  if (typeof summary === "string") {
    return summary.trim().slice(0, 2000);
  }
  if (summary && typeof summary === "object") {
    return typeof normalizeNodeGraphAssetMetadata === "function"
      ? normalizeNodeGraphAssetMetadata(summary)
      : summary;
  }
  return String(summary).trim().slice(0, 2000);
}

function normalizeNodeGraphFileGridTags(tags = []) {
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags
    .map((tag) => String(tag || "").trim())
    .filter(Boolean)
    .slice(0, 64);
}

function normalizeNodeGraphFileGridResourceRow(row = {}) {
  const source = row && typeof row === "object" ? row : {};
  const rawPath = normalizeNodeGraphResourceExternalPath(source.path || source.sourcePath || source.url);
  const id = typeof normalizeNodeGraphSampleId === "function"
    ? normalizeNodeGraphSampleId(source.id || source.resourceId || rawPath)
    : String(source.id || source.resourceId || rawPath || "").trim();
  if (!id || !rawPath) {
    return null;
  }
  const kind = typeof normalizeNodeGraphAssetKind === "function"
    ? normalizeNodeGraphAssetKind(source.kind)
    : String(source.kind || "misc").trim().toLowerCase();
  const nameFromPath = typeof nodeGraphAssetFileNameFromPath === "function"
    ? nodeGraphAssetFileNameFromPath(rawPath)
    : rawPath.split("/").pop();
  const name = String(source.name || source.sourceName || nameFromPath || id).trim().slice(0, 160);
  const metadata = typeof normalizeNodeGraphAssetMetadata === "function"
    ? normalizeNodeGraphAssetMetadata(source.metadata)
    : {};
  const file = typeof normalizeNodeGraphAssetFile === "function"
    ? normalizeNodeGraphAssetFile(source.file, {
      name,
      size: source.size,
      sourceName: name,
      sourcePath: rawPath,
    })
    : { name, sourcePath: rawPath };
  const modifiedTime = Number(source.modifiedTime);
  const rating = Number(source.rating);
  return {
    acceptedTypes: Array.isArray(source.acceptedTypes) && source.acceptedTypes.length
      ? source.acceptedTypes.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 16)
      : [`${kind}/*`],
    dataUrl: String(source.dataUrl || "").trim().slice(0, 10000000),
    description: String(source.description || "").trim().slice(0, 4000),
    descriptionPath: normalizeNodeGraphResourceExternalPath(source.descriptionPath),
    file,
    id,
    kind,
    metadata,
    metadataSummary: normalizeNodeGraphResourceMetadataSummary(source.metadataSummary),
    modifiedTime: Number.isFinite(modifiedTime) ? modifiedTime : null,
    name,
    organizationPath: normalizeNodeGraphResourceExternalPath(source.organizationPath),
    path: rawPath,
    previewStatus: String(source.previewStatus || "").trim().slice(0, 80),
    rating: Number.isFinite(rating) ? rating : null,
    ratingLabel: String(source.ratingLabel || "").trim().slice(0, 80),
    resourceId: id,
    size: Math.max(0, Math.round(nodeGraphFiniteNumber(source.size, nodeGraphFiniteNumber(file.size, 0)))),
    sourceName: name,
    sourcePath: rawPath,
    tags: normalizeNodeGraphFileGridTags(source.tags),
    thumbnailDataUrl: String(source.thumbnailDataUrl || "").trim().slice(0, 10000000),
    thumbnailStatus: String(source.thumbnailStatus || "").trim().slice(0, 80),
  };
}

function normalizeNodeGraphResourceEntry(entry = {}) {
  const source = entry && typeof entry === "object" ? entry : {};
  const id = typeof normalizeNodeGraphSampleId === "function"
    ? normalizeNodeGraphSampleId(source.id || source.resourceId || source.path || source.sourcePath || source.url)
    : String(source.id || source.resourceId || "").trim();
  if (!id) {
    return null;
  }
  const kind = typeof normalizeNodeGraphAssetKind === "function"
    ? normalizeNodeGraphAssetKind(source.kind)
    : String(source.kind || "audio").trim().toLowerCase();
  const path = normalizeNodeGraphResourcePath(source.path || source.url || source.sourcePath);
  if (!path) {
    return null;
  }
  const nameFromPath = typeof nodeGraphAssetFileNameFromPath === "function"
    ? nodeGraphAssetFileNameFromPath(path)
    : path.split("/").pop();
  const metadata = typeof normalizeNodeGraphAssetMetadata === "function"
    ? normalizeNodeGraphAssetMetadata(source.metadata)
    : {};
  const file = typeof normalizeNodeGraphAssetFile === "function"
    ? normalizeNodeGraphAssetFile(source.file, {
      name: source.name || nameFromPath || id,
      sourceName: source.sourceName || nameFromPath || id,
      sourcePath: path,
    })
    : { name: source.name || nameFromPath || id, sourcePath: path };
  return {
    acceptedTypes: Array.isArray(source.acceptedTypes) && source.acceptedTypes.length
      ? source.acceptedTypes.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 16)
      : [`${kind}/*`],
    file,
    id,
    kind,
    metadata,
    metadataSummary: normalizeNodeGraphResourceMetadataSummary(source.metadataSummary),
    name: String(source.name || file.name || nameFromPath || id).trim().slice(0, 160),
    organizationPath: normalizeNodeGraphResourceExternalPath(source.organizationPath),
    path,
    resourceId: id,
    sourceName: String(source.sourceName || file.name || nameFromPath || id).trim().slice(0, 160),
    sourcePath: path,
    tags: normalizeNodeGraphFileGridTags(source.tags),
    thumbnailStatus: String(source.thumbnailStatus || "").trim().slice(0, 80),
  };
}

function normalizeNodeGraphResourceManifest(manifest = {}) {
  const source = manifest && typeof manifest === "object" ? manifest : {};
  const resources = Array.isArray(source.resources) ? source.resources : [];
  const map = new Map();
  for (const resource of resources) {
    const normalized = normalizeNodeGraphResourceEntry(resource);
    if (!normalized || map.has(normalized.id)) {
      continue;
    }
    map.set(normalized.id, normalized);
  }
  return {
    resources: [...map.values()],
    version: Math.max(1, Math.round(nodeGraphFiniteNumber(source.version, 1))),
  };
}

async function nodeGraphResourcesManifestUrlToLoad() {
  const override = typeof nodeGraphResolveEmbedOverride === "function"
    ? await nodeGraphResolveEmbedOverride("resourcesManifestUrl", "resourcesManifest")
    : null;
  return override || nodeGraphResourcesManifestUrl;
}

async function loadNodeGraphResourceManifest() {
  const fallback = normalizeNodeGraphResourceManifest();
  try {
    const response = await fetch(await nodeGraphResourcesManifestUrlToLoad(), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`resource manifest load failed (${response.status})`);
    }
    nodeGraphMvp.resources = normalizeNodeGraphResourceManifest(await response.json());
  } catch (error) {
    nodeGraphMvp.resources = fallback;
    nodeGraphMvp.resourceManifestError = String(error?.message || error || "");
  }
  nodeGraphMvp.resourceMap = new Map((nodeGraphMvp.resources?.resources || []).map((resource) => [resource.id, resource]));
  nodeGraphMvp.resourcePathMap = new Map(
    (nodeGraphMvp.resources?.resources || [])
      .filter((resource) => resource.path)
      .map((resource) => [normalizeNodeGraphResourceExternalPath(resource.path), resource]),
  );
  return nodeGraphMvp.resources;
}

function nodeGraphResourceById(resourceId) {
  const id = typeof normalizeNodeGraphSampleId === "function"
    ? normalizeNodeGraphSampleId(resourceId)
    : String(resourceId || "").trim();
  if (!id) {
    return null;
  }
  return nodeGraphMvp.resourceMap?.get?.(id) || null;
}

function nodeGraphResourceByPath(path) {
  const normalizedPath = normalizeNodeGraphResourceExternalPath(path);
  if (!normalizedPath) {
    return null;
  }
  return nodeGraphMvp.resourcePathMap?.get?.(normalizedPath) || null;
}

function registerNodeGraphResources(resources = []) {
  const rows = Array.isArray(resources) ? resources : [resources];
  const current = Array.isArray(nodeGraphMvp.resources?.resources) ? nodeGraphMvp.resources.resources : [];
  const byId = new Map(current.map((resource) => [resource.id, resource]));
  for (const row of rows) {
    const normalized = normalizeNodeGraphFileGridResourceRow(row) || normalizeNodeGraphResourceEntry(row);
    if (!normalized?.id) {
      continue;
    }
    byId.set(normalized.id, normalized);
  }
  nodeGraphMvp.resources = {
    resources: [...byId.values()],
    version: Math.max(1, Math.round(nodeGraphFiniteNumber(nodeGraphMvp.resources?.version, 1))),
  };
  nodeGraphMvp.resourceMap = new Map(nodeGraphMvp.resources.resources.map((resource) => [resource.id, resource]));
  nodeGraphMvp.resourcePathMap = new Map(
    nodeGraphMvp.resources.resources
      .filter((resource) => resource.path)
      .map((resource) => [normalizeNodeGraphResourceExternalPath(resource.path), resource]),
  );
  return nodeGraphMvp.resources.resources;
}

function nodeGraphSampleReferenceFromResource(resourceId) {
  const resource = nodeGraphResourceById(resourceId) || nodeGraphResourceByPath(resourceId);
  if (!resource || resource.kind !== "audio") {
    return null;
  }
  return normalizeNodeGraphSampleReference({
    dataUrl: resource.dataUrl,
    id: resource.id,
    kind: "audio",
    metadata: resource.metadata,
    name: resource.name,
    resourceId: resource.id,
    sourceName: resource.sourceName || resource.name,
    sourcePath: resource.path,
    file: resource.file,
  });
}
