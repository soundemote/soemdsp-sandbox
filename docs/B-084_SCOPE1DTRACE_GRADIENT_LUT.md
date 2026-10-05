# scope1dTrace Display Settings gradient not feeding TraceWoscope LUT

**Status:** fixed  
**Severity:** see  
**Source:** user 2026-09-28 (ArchIV soemdsp-sandbox — Tube Sat / scope1dTrace / TraceWoscope)  
**Fixed:** 2026-09-28 (local, no push)  
**Related:** B-083 face blank; FEATURE_TUBE_SAT_CRT_AMBER; B-081 Size

## User symptom

Tube Sat / catalog **1D Trace** (scope1dTrace / TraceWoscope) did not visibly apply the Display Settings **gradient**. Changing stops looked like a flat hue swatch. User clarified: **2D Trace is NOT gradient-based** (additive solid hue blend) — do not force gradient onto 2D.

## Root cause

1. Points pushed for TraceWoscope had **no energy 	**. TraceWoscope fell back to index-along-window T, so short undrawn chunks compressed the full LUT into a few pixels (muddy / peak-like) and Display Settings edits were hard to see as a colormap.
2. Display Settings still exposed **Color** swatches (dot1Color / secondaryColor) while the Bright tip already said **Gradient owns color** — phosphor faces use colors: [] + shared Gradient editor only.
3. Flat ink RGB ignored gradientStops (hue from dot1Color), so TraceStroke fallback and any non-LUT path stayed on the swatch.

Wiring to pass gradientStops into TraceWoscope.draw already existed; the LUT was underfed.

## Fix (1D only)

1. Tag each 1D Trace point with 	 = clamp01(|sample|) so TraceWoscope LUT maps **signal energy → color** from Display Settings gradientStops.
2. When gradientStops present, 
odeGraphScope1dTraceInkRgb01 samples LUT peak (	=1) for flat tip / TraceStroke fallback.
3. scope1dTrace Display Settings colors: [] — Gradient editor only (same pattern as lineBurn / scope2d phosphor).
4. **No change** to drawNodeGraphScope2dTraceLayer / 
ormalizeNodeGraphScope2dTraceSettings (still solid hue + Bright, no gradientStops).
5. Cache-bust 084-1dtrace-grad-1 (index + perform).

## Verify

1. Load **demo_patches/tubesaturation.json** — Tube Sat beam follows crt-amber LUT (quiet = floor, peaks = tip).
2. Open Display Settings → change Gradient preset / stops — beam colors update live; no Color swatches on 1D Trace.
3. Spawn **2D Trace** / XY Trace — still solid hue + Bright additive blend; no gradient forced.
4. Bright still scales TraceWoscope intensity; Size still thickness (B-081).

Display/UI only — no audio path.
