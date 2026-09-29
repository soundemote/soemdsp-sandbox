# B-056 - Default filter drawer pollutes basic displays / Softclipper display jitters

**Status:** fixed  
**Severity:** see  
**Source:** user 2026-09-27  
**Fixed:** 2026-09-28

## User symptom

The default filter drawer appears to pollute basic displays. **Softclipper** jitters between an unused filter display and its intended display instead of keeping the intended display stable.

## Root cause

Softclipper’s transfer-curve face reused the shared plate class `node-filter-curve-display` (for layout CSS) but did **not** opt out of filter-drawer ownership. `drawNodeGraphFilterCurveDisplays` / `scheduleNodeGraphFilterCurveDraw` selected every `.node-filter-curve-display` and painted the generic filter magnitude curve onto Softclipper (and relied on an ad-hoc exclusion list for other borrowers). Softclipper was missing from that list, so its intended transfer curve and the filter drawer alternated.

## Fix (structural ownership + lib SSOT)

1. **`public/lib/visual/filter-curve-face.js`** — SSOT for filter-face ownership:
   - True filter faces: `markFilterCurveOwnedFace` → `data-face-kind="filterCurve"`.
   - Non-filter plates: `markCurveFacePlate(section, kind)` (e.g. `softClipperCurve`) — plate CSS allowed, never filter-owned.
   - `queryFilterCurveOwnedFaces` / `scheduleFilterCurveOwnedDraw` paint **only** owned faces.
2. **`createNodeGraphFilterCurveDisplay`** marks ownership on create.
3. Softclipper mounts as plate + `softClipperCurve` kind — never `filterCurve`.
4. Cookbook paint/sync loops drop the exclusion-list dispatcher; they route through the lib owned-face scheduler.

Display/UI only — no JS in the audio path.

## Verification

- Smoke: `node scripts/test_b056_filter_curve_face_ownership.js`
- Manual: default preset (ladderFilter + softClipper). Softclipper transfer curve stays stable while filter params change; Softclipper params redraw Softclipper only.
