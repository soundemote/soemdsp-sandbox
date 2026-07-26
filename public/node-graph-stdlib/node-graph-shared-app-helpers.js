// Node Graph Standard Library -- small app-level helpers.
//
// Companion to the DSP-side stdlib files in this folder. Everything here is
// generic (no module knows about any other), was found duplicated across two
// or more callers, and is small enough that copying it was always the path of
// least resistance -- which is exactly why it belongs here instead.
//
// House rules for this folder:
//   * Only put something here once a SECOND caller wants it. One caller is
//     not a library, it is a function.
//   * Keep the existing name at the old site as a thin delegating wrapper if
//     scripts/smoke_test.py names it -- that file asserts symbols exist, and
//     the release build fails if one disappears.
//   * No DOM ids, no module type names, no nodeGraphMvp reads beyond what is
//     passed in.

// Reads a numeric parameter off a patch node, falling back when the value is
// missing or not finite. Was copy-pasted three times under three names
// (readNodeGraphLiveParam, nodeGraphGpuAdditiveNodeParam,
// nodeGraphModuleScopeNodeParam) in three different files.
function nodeGraphNodeParamNumber(node, key, fallback = 0) {
  const value = Number(node?.params?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

// Saves text to the user's downloads as a file. Was duplicated verbatim by the
// metadata script editor and the shader script dialog.
//
// The object URL is revoked on the next tick rather than immediately: the
// click() above only *schedules* the download, and revoking synchronously
// races it in some browsers.
function nodeGraphDownloadTextFile(filename, source, type = "text/plain;charset=utf-8") {
  const link = document.createElement("a");
  const blob = new Blob([source], { type });
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
}
