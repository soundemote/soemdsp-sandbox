from __future__ import annotations

import argparse
from functools import cache
from html.parser import HTMLParser
import json
import re
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Callable
from wave import Error as WaveError
from wave import open as open_wave


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
DEFAULT_UI_SETTINGS = PUBLIC / "presets" / "useruisettings.json"
DEFAULT_UI_SETTINGS_SCRIPT = PUBLIC / "presets" / "useruisettings.js"
DEFAULT_MANIFEST = (
    ROOT.parent / "soemdsp" / "runtime_dsp_object_bound_wav_resync_demo.manifest.json"
)
JS_CONTENT_TYPES = ("application/javascript", "text/javascript")


def parse_bundled_default_ui_settings_script_payload(source: str) -> dict:
    match = re.search(r"\}\)\((.*)\);\s*$", source, re.S)
    require(match is not None, "bundled UI settings script should wrap a JSON settings payload")
    return json.loads(match.group(1))


def read_bundled_default_ui_settings_script_payload() -> dict:
    source = DEFAULT_UI_SETTINGS_SCRIPT.read_text(encoding="utf-8-sig")
    return parse_bundled_default_ui_settings_script_payload(source)


PUBLIC_SCRIPT_PATHS = (
    "./public/boot-loading.js",
    "./public/app-state.js",
    "./public/format-utils.js",
    "./public/inspection-utils.js",
    "./public/audio-utils.js",
    "./public/ui-label-utils.js",
    "./public/ui-render-utils.js",
    "./public/inspection-cursor-pills.js",
    "./public/inspection-cursor.js",
    "./public/phase-display-utils.js",
    "./public/phase-audio-analysis.js",
    "./public/level-envelope-canvas.js",
    "./public/level-envelope-view.js",
    "./public/phase-audio-stats-probe.js",
    "./public/phase-audio-stats-view.js",
    "./public/signal-plot-settings.js",
    "./public/signal-plot-metrics.js",
    "./public/signal-plot-view.js",
    "./public/signal-plot-probes.js",
    "./public/signal-plot-readouts.js",
    "./public/signal-plot-controls.js",
    "./public/artifact-report-utils.js",
    "./public/artifact-report-reports.js",
    "./public/artifact-list-view.js",
    "./public/artifact-coverage-view.js",
    "./public/manifest-source-view.js",
    "./public/parameter-summary-view.js",
    "./public/parameter-timeline-probe.js",
    "./public/parameter-views.js",
    "./public/manifest-processing-contracts.js",
    "./public/manifest-phase-contracts.js",
    "./public/manifest-contracts.js",
    "./public/legacy-evidence-checklist-view.js",
    "./public/legacy-evidence-proof-view.js",
    "./public/legacy-evidence-views.js",
    "./public/phase-list-view.js",
    "./public/hands-on-readiness-waveform-labels.js",
    "./public/hands-on-readiness-primary-labels.js",
    "./public/hands-on-readiness-artifact-labels.js",
    "./public/hands-on-readiness-signal-inspection-labels.js",
    "./public/hands-on-readiness-phase-parameter-labels.js",
    "./public/hands-on-readiness-probe-labels.js",
    "./public/hands-on-readiness.js",
    "./public/waveform-canvas.js",
    "./public/waveform-current-parameters.js",
    "./public/waveform-position-view.js",
    "./public/waveform-view.js",
    "./public/waveform-transport.js",
    "./public/waveform-phase-controls.js",
    "./public/waveform-interactions.js",
    "./public/manifest-view.js",
    "./public/manifest-loader.js",
    "./public/node-graph-wires.js",
    "./public/node-graph-floating-windows.js",
    "./public/node-graph-file-actions.js",
    "./public/node-graph-default-buttons.js",
    "./public/node-graph-cookbook-filter.js",
    "./public/node-graph-papoulis-filter.js",
    "./public/node-graph-phosphor-draw-sample.js",
    "./public/node-graph-color-standards.js",
    "./public/node-graph-module-definitions.js",
    "./public/node-graph-data-bus.js",
    "./public/node-graph-module-store.js",
    "./public/node-graph-module-sizing.js",
    "./public/node-graph-metadata-kinds.js",
    "./public/node-graph-parameter-metadata.js",
    "./public/node-graph-metadata-defaults.js",
    "./public/node-graph-text-box-utils.js",
    "./public/node-graph-port-script.js",
    "./public/node-graph-image-utils.js",
    "./public/node-graph-graph-utils.js",
    "./public/node-graph-samples.js",
    "./public/node-graph-phosphor-waveform.js",
    "./public/node-graph-phosphillator.js",
    "./public/node-graph-pulse-explosion-display.js",
    "./public/node-graph-embed-config.js",
    "./public/node-graph-resources.js",
    "./public/node-graph-text-box-rendering.js",
    "./public/node-graph-patch-normalizers.js",
    "./public/node-graph-ui-view.js",
    "./public/node-graph-audio-derivation.js",
    "./public/node-graph-grid-utils.js",
    "./public/node-graph-patch-runtime.js",
    "./public/node-graph-code-screen-model.js",
    "./public/node-graph-patch-serialization.js",
    "./public/node-graph-settings-fields.js",
    "./public/node-graph-settings-view.js",
    "./public/node-graph-settings-text-fit.js",
    "./public/node-graph-default-preset.js",
    "./public/node-graph-script-status.js",
    "./public/node-graph-view-controls.js",
    "./public/node-graph-workspace-geometry.js",
    "./public/node-graph-workspace-zoom.js",
    "./public/node-graph-workspace-view.js",
    "./public/node-graph-camera-view.js",
    "./public/node-graph-clap-host.js",
    "./public/node-graph-marquee-selection.js",
    "./public/node-graph-node-dragging.js",
    "./public/node-graph-context-menu.js",
    "./public/node-graph-module-actions.js",
    "./public/node-graph-code-screen.js",
    "./public/node-graph-module-scopes.js",
    "./public/node-graph-shader-script.js",
    "./public/node-graph-canvas-script.js",
    "./public/node-graph-module-factories.js",
    "./public/node-graph-module-header-rendering.js",
    "./public/node-graph-module-rendering.js",
    "./public/node-graph-history.js",
    "./public/node-graph-visual-utils.js",
    "./public/node-graph-patch-clone.js",
    "./public/node-graph-slider-metadata.js",
    "./public/node-graph-slider-values.js",
    "./public/node-graph-slider-dragging.js",
    "./public/node-graph-node-accessors.js",
    "./public/node-graph-selection.js",
    "./public/node-graph-port-geometry.js",
    "./public/node-graph-slider-readout.js",
    "./public/node-graph-slider-readout-controls.js",
    "./public/node-graph-ghost-sliders.js",
    "./public/node-graph-gpu-additive-backend.js",
    "./public/node-code-settings-editor.js",
    "./public/node-graph-metadata-editor.js",
    "./public/node-graph-render-settings.js",
    "./public/node-graph-ear-protection.js",
    "./public/node-graph-module-diagnostics.js",
    "./public/node-graph-rendered-audio.js",
    "./public/node-graph-rendered-visual-output.js",
    "./public/node-graph-rendered-output-canvases.js",
    "./public/node-graph-execution-wires.js",
    "./public/node-graph-execution-plan.js",
    "./public/node-graph-execution-summary.js",
    "./public/node-graph-wire-actions.js",
    "./public/node-graph-trace-router.js",
    "./public/node-graph-wire-rendering.js",
    "./public/node-graph-render-output.js",
    "./public/node-graph-debug-copy.js",
    "./public/node-graph-execution-debug-api.js",
    "./public/node-graph-execution-debug-view.js",
    "./public/node-graph-tooltips.js",
    "./public/node-graph-interaction-help.js",
    "./public/presets/useruisettings.js",
    "./public/node-graph-ui-settings-definitions.js",
    "./public/node-graph-ui-settings-utils.js",
    "./public/node-graph-user-ui-settings-controls.js",
    "./public/node-graph-ui-settings-panels.js",
    "./public/node-graph-ui-settings-persistence.js",
    "./public/node-graph-ui-settings-sync.js",
    "./public/node-graph-keyboard-shortcuts.js",
    "./public/node-graph-live-status-text.js",
    "./public/node-graph-live-status-controls.js",
    "./public/node-graph-live-meter-controls.js",
    "./public/node-graph-live-input-status.js",
    "./public/node-graph-live-evidence.js",
    "./public/node-graph-live-control-rendering.js",
    "./public/node-graph-default-patch.js",
    "./public/node-graph-state.js",
    "./public/node-graph-external-ui-events.js",
    "./public/node-graph-patch-core.js",
    "./public/node-graph-live-plan-runtime.js",
    "./public/node-graph-live-parameter-runtime.js",
    "./public/node-graph-oscillator-runtime.js",
    "./public/node-graph-jerobeam-spiral.js",
    "./public/node-graph-fractal-spiral.js",
    "./public/node-graph-log-spiral.js",
    "./public/node-graph-lorenz-attractor.js",
    "./public/node-graph-logistic-map.js",
    "./public/node-graph-henon-map.js",
    "./public/node-graph-chua-attractor.js",
    "./public/node-graph-jerobeam-wirdo-spiral.js",
    "./public/node-graph-jerobeam-blubb.js",
    "./public/node-graph-jerobeam-mushroom.js",
    "./public/node-graph-jerobeam-boing.js",
    "./public/node-graph-jerobeam-torus.js",
    "./public/node-graph-jerobeam-kepler-bouwkamp.js",
    "./public/node-graph-jerobeam-nyquist-shannon.js",
    "./public/node-graph-jerobeam-radar.js",
    "./public/node-graph-chord-memory.js",
    "./public/node-graph-turing-machine.js",
    "./public/node-graph-pitch-quantizer.js",
    "./public/node-graph-surge-oscillator.js",
    "./public/node-graph-dsf-oscillator.js",
    "./public/node-graph-robin-supersaw.js",
    "./public/node-graph-hypersaw.js",
    "./public/node-graph-chord-sequencer.js",
    "./public/node-graph-lut-cell.js",
    "./public/node-graph-metallic-ratio.js",
    "./public/node-graph-stdlib/node-graph-analog-filter-helpers.js",
    "./public/node-graph-stdlib/node-graph-visual-control-helpers.js",
    "./public/node-graph-stdlib/node-graph-seeded-rng-helpers.js",
    "./public/node-graph-stdlib/node-graph-shared-dsp-helpers.js",
    "./public/node-graph-live-frame-evaluator.js",
    "./public/node-graph-surge-oscillator.js",
    "./public/node-graph-live-runtime.js",
    "./public/node-graph-wire-controller-bootstrap.js",
    "./public/node-graph-workspace-event-bindings.js",
    "./public/node-graph-render-live-event-bindings.js",
    "./public/node-graph-header-event-bindings.js",
    "./public/node-graph-help-event-bindings.js",
    "./public/node-graph-scene-menu-event-bindings.js",
    "./public/node-graph-uidev-event-bindings.js",
    "./public/node-graph-settings-event-bindings.js",
    "./public/node-graph-slider-event-bindings.js",
    "./public/node-graph-event-bindings.js",
    "./public/node-graph-bootstrap.js",
    "./public/node-graph-bradley-2a.js",
    "./public/node-graph-antisaw.js",
    "./public/app-event-bindings.js",
    "./public/app.js",
    "./native_modules/logistic_map/logistic_map-live-evaluator.js",
    "./public/modules/turingMachine/turing-machine-live-evaluator.js",
    "./public/modules/oscilloscopeBank/oscilloscope-bank-display.js",
    "./public/modules/videoscope/videoscope-display.js",
    "./public/modules/transport/transport-display.js",
    "./public/modules/henonMap/henon-map-live-evaluator.js",
    "./public/modules/chuaAttractor/chua-attractor-live-evaluator.js",
    "./public/modules/chordMemory/chord-memory-live-evaluator.js",
    "./public/modules/pitchQuantizer/pitch-quantizer-live-evaluator.js",
    "./public/modules/wirdoSpiral/wirdo-spiral-live-evaluator.js",
    "./public/modules/blubb/blubb-live-evaluator.js",
    "./public/modules/mushroom/mushroom-live-evaluator.js",
    "./public/modules/boing/boing-live-evaluator.js",
    "./public/modules/torus/torus-live-evaluator.js",
    "./public/modules/keplerBouwkamp/kepler-bouwkamp-live-evaluator.js",
    "./public/modules/nyquistShannon/nyquist-shannon-live-evaluator.js",
    "./public/modules/radar/radar-live-evaluator.js",
    "./public/modules/surgeOscillator/surge-oscillator-live-evaluator.js",
    "./public/modules/dsfOscillator/dsf-oscillator-live-evaluator.js",
    "./public/modules/robinSupersaw/robin-supersaw-live-evaluator.js",
    "./public/modules/hypersaw/hypersaw-live-evaluator.js",
    "./public/modules/chordSequencer/chord-sequencer-live-evaluator.js",
    "./public/modules/lutCell/lut-cell-live-evaluator.js",
    "./public/modules/metallicRatio/metallic-ratio-live-evaluator.js",
    "./public/modules/passiveFilter/passive-filter-live-evaluator.js",
    "./public/modules/papoulisFilter/papoulis-filter-live-evaluator.js",
    "./public/modules/phosphillator/phosphillator-live-evaluator.js",
    "./public/modules/cookbookFilter/cookbook-filter-live-evaluator.js",
    "./public/modules/ladderFilter/ladder-filter-live-evaluator.js",
    "./public/modules/flowerChildFilter/flower-child-filter-live-evaluator.js",
    "./public/modules/rsmetFilter/rsmet-filter-live-evaluator.js",
    "./public/modules/yellowjacketFilter/yellowjacket-filter-live-evaluator.js",
    "./public/modules/superloveFilter/superlove-filter-live-evaluator.js",
    "./public/modules/chaoticPhaseLockingFilter/chaotic-phase-locking-filter-live-evaluator.js",
    "./public/modules/resonatorFilter/resonator-filter-live-evaluator.js",
    "./public/modules/humanFilter/human-filter-live-evaluator.js",
    "./public/modules/pulseExplosion/pulse-explosion-live-evaluator.js",
    "./public/modules/comparator/comparator-live-evaluator.js",
    "./public/modules/minMax/min-max-live-evaluator.js",
    "./public/modules/aliasSine/alias-sine-live-evaluator.js",
    "./public/modules/tb303Filter/tb303-filter-live-evaluator.js",
    "./public/modules/delayEffect/delay-effect-live-evaluator.js",
    "./public/modules/pingPongDelay/ping-pong-delay-live-evaluator.js",
    "./public/modules/reverbEffect/reverb-effect-live-evaluator.js",
    "./public/modules/pll/pll-live-evaluator.js",
    "./public/modules/helmholtzPitch/helmholtz-pitch-live-evaluator.js",
    "./public/modules/slewLimiter/slew-limiter-live-evaluator.js",
    "./public/modules/sampleHold/sample-hold-live-evaluator.js",
    "./public/modules/expAdsr/exp-adsr-live-evaluator.js",
    "./public/modules/linearEnvelope/linear-envelope-live-evaluator.js",
    "./public/modules/pluckEnvelope/pluck-envelope-live-evaluator.js",
    "./public/modules/vactrolEnvelope/vactrol-envelope-live-evaluator.js",
    "./public/modules/impulseButton/impulse-button-live-evaluator.js",
    "./public/modules/flowerChildEnvelopeFollower/flower-child-envelope-follower-live-evaluator.js",
    "./public/modules/spiral/spiral-live-evaluator.js",
    "./public/modules/fractalSpiral/fractal-spiral-live-evaluator.js",
    "./public/modules/logSpiral/log-spiral-live-evaluator.js",
    "./public/modules/lorenzAttractor/lorenz-attractor-live-evaluator.js",
    "./public/modules/noiseGenerator/noise-generator-live-evaluator.js",
    "./public/modules/randomWalk/random-walk-live-evaluator.js",
    "./public/modules/piSpigotNoise/pi-spigot-noise-live-evaluator.js",
    "./public/modules/bradley2a/bradley-2a-live-evaluator.js",
    "./public/modules/antisaw/antisaw-live-evaluator.js",
    "./public/modules/fractalBrownianNoise/fractal-brownian-noise-live-evaluator.js",
    "./public/modules/clock/clock-live-evaluator.js",
    "./public/modules/transport/transport-live-evaluator.js",
    "./public/modules/randomClock/random-clock-live-evaluator.js",
    "./public/modules/clockDivider/clock-divider-live-evaluator.js",
    "./public/modules/delayedTrigger/delayed-trigger-live-evaluator.js",
    "./public/modules/triggerCounter/trigger-counter-live-evaluator.js",
    "./public/modules/triggerDivider/trigger-divider-live-evaluator.js",
    "./public/modules/stepSequencer/step-sequencer-live-evaluator.js",
    "./public/modules/midiOut/midi-out-live-evaluator.js",
    "./public/modules/midiNotePitch/midi-note-pitch-live-evaluator.js",
    "./public/modules/keyboardController/keyboard-controller-live-evaluator.js",
    "./public/modules/buttonEvents/button-events-live-evaluator.js",
    "./public/modules/wireEvents/wire-events-live-evaluator.js",
    "./public/modules/shootingStarExplosion/shooting-star-explosion-live-evaluator.js",
    "./public/modules/patchCommand/patch-command-live-evaluator.js",
    "./public/modules/macroControls/macro-controls-live-evaluator.js",
    "./public/modules/pitchModWheel/pitch-mod-wheel-live-evaluator.js",
    "./public/modules/gain/gain-live-evaluator.js",
    "./public/modules/led/led-live-evaluator.js",
    "./public/modules/bias/bias-live-evaluator.js",
    "./public/modules/softClipper/soft-clipper-live-evaluator.js",
    "./public/modules/rotate3dTo2d/rotate-3d-to-2d-live-evaluator.js",
    "./public/modules/valueSlider/value-slider-live-evaluator.js",
    "./public/modules/knob/knob-live-evaluator.js",
    "./public/modules/sandboxVisuals/sandbox-visuals-live-evaluator.js",
    "./public/modules/screenSpaceShader/screen-space-shader-live-evaluator.js",
    "./public/modules/bloomGlow/bloom-glow-live-evaluator.js",
    "./public/modules/rgbaHsla/rgba-hsla-live-evaluator.js",
    "./public/modules/chromaColor/chroma-color-live-evaluator.js",
    "./public/modules/badvalMonitor/badval-monitor-live-evaluator.js",
    "./public/modules/speakerProtection/speaker-protection-live-evaluator.js",
    "./public/modules/groupOutput/group-output-live-evaluator.js",
    "./public/modules/clapPlugin/clap-plugin-live-evaluator.js",
    "./public/modules/output/output-live-evaluator.js",
    "./public/modules/groupInput/group-input-live-evaluator.js",
    "./public/modules/audioInput/audio-input-live-evaluator.js",
    "./public/modules/audioPlayer/audio-player-live-evaluator.js",
    "./public/modules/moduleGroup/module-group-live-evaluator.js",
    "./public/modules/codeblock/codeblock-live-evaluator.js",
    "./public/modules/sineWavetable/sine-wavetable-live-evaluator.js",
    "./public/modules/ellipsoid/ellipsoid-live-evaluator.js",
    "./public/modules/additiveOsc/additive-osc-live-evaluator.js",
    "./public/modules/graph/graph-live-evaluator.js",
    "./public/modules/polyBlep/poly-blep-live-evaluator.js",
)


# Mirrors nodeGraphLiveWorkletSourceFiles in node-graph-live-runtime.js --
# the ordered list of files the Blob loader concatenates into the one
# AudioWorklet module. Must be kept in sync by hand (same contract as
# PUBLIC_SCRIPT_PATHS mirroring index.html's <script> tags) whenever a
# module's worklet math is split out of node-live-audio-worklet-core.js
# into its own public/modules/<name>/ file.
WORKLET_BLOB_SOURCE_FILES = (
    "node-live-audio-worklet-core.js",
    "modules/codeblock/codeblock-worklet-evaluator.js",
    "modules/moduleGroup/module-group-worklet-evaluator.js",
    "modules/ellipsoid/ellipsoid-worklet-evaluator.js",
    "modules/sineWavetable/sine-wavetable-worklet-evaluator.js",
    "modules/additiveOsc/additive-osc-worklet-evaluator.js",
    "modules/polyBlep/poly-blep-worklet-evaluator.js",
    "modules/noiseGenerator/noise-generator-worklet-evaluator.js",
    "modules/randomWalk/random-walk-worklet-evaluator.js",
    "modules/piSpigotNoise/pi-spigot-noise-worklet-evaluator.js",
    "modules/bradley2a/bradley-2a-worklet-evaluator.js",
    "modules/antisaw/antisaw-worklet-evaluator.js",
    "modules/fractalBrownianNoise/fractal-brownian-noise-worklet-evaluator.js",
    "modules/logisticMap/logistic-map-worklet-evaluator.js",
    "modules/turingMachine/turing-machine-worklet-evaluator.js",
    "modules/henonMap/henon-map-worklet-evaluator.js",
    "modules/chuaAttractor/chua-attractor-worklet-evaluator.js",
    "modules/chordMemory/chord-memory-worklet-evaluator.js",
    "modules/pitchQuantizer/pitch-quantizer-worklet-evaluator.js",
    "modules/wirdoSpiral/wirdo-spiral-worklet-evaluator.js",
    "modules/blubb/blubb-worklet-evaluator.js",
    "modules/mushroom/mushroom-worklet-evaluator.js",
    "modules/boing/boing-worklet-evaluator.js",
    "modules/torus/torus-worklet-evaluator.js",
    "modules/keplerBouwkamp/kepler-bouwkamp-worklet-evaluator.js",
    "modules/nyquistShannon/nyquist-shannon-worklet-evaluator.js",
    "modules/surgeOscillator/surge-oscillator-worklet-evaluator.js",
    "modules/dsfOscillator/dsf-oscillator-worklet-evaluator.js",
    "modules/robinSupersaw/robin-supersaw-worklet-evaluator.js",
    "modules/hypersaw/hypersaw-worklet-evaluator.js",
    "modules/chordSequencer/chord-sequencer-worklet-evaluator.js",
    "modules/lutCell/lut-cell-worklet-evaluator.js",
    "modules/passiveFilter/passive-filter-worklet-evaluator.js",
    "modules/papoulisFilter/papoulis-filter-worklet-evaluator.js",
    "modules/phosphillator/phosphillator-worklet-evaluator.js",
    "modules/cookbookFilter/cookbook-filter-worklet-evaluator.js",
    "modules/ladderFilter/ladder-filter-worklet-evaluator.js",
    "modules/flowerChildFilter/flower-child-filter-worklet-evaluator.js",
    "modules/rsmetFilter/rsmet-filter-worklet-evaluator.js",
    "modules/yellowjacketFilter/yellowjacket-filter-worklet-evaluator.js",
    "modules/superloveFilter/superlove-filter-worklet-evaluator.js",
    "modules/chaoticPhaseLockingFilter/chaotic-phase-locking-filter-worklet-evaluator.js",
    "modules/resonatorFilter/resonator-filter-worklet-evaluator.js",
    "modules/humanFilter/human-filter-worklet-evaluator.js",
    "modules/pulseExplosion/pulse-explosion-worklet-evaluator.js",
    "modules/comparator/comparator-worklet-evaluator.js",
    "modules/minMax/min-max-worklet-evaluator.js",
    "modules/aliasSine/alias-sine-worklet-evaluator.js",
    "modules/tb303Filter/tb303-filter-worklet-evaluator.js",
    "modules/delayEffect/delay-effect-worklet-evaluator.js",
    "modules/pingPongDelay/ping-pong-delay-worklet-evaluator.js",
    "modules/reverbEffect/reverb-effect-worklet-evaluator.js",
    "modules/pll/pll-worklet-evaluator.js",
    "modules/helmholtzPitch/helmholtz-pitch-worklet-evaluator.js",
    "modules/slewLimiter/slew-limiter-worklet-evaluator.js",
    "modules/sampleHold/sample-hold-worklet-evaluator.js",
    "modules/expAdsr/exp-adsr-worklet-evaluator.js",
    "modules/linearEnvelope/linear-envelope-worklet-evaluator.js",
    "modules/pluckEnvelope/pluck-envelope-worklet-evaluator.js",
    "modules/vactrolEnvelopeSeries/vactrol-envelope-series-worklet-evaluator.js",
    "modules/impulseButton/impulse-button-worklet-evaluator.js",
    "modules/flowerChildEnvelopeFollower/flower-child-envelope-follower-worklet-evaluator.js",
    "modules/spiral/spiral-worklet-evaluator.js",
    "modules/fractalSpiral/fractal-spiral-worklet-evaluator.js",
    "modules/logSpiral/log-spiral-worklet-evaluator.js",
    "modules/lorenzAttractor/lorenz-attractor-worklet-evaluator.js",
    "modules/clock/clock-worklet-evaluator.js",
    "modules/transport/transport-worklet-evaluator.js",
    "modules/randomClock/random-clock-worklet-evaluator.js",
    "modules/triggerDivider/trigger-divider-worklet-evaluator.js",
    "modules/delayedTrigger/delayed-trigger-worklet-evaluator.js",
    "modules/triggerCounter/trigger-counter-worklet-evaluator.js",
    "modules/stepSequencer/step-sequencer-worklet-evaluator.js",
    "modules/nextPatch/next-patch-worklet-evaluator.js",
    "modules/softClipper/soft-clipper-worklet-evaluator.js",
    "modules/rgbaHsla/rgba-hsla-worklet-evaluator.js",
    "modules/screenSpaceShader/screen-space-shader-worklet-evaluator.js",
    "modules/metallicRatio/metallic-ratio-worklet-evaluator.js",
    "modules/speakerProtection/speaker-protection-worklet-evaluator.js",
    "modules/badvalMonitor/badval-monitor-worklet-evaluator.js",
    "modules/radar/radar-worklet-evaluator.js",
    "modules/audioPlayer/audio-player-worklet-evaluator.js",
    "modules/videoscope/videoscope-worklet-evaluator.js",
    "node-live-audio-worklet-register.js",
)


def read_assembled_worklet_source() -> str:
    return "\n".join(
        (PUBLIC / relative_path).read_text(encoding="utf-8")
        for relative_path in WORKLET_BLOB_SOURCE_FILES
    )


def public_script_request_path(script_path: str) -> str:
    return script_path.removeprefix(".")


def public_script_source_path(script_path: str) -> Path:
    if script_path == "./public/presets/useruisettings.js":
        return DEFAULT_UI_SETTINGS_SCRIPT
    return ROOT / script_path.removeprefix("./")


def static_asset_contracts():
    for script_path in PUBLIC_SCRIPT_PATHS:
        yield public_script_request_path(script_path), JS_CONTENT_TYPES, public_script_source_path(script_path)
    for relative_path in WORKLET_BLOB_SOURCE_FILES:
        yield f"/public/{relative_path}", JS_CONTENT_TYPES, PUBLIC / relative_path
    yield "/public/styles.css", "text/css", PUBLIC / "styles.css"


@cache
def read_public_script_sources() -> dict[str, str]:
    return {
        script_path: public_script_source_path(script_path).read_text(encoding="utf-8")
        for script_path in PUBLIC_SCRIPT_PATHS
    }

SOEMDSP_META_HEADER = ROOT.parent / "soemdsp" / "include" / "soemdsp" / "meta.hpp"
EXPECTED_CONTRACT = "soemdsp-demo-local-sandbox-handoff"
EXPECTED_CONTRACT_VERSION = 1
EXPECTED_INSPECTION_MODE = "mouse-and-ears"
EXPECTED_META_KINDS = {
    "amplitude",
    "bypass",
    "decibels",
    "decimal",
    "decimal_bipolar",
    "descrete",
    "frequency",
    "integer_bipolar",
    "momentary",
    "onoff",
    "phase",
    "pitch",
    "plusminus",
    "seconds",
    "sustain",
    "waveform",
}
REQUIRED_FLAGS = {
    "callerOwnsProcessingOrder": True,
    "callerOwnsDspObjects": True,
    "circuitOwnsDspObjects": False,
    "dspObjectsKnowCircuit": False,
    "serializesPatch": False,
    "ownsAudioEngine": False,
    "ownsScheduler": False,
}
REQUIRED_ARTIFACT_KINDS = {
    "entry-point",
    "audio",
    "manifest",
    "text-summary",
    "wav-report",
}
EXPECTED_DEMOS = {
    "runtime_dsp_object_bound_wav_resync_demo":
        "demo-local-bound-wav-resync-artifacts",
    "runtime_dsp_object_circuit_connected_wav_demo":
        "demo-local-circuit-connected-wav-artifacts",
    "runtime_dsp_object_circuit_connected_bias_wav_demo":
        "demo-local-circuit-connected-bias-wav-artifacts",
}
EXPECTED_CALLER_PROCESSING_STEPS = {
    "runtime_dsp_object_circuit_connected_wav_demo": [
        {
            "index": 0,
            "sourceNode": "Tiny Oscillator",
            "sourcePort": "Out",
            "destinationNode": "Tiny Gain",
            "destinationPort": "A",
            "callerStep": "oscillator.processSample -> gain.processSample",
        },
        {
            "index": 1,
            "sourceNode": "Tiny Gain",
            "sourcePort": "Out",
            "destinationNode": "Audio Out",
            "destinationPort": "In",
            "callerStep": "gain.processSample -> output sample",
        },
    ],
    "runtime_dsp_object_circuit_connected_bias_wav_demo": [
        {
            "index": 0,
            "sourceNode": "Tiny Oscillator",
            "sourcePort": "Out",
            "destinationNode": "Tiny Gain",
            "destinationPort": "A",
            "callerStep": "oscillator.processSample -> gain.processSample",
        },
        {
            "index": 1,
            "sourceNode": "Tiny Gain",
            "sourcePort": "Out",
            "destinationNode": "Tiny Bias",
            "destinationPort": "A",
            "callerStep": "gain.processSample -> bias.processSample",
        },
        {
            "index": 2,
            "sourceNode": "Tiny Bias",
            "sourcePort": "Out",
            "destinationNode": "Audio Out",
            "destinationPort": "In",
            "callerStep": "bias.processSample -> output sample",
        },
    ],
}
REPORT_ARTIFACT_KINDS = {
    "manifest",
    "text-summary",
    "wav-report",
    "phase-report",
}
SUMMARY_PARAMETER_KEYS = (
    "first half frequency",
    "first half amplitude",
    "second half frequency",
    "second half amplitude",
)
REQUIRED_SHELL_IDS = {
    "artifactCoverage",
    "artifactCoverageStatus",
    "artifactList",
    "artifactRoot",
    "artifactStatus",
    "audioPlayer",
    "audioPosition",
    "audioTitle",
    "boundaryFlags",
    "checklist",
    "checklistStatus",
    "circuitChain",
    "circuitChainStatus",
    "contractStatus",
    "currentAmplitude",
    "currentFrequency",
    "currentMeasuredFrequency",
    "currentMeasuredFrequencyDelta",
    "currentMeasuredPeak",
    "currentMeasuredPeakDelta",
    "currentMeasuredStatus",
    "currentParameterStatus",
    "followAudioButton",
    "frameCount",
    "handsOnReadiness",
    "handsOnReadinessStatus",
    "inspectionCursor",
    "inspectionCursorAudio",
    "inspectionCursorDelta",
    "inspectionCursorDivergence",
    "inspectionCursorPlayback",
    "inspectionCursorPreview",
    "inspectionCursorSeek",
    "inspectionCursorSeekTarget",
    "inspectionCursorSeekSync",
    "inspectionCursorSource",
    "inspectionCursorStatus",
    "inspectionCursorTarget",
    "inspectionCursorTransport",
    "inspectionCursorView",
    "inspectionMode",
    "levelEnvelopeCanvas",
    "levelEnvelopeMeta",
    "levelEnvelopePeak",
    "levelEnvelopeProbe",
    "levelEnvelopeRms",
    "levelEnvelopeStatus",
    "manifestBytes",
    "manifestCacheControl",
    "manifestExpires",
    "manifestHttpStatus",
    "manifestLoadedAt",
    "manifestModified",
    "manifestPath",
    "manifestPragma",
    "manifestStatus",
    "loadNodeGraphScriptButton",
    "nodeAudioStats",
    "nodeBadValueMonitorButton",
    "nodeTripEarProtectionButton",
    "nodeBadValueMonitorEvidence",
    "nodeBadValueMonitorStatus",
    "nodeConnectionList",
    "nodeDeleteButton",
    "nodeExecutionPlanDebug",
    "nodeExecutionPolicy",
    "nodeExecutionPlanSummary",
    "nodeExecutionPlanStatus",
    "nodeExecutionOrder",
    "nodeExecutionWireModes",
    "nodeCopyExecutionJsonButton",
    "nodeExecutionJsonStatus",
    "nodeCopyRuntimeSketchButton",
    "nodeRuntimeSketch",
    "nodeRuntimeSketchStatus",
    "nodeGraphNodes",
    "nodeGraphRenderStatus",
    "nodeGraphResizeHandle",
    "nodeGraphSource",
    "nodeGraphStatus",
    "nodeGraphValidation",
    "nodeGraphWorkspace",
    "nodeGraphZoomSurface",
    "nodeGridHeatmap",
    "nodeInteractionHelp",
    "nodeModuleScopeCanvas",
    "nodeModularShaderCanvas",
    "nodeVideoViewPanel",
    "nodeVideoViewStatus",
    "nodeCameraResolutionWidth",
    "nodeCameraResolutionHeight",
    "nodeCodeScreenBody",
    "nodeCodeScreenEyebrow",
    "nodeCodeScreenLookupHelpers",
    "nodeCodeScreenLookupResults",
    "nodeCodeScreenLookupSearch",
    "nodeCodeScreenLookupNamespaces",
    "nodeCodeScreenLookupSnippets",
    "nodeCodeScreenLookupSummary",
    "nodeCodeScreenLookupTarget",
    "nodeCodeScreenClearLookupSearch",
    "nodeCodeScreenSections",
    "nodeCodeScreenStatus",
    "nodeCodeScreenTitle",
    "nodeCodeScreenView",
    "nodeCodeScreenViewButton",
    "nodeMappingView",
    "nodeMappingGrid",
    "nodeMappingStatus",
    "nodeShaderScriptApply",
    "nodeShaderScriptClose",
    "nodeShaderScriptDialog",
    "nodeShaderScriptEnable",
    "nodeShaderScriptHighlight",
    "nodeShaderScriptCopy",
    "nodeShaderScriptCopyStatus",
    "nodeShaderScriptPaste",
    "nodeShaderScriptToDesktop",
    "nodeShaderScriptPreviewPanel",
    "nodeShaderScriptCameraViewport",
    "nodeShaderScriptCameraSurface",
    "nodeShaderScriptPreviewStatus",
    "nodeShaderScriptSource",
    "nodeShaderScriptStatus",
    "nodeShaderScriptSyntaxColorsButton",
    "nodeShaderScriptSyntaxColorsPanel",
    "nodeShaderScriptSyntaxColorsReset",
    "nodeShaderScriptSyntaxColorProperty",
    "nodeShaderScriptVideoInputBar",
    "nodeShaderScriptVideoInputChoices",
    "nodeShaderScriptSyntaxColorAssignment",
    "nodeShaderScriptSyntaxColorNumber",
    "nodeShaderScriptSyntaxColorMode",
    "nodeShaderScriptSyntaxColorComment",
    "nodeShaderScriptTextSizeDecrease",
    "nodeShaderScriptTextSizeIncrease",
    "nodeShaderScriptTitle",
    "nodeShaderScriptTokenWidget",
    "nodeShaderScriptColorWidget",
    "nodeShaderScriptColorWidgetHost",
    "nodeShaderScriptModeWidget",
    "nodeScriptGridHeightPxValue",
    "nodeScriptGridWidthPxValue",
    "patchGridHeightPxValue",
    "patchGridWidthPxValue",
    "nodeLiveEngineStatus",
    "nodeLiveInputStatus",
    "nodeLiveInputMeter",
    "nodeLiveMicStatus",
    "nodeLiveMeter",
    "nodeGpuAdditiveStatus",
    "nodeLivePlanStatus",
    "nodeLiveRouteStatus",
    "nodeLiveStatus",
    "nodeVisualOutputCanvas",
    "nodeVisualOutputMeta",
    "nodeVisualOutputStatus",
    "nodeOutputSummary",
    "patchVisualScaleValue",
    "patchVisualStyleValue",
    "patchVisualThemeValue",
    "patchVisualTrailValue",
    "nodeZoomInButton",
    "nodeZoomOutButton",
    "nodeModularOnlyBackButton",
    "nodeSettingsView",
    "nodeSettingsViewButton",
    "nodeParameterMetadataPopover",
    "nodePalette",
    "nodePatchScript",
    "nodePatchScriptFileInput",
    "nodePatchNameHeader",
    "nodePatchTagsHeader",
    "nodePatchBankNameHeader",
    "nodeCanvasScriptDialog",
    "nodeCanvasScriptSource",
    "nodeCanvasScriptSave",
    "nodeCanvasScriptCopy",
    "nodeCanvasScriptPaste",
    "nodeCanvasScriptToDesktop",
    "nodeCanvasScriptStarter",
    "nodeCanvasScriptSaveDefault",
    "nodeCanvasScriptStatus",
    "nodeSceneCanvasControls",
    "nodeSceneCanvasScript",
    "updateDefaultPresetButton",
    "nodeRedoButton",
    "nodeRenderButton",
    "nodeModuleShopView",
    "nodeModuleShopClose",
    "nodeModuleShopHeading",
    "nodeModuleShopDragHandle",
    "nodeModuleDepartmentSearch",
    "nodeModuleDepartmentSearchShell",
    "nodeModuleDepartmentList",
    "nodeModuleGroups",
    "nodeModuleGroupList",
    "nodeSceneCloseMenu",
    "nodeSceneCodeblockOpenCodeScreen",
    "nodeSceneContextMenu",
    "nodeSceneDragHandle",
    "nodeScopeContextMenu",
    "nodeSceneAddToGroup",
    "nodeScriptView",
    "nodeSettingsScriptViewButton",
    "nodeSignalPlotCanvas",
    "nodeLiveInputButton",
    "nodeLiveOutputButton",
    "nodeUndoButton",
    "nodeWaveformCanvas",
    "nodeWireSvg",
    "patchAuthorValue",
    "patchDescriptionValue",
    "patchNameValue",
    "patchTagsValue",
    "patchVisualModeValue",
    "downloadNodeGraphScriptButton",
    "metadataAdvancedToggle",
    "metadataAliasValue",
    "metadataDefaultValue",
    "metadataDivideChoicesValue",
    "metadataDisplayChoicesValue",
    "metadataKindValue",
    "metadataLinearSmoothingValue",
    "metadataMaxDigitsValue",
    "metadataNonlinearSliderValue",
    "metadataChoicesValue",
    "metadataCloseDiscard",
    "metadataClosePrompt",
    "metadataCloseSave",
    "metadataMaxValue",
    "metadataMidLabel",
    "metadataMidValue",
    "metadataMinValue",
    "metadataPopoverClose",
    "metadataPopoverCornerDrag",
    "metadataPopoverDragHandle",
    "metadataPopoverSubtitle",
    "metadataPopoverTitle",
    "metadataRestoreDefaultButton",
    "metadataShowSignValue",
    "metadataScriptApply",
    "metadataScriptCopy",
    "metadataScriptEffective",
    "metadataScriptHighlight",
    "metadataScriptKindTemplate",
    "metadataScriptNormalize",
    "metadataScriptPaste",
    "metadataScriptReference",
    "metadataScriptRefresh",
    "metadataScriptSource",
    "metadataScriptStatus",
    "metadataScriptTarget",
    "metadataScriptToDesktop",
    "metadataSaveFieldsButton",
    "metadataRestoreFieldsButton",
    "metadataWraparoundValue",
    "metadataStepValue",
    "metadataUnitValue",
    "parameterSummary",
    "parameterSummaryStatus",
    "parameterTimeline",
    "parameterTimelinePhase",
    "parameterTimelineProbe",
    "parameterTimelineStatus",
    "phaseAudioStats",
    "phaseAudioStatsProbe",
    "phaseAudioStatsStatus",
    "phaseCoverage",
    "phaseCoverageStatus",
    "phaseList",
    "phaseProbe",
    "phaseStatus",
    "producerProof",
    "producerStatus",
    "reportControls",
    "reportStatus",
    "reportViewer",
    "sandboxContract",
    "sandboxContractStatus",
    "sourceDetail",
    "sourceError",
    "sourceStatus",
    "signalPlotCanvas",
    "signalPlotControls",
    "signalPlotLagSummary",
    "signalPlotMeta",
    "signalPlotModeSummary",
    "signalPlotPoint",
    "signalPlotProbe",
    "signalPlotProbeSource",
    "signalPlotStatus",
    "signalPlotWindowSummary",
    "waveformCanvas",
    "waveformMeta",
    "waveformPhase",
    "waveformPhaseControls",
    "waveformPhaseJumpTarget",
    "waveformPhaseRange",
    "waveformPlayButton",
    "waveformPosition",
    "waveformProbe",
    "waveformSample",
    "waveformScrubber",
    "waveformStatus",
    "toggleDebugButton",
}


class ShellContractParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.duplicate_ids: set[str] = set()
        self.elements_by_id: dict[str, tuple[str, dict[str, str]]] = {}
        self.ids: set[str] = set()
        self.inline_script_count = 0
        self.scripts: set[str] = set()
        self.stylesheets: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {key: value if value is not None else "" for key, value in attrs}
        element_id = attributes.get("id")
        if element_id:
            if element_id in self.ids:
                self.duplicate_ids.add(element_id)
            self.ids.add(element_id)
            self.elements_by_id[element_id] = (tag, attributes)

        if tag == "script":
            src = attributes.get("src")
            if src:
                self.scripts.add(src)
            else:
                self.inline_script_count += 1

        if tag == "link" and attributes.get("rel") == "stylesheet":
            href = attributes.get("href")
            if href:
                self.stylesheets.add(href)


@dataclass
class Response:
    status: int
    reason: str
    headers: dict[str, str]
    body: bytes


def request(
    url: str,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    data: bytes | None = None,
) -> Response:
    request = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return Response(
                status=response.status,
                reason=response.reason,
                headers={key.lower(): value for key, value in response.headers.items()},
                body=response.read(),
            )
    except urllib.error.HTTPError as error:
        return Response(
            status=error.code,
            reason=error.reason,
            headers={key.lower(): value for key, value in error.headers.items()},
            body=error.read(),
        )
    except urllib.error.URLError as error:
        return Response(
            status=0,
            reason=str(error.reason),
            headers={},
            body=b"",
        )


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def trace_test_point(value: float) -> float:
    return round(float(value or 0) - 0.5) + 0.5


def normalize_trace_test_points(points: list[dict[str, float]]) -> list[dict[str, float]]:
    return [
        {"x": trace_test_point(point.get("x", 0)), "y": trace_test_point(point.get("y", 0))}
        for point in points
    ]


def push_trace_test_point(points: list[dict[str, float]], point: dict[str, float]) -> None:
    previous = points[-1] if points else None
    if not previous or abs(previous["x"] - point["x"]) > 0.001 or abs(previous["y"] - point["y"]) > 0.001:
        points.append(point)


def trace_test_orthogonal_points(
    start: dict[str, float],
    waypoints: list[dict[str, float]],
    end: dict[str, float],
) -> list[dict[str, float]]:
    anchors = normalize_trace_test_points([start, *normalize_trace_test_points(waypoints), end])
    if len(anchors) < 2:
        return anchors

    routed: list[dict[str, float]] = []
    push_trace_test_point(routed, anchors[0])
    for anchor in anchors[1:]:
        previous = routed[-1]
        if abs(previous["x"] - anchor["x"]) > 0.001 and abs(previous["y"] - anchor["y"]) > 0.001:
            push_trace_test_point(routed, {"x": anchor["x"], "y": previous["y"]})
        push_trace_test_point(routed, anchor)
    return routed


def trace_test_single_move_point(
    start: dict[str, float],
    waypoints: list[dict[str, float]],
    point: dict[str, float],
) -> dict[str, float]:
    anchors = normalize_trace_test_points([start, *normalize_trace_test_points(waypoints)])
    previous = anchors[-1]
    target = normalize_trace_test_points([point])[0]
    dx = abs(target["x"] - previous["x"])
    dy = abs(target["y"] - previous["y"])
    return {"x": target["x"], "y": previous["y"]} if dx >= dy else {"x": previous["x"], "y": target["y"]}


def require_manual_trace_waypoint_contract() -> None:
    waypoints = [
        {"x": 123, "y": 234},
        {"x": 345, "y": 456},
        {"x": 567, "y": 234},
    ]
    routed = trace_test_orthogonal_points({"x": 0, "y": 0}, waypoints, {"x": 700, "y": 500})
    routed_pairs = {(point["x"], point["y"]) for point in routed}
    for point in normalize_trace_test_points(waypoints):
        require(
            (point["x"], point["y"]) in routed_pairs,
            f"manual trace waypoint missing from routed path: {point}",
        )
    for previous, current in zip(routed, routed[1:]):
        require(
            previous["x"] == current["x"] or previous["y"] == current["y"],
            f"manual trace segment is diagonal: {previous} -> {current}",
        )
    normalized_once = normalize_trace_test_points(waypoints)
    normalized_twice = normalize_trace_test_points(normalized_once)
    require(normalized_once == normalized_twice, "manual trace waypoint normalization must be idempotent")

    start = {"x": 0, "y": 0}
    first_click = trace_test_single_move_point(start, [], {"x": 100, "y": 60})
    second_click = trace_test_single_move_point(start, [first_click], {"x": 100, "y": 140})
    require(first_click == {"x": 100.5, "y": 0.5}, "first manual trace click should add only one horizontal move")
    require(second_click == {"x": 100.5, "y": 140.5}, "second manual trace click should add only one vertical move")


def read_soemdsp_meta_kinds() -> set[str]:
    source = SOEMDSP_META_HEADER.read_text(encoding="utf-8")
    enum_start = source.index("enum class MetaType")
    body_start = source.index("{", enum_start) + 1
    body_end = source.index("};", body_start)
    names: set[str] = set()
    for line in source[body_start:body_end].splitlines():
        line = line.split("//", 1)[0].strip().rstrip(",")
        if line:
            names.add(line)
    return names


def require_soemdsp_wire_meta_traits() -> None:
    source = SOEMDSP_META_HEADER.read_text(encoding="utf-8")
    for snippet in [
        "std::string_view unit_;",
        ", unit_(WireTypeTraits::get(type).unit_)",
        ", maxDigits(WireTypeTraits::get(type).maxDigits)",
        ", divideChoicesVisibly(!customchoices.empty() ? true : WireTypeTraits::get(type).divideChoicesVisibly)",
        ", def_(!customchoices.empty() ? 0.0 : WireTypeTraits::get(type).def_)",
        ", min_(!customchoices.empty() ? 0.0 : WireTypeTraits::get(type).min_)",
        "? static_cast<double>(customchoices.size() - 1)",
        ": WireTypeTraits::get(type).max_)",
        'static_assert(WireMeta{ "frequency", "", MetaType::frequency }.unit_ == "Hz");',
        'static_assert(WireMeta{ "frequency", "", MetaType::frequency }.max_ == 20000.0);',
        'static_assert(WireMeta{ "frequency", "", MetaType::frequency }.maxDigits == 5);',
        'static_assert(WireMeta{ "amplitude", "", MetaType::amplitude }.maxDigits == 3);',
        'static_assert(WireMeta{ "waveform", "", MetaType::waveform }.choices.size() == 5);',
        'static_assert(WireMeta{ "waveform", "", MetaType::waveform }.max_ == 4.0);',
        'static_assert(WireMeta{ "custom", "", MetaType::waveform, choice::onoff }.choices.size() == 2);',
        'static_assert(WireMeta{ "custom", "", MetaType::waveform, choice::onoff }.def_ == 0.0);',
        'static_assert(WireMeta{ "custom", "", MetaType::waveform, choice::onoff }.max_ == 1.0);',
    ]:
        require(snippet in source, f"soemdsp WireMeta trait contract missing {snippet}")


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.bind(("127.0.0.1", 0))
        return int(server.getsockname()[1])


def require_port_available(port: int) -> None:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
            server.bind(("127.0.0.1", port))
    except OSError as error:
        raise RuntimeError(f"port {port} is not available: {error}") from error


def run_step(label: str, action: Callable[[], None]) -> None:
    print(f"[smoke] {label}...", flush=True)
    try:
        action()
    except Exception as error:
        raise AssertionError(f"{label} failed: {error}") from error
    print(f"[smoke] {label}: ok", flush=True)


def require_no_store(response: Response, label: str) -> None:
    require(
        "no-store" in response.headers.get("cache-control", ""),
        f"{label} missing no-store cache-control",
    )
    require(
        response.headers.get("pragma") == "no-cache",
        f"{label} missing no-cache pragma",
    )
    require(response.headers.get("expires") == "0", f"{label} missing expires 0")


def require_content_type(response: Response, expected: str | tuple[str, ...], label: str) -> None:
    content_type = response.headers.get("content-type", "")
    expected_values = (expected,) if isinstance(expected, str) else expected
    require(
        any(content_type.startswith(value) for value in expected_values),
        f"{label} content-type was {content_type!r}, expected {expected_values!r}",
    )


def require_json_response_metadata(response: Response, label: str) -> None:
    require_no_store(response, label)
    require_content_type(response, "application/json", label)
    require(
        response.headers.get("content-length") == str(len(response.body)),
        f"{label} content-length mismatch",
    )


def require_manifest_file_info(
  payload: dict[str, object],
  manifest_file: Path,
  label: str,
) -> None:
    manifest_info = payload.get("manifestInfo")
    require(isinstance(manifest_info, dict), f"{label} manifest info missing")
    require(
        manifest_info.get("bytes") == manifest_file.stat().st_size,
        f"{label} manifest byte count mismatch",
    )
    require(
        isinstance(manifest_info.get("modifiedUtc"), str),
        f"{label} manifest modified time missing",
    )


def require_shell_element(
  parser: ShellContractParser,
  element_id: str,
  tag: str,
  expected_attrs: dict[str, str],
) -> None:
    element = parser.elements_by_id.get(element_id)
    require(element is not None, f"shell element {element_id} missing")
    actual_tag, actual_attrs = element
    require(actual_tag == tag, f"shell element {element_id} was {actual_tag}, expected {tag}")
    for key, expected in expected_attrs.items():
        actual = actual_attrs.get(key)
        require(
            actual == expected,
            f"shell element {element_id} {key} was {actual!r}, expected {expected!r}",
        )


def require_shell_contract(html: str) -> None:
    parser = ShellContractParser()
    parser.feed(html)
    script_paths = {urllib.parse.urlsplit(src).path for src in parser.scripts}
    stylesheet_paths = {urllib.parse.urlsplit(href).path for href in parser.stylesheets}

    duplicate_ids = sorted(parser.duplicate_ids)
    require(not duplicate_ids, f"shell duplicate ids: {duplicate_ids}")
    missing_ids = sorted(REQUIRED_SHELL_IDS - parser.ids)
    require(not missing_ids, f"shell missing required ids: {missing_ids}")
    for snippet in [
        "<span>ALIAS</span>",
        "<span>KIND</span>",
        "<span>UNIT</span>",
        "<span>MAX DIGITS</span>",
        "<span>MIN</span>",
        "<span>MID</span>",
        "<span>MAX</span>",
        "<span>DEFAULT</span>",
        "<span>STEP</span>",
        "<span>CHOICES</span>",
    ]:
        require(snippet in html, f"parameter metadata label should be literal all caps: {snippet}")
    require(
        "<span>constrained</span>" not in html,
        "resource widgets should show CPU/RAM/GPU without the word constrained",
    )
    require(parser.inline_script_count == 0, "shell includes inline script")
    require(
        script_paths == set(PUBLIC_SCRIPT_PATHS),
        f"shell scripts were {sorted(parser.scripts)!r}",
    )
    require(
        stylesheet_paths == {"./public/styles.css"},
        f"shell stylesheets were {sorted(parser.stylesheets)!r}",
    )
    require_shell_element(
        parser,
        "audioPlayer",
        "audio",
        {"controls": "", "preload": "metadata"},
    )
    require_shell_element(
        parser,
        "nodeGraphWorkspace",
        "div",
        {"aria-label": "Drag wires between DSP node ports"},
    )
    require_shell_element(
        parser,
        "nodeWireSvg",
        "svg",
        {"aria-hidden": "true", "focusable": "false"},
    )
    require_shell_element(
        parser,
        "nodeRenderButton",
        "button",
        {"type": "button"},
    )
    require_shell_element(
        parser,
        "nodeLiveInputButton",
        "button",
        {"type": "button", "aria-pressed": "false"},
    )
    require_shell_element(
        parser,
        "nodeLiveOutputButton",
        "button",
        {"type": "button", "aria-pressed": "false"},
    )
    require_shell_element(
        parser,
        "nodeLiveInputStatus",
        "span",
        {},
    )
    require_shell_element(
        parser,
        "nodeLiveInputMeter",
        "span",
        {},
    )
    require_shell_element(
        parser,
        "nodeLiveMicStatus",
        "span",
        {},
    )
    require_shell_element(
        parser,
        "nodeLiveStatus",
        "span",
        {},
    )
    require_shell_element(
        parser,
        "nodeWaveformCanvas",
        "canvas",
        {"width": "720", "height": "180", "aria-label": "Node graph rendered waveform"},
    )
    require_shell_element(
        parser,
        "nodeSignalPlotCanvas",
        "canvas",
        {"width": "720", "height": "300", "aria-label": "Node graph rendered signal plot"},
    )
    require_shell_element(
        parser,
        "nodeVisualOutputCanvas",
        "canvas",
        {"width": "720", "height": "300", "aria-label": "Node graph visual output"},
    )
    require_shell_element(
        parser,
        "followAudioButton",
        "button",
        {"type": "button", "aria-pressed": "true"},
    )
    require_shell_element(
        parser,
        "waveformPlayButton",
        "button",
        {"type": "button", "aria-pressed": "false", "disabled": ""},
    )
    require_shell_element(
        parser,
        "waveformCanvas",
        "canvas",
        {"width": "1120", "height": "180", "aria-label": "Primary WAV waveform"},
    )
    require_shell_element(
        parser,
        "waveformProbe",
        "span",
        {
            "data-probe-source": "none",
            "data-probe-frame": "none",
            "data-tooltip-key": "legacyEvidence.waveformProbeIdle",
        },
    )
    require_shell_element(
        parser,
        "parameterTimelineProbe",
        "span",
        {
            "data-probe-source": "none",
            "data-probe-frame": "none",
            "data-tooltip-key": "legacyEvidence.parameterTimelineProbeIdle",
        },
    )
    require_shell_element(
        parser,
        "phaseAudioStatsProbe",
        "span",
        {
            "data-probe-source": "none",
            "data-probe-frame": "none",
            "data-tooltip-key": "legacyEvidence.phaseAudioStatsProbeIdle",
        },
    )
    require_shell_element(
        parser,
        "phaseProbe",
        "span",
        {
            "data-probe-source": "none",
            "data-probe-frame": "none",
            "data-tooltip-key": "legacyEvidence.phaseListProbeIdle",
        },
    )
    require_shell_element(
        parser,
        "signalPlotCanvas",
        "canvas",
        {"width": "720", "height": "360", "aria-label": "Primary WAV signal plot"},
    )
    require_shell_element(
        parser,
        "signalPlotProbe",
        "span",
        {
            "data-probe-source": "none",
            "data-probe-frame": "none",
            "data-tooltip-key": "legacyEvidence.signalPlotProbeIdle",
        },
    )
    require_shell_element(
        parser,
        "signalPlotProbeSource",
        "span",
        {
            "data-probe-source": "none",
            "data-probe-frame": "none",
            "data-tooltip-key": "legacyEvidence.signalPlotSourceProbeIdle",
        },
    )
    require_shell_element(
        parser,
        "levelEnvelopeCanvas",
        "canvas",
        {"width": "1120", "height": "140", "aria-label": "Primary WAV level envelope"},
    )
    require_shell_element(
        parser,
        "levelEnvelopeProbe",
        "span",
        {
            "data-probe-source": "none",
            "data-probe-frame": "none",
            "data-tooltip-key": "legacyEvidence.levelEnvelopeProbeIdle",
        },
    )
    require_shell_element(
        parser,
        "waveformScrubber",
        "input",
        {
            "type": "range",
            "min": "0",
            "max": "1",
            "step": "0.001",
            "value": "0",
            "aria-label": "Waveform position",
            "aria-valuetext": "0.000s / unknown / phase unknown / follow",
            "data-follow-mode": "follow",
            "data-tooltip-key": "legacyEvidence.waveformPositionIdle",
        },
    )


def require_handoff_contract(payload: dict[str, object]) -> None:
    manifest = payload.get("manifest")
    require(isinstance(manifest, dict), "manifest object missing")
    require(manifest.get("allOk") is True, "manifest allOk was not true")

    handoff = manifest.get("sandboxHandoff")
    require(isinstance(handoff, dict), "sandbox handoff missing")
    require(handoff.get("contract") == EXPECTED_CONTRACT, "handoff contract mismatch")
    require(
        handoff.get("contractVersion") == EXPECTED_CONTRACT_VERSION,
        "handoff contract version mismatch",
    )
    require(
        handoff.get("inspectionMode") == EXPECTED_INSPECTION_MODE,
        "handoff inspection mode mismatch",
    )

    for key, expected in REQUIRED_FLAGS.items():
        require(handoff.get(key) is expected, f"handoff flag {key} mismatch")


def require_producer_proof(payload: dict[str, object]) -> None:
    manifest = payload.get("manifest")
    require(isinstance(manifest, dict), "manifest object missing")
    demo = manifest.get("demo")
    require(demo in EXPECTED_DEMOS, "demo name mismatch")
    require(manifest.get("kind") == EXPECTED_DEMOS[demo], "artifact kind mismatch")
    require(manifest.get("runtimeApi") is False, "runtime API flag mismatch")
    require(manifest.get("scheduler") is False, "scheduler flag mismatch")
    require(manifest.get("audioEngine") is False, "audio engine flag mismatch")

    setters = manifest.get("parameterSetters")
    require(isinstance(setters, dict), "parameter setters missing")
    require(setters.get("frequency") is True, "frequency setter missing")
    require(setters.get("amplitude") is True, "amplitude setter missing")


def require_artifact_contract(payload: dict[str, object]) -> None:
    manifest = payload.get("manifest")
    require(isinstance(manifest, dict), "manifest object missing")
    handoff = manifest.get("sandboxHandoff")
    require(isinstance(handoff, dict), "sandbox handoff missing")

    links = manifest.get("artifactLinks")
    require(isinstance(links, list), "artifact links missing")
    require(all(isinstance(link, dict) for link in links), "artifact link not object")
    require(all(link.get("path") for link in links), "artifact link path missing")

    kinds = {str(link.get("kind")) for link in links}
    missing_kinds = REQUIRED_ARTIFACT_KINDS - kinds
    require(not missing_kinds, f"required artifact kinds missing: {sorted(missing_kinds)}")
    for kind in REQUIRED_ARTIFACT_KINDS - {"phase-report"}:
        count = sum(1 for link in links if link.get("kind") == kind)
        require(count == 1, f"{kind} artifact link count mismatch")

    links_by_kind = {str(link.get("kind")): link for link in links}
    entry_point = handoff.get("entryPoint")
    primary_audio = handoff.get("primaryAudioArtifact")
    require(
        links_by_kind["entry-point"].get("path") == entry_point,
        "entry-point link did not match handoff entry point",
    )
    require(
        links_by_kind["audio"].get("path") == primary_audio,
        "audio link did not match handoff primary audio",
    )

    wav = manifest.get("wav")
    require(isinstance(wav, dict), "wav metadata missing")
    require(wav.get("path") == primary_audio, "wav path did not match primary audio")

    phases = manifest.get("phases")
    require(isinstance(phases, list), "phases missing")
    phase_report_count = sum(1 for link in links if link.get("kind") == "phase-report")
    require(
        phase_report_count == len(phases),
        "phase report count did not match phase count",
    )
    phase_names = {
        str(phase.get("name"))
        for phase in phases
        if isinstance(phase, dict) and phase.get("name")
    }
    report_phases: set[str] = set()
    for index, link in enumerate(links):
        if link.get("kind") != "phase-report":
            continue
        phase = link.get("phase")
        require(isinstance(phase, str) and phase, f"phase report {index} phase missing")
        require(phase in phase_names, f"phase report {index} phase unknown")
        require(phase not in report_phases, f"phase report {index} phase duplicate")
        report_phases.add(phase)
    require(report_phases == phase_names, "phase report phases did not match phases")


def artifact_contract_fixture() -> dict[str, object]:
    return {
        "manifest": {
            "sandboxHandoff": {
                "entryPoint": "runtime_dsp_object_bound_wav_resync_demo.html",
                "primaryAudioArtifact": "runtime_dsp_object_bound_wav_resync_demo.wav",
            },
            "artifactLinks": [
                {
                    "label": "HTML report",
                    "kind": "entry-point",
                    "path": "runtime_dsp_object_bound_wav_resync_demo.html",
                },
                {
                    "label": "Primary WAV",
                    "kind": "audio",
                    "path": "runtime_dsp_object_bound_wav_resync_demo.wav",
                },
                {
                    "label": "Manifest",
                    "kind": "manifest",
                    "path": "runtime_dsp_object_bound_wav_resync_demo.manifest.json",
                },
                {
                    "label": "Summary",
                    "kind": "text-summary",
                    "path": "runtime_dsp_object_bound_wav_resync_demo_summary.txt",
                },
                {
                    "label": "WAV report",
                    "kind": "wav-report",
                    "path": "runtime_dsp_object_bound_wav_resync_demo_wav_report.txt",
                },
                {
                    "label": "Phase report",
                    "kind": "phase-report",
                    "path": "runtime_dsp_object_bound_wav_resync_demo_first_phase.txt",
                    "phase": "first",
                },
            ],
            "wav": {
                "path": "runtime_dsp_object_bound_wav_resync_demo.wav",
            },
            "phases": [
                {
                    "name": "first",
                },
            ],
        },
    }


def require_artifact_contract_failure(
  label: str,
  mutate: Callable[[dict[str, object]], None],
  expected: str,
) -> None:
    payload = json.loads(json.dumps(artifact_contract_fixture()))
    manifest = payload["manifest"]
    require(isinstance(manifest, dict), f"{label} fixture manifest missing")
    mutate(manifest)
    try:
        require_artifact_contract(payload)
    except AssertionError as error:
        require(expected in str(error), f"{label} produced {error}, expected {expected}")
        return

    raise AssertionError(f"{label} did not fail")


def require_artifact_contract_negative_cases() -> None:
    require_artifact_contract(artifact_contract_fixture())
    require_artifact_contract_failure(
        "entry point link mismatch",
        lambda manifest: manifest["artifactLinks"][0].update({"path": "other.html"}),
        "entry-point link did not match handoff entry point",
    )
    require_artifact_contract_failure(
        "audio link mismatch",
        lambda manifest: manifest["artifactLinks"][1].update({"path": "other.wav"}),
        "audio link did not match handoff primary audio",
    )
    require_artifact_contract_failure(
        "wav path mismatch",
        lambda manifest: manifest["wav"].update({"path": "other.wav"}),
        "wav path did not match primary audio",
    )
    require_artifact_contract_failure(
        "duplicate entry point",
        lambda manifest: manifest["artifactLinks"].append(
            {
                "label": "Duplicate HTML report",
                "kind": "entry-point",
                "path": "duplicate.html",
            },
        ),
        "entry-point artifact link count mismatch",
    )
    require_artifact_contract_failure(
        "duplicate audio",
        lambda manifest: manifest["artifactLinks"].append(
            {
                "label": "Duplicate WAV",
                "kind": "audio",
                "path": "duplicate.wav",
            },
        ),
        "audio artifact link count mismatch",
    )
    require_artifact_contract_failure(
        "phase report phase missing",
        lambda manifest: manifest["artifactLinks"][-1].pop("phase"),
        "phase report 5 phase missing",
    )
    require_artifact_contract_failure(
        "phase report phase unknown",
        lambda manifest: manifest["artifactLinks"][-1].update({"phase": "other"}),
        "phase report 5 phase unknown",
    )
    require_artifact_contract_failure(
        "phase report phase duplicate",
        lambda manifest: (
            manifest["phases"].append({"name": "second"}),
            manifest["artifactLinks"].append(
                {
                    "label": "Second phase report",
                    "kind": "phase-report",
                    "path": "runtime_dsp_object_bound_wav_resync_demo.second.txt",
                    "phase": "first",
                },
            ),
        ),
        "phase report 6 phase duplicate",
    )


def require_phase_contract(payload: dict[str, object]) -> None:
    manifest = payload.get("manifest")
    require(isinstance(manifest, dict), "manifest object missing")

    wav = manifest.get("wav")
    require(isinstance(wav, dict), "wav metadata missing")
    wav_frames = int(wav.get("frames", 0))
    require(wav_frames > 0, "wav frame count missing")

    phases = manifest.get("phases")
    require(isinstance(phases, list), "phases missing")
    require(phases, "phases empty")

    total_phase_frames = 0
    expected_start_frame = 0
    for index, phase in enumerate(phases):
        require(isinstance(phase, dict), f"phase {index} not object")
        require(phase.get("name"), f"phase {index} name missing")
        require(phase.get("preflightOk") is True, f"phase {index} preflight failed")
        require(phase.get("applyOk") is True, f"phase {index} apply failed")
        require(phase.get("processOk") is True, f"phase {index} process failed")
        samples = int(phase.get("samplesProcessed", 0))
        require(samples > 0, f"phase {index} samples missing")
        start_frame = int(phase.get("startFrame", -1))
        end_frame = int(phase.get("endFrame", -1))
        require(
            start_frame == expected_start_frame,
            f"phase {index} start frame mismatch",
        )
        require(
            end_frame == start_frame + samples,
            f"phase {index} end frame mismatch",
        )
        expected_start_frame = end_frame
        total_phase_frames += samples

    require(
        total_phase_frames == wav_frames,
        f"phase frames {total_phase_frames} did not match wav frames {wav_frames}",
    )

    measurements = manifest.get("phaseAudioMeasurements")
    require(isinstance(measurements, list), "phase audio measurements missing")
    require(
        len(measurements) == len(phases),
        "phase audio measurement count did not match phase count",
    )
    measurements_by_name = {
        measurement.get("name"): measurement
        for measurement in measurements
        if isinstance(measurement, dict)
    }
    resync = manifest.get("parameterResync")
    require(isinstance(resync, dict), "parameter resync missing")
    frequency = resync.get("frequency")
    amplitude = resync.get("amplitude")
    bias = resync.get("bias", {})
    require(isinstance(frequency, dict), "frequency resync missing")
    require(isinstance(amplitude, dict), "amplitude resync missing")
    require(isinstance(bias, dict), "bias resync invalid")
    for phase in phases:
        require(isinstance(phase, dict), "phase not object")
        name = phase.get("name")
        require(isinstance(name, str) and name, "phase name missing")
        measurement = measurements_by_name.get(name)
        require(isinstance(measurement, dict), f"{name} measurement missing")
        measured_frequency = float(measurement.get("measuredFrequency", 0))
        peak = float(measurement.get("peak", 0))
        rms = float(measurement.get("rms", 0))
        dc_offset = float(measurement.get("dcOffset", 0))
        target_amplitude = float(amplitude.get(name, 0))
        target_bias = float(bias.get(name, 0))
        target_peak = target_amplitude + abs(target_bias)
        require(
            abs(measured_frequency - float(frequency.get(name, 0))) < 0.5,
            f"{name} producer measured frequency mismatch",
        )
        require(
            abs(peak - target_peak) < 0.001,
            f"{name} producer measured peak mismatch",
        )
        require(
            abs(dc_offset - target_bias) < 0.001,
            f"{name} producer measured dc offset mismatch",
        )
        require(rms > 0, f"{name} producer measured rms missing")


def phase_audio_contract_fixture() -> dict[str, object]:
    return {
        "manifest": {
            "wav": {
                "frames": 200,
            },
            "phases": [
                {
                    "name": "first",
                    "preflightOk": True,
                    "applyOk": True,
                    "processOk": True,
                    "samplesProcessed": 100,
                    "startFrame": 0,
                    "endFrame": 100,
                },
                {
                    "name": "second",
                    "preflightOk": True,
                    "applyOk": True,
                    "processOk": True,
                    "samplesProcessed": 100,
                    "startFrame": 100,
                    "endFrame": 200,
                },
            ],
            "parameterResync": {
                "frequency": {
                    "first": 220,
                    "second": 440,
                },
                "amplitude": {
                    "first": 0.2,
                    "second": 0.35,
                },
            },
            "phaseAudioMeasurements": [
                {
                    "name": "first",
                    "measuredFrequency": 220,
                    "peak": 0.2,
                    "rms": 0.141421,
                },
                {
                    "name": "second",
                    "measuredFrequency": 440,
                    "peak": 0.35,
                    "rms": 0.247487,
                },
            ],
        }
    }


def require_phase_audio_contract_failure(
  label: str,
  mutate: Callable[[dict[str, object]], None],
  expected: str,
) -> None:
    payload = json.loads(json.dumps(phase_audio_contract_fixture()))
    manifest = payload["manifest"]
    require(isinstance(manifest, dict), f"{label} fixture manifest missing")
    mutate(manifest)
    try:
        require_phase_contract(payload)
    except AssertionError as error:
        require(expected in str(error), f"{label} produced {error}, expected {expected}")
        return

    raise AssertionError(f"{label} did not fail")


def require_phase_audio_contract_negative_cases() -> None:
    require_phase_contract(phase_audio_contract_fixture())
    require_phase_audio_contract_failure(
        "missing measurements",
        lambda manifest: manifest.pop("phaseAudioMeasurements"),
        "phase audio measurements missing",
    )
    require_phase_audio_contract_failure(
        "measurement count mismatch",
        lambda manifest: manifest["phaseAudioMeasurements"].pop(),
        "phase audio measurement count did not match phase count",
    )
    require_phase_audio_contract_failure(
        "measurement name mismatch",
        lambda manifest: manifest["phaseAudioMeasurements"][0].update({"name": "other"}),
        "first measurement missing",
    )
    require_phase_audio_contract_failure(
        "producer frequency mismatch",
        lambda manifest: manifest["phaseAudioMeasurements"][0].update(
            {"measuredFrequency": 221},
        ),
        "first producer measured frequency mismatch",
    )
    require_phase_audio_contract_failure(
        "producer peak mismatch",
        lambda manifest: manifest["phaseAudioMeasurements"][0].update({"peak": 0.25}),
        "first producer measured peak mismatch",
    )
    require_phase_audio_contract_failure(
        "producer rms missing",
        lambda manifest: manifest["phaseAudioMeasurements"][0].update({"rms": 0}),
        "first producer measured rms missing",
    )


def parameter_resync_contract_fixture() -> dict[str, object]:
    return {
        "manifest": {
            "parameterResync": {
                "frequency": {
                    "changed": True,
                    "first": 220,
                    "second": 440,
                },
                "amplitude": {
                    "changed": True,
                    "first": 0.2,
                    "second": 0.35,
                },
            },
        },
    }


def require_parameter_resync_contract(payload: dict[str, object]) -> None:
    manifest = payload.get("manifest")
    require(isinstance(manifest, dict), "manifest object missing")
    resync = manifest.get("parameterResync")
    require(isinstance(resync, dict), "parameter resync missing")

    for key in ("frequency", "amplitude"):
        values = resync.get(key)
        require(isinstance(values, dict), f"{key} resync missing")
        require(values.get("changed") is True, f"{key} resync changed flag missing")
        first = float(values.get("first", 0))
        second = float(values.get("second", 0))
        require(first > 0, f"{key} first value invalid")
        require(second > 0, f"{key} second value invalid")
        require(second > first, f"{key} did not resync upward")


def require_parameter_resync_contract_failure(
  label: str,
  mutate: Callable[[dict[str, object]], None],
  expected: str,
) -> None:
    payload = json.loads(json.dumps(parameter_resync_contract_fixture()))
    manifest = payload["manifest"]
    require(isinstance(manifest, dict), f"{label} fixture manifest missing")
    mutate(manifest)
    try:
        require_parameter_resync_contract(payload)
    except AssertionError as error:
        require(expected in str(error), f"{label} produced {error}, expected {expected}")
        return

    raise AssertionError(f"{label} did not fail")


def require_parameter_resync_contract_negative_cases() -> None:
    require_parameter_resync_contract(parameter_resync_contract_fixture())
    require_parameter_resync_contract_failure(
        "missing parameter resync",
        lambda manifest: manifest.pop("parameterResync"),
        "parameter resync missing",
    )
    require_parameter_resync_contract_failure(
        "missing frequency",
        lambda manifest: manifest["parameterResync"].pop("frequency"),
        "frequency resync missing",
    )
    require_parameter_resync_contract_failure(
        "frequency changed flag false",
        lambda manifest: manifest["parameterResync"]["frequency"].update(
            {"changed": False},
        ),
        "frequency resync changed flag missing",
    )
    require_parameter_resync_contract_failure(
        "amplitude first invalid",
        lambda manifest: manifest["parameterResync"]["amplitude"].update({"first": 0}),
        "amplitude first value invalid",
    )
    require_parameter_resync_contract_failure(
        "amplitude not upward",
        lambda manifest: manifest["parameterResync"]["amplitude"].update(
            {"second": 0.1},
        ),
        "amplitude did not resync upward",
    )


def caller_processing_order_contract_fixture() -> dict[str, object]:
    demo = "runtime_dsp_object_circuit_connected_wav_demo"
    steps = EXPECTED_CALLER_PROCESSING_STEPS[demo]
    return {
        "manifest": {
            "demo": demo,
            "circuitConnections": {
                "count": len(steps),
                "describesProcessingChain": True,
            },
            "callerProcessingOrderProof": {
                "matchesCircuitConnections": True,
            },
            "callerProcessingOrder": {
                "matchesCircuitConnections": True,
                "callerOwnsProcessingOrder": True,
                "steps": json.loads(json.dumps(steps)),
            },
        },
    }


def require_caller_processing_order_contract(payload: dict[str, object]) -> None:
    manifest = payload.get("manifest")
    require(isinstance(manifest, dict), "manifest object missing")
    expected_steps = EXPECTED_CALLER_PROCESSING_STEPS.get(str(manifest.get("demo")))
    if expected_steps is None:
        return

    connections = manifest.get("circuitConnections")
    require(isinstance(connections, dict), "circuit connections missing")
    require(
        int(connections.get("count", 0)) == len(expected_steps),
        "circuit connection count mismatch",
    )
    require(
        connections.get("describesProcessingChain") is True,
        "circuit connection chain flag missing",
    )

    proof = manifest.get("callerProcessingOrderProof")
    require(isinstance(proof, dict), "caller processing proof missing")
    require(
        proof.get("matchesCircuitConnections") is True,
        "caller processing order mismatch",
    )

    order = manifest.get("callerProcessingOrder")
    require(isinstance(order, dict), "caller processing order missing")
    require(
        order.get("matchesCircuitConnections") is True,
        "caller processing order match flag missing",
    )
    require(
        order.get("callerOwnsProcessingOrder") is True,
        "caller processing ownership missing",
    )

    steps = order.get("steps")
    require(isinstance(steps, list), "caller processing steps missing")
    require(
        len(steps) == len(expected_steps),
        "caller processing step count mismatch",
    )
    for index, expected in enumerate(expected_steps):
        step = steps[index]
        require(isinstance(step, dict), "caller processing step invalid")
        for key, expected_value in expected.items():
            require(
                step.get(key) == expected_value,
                f"caller processing step {index} {key} mismatch",
            )


def require_caller_processing_order_contract_failure(
  label: str,
  mutate: Callable[[dict[str, object]], None],
  expected: str,
) -> None:
    payload = json.loads(json.dumps(caller_processing_order_contract_fixture()))
    manifest = payload["manifest"]
    require(isinstance(manifest, dict), f"{label} fixture manifest missing")
    mutate(manifest)
    try:
        require_caller_processing_order_contract(payload)
    except AssertionError as error:
        require(expected in str(error), f"{label} produced {error}, expected {expected}")
        return

    raise AssertionError(f"{label} did not fail")


def require_caller_processing_order_contract_negative_cases() -> None:
    require_caller_processing_order_contract(caller_processing_order_contract_fixture())
    require_caller_processing_order_contract_failure(
        "missing circuit connections",
        lambda manifest: manifest.pop("circuitConnections"),
        "circuit connections missing",
    )
    require_caller_processing_order_contract_failure(
        "wrong circuit connection count",
        lambda manifest: manifest["circuitConnections"].update({"count": 1}),
        "circuit connection count mismatch",
    )
    require_caller_processing_order_contract_failure(
        "chain flag false",
        lambda manifest: manifest["circuitConnections"].update(
            {"describesProcessingChain": False},
        ),
        "circuit connection chain flag missing",
    )
    require_caller_processing_order_contract_failure(
        "proof false",
        lambda manifest: manifest["callerProcessingOrderProof"].update(
            {"matchesCircuitConnections": False},
        ),
        "caller processing order mismatch",
    )
    require_caller_processing_order_contract_failure(
        "order flag false",
        lambda manifest: manifest["callerProcessingOrder"].update(
            {"matchesCircuitConnections": False},
        ),
        "caller processing order match flag missing",
    )
    require_caller_processing_order_contract_failure(
        "ownership false",
        lambda manifest: manifest["callerProcessingOrder"].update(
            {"callerOwnsProcessingOrder": False},
        ),
        "caller processing ownership missing",
    )
    require_caller_processing_order_contract_failure(
        "step count mismatch",
        lambda manifest: manifest["callerProcessingOrder"]["steps"].pop(),
        "caller processing step count mismatch",
    )
    require_caller_processing_order_contract_failure(
        "step mismatch",
        lambda manifest: manifest["callerProcessingOrder"]["steps"][0].update(
            {"destinationNode": "Audio Out"},
        ),
        "caller processing step 0 destinationNode mismatch",
    )


def require_artifact_reachability(base_url: str, payload: dict[str, object]) -> None:
    manifest = payload.get("manifest")
    require(isinstance(manifest, dict), "manifest object missing")
    artifact_root = payload.get("artifactRoot")
    require(isinstance(artifact_root, str) and artifact_root, "artifact root missing")
    artifact_root_path = Path(artifact_root).resolve()
    links = manifest.get("artifactLinks")
    require(isinstance(links, list), "artifact links missing")

    for index, link in enumerate(links):
        require(isinstance(link, dict), f"artifact link {index} not object")
        path = link.get("path")
        require(isinstance(path, str) and path, f"artifact link {index} path missing")
        local_path = (artifact_root_path / path).resolve()
        require(
            local_path.is_relative_to(artifact_root_path),
            f"artifact link {index} escapes artifact root",
        )
        require(local_path.is_file(), f"artifact link {index} local file missing")
        artifact_response = request(
            f"{base_url}/artifact?path={urllib.parse.quote(path)}",
            method="HEAD",
        )
        require(
            artifact_response.status == 200,
            f"artifact link {index} did not return 200",
        )
        require_no_store(artifact_response, f"artifact link {index}")
        content_length = int(artifact_response.headers.get("content-length", "0"))
        require(
            content_length == local_path.stat().st_size,
            f"artifact link {index} content length mismatch",
        )
        require(
            artifact_response.headers.get("accept-ranges") == "bytes",
            f"artifact link {index} did not advertise byte ranges",
        )
        require(
            bool(artifact_response.headers.get("last-modified")),
            f"artifact link {index} last-modified missing",
        )


def require_report_documents(base_url: str, payload: dict[str, object]) -> None:
    manifest = payload.get("manifest")
    require(isinstance(manifest, dict), "manifest object missing")
    artifact_root = payload.get("artifactRoot")
    require(isinstance(artifact_root, str) and artifact_root, "artifact root missing")
    artifact_root_path = Path(artifact_root).resolve()
    links = manifest.get("artifactLinks")
    require(isinstance(links, list), "artifact links missing")

    report_links = [
        link
        for link in links
        if isinstance(link, dict) and link.get("kind") in REPORT_ARTIFACT_KINDS
    ]
    require(report_links, "report artifact links missing")

    for index, link in enumerate(report_links):
        path = link.get("path")
        kind = link.get("kind")
        require(isinstance(path, str) and path, f"report link {index} path missing")
        local_path = (artifact_root_path / path).resolve()
        require(
            local_path.is_relative_to(artifact_root_path),
            f"report link {index} escapes artifact root",
        )
        expected = local_path.read_bytes()
        response = request(f"{base_url}/artifact?path={urllib.parse.quote(path)}")
        require(response.status == 200, f"report link {index} did not return 200")
        require_no_store(response, f"report link {index}")
        require(
            response.headers.get("content-length") == str(len(expected)),
            f"report link {index} content-length mismatch",
        )
        require(response.body == expected, f"report link {index} did not match local bytes")
        text = response.body.decode("utf-8")
        require(text.strip(), f"report link {index} was empty")
        if kind == "manifest":
            json.loads(text)


def parse_summary_pairs(text: str) -> dict[str, str]:
    pairs: dict[str, str] = {}
    for line in text.splitlines():
        key, separator, value = line.partition(":")
        if separator and key.strip():
            pairs[key.strip()] = value.strip()
    return pairs


def require_parameter_summary(base_url: str, payload: dict[str, object]) -> None:
    manifest = payload.get("manifest")
    require(isinstance(manifest, dict), "manifest object missing")

    resync = manifest.get("parameterResync")
    require(isinstance(resync, dict), "parameter resync missing")
    frequency = resync.get("frequency")
    amplitude = resync.get("amplitude")
    require(isinstance(frequency, dict), "frequency resync missing")
    require(isinstance(amplitude, dict), "amplitude resync missing")
    require(frequency.get("changed") is True, "frequency resync changed flag missing")
    require(amplitude.get("changed") is True, "amplitude resync changed flag missing")

    first_frequency = float(frequency.get("first", 0))
    second_frequency = float(frequency.get("second", 0))
    first_amplitude = float(amplitude.get("first", 0))
    second_amplitude = float(amplitude.get("second", 0))
    require(first_frequency > 0, "manifest first frequency was not positive")
    require(second_frequency > 0, "manifest second frequency was not positive")
    require(first_amplitude > 0, "manifest first amplitude was not positive")
    require(second_amplitude > 0, "manifest second amplitude was not positive")
    require(second_frequency > first_frequency, "manifest frequency did not resync upward")
    require(second_amplitude > first_amplitude, "manifest amplitude did not resync upward")

    links = manifest.get("artifactLinks")
    require(isinstance(links, list), "artifact links missing")
    summary_links = [
        link
        for link in links
        if isinstance(link, dict) and link.get("kind") == "text-summary"
    ]
    require(len(summary_links) == 1, "expected exactly one text summary")

    path = summary_links[0].get("path")
    require(isinstance(path, str) and path, "text summary path missing")
    response = request(f"{base_url}/artifact?path={urllib.parse.quote(path)}")
    require(response.status == 200, "text summary did not return 200")
    require_no_store(response, "text summary")
    pairs = parse_summary_pairs(response.body.decode("utf-8"))

    for key in SUMMARY_PARAMETER_KEYS:
        require(key in pairs, f"text summary missing {key}")
        number = float(pairs[key])
        require(number > 0, f"text summary {key} was not positive")

    require(
        float(pairs["first half frequency"]) == first_frequency,
        "text summary first frequency did not match manifest",
    )
    require(
        float(pairs["second half frequency"]) == second_frequency,
        "text summary second frequency did not match manifest",
    )
    require(
        float(pairs["first half amplitude"]) == first_amplitude,
        "text summary first amplitude did not match manifest",
    )
    require(
        float(pairs["second half amplitude"]) == second_amplitude,
        "text summary second amplitude did not match manifest",
    )


def decode_mono_float_samples(
    frames: bytes,
    channels: int,
    sample_width: int,
) -> list[float]:
    require(sample_width == 2, "WAV sample width was not 16-bit")
    samples: list[float] = []
    frame_width = channels * sample_width
    frame_count = len(frames) // frame_width
    for frame_index in range(frame_count):
        total = 0.0
        for channel in range(channels):
            offset = frame_index * frame_width + channel * sample_width
            total += int.from_bytes(
                frames[offset : offset + sample_width],
                byteorder="little",
                signed=True,
            ) / 32768
        samples.append(total / channels)
    return samples


def estimate_positive_crossing_frequency(
    samples: list[float],
    start_frame: int,
    end_frame: int,
    sample_rate: int,
) -> float | None:
    start = max(0, min(len(samples), start_frame))
    end = max(start, min(len(samples), end_frame))
    if end - start < 2 or sample_rate <= 0:
        return None

    crossings: list[float] = []
    previous = samples[start]
    for frame in range(start + 1, end):
        current = samples[frame]
        if previous < 0 <= current:
            span = current - previous
            offset = 0 if span == 0 else -previous / span
            crossings.append(frame - 1 + offset)
        previous = current

    if len(crossings) < 2:
        return None

    seconds = (crossings[-1] - crossings[0]) / sample_rate
    if seconds <= 0:
        return None
    return (len(crossings) - 1) / seconds


def require_phase_audio_measurements(
    manifest: dict[str, object],
    samples: list[float],
    sample_rate: int,
) -> None:
    phases = manifest.get("phases")
    require(isinstance(phases, list), "phase measurement phases missing")
    resync = manifest.get("parameterResync")
    require(isinstance(resync, dict), "phase measurement resync missing")
    frequency = resync.get("frequency")
    amplitude = resync.get("amplitude")
    bias = resync.get("bias", {})
    require(isinstance(frequency, dict), "phase measurement frequency missing")
    require(isinstance(amplitude, dict), "phase measurement amplitude missing")
    require(isinstance(bias, dict), "phase measurement bias invalid")
    producer_measurements = manifest.get("phaseAudioMeasurements")
    require(
        isinstance(producer_measurements, list),
        "producer phase measurements missing",
    )
    producer_measurements_by_name = {
        measurement.get("name"): measurement
        for measurement in producer_measurements
        if isinstance(measurement, dict)
    }

    for index, phase in enumerate(phases):
        require(isinstance(phase, dict), f"phase measurement {index} not object")
        name = phase.get("name")
        require(isinstance(name, str) and name, f"phase measurement {index} name missing")
        start_frame = int(phase.get("startFrame", -1))
        end_frame = int(phase.get("endFrame", -1))
        require(start_frame >= 0 and end_frame > start_frame, f"{name} range invalid")

        target_frequency = float(frequency.get(name, 0))
        target_amplitude = float(amplitude.get(name, 0))
        target_bias = float(bias.get(name, 0))
        target_peak = target_amplitude + abs(target_bias)
        require(target_frequency > 0, f"{name} target frequency missing")
        require(target_amplitude > 0, f"{name} target amplitude missing")

        measured_frequency = estimate_positive_crossing_frequency(
            samples,
            start_frame,
            end_frame,
            sample_rate,
        )
        require(measured_frequency is not None, f"{name} measured frequency missing")
        require(
            abs(measured_frequency - target_frequency) < 0.5,
            f"{name} measured frequency {measured_frequency} did not match {target_frequency}",
        )

        phase_samples = samples[start_frame:end_frame]
        peak = max(abs(sample) for sample in phase_samples)
        rms = (sum(sample * sample for sample in phase_samples) / len(phase_samples)) ** 0.5
        dc_offset = sum(phase_samples) / len(phase_samples)
        require(
            abs(peak - target_peak) < 0.001,
            f"{name} peak {peak} did not match target peak {target_peak}",
        )
        require(
            abs(dc_offset - target_bias) < 0.001,
            f"{name} dc offset {dc_offset} did not match target bias {target_bias}",
        )
        producer_measurement = producer_measurements_by_name.get(name)
        require(
            isinstance(producer_measurement, dict),
            f"{name} producer measurement missing",
        )
        producer_frequency = float(producer_measurement.get("measuredFrequency", 0))
        producer_peak = float(producer_measurement.get("peak", 0))
        producer_rms = float(producer_measurement.get("rms", 0))
        require(
            abs(producer_frequency - measured_frequency) < 0.5,
            f"{name} producer frequency {producer_frequency} did not match decoded {measured_frequency}",
        )
        require(
            abs(producer_peak - peak) < 0.001,
            f"{name} producer peak {producer_peak} did not match decoded {peak}",
        )
        require(
            abs(producer_rms - rms) < 0.001,
            f"{name} producer rms {producer_rms} did not match decoded {rms}",
        )


def require_primary_audio_wav(base_url: str, payload: dict[str, object]) -> None:
    manifest = payload.get("manifest")
    require(isinstance(manifest, dict), "manifest object missing")

    handoff = manifest.get("sandboxHandoff")
    require(isinstance(handoff, dict), "sandbox handoff missing")
    audio_path = handoff.get("primaryAudioArtifact")
    require(isinstance(audio_path, str) and audio_path, "primary audio artifact missing")

    wav = manifest.get("wav")
    require(isinstance(wav, dict), "wav metadata missing")
    expected_frames = int(wav.get("frames", 0))
    expected_sample_rate = int(wav.get("sampleRate", 0))
    expected_channels = int(wav.get("channels", 0))
    expected_bit_depth = int(wav.get("bitDepth", 0))
    expected_data_bytes = int(wav.get("dataBytes", 0))
    expected_file_bytes = int(wav.get("fileBytes", 0))
    require(expected_frames > 0, "wav frame count missing")
    require(expected_sample_rate > 0, "wav sample rate missing")
    require(expected_channels > 0, "wav channel count missing")
    require(expected_bit_depth > 0, "wav bit depth missing")
    require(expected_data_bytes > 0, "wav data byte count missing")
    require(expected_file_bytes > 0, "wav file byte count missing")

    response = request(f"{base_url}/artifact?path={urllib.parse.quote(audio_path)}")
    require(response.status == 200, "primary audio WAV did not return 200")
    require_no_store(response, "primary audio WAV")
    require(
        response.headers.get("accept-ranges") == "bytes",
        "primary audio WAV did not advertise byte ranges",
    )
    require(len(response.body) == expected_file_bytes, "WAV file byte count mismatch")

    range_url = f"{base_url}/artifact?path={urllib.parse.quote(audio_path)}"
    range_response = request(range_url, headers={"Range": "bytes=0-15"})
    require(range_response.status == 206, "primary audio range did not return 206")
    require_no_store(range_response, "primary audio range")
    require(
        range_response.headers.get("accept-ranges") == "bytes",
        "primary audio range did not advertise byte ranges",
    )
    require(
        range_response.headers.get("content-range")
        == f"bytes 0-15/{expected_file_bytes}",
        "primary audio range content-range mismatch",
    )
    require(len(range_response.body) == 16, "primary audio range byte count mismatch")

    open_range = request(range_url, headers={"Range": "bytes=16-"})
    require(open_range.status == 206, "open-ended primary audio range did not return 206")
    require_no_store(open_range, "open-ended primary audio range")
    require(
        open_range.headers.get("content-range") == f"bytes 16-{expected_file_bytes - 1}/{expected_file_bytes}",
        "open-ended primary audio range content-range mismatch",
    )
    require(
        open_range.body == response.body[16:],
        "open-ended primary audio range bytes mismatch",
    )

    suffix_range = request(range_url, headers={"Range": "bytes=-16"})
    require(suffix_range.status == 206, "suffix primary audio range did not return 206")
    require_no_store(suffix_range, "suffix primary audio range")
    require(
        suffix_range.headers.get("content-range")
        == f"bytes {expected_file_bytes - 16}-{expected_file_bytes - 1}/{expected_file_bytes}",
        "suffix primary audio range content-range mismatch",
    )
    require(suffix_range.body == response.body[-16:], "suffix primary audio range bytes mismatch")

    unsatisfied_range = request(
        range_url,
        headers={"Range": f"bytes={expected_file_bytes + 1}-"},
    )
    require(
        unsatisfied_range.status == 416,
        "unsatisfied primary audio range did not return 416",
    )
    require_no_store(unsatisfied_range, "unsatisfied primary audio range")
    require(
        unsatisfied_range.headers.get("content-range") == f"bytes */{expected_file_bytes}",
        "unsatisfied primary audio range content-range mismatch",
    )
    require(
        unsatisfied_range.headers.get("content-length") == "0",
        "unsatisfied primary audio range content-length mismatch",
    )

    for label, header in [
        ("unsupported unit", "samples=0-15"),
        ("multi range", "bytes=0-1,4-5"),
        ("reversed range", "bytes=15-0"),
        ("zero suffix", "bytes=-0"),
    ]:
        invalid_range = request(range_url, headers={"Range": header})
        require(invalid_range.status == 416, f"{label} primary audio range did not return 416")
        require_no_store(invalid_range, f"{label} primary audio range")
        require(
            invalid_range.headers.get("content-range") == f"bytes */{expected_file_bytes}",
            f"{label} primary audio range content-range mismatch",
        )
        require(
            invalid_range.headers.get("content-length") == "0",
            f"{label} primary audio range content-length mismatch",
        )
        require(invalid_range.body == b"", f"{label} primary audio range returned a body")

    try:
        with tempfile.TemporaryFile() as handle:
            handle.write(response.body)
            handle.seek(0)
            with open_wave(handle, "rb") as wave_file:
                require(wave_file.getnframes() == expected_frames, "WAV frame mismatch")
                require(
                    wave_file.getframerate() == expected_sample_rate,
                    "WAV sample rate mismatch",
                )
                require(
                    wave_file.getnchannels() == expected_channels,
                    "WAV channel count mismatch",
                )
                require(
                    wave_file.getsampwidth() * 8 == expected_bit_depth,
                    "WAV bit depth mismatch",
                )
                require(
                    expected_frames * expected_channels * wave_file.getsampwidth()
                    == expected_data_bytes,
                    "WAV data byte count mismatch",
                )
                wave_file.rewind()
                samples = decode_mono_float_samples(
                    wave_file.readframes(expected_frames),
                    expected_channels,
                    wave_file.getsampwidth(),
                )
                require(len(samples) == expected_frames, "decoded WAV sample count mismatch")
                require_phase_audio_measurements(
                    manifest,
                    samples,
                    expected_sample_rate,
                )
    except WaveError as error:
        raise AssertionError(f"primary audio WAV parse failed: {error}") from error


def require_read_only_method_rejections(base_url: str) -> None:
    for method, path in [
        ("POST", "/api/manifest"),
        ("POST", "/api/node-metadata-kinds"),
        ("PUT", "/artifact?path=runtime_dsp_object_bound_wav_resync_demo.wav"),
        ("PATCH", "/public/app.js"),
        ("DELETE", "/"),
        ("OPTIONS", "/api/manifest"),
    ]:
        response = request(f"{base_url}{path}", method=method)
        label = f"{method} {path}"
        require(response.status == 405, f"{label} did not return 405")
        require_no_store(response, label)

    invalid_default = request(f"{base_url}/api/presets/default", method="POST")
    require(invalid_default.status == 400, "empty default preset update did not return 400")
    require_no_store(invalid_default, "empty default preset update")


def require_user_ui_settings_update_contract(base_url: str) -> None:
    original = DEFAULT_UI_SETTINGS.read_bytes()
    original_script = DEFAULT_UI_SETTINGS_SCRIPT.read_bytes()
    payload = json.loads(original.decode("utf-8"))
    payload["format"] = {
        "kind": "soemdsp-sandbox-user-ui-settings",
        "version": 3,
    }
    payload["view"] = {"gridVisible": False, "sliderLayout": "value-focus"}
    body = json.dumps(payload).encode("utf-8")
    try:
        response = request(
            f"{base_url}/api/presets/useruisettings",
            method="POST",
            headers={"Content-Type": "application/json"},
            data=body,
        )
        require(response.status == 200, "version 3 UI settings update did not return 200")
        require_no_store(response, "version 3 UI settings update")
        saved_payload = json.loads(DEFAULT_UI_SETTINGS.read_text(encoding="utf-8"))
        require(
            saved_payload.get("format", {}).get("version") == 3,
            "version 3 UI settings update was not saved",
        )
        require(
            saved_payload.get("view", {}).get("gridVisible") is False,
            "UI settings update did not preserve view.gridVisible",
        )
        require(
            saved_payload.get("view", {}).get("sliderLayout") == "value-focus",
            "UI settings update did not preserve view.sliderLayout",
        )
        saved_script = DEFAULT_UI_SETTINGS_SCRIPT.read_text(encoding="utf-8")
        require(
            "window.nodeUiDevBundledDefaultSettings" in saved_script,
            "UI settings update did not write bundled script preset",
        )
        require(
            "document.documentElement.dataset.nodeUiDevBundledDefaultSettings" in saved_script,
            "UI settings update did not write DOM-readable bundled script preset",
        )
        require(
            '"gridVisible": false' in saved_script,
            "bundled UI settings script did not preserve view.gridVisible",
        )
        require(
            '"sliderLayout": "value-focus"' in saved_script,
            "bundled UI settings script did not preserve view.sliderLayout",
        )
        require(
            parse_bundled_default_ui_settings_script_payload(saved_script) == saved_payload,
            "bundled UI settings script payload did not match saved JSON after update",
        )
    finally:
        DEFAULT_UI_SETTINGS.write_bytes(original)
        DEFAULT_UI_SETTINGS_SCRIPT.write_bytes(original_script)


def require_root_shell(base_url: str) -> None:
    server_source = (ROOT / "server.py").read_text(encoding="utf-8")
    build_number_match = re.search(r'BUILD_NUMBER = "([^"]+)"', server_source)
    build_number = build_number_match.group(1) if build_number_match else ""
    version_file = ROOT / "VERSION"
    sandbox_version = version_file.read_text(encoding="utf-8").strip() if version_file.exists() else "0.0.0"
    expected = (
        (PUBLIC / "index.html")
        .read_text(encoding="utf-8")
        .replace("{{BUILD_NUMBER}}", build_number)
        .replace("{{SANDBOX_VERSION}}", sandbox_version)
        .encode("utf-8")
    )
    expected_size = str(len(expected))
    root_response: Response | None = None
    for path in ["/", "/public/index.html"]:
        response = request(f"{base_url}{path}")
        require(response.status == 200, f"{path} shell did not return 200")
        require_no_store(response, f"{path} shell")
        require_content_type(response, "text/html", f"{path} shell")
        require(
            response.headers.get("content-length") == expected_size,
            f"{path} shell content-length mismatch",
        )
        require(response.body == expected, f"{path} shell did not match local index.html")
        if path == "/":
            root_response = response

    require(root_response is not None, "root shell response missing")
    require_shell_contract(root_response.body.decode("utf-8"))


def require_static_assets(base_url: str) -> None:
    for path, content_type, source_path in static_asset_contracts():
        expected = source_path.read_bytes()
        expected_size = str(len(expected))
        head_response = request(f"{base_url}{path}", method="HEAD")
        require(head_response.status == 200, f"{path} HEAD did not return 200")
        require(head_response.body == b"", f"{path} HEAD returned a body")
        require_no_store(head_response, f"{path} HEAD")
        require_content_type(head_response, content_type, f"{path} HEAD")
        require(
            head_response.headers.get("content-length") == expected_size,
            f"{path} HEAD content-length mismatch",
        )

        get_response = request(f"{base_url}{path}")
        require(get_response.status == 200, f"{path} GET did not return 200")
        require_no_store(get_response, f"{path} GET")
        require_content_type(get_response, content_type, f"{path} GET")
        require(
            get_response.headers.get("content-length") == expected_size,
            f"{path} GET content-length mismatch",
        )
        require(get_response.body == expected, f"{path} GET did not match local file bytes")


def require_waveform_seek_source_contract() -> None:
    script_sources = read_public_script_sources()
    app_source = script_sources["./public/app.js"]
    waveform_source = "\n".join(script_sources.values())
    style_source = (PUBLIC / "styles.css").read_text(encoding="utf-8")
    require(
        "function seekPrimaryAudioToFrame(frame, source = inspectionSources.waveform)" in waveform_source,
        "waveform seek helper missing",
    )
    require(
        "audio.currentTime = targetTime;" in waveform_source,
        "waveform seek helper does not seek primary audio",
    )
    for snippet in [
        "function analyzeWaveform(samples)",
        '["peak", formatCompactNumber(stats.peak)]',
        '["rms", formatCompactNumber(stats.rms)]',
        '["dc offset", formatCompactNumber(stats.dcOffset)]',
        "function analyzeSampleRange(samples, startFrame, endFrame)",
        "function estimateZeroCrossingFrequency(samples, startFrame, endFrame, sampleRate)",
        "function activeParameterValue(name, region)",
        "function producerPhaseAudioMeasurement(region)",
        "function measuredPhaseAudio(region)",
        "function targetPeakFor(targetAmplitude, targetBias)",
        "function measuredPhaseAudioMatches(measurement, targetFrequency, targetAmplitude, targetBias = 0)",
        "function measuredPhaseDelta(measuredValue, targetValue)",
        "const measuredFrequency = document.getElementById(\"currentMeasuredFrequency\")",
        "const measuredPeak = document.getElementById(\"currentMeasuredPeak\")",
        "const measuredFrequencyDelta = document.getElementById(\"currentMeasuredFrequencyDelta\")",
        "const measuredPeakDelta = document.getElementById(\"currentMeasuredPeakDelta\")",
        "const measuredStatus = document.getElementById(\"currentMeasuredStatus\")",
        "measurement?.frequency === null || measurement?.frequency === undefined",
        "`measured ${formatCompactNumber(measurement.frequency)} Hz`",
        "`peak ${formatCompactNumber(measurement.peak)}`",
        "`freq delta ${formatSignedNumber(frequencyDelta)}`",
        "`peak delta ${formatSignedNumber(peakDelta)}`",
        '"measured ok"',
        '"measured mismatch"',
        "Math.abs(measurement.frequency - targetFrequency) <= phaseAudioFrequencyToleranceHz",
        "Math.abs(measurement.peak - targetPeak) <= phaseAudioAmplitudeTolerance",
        "Math.abs(measurement.dcOffset - (targetBias || 0)) <= phaseAudioAmplitudeTolerance",
        "function phaseAudioMeasurementIssues(manifest)",
        "const phaseAudioFrequencyToleranceHz = 0.5",
        "const phaseAudioAmplitudeTolerance = 0.001",
        "const phaseAudioRmsTolerance = 0.001",
        "function renderCurrentParameters(region)",
        "const frames = Math.max(0, region.endFrame - region.startFrame)",
        ")} / ${frames} frames`",
        "waveformProbeSource: null",
        "function labelInspectionCursorPill(element, label, value, stateName)",
        "element.dataset.inspectionPill = label",
        "element.dataset.inspectionValue = value",
        "element.dataset.inspectionState = stateName",
        "function labelInspectionCursorSurface(cursor, value, stateName)",
        'cursor.dataset.inspectionCursorLabel = "inspection cursor"',
        "cursor.dataset.inspectionCursorValue = value",
        "cursor.dataset.inspectionCursorState = stateName",
        'cursor.setAttribute("role", "group")',
        "function setInspectionCursorSource(sourceName, mode)",
        "source.className = `pill inspection-source ${mode}`",
        "labelInspectionCursorPill(source, \"inspection source\", value, mode)",
        "manifestLoading: false",
        "function renderRefreshButton(loading = state.manifestLoading)",
        'const button = document.getElementById("refreshButton")',
        "if (!button) {",
        "button.disabled = loading",
        'button.textContent = loading ? "Loading Manifest" : "Reload Manifest"',
        "button.setAttribute(\"aria-busy\", String(loading))",
        "button.dataset.loading = String(loading)",
        'loading ? "legacyEvidence.manifestReloading" : "legacyEvidence.manifestReload"',
        "if (state.manifestLoading) {",
        "state.manifestLoading = true",
        "state.manifestLoading = false",
        "?.addEventListener(\"click\", loadManifest)",
        "function formatInspectionDelta(deltaFrame, sampleRate)",
        "function setInspectionCursorDelta(deltaFrame, sampleRate)",
        "const inspectionModes = Object.freeze(",
        'none: "none"',
        'transport: "transport"',
        'hover: "hover"',
        'probe: "probe"',
        "deltaFrame === null ? inspectionModes.none : inspectionModes.hover",
        "function formatAudioDuration(duration)",
        "function setInspectionCursorAudio(time, duration)",
        "formatAudioDuration(duration)",
        "const positionText = `audio ${formatSeconds(Number.isFinite(time) ? time : 0)} / ${formatAudioDuration(duration)}`",
        'labelWaveformHeaderPill(',
        '"primary audio position"',
        "Boolean(audio.getAttribute(\"src\"))",
        'labelWaveformHeaderPill(position, "waveform position", "0.000s / unknown", false)',
        "formatAudioDuration(waveform.frames / waveform.sampleRate)",
        'labelWaveformHeaderPill(sample, "waveform sample", "frame 0 / unknown / sample 0", false)',
        "const sampleText = `frame ${state.playheadFrame} / ${waveform.frames} / sample ${formatCompactNumber(",
        "function resetSharedProbeState()",
        "function resetWaveformTransientState()",
        "resetSharedProbeState();",
        "resetWaveformTransientState();",
        "function setProbePillMetadata(probe, source, frame, title)",
        "function resetProbePill(id, text, title)",
        "function resetIdleProbePill(id, title)",
        "resetProbePill(id, inspectionModes.probe, title)",
        "probe.dataset.probeSource = source",
        'probe.dataset.probeFrame = frame === null || frame === undefined ? "none" : String(frame)',
        "probe.title = title",
        'resetIdleProbePill("waveformProbe", "Waveform probe idle")',
        "`Waveform probe ${source}",
        'resetIdleProbePill("levelEnvelopeProbe", "Level envelope probe idle")',
        "`Level envelope probe ${source}",
        'resetIdleProbePill("parameterTimelineProbe", "Parameter timeline probe idle")',
        "`Parameter timeline probe ${source}",
        'resetIdleProbePill("phaseAudioStatsProbe", "Phase audio stats probe idle")',
        "Phase audio stats probe ${source}",
        'resetIdleProbePill("phaseProbe", "Phase list probe idle")',
        "Phase list probe ${source}",
        'resetIdleProbePill("signalPlotProbe", "Signal plot probe idle")',
        'resetProbePill("signalPlotProbeSource", "near frame", "Signal plot source probe idle")',
        "Signal plot probe ${probeSource}",
        "Signal plot source ${probeSource}",
        "function updateWaveformScrubberLabel(scrubber, waveform, activeRegion)",
        "scrubber.setAttribute(\"aria-valuetext\"",
        "scrubber.dataset.followMode = followText",
        'nodeGraphTooltipText("legacyEvidence.waveformPosition"',
        "setInspectionCursorAudio(time, duration)",
        "setInspectionCursorAudio(0, Number.NaN)",
        "function setInspectionCursorPlayback(audio)",
        "labelInspectionCursorPill(playback, \"inspection playback\", value, stateName)",
        "setInspectionCursorPlayback(audio)",
        "setInspectionCursorPlayback(null)",
        'canvas.dataset.waveformSource = "decoded primary WAV"',
        "canvas.dataset.waveformSampleRate = String(state.waveform.sampleRate)",
        "canvas.dataset.waveformChannels = String(state.waveform.channels)",
        "canvas.dataset.waveformBitDepth = String(state.waveform.bitsPerSample)",
        "canvas.dataset.waveformFrames = String(state.waveform.frames)",
        "canvas.dataset.waveformDataBytes = String(state.waveform.dataBytes)",
        "canvas.dataset.waveformFileBytes = String(state.waveform.fileBytes)",
        "canvas.dataset.waveformPeak = formatCompactNumber(stats.peak)",
        "canvas.dataset.waveformRms = formatCompactNumber(stats.rms)",
        "`Primary WAV waveform / ${state.waveform.frames} frames / `",
        "function renderWaveformPlayControl(audio = document.getElementById(\"audioPlayer\"))",
        '"Pause primary audio"',
        '"Replay primary audio from start"',
        '"Play primary audio"',
        "const ended = ready && audio.ended",
        'const value = playing ? "Pause Audio" : ended ? "Replay Audio" : "Play Audio"',
        "const actionValue = playing",
        'const stateName = !ready ? "disabled" : playing ? "playing" : ended ? "ended" : "idle"',
        "button.textContent = value",
        "button.setAttribute(\"aria-pressed\", String(playing))",
        'labelWaveformControlButton(button, "waveform playback", actionValue, stateName)',
        "function togglePrimaryAudioPlayback()",
        "if (audio.ended) {",
        "audio.currentTime = 0;",
        "if (state.followAudio && state.waveform) {",
        "setPlayheadFrame(0);",
        "await audio.play();",
        "audio.pause();",
        "function syncWaveformToAudioEnd()",
        "setPlayheadFrame(state.waveform.frames);",
        '.addEventListener("ended", syncWaveformToAudioEnd)',
        ".addEventListener(\"click\", togglePrimaryAudioPlayback)",
        "function probeSourceText()",
        "function currentProbeSource()",
        "return state.waveformProbeSource || inspectionModes.probe",
        "source === inspectionModes.probe ? inspectionModes.probe : `${inspectionModes.probe} ${source}`",
        "function setInspectionCursorView(followAudio)",
        "labelInspectionCursorPill(view, \"inspection view\", value, stateName)",
        "setInspectionCursorView(state.followAudio)",
        'view.className = `pill inspection-view ${stateName}`',
        '.addEventListener("play", renderAudioPosition)',
        '.addEventListener("pause", renderAudioPosition)',
        '.addEventListener("ended", syncWaveformToAudioEnd)',
        "function setInspectionCursorPreview(active)",
        "labelInspectionCursorPill(preview, \"inspection preview\", value, stateName)",
        'setInspectionCursorPreview(false)',
        "lastSeekSource: null",
        "lastSeekFrame: null",
        "function setInspectionCursorSeek(sourceName)",
        "labelInspectionCursorPill(seek, \"inspection seek\", value, stateName)",
        'seek.className = `pill inspection-seek ${stateName}`',
        "function setInspectionCursorSeekTarget(region, frame, sampleRate)",
        '`seek target ${region.name} / ${formatSeconds(frame / sampleRate)} / frame ${frame}`',
        '"seek target none"',
        'target.className = `pill inspection-seek-target ${hasTarget ? "active" : "none"}`',
        "labelInspectionCursorPill(",
        "function setInspectionCursorSeekSync(match)",
        'match === "aligned"',
        'match === "diverged"',
        '"seek drift"',
        '"seek sync idle"',
        'sync.className = `pill inspection-seek-sync ${match}`',
        "setInspectionCursorSeek(state.lastSeekSource)",
        "setInspectionCursorSeekTarget(lastSeekRegion, lastSeekFrame, waveform.sampleRate)",
        "setInspectionCursorSeekSync(lastSeekTransportMatch)",
        "setInspectionCursorSeekTarget(null, null, 1)",
        'setInspectionCursorSeekSync("none")',
        "setInspectionCursorSeek(null)",
        "const lastSeekFrame =",
        "state.lastSeekFrame === null ? null : clampFrame(state.lastSeekFrame, waveform)",
        '["last seek source", state.lastSeekSource || "none"]',
        '"last seek mode"',
        "state.lastSeekFollowAudio === null",
        '"follow audio"',
        '"free view"',
        "function labelWaveformControlButton(button, label, value, stateName)",
        "button.dataset.waveformControlLabel = label",
        "button.dataset.waveformControlValue = valueText",
        "button.dataset.waveformControlState = stateName",
        'labelWaveformControlButton(button, "waveform playback", actionValue, stateName)',
        'labelWaveformControlButton(button, "waveform view mode", actionValue, stateName)',
        "function waveformControlsLabeled()",
        'return waveformControlButtonsLabeled(["waveformPlayButton", "followAudioButton"])',
        "function waveformPlayControlLabeled()",
        'return waveformControlButtonsLabeled(["waveformPlayButton"])',
        "function followAudioControlLabeled()",
        'return waveformControlButtonsLabeled(["followAudioButton"])',
        "function waveformControlButtonsLabeled(ids)",
        '["last seek frame", lastSeekFrame === null ? "none" : String(lastSeekFrame)]',
        '"last seek time"',
        '["last seek phase", lastSeekRegion?.name || "none"]',
        "const lastSeekTransportDeltaFrame =",
        '"last seek transport match"',
        '"last seek transport delta"',
        "lastSeekTransportDeltaFrame === 0",
        "formatInspectionDelta(lastSeekTransportDeltaFrame, waveform.sampleRate)",
        "const lastSeekHoverDeltaFrame =",
        '"last seek hover match"',
        '"last seek hover delta"',
        "lastSeekHoverDeltaFrame === 0",
        "formatInspectionDelta(lastSeekHoverDeltaFrame, waveform.sampleRate)",
        "state.lastSeekFrame = targetFrame",
        "state.lastSeekFollowAudio = state.followAudio",
        "scrubberPointerActive: false",
        "function beginScrubberDrag(event)",
        "function endScrubberDrag(event)",
        "state.lastSeekFrame = null",
        "state.lastSeekFollowAudio = null",
        "state.scrubberPointerActive = false",
        "const inspectionSources = Object.freeze(",
        'waveform: "waveform"',
        'scrubber: "scrubber"',
        'levelEnvelope: "level envelope"',
        'signalPlot: "signal plot"',
        'parameterTimeline: "parameter timeline"',
        'phaseAudioStats: "phase audio stats"',
        'phaseList: "phase list"',
        'phaseJump: "phase jump"',
        "button.dataset.phaseName = region.name || \"\"",
        "button.dataset.phaseStartFrame = String(region.startFrame)",
        "button.dataset.phaseEndFrame = String(region.endFrame)",
        "button.dataset.phaseStartTime = formatSeconds(region.startFrame / waveform.sampleRate)",
        "button.dataset.phaseEndTime = formatSeconds(region.endFrame / waveform.sampleRate)",
        '`Jump waveform to ${region.name} phase from frame ${region.startFrame} to ${region.endFrame}`',
        "`Jump to ${region.name} from ${button.dataset.phaseStartTime} to ${button.dataset.phaseEndTime}`",
        "seekPrimaryAudioToFrame(region.startFrame, inspectionSources.phaseJump)",
        "seekPrimaryAudioToFrame(waveformFrameAtClientX(clientX), inspectionSources.waveform)",
        "seekPrimaryAudioToFrame(Math.round(ratio * waveform.frames), inspectionSources.scrubber)",
        "function setInspectionCursorTarget(region, frame, sampleRate)",
        '`target ${region.name} / ${formatSeconds(frame / sampleRate)} / frame ${frame}`',
        '"target none"',
        'target.className = `pill inspection-target ${hasTarget ? "active" : "none"}`',
        'labelInspectionCursorPill(target, "inspection target", value, hasTarget ? "active" : "none")',
        "setInspectionCursorTarget(null, null, 1)",
        "function setInspectionCursorTransport(region, frame, sampleRate)",
        '`transport ${region.name} / ${formatSeconds(frame / sampleRate)} / frame ${frame}`',
        '"transport none"',
        'transport.className = `pill inspection-transport ${hasTransport ? "active" : "none"}`',
        "labelInspectionCursorPill(",
        "setInspectionCursorTransport(null, null, 1)",
        "function setInspectionCursorDivergence(transportRegion, targetRegion)",
        "`phase diverged ${transportRegion.name} -> ${targetRegion.name}`",
        '"phase aligned"',
        "divergence.className = `pill inspection-divergence ${diverged ? \"diverged\" : \"aligned\"}`",
        "setInspectionCursorDivergence(null, null)",
        "setInspectionCursorSource(inspectionModes.none, inspectionModes.none)",
        "setInspectionCursorDelta(null, 1)",
        "hoverFrame === null ? inspectionModes.transport : inspectionModes.hover",
        "setInspectionCursorDelta(hoverDeltaFrame, waveform.sampleRate)",
        "setInspectionCursorPreview(hoverFrame !== null)",
        "setInspectionCursorTransport(transportRegion, transportFrame, waveform.sampleRate)",
        "setInspectionCursorTarget(hoverRegion, hoverFrame, waveform.sampleRate)",
        "setInspectionCursorDivergence(transportRegion, hoverRegion)",
        '["hover source", hoverFrame === null ? "none" : hoverSource]',
        "const hoverDeltaFrame = hoverFrame === null ? null : hoverFrame - transportFrame",
        '"hover delta"',
        "state.waveformProbeSource = inspectionSources.waveform",
        "state.waveformProbeSource = inspectionSources.levelEnvelope",
        "function formatProbeFrame(frame, waveform, region = waveformRegionAtFrameFor(waveform, frame))",
        "function probeFrameLabelsReady()",
        "const label = formatProbeFrame(0, waveform)",
        'label.includes("0.000s")',
        'label.includes("frame 0")',
        "function waveformRegionAtFrameFor(waveform, frame)",
        "formatProbeFrame(frame, waveform, region)} / peak ${formatCompactNumber(",
        "state.waveformProbeFrame === null ? null : inspectionSources.signalPlot",
        "state.waveformProbeSource = inspectionSources.parameterTimeline",
        "state.waveformProbeSource = inspectionSources.phaseAudioStats",
        "state.waveformProbeSource = inspectionSources.phaseList",
        "setSharedProbeFrame(region.startFrame, inspectionSources.phaseJump)",
        "function renderSandboxContract(manifest)",
        '["allowed", "display manifest artifacts", Boolean(handoff.entryPoint)]',
        '["allowed", "play browser-native WAV", Boolean(handoff.primaryAudioArtifact)]',
        '["allowed", "inspect decoded WAV data", handoff.inspectionMode === expectedInspectionMode]',
        '["forbidden", "own DSP objects", handoff.circuitOwnsDspObjects === false]',
        '["forbidden", "make DSP know Circuit", handoff.dspObjectsKnowCircuit === false]',
        '["forbidden", "own scheduler", handoff.ownsScheduler === false]',
        '["forbidden", "own audio engine", handoff.ownsAudioEngine === false]',
        '["forbidden", "serialize patches", handoff.serializesPatch === false]',
        '["required", "caller owns processing order", handoff.callerOwnsProcessingOrder === true]',
        "item.dataset.contractKind = kind",
        "item.dataset.contractLabel = label",
        'item.dataset.contractState = rowOk ? "ok" : "check"',
        'item.setAttribute("role", "group")',
        "item.setAttribute(\"aria-label\", `${kind}: ${label} / ${item.dataset.contractState}`)",
        'nodeGraphTooltipText("legacyEvidence.contractRow"',
        "function sandboxContractRowsLabeled()",
        'setStatus("sandboxContractStatus", ok ? "Bounded" : "Check", ok)',
        'frequencyValue === null ? "freq" : `freq ${formatCompactNumber(frequencyValue)} Hz`',
        'amplitudeValue === null ? "amp" : `amp ${formatCompactNumber(amplitudeValue)}`',
        'const statusText = ok ? `params ${region?.name || "synced"}` : "params missing"',
        'labelWaveformHeaderPill(status, "current parameter status", statusText, ok)',
        "function parameterTimelineRows(manifest)",
        "function renderParameterTimeline(manifest)",
        "function renderUnavailableParameterSummary()",
        '["first half frequency", "unavailable"]',
        "renderUnavailableParameterSummary()",
        "function renderUnavailableParameterTimeline()",
        'label.textContent = "resync"',
        'value.textContent = "manifest required"',
        "renderUnavailableParameterTimeline()",
        "function updateParameterTimelinePlayhead(region)",
        'phase.textContent = region',
        '`phase ${region.name} / freq ${',
        '} / amp ${amplitude === null ? "missing" : formatCompactNumber(amplitude)}`',
        "function updateParameterTimelinePreview(region)",
        'segment.classList.toggle("preview", segment.dataset.phaseName === region?.name)',
        "function renderParameterTimelineProbe()",
        "function probeParameterTimelineSegment(event)",
        "function clearParameterTimelineProbe()",
        'marker.id = "parameterTimelinePlayhead"',
        'probeMarker.id = "parameterTimelineProbeMarker"',
        'segment.dataset.phaseName = phase.name || ""',
        "segment.dataset.parameterName = name",
        "segment.dataset.parameterValue = valueText",
        "segment.dataset.startFrame = String(span.startFrame)",
        "segment.dataset.endFrame = String(span.endFrame)",
        "segment.dataset.startTime = startTime",
        "segment.dataset.endTime = endTime",
        'segment.setAttribute("aria-label", segmentLabel)',
        'segment.setAttribute("role", "group")',
        'nodeGraphTooltipText("legacyEvidence.timelineSegment"',
        '.addEventListener("pointermove", probeParameterTimelineSegment)',
        "function buildLevelEnvelope(waveform)",
        "function drawLevelEnvelope()",
        "function renderLevelEnvelope()",
        'canvas.dataset.envelopeSource = "decoded primary WAV"',
        "canvas.dataset.envelopeWindowMs = String(envelope.windowMs)",
        "canvas.dataset.envelopeWindowFrames = String(envelope.windowFrames)",
        "canvas.dataset.envelopeWindows = String(envelope.windows.length)",
        "canvas.dataset.envelopePeak = formatCompactNumber(envelope.peak)",
        "canvas.dataset.envelopeRms = formatCompactNumber(envelope.rms)",
        "canvas.dataset.envelopeFrames = String(waveform.frames)",
        "`Primary WAV level envelope / ${formatCompactNumber(envelope.windowMs)} ms window / `",
        "function renderUnavailableLevelEnvelopeMeta()",
        '["source", "manifest/audio required", "decoded primary WAV"]',
        "renderUnavailableLevelEnvelopeMeta()",
        "function levelEnvelopeWindowAtFrame(frame)",
        "function renderLevelEnvelopeProbe()",
        "function probeLevelEnvelopeAtClientX(clientX)",
        "function clearLevelEnvelopeProbe()",
        'state.waveformProbeFrame = waveformFrameAtClientXForCanvas(clientX, "levelEnvelopeCanvas")',
        '.addEventListener("pointerleave", clearLevelEnvelopeProbe)',
        "function renderPhaseAudioStats()",
        "function renderUnavailablePhaseAudioStats()",
        'name.textContent = "Phase audio stats unavailable"',
        '["producer compare", "unavailable", "present"]',
        "renderUnavailablePhaseAudioStats()",
        "function updatePhaseAudioStatsActive(region)",
        "function updatePhaseProbeTargets()",
        'document.querySelectorAll(".phase, .phase-stat")',
        'item.classList.toggle("preview", item.dataset.phaseName === region?.name)',
        "function renderPhaseAudioStatsProbe()",
        "${probeSourceText()} ${formatProbeFrame(frame, waveform, region)}",
        "function probePhaseAudioStats(event)",
        "function clearPhaseAudioStatsProbe()",
        "item.dataset.startTime = startTime",
        "item.dataset.endTime = endTime",
        "item.dataset.targetFrequency = targetFrequencyText",
        "item.dataset.measuredFrequency = measuredFrequencyText",
        "item.dataset.targetAmplitude = targetPeakText",
        "item.dataset.peak = peakText",
        "item.dataset.rms = rmsText",
        "item.dataset.producerMatch = String(Boolean(producerOk))",
        'item.setAttribute("aria-label", itemLabel)',
        'item.setAttribute("role", "group")',
        "item.dataset.startFrame = String(region.startFrame)",
        'item.addEventListener("pointermove", probePhaseAudioStats)',
        "function renderPhaseProbe()",
        "function probePhaseList(event)",
        "${probeSourceText()} ${formatProbeFrame(frame, waveform, region)}",
        "function clearPhaseListProbe()",
        'item.dataset.phaseIndex = String(index)',
        'item.dataset.phaseName = phase.name || ""',
        "item.dataset.startFrame = String(span.startFrame)",
        "item.dataset.endFrame = String(span.endFrame)",
        "item.dataset.startTime = startTime",
        "item.dataset.endTime = endTime",
        "item.dataset.duration = duration",
        "item.dataset.wavShare = share",
        'item.setAttribute("aria-label", itemLabel)',
        'item.setAttribute("role", "group")',
        'nodeGraphTooltipText("legacyEvidence.phaseListItem"',
        'item.addEventListener("pointermove", probePhaseList)',
        '["window", `${formatCompactNumber(envelope.windowMs)} ms`]',
        '["source", "decoded primary WAV"]',
        '["target freq", targetFrequencyText]',
        '["measured freq", measuredFrequencyText]',
        '["freq delta", frequencyDelta]',
        '["producer freq", Number.isFinite(producerFrequency) ? `${formatCompactNumber(producerFrequency)} Hz` : "missing"]',
        '["producer freq delta", producerFrequencyDeltaText]',
        '["target amp", targetAmplitudeText]',
        '["target bias", formatCompactNumber(biasValue)]',
        '["target peak", targetPeakText]',
        '["peak", peakText]',
        '["peak delta", peakDelta]',
        '["producer peak", Number.isFinite(producerPeak) ? formatCompactNumber(producerPeak) : "missing"]',
        '["producer peak delta", producerPeakDeltaText]',
        '["producer rms", Number.isFinite(producerRms) ? formatCompactNumber(producerRms) : "missing"]',
        '["producer rms delta", producerRmsDeltaText]',
        '["rms", rmsText]',
        'status.textContent = allOk ? "Verified" : "Check"',
        "function renderUnavailableProducerProof()",
        '["runtime API", "unavailable", boolText(false)]',
        "renderUnavailableProducerProof()",
        "function renderUnavailableSandboxContract()",
        '"caller-owned processing order"',
        "renderUnavailableSandboxContract()",
        "function renderUnavailableBoundaryFlags()",
        "requiredFlags.map(([key, expected]) => [",
        "renderUnavailableBoundaryFlags()",
        "function renderUnavailablePhaseCoverage()",
        '["wav frames", "unavailable", "present"]',
        "renderUnavailablePhaseCoverage()",
        "function renderUnavailablePhases()",
        'name.textContent = "Phases unavailable"',
        '["resync proof", "unavailable", "present"]',
        "renderUnavailablePhases()",
        "function renderUnavailableArtifactCoverage()",
        '["artifact links", "unavailable", "available"]',
        "renderUnavailableArtifactCoverage()",
        "function renderUnavailableArtifacts()",
        'label.textContent = "Artifact packet"',
        'path.textContent = "manifest required"',
        "row.dataset.artifactKind = \"unavailable\"",
        "row.dataset.artifactLabel = \"Artifact packet\"",
        'row.setAttribute("aria-label", "Missing artifact packet (unavailable)")',
        "renderUnavailableArtifacts()",
        '["entry-point matches handoff", entryPointPath === handoff.entryPoint]',
        '["audio matches handoff", primaryAudioPath === handoff.primaryAudioArtifact]',
        '["phase report coverage", phaseReportIssue === "" ? "match" : phaseReportIssue, "match"]',
        '["phase report coverage", phaseReportIssue === ""]',
        '["parameter resync", parameterResyncIssue === ""]',
        "function parameterResyncContractIssue(manifest)",
        'return "parameter resync missing"',
        'return `${key} resync changed flag missing`',
        'return `${key} did not resync upward`',
        '["phase audio measurements", phaseAudioIssues.length === 0]',
        "function renderUnavailableChecklist()",
        '["sandbox handoff", false]',
        "renderUnavailableChecklist()",
        "const statusStripLabels = Object.freeze({",
        "function labelStatusStripValue(element, label, value, ok)",
        "element.dataset.statusLabel = label",
        "element.dataset.statusValue = valueText",
        "element.dataset.statusState = stateName",
        "function statusStripItemsLabeled()",
        '["status strip labels", statusStripItemsLabeled()]',
        "function labelPrimaryAudio(path, ok)",
        "audio.dataset.audioLabel = \"Primary Audio\"",
        "audio.dataset.audioPath = pathText",
        "audio.dataset.audioState = stateName",
        "function primaryAudioLabeled(manifest)",
        '["primary audio labels", primaryAudioLabeled(manifest)]',
        "function labelPrimaryAudioTitle(path, ok)",
        "title.dataset.audioTitlePath = pathText",
        "function primaryAudioTitleLabeled(manifest)",
        '["primary audio title labels", primaryAudioTitleLabeled(manifest)]',
        "function primaryAudioPositionLabeled()",
        'return waveformHeaderPillsLabeled(["audioPosition"])',
        '["primary audio position labels", primaryAudioPositionLabeled()]',
        "function labelWaveformHeaderPill(element, label, value, ok)",
        "element.dataset.waveformHeaderLabel = label",
        "element.dataset.waveformHeaderValue = valueText",
        "element.dataset.waveformHeaderState = stateName",
        "function waveformHeaderPillsLabeled(ids)",
        "function currentParameterPillsLabeled()",
        'waveformHeaderPillsLabeled(["currentFrequency", "currentAmplitude", "currentParameterStatus"])',
        "currentMeasuredAudioPillsLabeled()",
        "function currentMeasuredAudioPillsLabeled()",
        '"currentMeasuredFrequency"',
        '"currentMeasuredPeak"',
        '"currentMeasuredFrequencyDelta"',
        '"currentMeasuredPeakDelta"',
        '"currentMeasuredStatus"',
        '["current parameter labels", waveformReady && currentParameterPillsLabeled()]',
        'labelWaveformHeaderPill(position, "waveform position", positionText, true)',
        'labelWaveformHeaderPill(sample, "waveform sample", sampleText, true)',
        'labelWaveformHeaderPill(phase, "waveform phase", phaseText, Boolean(activeRegion))',
        "function waveformTransportPillsLabeled()",
        '["waveform transport labels", waveformReady && waveformTransportPillsLabeled()]',
        'labelWaveformHeaderPill(target, "phase jump target", targetText, Boolean(waveform))',
        "function phaseJumpTargetLabeled()",
        '["phase jump target labels", waveformReady && phaseJumpTargetLabeled()]',
        "function reloadManifestControlLabeled()",
        '["Reload manifest", "Loading manifest"].includes(label)',
        '["reload manifest labels", reloadManifestControlLabeled()]',
        "item.dataset.summaryLabel = label",
        "item.dataset.summaryValue = valueText",
        "item.dataset.summaryKind = kind || \"value\"",
        "item.dataset.summaryState = stateName",
        'item.setAttribute("role", "group")',
        "item.setAttribute(\"aria-label\", `${label}: ${valueText}`)",
        "function parameterSummaryCardsLabeled()",
        "item.dataset.checkLabel = label",
        "item.dataset.checkState = stateName",
        "item.setAttribute(\"aria-label\", `${label}: ${stateName}`)",
        "function checkRowsLabeled(containerId, expectedRows)",
        "function checkRowsHaveUniqueLabels(rows)",
        "new Set(labels).size === labels.length",
        "function consumerChecklistRowsLabeled()",
        'return checkRowsLabeled("checklist", 22)',
        "function setSourceText(id, key, value, expected = \"present\", ok = true)",
        "element.dataset.sourceKey = key",
        "element.dataset.sourceValue = valueText",
        "element.dataset.sourceExpected = expectedText",
        'element.dataset.sourceState = ok ? "ok" : "check"',
        "element.setAttribute(\"aria-label\", `${key}: ${valueText}`)",
        "function sourceRowsLabeled()",
        "function renderKeyValue(container, rows)",
        "dt.dataset.kvKey = key",
        "dd.dataset.kvKey = key",
        "dd.dataset.kvValue = valueText",
        "dd.dataset.kvExpected = expected === undefined ? \"none\" : expectedText",
        "dd.dataset.kvState = stateName",
        "dd.setAttribute(\"aria-label\", `${key}: ${valueText}`)",
        "function keyValueRowsLabeled(containerId, expectedRows)",
        "function producerProofRowsLabeled()",
        'keyValueRowsLabeled("producerProof", 9)',
        'keyValueRowsLabeled("producerProof", 10)',
        "function circuitChainRowsLabeled()",
        'document.querySelectorAll("#circuitChain .chain-row")',
        "function renderCircuitChain(manifest)",
        "function renderUnavailableCircuitChain()",
        "formatCircuitStep(step)",
        "Circuit connection",
        "Caller processing step",
        '["circuit chain rows", circuitChainRowsLabeled()]',
        "function boundaryFlagRowsLabeled()",
        "function phaseCoverageRowsLabeled()",
        "function artifactCoverageRowsLabeled()",
        "function renderReportControls()",
        "const label = `Show report ${report.label}`",
        "button.dataset.reportIndex = String(index)",
        "button.dataset.reportKind = report.kind",
        'button.dataset.reportPath = report.path || ""',
        'button.setAttribute("aria-label", label)',
        'button.setAttribute("aria-pressed", String(active))',
        "button.title = label",
        "function reportControlsLabeled()",
        'label.startsWith("Show report ")',
        '["report control labels", reportControlsLabeled()]',
        "viewer.dataset.reportLabel = report.label || \"\"",
        "viewer.dataset.reportKind = report.kind || \"\"",
        "viewer.dataset.reportState = stateName",
        "viewer.setAttribute(\"aria-label\", `Report viewer ${report.label}: ${stateName}`)",
        "function reportViewerLabeled()",
        '["report viewer labels", state.reports.length > 0 && reportViewerLabeled()]',
        "function artifactRowLabel(link)",
        "row.dataset.artifactKind = link.kind || \"\"",
        "row.dataset.artifactPath = link.path || \"\"",
        "row.dataset.artifactLabel = link.label || \"\"",
        'row.setAttribute("aria-label", rowLabel)',
        "function artifactRowsLabeled(manifest)",
        "rows.length === links.length",
        "label === artifactRowLabel(link)",
        'row.getAttribute("href") === artifactUrl(link.path)',
        '["artifact row labels", artifactRowsLabeled(manifest)]',
        '["artifact coverage row labels", artifactCoverageRowsLabeled()]',
        '["source row labels", sourceRowsLabeled()]',
        "renderHandsOnReadiness(state.response?.manifest, Boolean(state.waveform))",
        "function renderHandsOnReadiness(manifest, waveformReady = Boolean(state.waveform))",
        "function phaseJumpButtonsLabeled(manifest)",
        "function waveformScrubberLabeled()",
        "function waveformCanvasLabeled()",
        "function levelEnvelopeCanvasLabeled()",
        "function probePillLabeled(id)",
        "function probePillsLabeled(ids)",
        "function waveformProbeLabeled()",
        "function levelEnvelopeProbeLabeled()",
        "function parameterTimelineProbeLabeled()",
        "function parameterTimelineSegmentsLabeled()",
        "function parameterTimelinePreviewAvailable()",
        "return parameterTimelineSegmentsLabeled()",
        "function phaseAudioStatsProbeLabeled()",
        "function phaseListProbeLabeled()",
        "function phaseListItemsLabeled()",
        "function phasePreviewTargetAvailable()",
        "return phaseListItemsLabeled() && phaseAudioStatsItemsLabeled()",
        "function phaseAudioStatsItemsLabeled()",
        "function signalPlotPointProbeLabeled()",
        "function signalPlotSourceProbeLabeled()",
        "function signalPlotProbeLabeled()",
        'return probePillLabeled("waveformProbe")',
        'return probePillLabeled("levelEnvelopeProbe")',
        'return probePillLabeled("parameterTimelineProbe")',
        'label.startsWith("Parameter ")',
        '["parameter timeline segment labels", waveformReady && parameterTimelineSegmentsLabeled()]',
        'return probePillLabeled("phaseAudioStatsProbe")',
        'label.startsWith("Phase audio stats ")',
        '["phase audio stats item labels", waveformReady && phaseAudioStatsItemsLabeled()]',
        'return probePillLabeled("phaseProbe")',
        'label.startsWith("Phase ")',
        '["phase list item labels", waveformReady && phaseListItemsLabeled()]',
        'return probePillLabeled("signalPlotProbe")',
        'return probePillLabeled("signalPlotProbeSource")',
        'return probePillsLabeled(["signalPlotProbe", "signalPlotProbeSource"])',
        "function waveformToSignalProbeAvailable()",
        "const probe = signalPlotProbeAtFrame(0)",
        "probe.nearest?.frame === 0",
        "probe.nearest.distance === 0",
        "function signalToWaveformProbeAvailable()",
        "return waveformProbeLabeled()",
        'label.startsWith("Jump waveform to ")',
        'label.includes(" phase from frame ")',
        'button.title.startsWith("Jump to ")',
        'setStatus("handsOnReadinessStatus", ok ? "Ready" : "Check", ok)',
        '"native audio",',
        '["decoded waveform", waveformReady]',
        '["producer proof row labels", producerProofRowsLabeled()]',
        '["boundary flag row labels", boundaryFlagRowsLabeled()]',
        '["phase coverage row labels", phaseCoverageRowsLabeled()]',
        '["waveform seek", waveformReady && Number(manifest?.wav?.frames) > 0]',
        '["waveform canvas labels", waveformReady && waveformCanvasLabeled()]',
        '["waveform play control", waveformPlayControlLabeled()]',
        '["waveform control labels", waveformControlsLabeled()]',
        '["waveform scrubber labels", waveformReady && waveformScrubberLabeled()]',
        '["waveform hover probe", waveformReady && waveformProbeLabeled()]',
        '["waveform probe labels", waveformReady && waveformProbeLabeled()]',
        '["level envelope probe", waveformReady && levelEnvelopeProbeLabeled()]',
        '["level envelope probe labels", waveformReady && levelEnvelopeProbeLabeled()]',
        '["level envelope canvas labels", waveformReady && levelEnvelopeCanvasLabeled()]',
        '["parameter timeline probe", waveformReady && parameterTimelineProbeLabeled()]',
        '["parameter timeline probe labels", waveformReady && parameterTimelineProbeLabeled()]',
        '["parameter timeline segment labels", waveformReady && parameterTimelineSegmentsLabeled()]',
        '["parameter timeline preview", waveformReady && parameterTimelinePreviewAvailable()]',
        '["probe frame labels", waveformReady && probeFrameLabelsReady()]',
        '["follow/free view", followAudioControlLabeled()]',
        '["current measured audio", waveformReady && currentMeasuredAudioPillsLabeled()]',
        '["phase list probe", waveformReady && phaseListProbeLabeled()]',
        '["phase list probe labels", waveformReady && phaseListProbeLabeled()]',
        '["phase list item labels", waveformReady && phaseListItemsLabeled()]',
        '["phase jump preview", waveformReady && phaseJumpButtonsLabeled(manifest)]',
        '["phase jump labels", waveformReady && phaseJumpButtonsLabeled(manifest)]',
        '["phase jump target", waveformReady && phaseJumpTargetLabeled()]',
        '["phase parameter readout", parameterResyncContractIssue(manifest) === ""]',
        '["parameter summary card labels", parameterResyncContractIssue(manifest) === "" && parameterSummaryCardsLabeled()]',
        '["phase preview target", waveformReady && phasePreviewTargetAvailable()]',
        '["producer measurement compare", phaseAudioMeasurementIssues(manifest).length === 0]',
        "function callerProcessingOrderIssue(manifest)",
        "runtime_dsp_object_circuit_connected_bias_wav_demo",
        "callerProcessingOrderProof",
        "matchesCircuitConnections",
        '["caller processing order", callerProcessingIssue === ""]',
        '["caller processing order", boolText(callerProcessingIssue === ""), true]',
        '["phase audio stats probe", waveformReady && phaseAudioStatsProbeLabeled()]',
        '["phase audio stats probe labels", waveformReady && phaseAudioStatsProbeLabeled()]',
        '["phase audio stats item labels", waveformReady && phaseAudioStatsItemsLabeled()]',
        '["signal inspection", waveformReady && signalPlotCanvasLabeled()]',
        '["signal plot probe", waveformReady && signalPlotPointProbeLabeled()]',
        '["signal plot probe labels", waveformReady && signalPlotProbeLabeled()]',
        "function renderUnavailableHandsOnReadiness()",
        '["manifest loaded", false]',
        "renderUnavailableHandsOnReadiness()",
        '["signal plot source probe", waveformReady && signalPlotSourceProbeLabeled()]',
        '["waveform-to-signal probe", waveformReady && waveformToSignalProbeAvailable()]',
        '["signal-to-waveform probe", waveformReady && signalToWaveformProbeAvailable()]',
        '["inspection cursor", waveformReady && inspectionCursorLabeled()]',
        "const inspectionCursorPillIds = [",
        "function inspectionCursorPillLabeled(id)",
        '["inspection source pill", waveformReady && inspectionCursorPillLabeled("inspectionCursorSource")]',
        '["inspection delta pill", waveformReady && inspectionCursorPillLabeled("inspectionCursorDelta")]',
        '["inspection audio pill", waveformReady && inspectionCursorPillLabeled("inspectionCursorAudio")]',
        '["inspection playback pill", waveformReady && inspectionCursorPillLabeled("inspectionCursorPlayback")]',
        '["inspection view pill", waveformReady && inspectionCursorPillLabeled("inspectionCursorView")]',
        '["inspection preview pill", waveformReady && inspectionCursorPillLabeled("inspectionCursorPreview")]',
        '["inspection seek pill", waveformReady && inspectionCursorPillLabeled("inspectionCursorSeek")]',
        '["inspection seek target pill", waveformReady && inspectionCursorPillLabeled("inspectionCursorSeekTarget")]',
        '["inspection seek sync pill", waveformReady && inspectionCursorPillLabeled("inspectionCursorSeekSync")]',
        '["inspection transport pill", waveformReady && inspectionCursorPillLabeled("inspectionCursorTransport")]',
        '["inspection target pill", waveformReady && inspectionCursorPillLabeled("inspectionCursorTarget")]',
        '["inspection divergence pill", waveformReady && inspectionCursorPillLabeled("inspectionCursorDivergence")]',
        "function inspectionCursorPillsLabeled()",
        "function inspectionCursorKeyValueLabeled(key)",
        "function inspectionCursorHoverDeltaLabeled()",
        'return inspectionCursorKeyValueLabeled("hover delta")',
        "function inspectionCursorLabeled()",
        'cursor.dataset.inspectionCursorState === "ok"',
        'inspectionCursorKeyValueLabeled("transport frame")',
        'inspectionCursorKeyValueLabeled("hover signal")',
        '["inspection pill labels", waveformReady && inspectionCursorPillsLabeled()]',
        '["inspection hover delta", waveformReady && inspectionCursorHoverDeltaLabeled()]',
        '["read-only boundary", validateConsumerChecklist(manifest).accepted]',
        '["consumer checklist row labels", validateConsumerChecklist(manifest).accepted && consumerChecklistRowsLabeled()]',
        '["sandbox contract row labels", validateConsumerChecklist(manifest).accepted && sandboxContractRowsLabeled()]',
        '["readiness row labels",',
        "function phaseReportCoverageIssue(manifest)",
        'return "phase report phase missing"',
        'return "phase report phase unknown"',
        'return "phase report phase duplicate"',
        '["entry point path", entryPointMatches ? "match" : "mismatch", "match"]',
        '["audio path", primaryAudioMatches ? "match" : "mismatch", "match"]',
        'countArtifactKind(links, "entry-point") === 1',
        'countArtifactKind(links, "audio") === 1',
        'countArtifactKind(links, "manifest") === 1',
        'countArtifactKind(links, "text-summary") === 1',
        'countArtifactKind(links, "wav-report") === 1',
        'return `${kind} artifact link count mismatch`',
        'return "entry-point link mismatch"',
        'return "audio link mismatch"',
        "function drawSignalPlot()",
        "function renderSignalPlot()",
        'canvas.dataset.signalSource = "decoded primary WAV"',
        "canvas.dataset.signalFocus = focusName",
        "canvas.dataset.signalMode = state.signalPlotMode",
        "canvas.dataset.signalScale = String(state.signalPlotScale)",
        "canvas.dataset.signalWindow = windowName",
        "canvas.dataset.signalWindowMs = String(state.signalPlotWindowMs)",
        "canvas.dataset.signalLagMs = String(state.signalLagMs)",
        "canvas.dataset.signalLagFrames = String(lagFrames)",
        "canvas.dataset.signalPoints = String(pointCount)",
        "canvas.dataset.signalFocusPeak = formatCompactNumber(focusStats.peak)",
        "canvas.dataset.signalFocusRms = formatCompactNumber(focusStats.rms)",
        "`Primary WAV signal plot / ${focusName} / ${state.signalPlotMode} / `",
        "function renderUnavailableSignalPlotMeta()",
        '["source", "manifest/audio required", "decoded primary WAV"]',
        "renderUnavailableSignalPlotMeta()",
        "function renderSignalPlotControls()",
        "function labelSignalPlotButton(button, label, active = false)",
        'button.setAttribute("aria-pressed", String(active))',
        "button.title = label",
        "function signalPlotWindowFrameRange(waveform, drawableFrames)",
        "function signalPlotWindowName(waveform, drawableFrames)",
        "function signalPlotRegions(waveform, drawableFrames)",
        "function signalPlotFocusName(waveform)",
        "function restoreSignalPlotFocusIndex()",
        "function signalPlotPointCount(waveform, drawableFrames)",
        "function signalPlotFocusStats(waveform, drawableFrames)",
        "function signalPlotRegionColor(index)",
        "function renderSignalPlotSummary()",
        "function renderSignalPlotPoint()",
        "function signalPlotLagFrames(waveform)",
        "function signalPlotProbeAtClientPoint(clientX, clientY)",
        "function signalPlotProbeAtFrame(frame)",
        "function renderSignalPlotProbe()",
        "waveformRegionAtFrame(frame)?.name",
        "nearest.frame",
        "`probe ${formatProbeFrame(nearest.frame, state.waveform)} / ${pointText}`",
        "${probeSourceText()} / near frame ${nearest.frame}",
        "state.waveformProbeFrame = state.signalPlotProbe.nearest?.frame ?? null",
        "clampFrame(state.waveformProbeFrame, waveform) / waveform.frames",
        "const nearestProbe = state.signalPlotProbe?.nearest",
        'context.strokeStyle = "#f6c96d"',
        "drawSignalPlot();",
        "state.signalPlotProbe = signalPlotProbeAtFrame(state.waveformProbeFrame)",
        "function probeSignalPlot(event)",
        "function clearSignalPlotProbe()",
        '.addEventListener("pointermove", probeSignalPlot)',
        '.addEventListener("pointerleave", clearSignalPlotProbe)',
        "const signalPlotSettingsKey",
        "function loadSignalPlotSettings()",
        "function saveSignalPlotSettings()",
        "function resetSignalPlotSettings()",
        "signalLagMs: 1",
        "signalPhaseFocusIndex: null",
        'signalPhaseFocusName: "all"',
        'signalPlotMode: "trace"',
        "signalPlotScale: 1",
        'signalPlotWindow: "full"',
        "signalPlotWindowMs: 80",
        "state.signalPhaseFocusIndex = index;",
        "state.signalPhaseFocusName = region.name;",
        "state.signalLagMs = lagMs;",
        "state.signalPlotMode = mode;",
        "state.signalPlotScale = scale;",
        "state.signalPlotWindow = windowMode;",
        "state.signalPlotWindowMs = windowMs;",
        'className = "control-group"',
        'dataset.signalFocus = "all"',
        "dataset.signalFocus = region.name",
        "dataset.signalLagMs = String(lagMs)",
        "dataset.signalMode = mode",
        "dataset.signalScale = String(scale)",
        "dataset.signalWindow = windowMode",
        "dataset.signalWindowMs = String(windowMs)",
        'dataset.signalReset = "settings"',
        "Signal plot focus",
        "Signal plot lag",
        "Signal plot mode",
        "Signal plot scale",
        "Signal plot window",
        "Signal plot window size",
        "Signal plot reset",
        "function signalPlotControlsLabeled()",
        "function signalPlotCanvasLabeled()",
        "groups.length === 7",
        'button.title === label',
        '["signal plot control labels", waveformReady && signalPlotControlsLabeled()]',
        '["signal plot canvas labels", waveformReady && signalPlotCanvasLabeled()]',
        '["focus", focusName]',
        '["mode", state.signalPlotMode]',
        '["scale", `x${state.signalPlotScale}`]',
        '["window", windowName]',
        '["window size", `${state.signalPlotWindowMs} ms`]',
        "frame ${pointFrame} / ${formatSeconds(pointFrame / waveform.sampleRate)} / ${region?.name || \"phase\"} / x ${formatCompactNumber(x)} / y ${formatCompactNumber(y)}",
        '["x", "sample[n]"]',
        '["y", "sample[n + lag]"]',
        '["points", String(pointCount)]',
        '["focus peak", formatCompactNumber(focusStats.peak)]',
        '["focus rms", formatCompactNumber(focusStats.rms)]',
    ]:
        require(snippet in waveform_source, f"waveform analysis source missing {snippet}")
    for snippet in [
        "function beginWaveformDrag(event)",
        "function dragWaveform(event)",
        "function endWaveformDrag(event)",
        "function setSharedProbeFrame(frame, source = inspectionModes.probe)",
        "function clearSharedProbeFrame()",
        "function probePhaseButton(index)",
        "function clearPhaseButtonProbe()",
        "function clearPhaseButtonProbeFromOutside(event)",
        'target.closest("#waveformPhaseControls")',
        'document.addEventListener("pointermove", clearPhaseButtonProbeFromOutside)',
        "function renderPhaseJumpTarget()",
        'target.textContent =',
        '`jump ${region.name} / ${formatSeconds(',
        '} / frame ${region.startFrame}`',
        ': "jump idle";',
        "phaseJumpPreviewIndex: null",
        "state.phaseJumpPreviewIndex = null",
        'button.classList.toggle("preview", index === state.phaseJumpPreviewIndex)',
        "renderPhaseJumpTarget();",
        "function waveformFrameAtClientX(clientX)",
        "function probeWaveformAtClientX(clientX)",
        "function renderWaveformProbe()",
        "function renderUnavailableWaveformMeta()",
        '["data bytes", "unavailable", "present"]',
        "renderUnavailableWaveformMeta()",
        "function renderInspectionCursor()",
        'labelInspectionCursorSurface(cursor, "unavailable", "check")',
        'labelInspectionCursorSurface(',
        '"transport inspection"',
        '"hover inspection"',
        'setStatus("inspectionCursorStatus", hoverFrame === null ? "Transport" : "Hover", true)',
        "const hoverDeltaFrame = hoverFrame === null ? null : hoverFrame - transportFrame",
        'const hoverFrequency = activeParameterValue("frequency", hoverRegion)',
        'const hoverAmplitude = activeParameterValue("amplitude", hoverRegion)',
        "const hoverEnvelope = hoverFrame !== null ? levelEnvelopeWindowAtFrame(hoverFrame) : null",
        '"hover delta"',
        '"hover frequency"',
        '"hover amplitude"',
        '"hover envelope peak"',
        '"hover envelope rms"',
        '["hover signal",',
        "function clearWaveformProbe()",
        "function clampFrame(frame, waveform)",
        '.addEventListener("pointerdown", beginWaveformDrag)',
        '.addEventListener("pointermove", dragWaveform)',
        '.addEventListener("pointerleave", clearWaveformProbe)',
        '.addEventListener("pointerup", endWaveformDrag)',
        '.addEventListener("pointermove", () => probePhaseButton(index))',
        '.addEventListener("focus", () => probePhaseButton(index))',
        '.addEventListener("blur", clearPhaseButtonProbe)',
        'button.dataset.phaseIndex === String(state.phaseJumpPreviewIndex)',
        "button.dataset.phaseName !== undefined",
        "button.dataset.phaseEndFrame !== undefined",
        "button.dataset.phaseEndTime !== undefined",
        'label.includes(" phase from frame ")',
    ]:
        require(snippet in waveform_source, f"waveform drag source missing {snippet}")
    for snippet in [
        'classList.add("dragging")',
        'classList.remove("dragging")',
    ]:
        require(snippet in waveform_source, f"waveform drag state missing {snippet}")
    for snippet in [
        "touch-action: none;",
        "user-select: none;",
        ".control-group",
        ".parameter-timeline",
        ".parameter-segment.active",
        ".parameter-segment.preview",
        ".parameter-timeline-marker",
        ".parameter-timeline-marker.probe",
        ".phase-stat-list",
        ".phase-stat.active",
        ".phase.preview",
        ".phase-stat.preview",
        ".phase-button.preview",
        ".pill.inspection-source.none",
        ".pill.inspection-source.transport",
        ".pill.inspection-source.hover",
        ".pill.inspection-delta.none",
        ".pill.inspection-delta.hover",
        ".pill.inspection-playback.paused",
        ".pill.inspection-playback.playing",
        ".pill.inspection-playback.ended",
        ".pill.inspection-view.follow",
        ".pill.inspection-view.free",
        ".pill.inspection-preview.idle",
        ".pill.inspection-preview.active",
        ".pill.inspection-seek.idle",
        ".pill.inspection-seek.active",
        ".pill.inspection-seek-sync.none",
        ".pill.inspection-seek-sync.aligned",
        ".pill.inspection-seek-sync.diverged",
        ".pill.inspection-target.none",
        ".pill.inspection-target.active",
        ".pill.inspection-transport.none",
        ".pill.inspection-transport.active",
        ".pill.inspection-divergence.aligned",
        ".pill.inspection-divergence.diverged",
        ".contract-list",
        ".contract-row",
        ".readiness-list",
    ]:
        require(snippet in style_source, f"waveform drag style missing {snippet}")
    require(
        "setFollowAudio(false, false);" not in app_source,
        "waveform controls still force free-view mode",
    )


def require_manifest_error_surface_contract() -> None:
    manifest_view_source = (PUBLIC / "manifest-view.js").read_text(encoding="utf-8")
    manifest_loader_source = (PUBLIC / "manifest-loader.js").read_text(encoding="utf-8")
    start = manifest_view_source.index("function renderError(message, details = {})")
    end = len(manifest_view_source)
    render_error = manifest_view_source[start:end]
    for snippet in [
        "function renderRefreshButton(loading = state.manifestLoading)",
        'const button = document.getElementById("refreshButton")',
        "async function loadManifest()",
    ]:
        require(snippet in manifest_loader_source, f"manifest loader missing {snippet}")
    required_unavailable_renderers = [
        "renderUnavailableProducerProof();",
        "renderUnavailableHandsOnReadiness();",
        "renderUnavailableSandboxContract();",
        "renderUnavailableParameterSummary();",
        "renderUnavailableParameterTimeline();",
        "renderUnavailableWaveformMeta();",
        "renderUnavailableLevelEnvelopeMeta();",
        "renderUnavailablePhaseAudioStats();",
        "renderUnavailableSignalPlotMeta();",
        "renderUnavailableBoundaryFlags();",
        "renderUnavailablePhaseCoverage();",
        "renderUnavailablePhases();",
        "renderUnavailableChecklist();",
        "renderUnavailableArtifactCoverage();",
        "renderUnavailableArtifacts();",
    ]
    for renderer in required_unavailable_renderers:
        require(renderer in render_error, f"manifest error surface missing {renderer}")
    for resetter in [
        'resetIdleProbePill("waveformProbe", "Waveform probe idle");',
        'resetIdleProbePill("parameterTimelineProbe", "Parameter timeline probe idle");',
        'resetIdleProbePill("levelEnvelopeProbe", "Level envelope probe idle");',
        'resetIdleProbePill("signalPlotProbe", "Signal plot probe idle");',
        'resetProbePill("signalPlotProbeSource", "near frame", "Signal plot source probe idle");',
        'resetIdleProbePill("phaseAudioStatsProbe", "Phase audio stats probe idle");',
        'resetIdleProbePill("phaseProbe", "Phase list probe idle");',
    ]:
        require(resetter in render_error, f"manifest error surface missing {resetter}")
    require(
        "clearElement(" not in render_error,
        "manifest error surface clears a user-facing panel",
    )


def require_follow_free_seek_contract() -> None:
    waveform_source = "\n".join(read_public_script_sources().values())
    start = waveform_source.index(
        "function seekPrimaryAudioToFrame(frame, source = inspectionSources.waveform)",
    )
    end = waveform_source.index("function seekWaveformAtClientX(clientX)", start)
    seek_function = waveform_source[start:end]
    sync_start = waveform_source.index("function syncWaveformToAudio()")
    sync_end = waveform_source.index(
        "function seekPrimaryAudioToFrame(frame, source = inspectionSources.waveform)",
        sync_start,
    )
    sync_function = waveform_source[sync_start:sync_end]
    require(
        "if (state.followAudio) {" in seek_function,
        "waveform seek no longer gates native audio seeking behind follow mode",
    )
    require(
        "audio.currentTime = targetTime;" in seek_function,
        "waveform seek no longer updates native audio in follow mode",
    )
    require(
        "setPlayheadFrame(targetFrame);" in seek_function,
        "waveform seek no longer updates local inspection playhead",
    )
    require(
        "state.lastSeekFollowAudio = state.followAudio;" in seek_function,
        "waveform seek no longer records follow/free mode at seek time",
    )
    require(
        seek_function.index("audio.currentTime = targetTime;") <
        seek_function.index("setPlayheadFrame(targetFrame);"),
        "waveform seek updates local playhead before native audio",
    )
    require(
        "state.scrubberPointerActive" in sync_function,
        "audio sync no longer defers while the waveform scrubber is being dragged",
    )
    for snippet in [
        "function beginScrubberDrag(event)",
        "function endScrubberDrag(event)",
        "state.scrubberPointerActive = true;",
        "state.scrubberPointerActive = false;",
        '.addEventListener("pointerdown", beginScrubberDrag)',
        '.addEventListener("pointerup", endScrubberDrag)',
        '.addEventListener("pointercancel", endScrubberDrag)',
        '.addEventListener("lostpointercapture", endScrubberDrag)',
    ]:
        require(snippet in waveform_source, f"scrubber drag guard missing {snippet}")


def require_node_graph_mvp_contract() -> None:
    require_manual_trace_waypoint_contract()

    index_source = (PUBLIC / "index.html").read_text(encoding="utf-8")
    script_sources = read_public_script_sources()
    app_source = script_sources["./public/app.js"]
    boot_loading_source = script_sources["./public/boot-loading.js"]
    metadata_defaults_source = script_sources["./public/node-graph-metadata-defaults.js"]
    slider_metadata_source = script_sources["./public/node-graph-slider-metadata.js"]
    metadata_editor_source = script_sources["./public/node-graph-metadata-editor.js"]
    shader_script_source = script_sources["./public/node-graph-shader-script.js"]
    slider_readout_source = script_sources["./public/node-graph-slider-readout.js"]
    code_settings_source = script_sources["./public/node-code-settings-editor.js"]
    tooltip_utils_source = script_sources["./public/node-graph-tooltips.js"]
    module_actions_source = script_sources["./public/node-graph-module-actions.js"]
    wire_actions_source = script_sources["./public/node-graph-wire-actions.js"]
    color_standards_source = script_sources["./public/node-graph-color-standards.js"]
    color_widget_source = (PUBLIC / "color-widget.js").read_text(encoding="utf-8")
    server_source = (ROOT / "server.py").read_text(encoding="utf-8")
    node_graph_source = "\n".join(script_sources.values()) + f"\n{server_source}"
    style_source = (PUBLIC / "styles.css").read_text(encoding="utf-8")
    tooltip_source = (PUBLIC / "tooltips.json").read_text(encoding="utf-8")
    worklet_source = read_assembled_worklet_source()
    live_frame_evaluator_source = script_sources["./public/node-graph-live-frame-evaluator.js"]
    default_preset_source = (PUBLIC / "presets" / "default.json").read_text(encoding="utf-8")
    default_ui_settings_source = (PUBLIC / "presets" / "useruisettings.json").read_text(encoding="utf-8")
    slider_values_source = script_sources["./public/node-graph-slider-values.js"]
    require(
        "event?.shiftKey && (event.ctrlKey || event.metaKey)" in slider_values_source
        and "return 0.01;" in slider_values_source
        and "event?.shiftKey || event?.ctrlKey || event?.metaKey" in slider_values_source
        and "return 0.1;" in slider_values_source
        and "event?.altKey" in slider_values_source
        and "return 10;" in slider_values_source
        and "event?.shiftKey && (event.ctrlKey || event.metaKey) && event.altKey" in slider_values_source,
        "shared numeric drag policy should support ctrl fine, shift+ctrl extra-fine, alt coarse, and reserved shift+ctrl+alt",
    )
    require(
        "text-overflow: ellipsis" not in style_source,
        "app-wide text should not default to ellipsis shortening",
    )
    require(
        "body {\n  margin: 0;" in style_source
        and "user-select: none;\n  -webkit-user-select: none;" in style_source
        and ":is(input, textarea, select, [contenteditable=\"true\"], .node-text-selectable)" in style_source
        and "user-select: text;\n  -webkit-user-select: text;" in style_source,
        "app-wide UI labels/titles should be non-selectable while edit fields remain selectable",
    )
    execution_plan_source = script_sources["./public/node-graph-execution-plan.js"]
    definitions_source = script_sources["./public/node-graph-module-definitions.js"]
    require(
        "function nodeGraphModuleIsRealtimeOscillatorType(type)" in definitions_source
        and 'return type === "osc" || type === "polyBlep" || type === "sineWavetable" || type === "blit";' in definitions_source,
        "polyBlep should share the browser-side realtime oscillator type helper",
    )
    require(
        "function sanitizeNodeGraphNumericText(value)" in slider_metadata_source
        and "parseNodeMetadataNumber(value, fallback)" in slider_metadata_source
        and "Number(sanitizeNodeGraphNumericText(value))" in slider_metadata_source
        and 'replace(/,/g, "")' in slider_metadata_source,
        "numeric text entry should sanitize invalid characters before parsing",
    )
    require(
        "const sanitizeMetadataNumberInput = (id) =>" in metadata_editor_source
        and "sanitizeNodeGraphNumericText(input.value)" in metadata_editor_source
        and "input.value = sanitized;" in metadata_editor_source,
        "parameter metadata numeric fields should visibly remove invalid typed characters before saving",
    )
    live_plan_runtime_source = script_sources["./public/node-graph-live-plan-runtime.js"]
    require(
        "if (nodeGraphModuleIsRealtimeOscillatorType(node.type))" in live_plan_runtime_source
        and "phases.set(node.id, 0)" in live_plan_runtime_source
        and "oscResetStates.set(node.id, createNodeGraphOscResetState())" in live_plan_runtime_source
        and "triangleStates.set(node.id, 0)" in live_plan_runtime_source
        and "noiseSeeds.set(node.id, nodeGraphStableSeed(node.id))" in live_plan_runtime_source
        and "if (nodeGraphModuleIsRealtimeOscillatorType(node.type) && !runtime.phases.has(node.id))" in live_plan_runtime_source
        and "if (nodeGraphModuleIsRealtimeOscillatorType(node.type) && !runtime.oscResetStates.has(node.id))" in live_plan_runtime_source
        and "if (nodeGraphModuleIsRealtimeOscillatorType(node.type) && !runtime.triangleStates.has(node.id))" in live_plan_runtime_source
        and "if (nodeGraphModuleIsRealtimeOscillatorType(node.type) && !runtime.noiseSeeds.has(node.id))" in live_plan_runtime_source,
        "polyBlep should share live-plan oscillator state initialization with osc and F/B PolyBLEP",
    )
    node_graph_module_definitions_source = script_sources["./public/node-graph-module-definitions.js"]
    unsupported_source_start = execution_plan_source.index('nodeGraphModuleProducesOutputWithoutSignalInput(type)')
    source_nodes_start = execution_plan_source.index("const sourceNodes = order.filter")
    source_nodes_end = execution_plan_source.index("const inactiveNodes", source_nodes_start)
    require(
        "nodeGraphModuleProducesOutputWithoutSignalInput(type)" in execution_plan_source[unsupported_source_start:source_nodes_start],
        "execution-plan source gate should use the module capability helper",
    )
    require(
        "nodeGraphModuleDefinitions" in node_graph_module_definitions_source,
        "module capability helper should reference module definitions",
    )
    passthrough_start = execution_plan_source.index("const passthroughTypes = new Set")
    passthrough_end = execution_plan_source.index("function markReachable", passthrough_start)
    passthrough_source = execution_plan_source[passthrough_start:passthrough_end]
    output_without_input_start = node_graph_module_definitions_source.index("function nodeGraphModuleProducesOutputWithoutSignalInput(type)")
    output_without_input_end = node_graph_module_definitions_source.index("function nodeGraphCanonicalInputPort", output_without_input_start)
    output_without_input_source = node_graph_module_definitions_source[output_without_input_start:output_without_input_end]
    helmholtz_definition_start = node_graph_module_definitions_source.index("  helmholtzPitch: {")
    helmholtz_definition_end = node_graph_module_definitions_source.index("  slewLimiter: {", helmholtz_definition_start)
    helmholtz_definition_source = node_graph_module_definitions_source[helmholtz_definition_start:helmholtz_definition_end]
    require(
        '"helmholtzPitch"' not in passthrough_source
        and '"helmholtzPitch"' in output_without_input_source,
        "Helmholtz Pitch should be classified as an analyzer/control output, not an audio passthrough route",
    )
    require(
        'inputs: ["In"]' in helmholtz_definition_source
        and 'outputs: ["Frequency", "Fidelity"]' in helmholtz_definition_source
        and 'outputs: ["Out"]' not in helmholtz_definition_source
        and "visualSink: true" not in helmholtz_definition_source,
        "Helmholtz Pitch should expose analyzer outputs only and should not masquerade as an audio effect or visual sink",
    )
    require(
        "// soemdsp-native-kind: analysis" in (ROOT / "native_modules" / "helmholtz" / "helmholtz.cpp").read_text(encoding="utf-8"),
        "native Helmholtz metadata should declare analysis kind",
    )
    require(
        "helmholtzSample(state, input, params, inputConnected = true" in worklet_source
        and "if (!inputConnected) {" in worklet_source
        and 'return { Frequency: 0, Fidelity: 0, "Pitch View": -1 };' in worklet_source
        and "reportHelmholtzStatus(status, message = \"\")" in worklet_source
        and "native Helmholtz handle creation failed; analyzer outputs zero" in worklet_source
        and "native Helmholtz failed; analyzer outputs zero:" in worklet_source
        and "this.nativeHelmholtzReady = false;" in worklet_source
        and "Math.max(128, Math.min(1024" in worklet_source
        and 'windowSize: read("windowSize", 512)' in worklet_source
        and 'hasInput(nodeId, "In"),\n          safeRate,' in worklet_source
        and "function nodeGraphHelmholtzSample(state, input, params, inputConnected, sampleRate" in node_graph_source
        and "Math.max(128, Math.min(1024" in node_graph_source
        and 'windowSize: read("windowSize", 512)' in node_graph_source
        and 'hasInput(nodeId, "In"),\n    sampleRate,' in node_graph_source,
        "Helmholtz Pitch should output analyzer zeros on disconnected input and clamp analysis to the temporary safe window range",
    )
    require(
        "nodeGraphModuleIsRealtimeOscillatorType(type) ||" in execution_plan_source[source_nodes_start:source_nodes_end],
        "polyBlep oscillator types should be included in live execution-plan source nodes",
    )
    require(
        'type === "ellipsoid" ||' in execution_plan_source[source_nodes_start:source_nodes_end],
        "ellipsoid should be included in live execution-plan source nodes",
    )
    removed_overdraw_snippets = [
        "nodeMasterScopeOverdrawPoints",
        "nodeMasterScopeOverdrawFade",
        "moduleScopeOverdrawPoints",
        "moduleScopeOverdrawFade",
        "normalizeNodeGraphModuleScopeOverdrawPoints",
        "normalizeNodeGraphModuleScopeOverdrawFade",
        "nodeGraphModuleScopeOverdrawPointCount",
        "uOverdrawFade",
        "beamOverdrawFadeLocation",
    ]
    overdraw_removed_sources = {
        "index": index_source,
        "node graph": node_graph_source,
        "view controls": script_sources["./public/node-graph-view-controls.js"],
        "ui settings persistence": script_sources["./public/node-graph-ui-settings-persistence.js"],
        "state": script_sources["./public/node-graph-state.js"],
        "default ui settings": DEFAULT_UI_SETTINGS.read_text(encoding="utf-8"),
        "default ui settings script": DEFAULT_UI_SETTINGS_SCRIPT.read_text(encoding="utf-8"),
    }
    for snippet in removed_overdraw_snippets:
        for label, source_text in overdraw_removed_sources.items():
            require(snippet not in source_text, f"removed overdraw artifact still present in {label}: {snippet}")

    default_ui_settings_payload = json.loads(DEFAULT_UI_SETTINGS.read_text(encoding="utf-8-sig"))
    default_ui_settings_script_payload = read_bundled_default_ui_settings_script_payload()
    require(
        default_ui_settings_script_payload == default_ui_settings_payload,
        "bundled UI settings script payload should match useruisettings.json exactly",
    )
    default_ui_view = default_ui_settings_payload.get("view", {})
    require(default_ui_view.get("workingPatch") is None, "default ui settings should not embed a working patch")
    require(default_ui_view.get("patchDirtyState") == "untouched", "default ui settings should start untouched")
    require(
        all(not entry.get("open") for entry in default_ui_view.get("workspaceWindowStates", {}).values()),
        "default ui settings should not open floating windows on first load",
    )
    require(default_ui_view.get("sharedInspectorActive", "") == "", "default ui settings should not open a shared inspector on first load")
    require(default_ui_view.get("sharedInspectorWindowState", {}) == {}, "default ui settings should not pin shared inspector geometry on first load")

    require(
        '<script src="./public/node-graph-color-standards.js?v=color-standards-1"></script>' in index_source,
        "color standards script tag missing from index",
    )
    for snippet in [
        'parsed.path == "/api/shader-script/to-desktop"',
        "def save_shader_script_to_desktop(self) -> None:",
        "shader script source must be a string",
        'parsed.path == "/api/metadata-script/to-desktop"',
        "def save_metadata_script_to_desktop(self) -> None:",
        "metadata script source must be a string",
        'parsed.path == "/api/open-path"',
        "def open_local_path(self) -> None:",
        "downloads = (Path.home() / \"Downloads\").resolve()",
        "path must be inside Downloads",
        "os.startfile(str(target))",
        'SAVED_PATCHES = ROOT / "saved-patches"',
        'parsed.path == "/api/patches/save"',
        'parsed.path == "/api/patches"',
        'parsed.path == "/api/patches/file"',
        "def serve_demo_patches(self) -> None:",
        "requested_bank = self.normalized_patch_bank",
        "\"program\": program",
        "\"bankName\": str(info.get(\"bankName\") or \"\")",
        "def serve_demo_patch_file(self, query: str) -> None:",
        "def save_demo_patch(self) -> None:",
        "filename = f\"bank{bank:03d}-program{program:03d}-{safe_title or 'soemdsp-patch'}.json\"",
        "def patch_program_for_file(self, path: Path, info: dict, fallback: int) -> int:",
        "def validate_node_patch_payload(self, payload: dict, label: str) -> bool:",
        "SAVED_PATCHES.mkdir(parents=True, exist_ok=True)",
        "Path.home() / \"Desktop\"",
        "filename = f\"{safe_title}-{timestamp}.scope-shader.txt\"",
        "filename = f\"{safe_title}-{timestamp}.metadata-script.txt\"",
    ]:
        require(snippet in server_source, f"server desktop export contract missing {snippet}")
    for snippet in [
        'ZRGBA: "ZRGBA"',
        'Chroma: "Chroma"',
        'HLSA: "HLSA"',
        "function nodeGraphNormalizeColorSpace(space)",
        "function nodeGraphNormalizeZrgba(color = {})",
        "function nodeGraphNormalizeHlsa(color = {})",
        "function nodeGraphNormalizeChroma(color = {})",
        "function nodeGraphHlsaToZrgba(color = {})",
        "function nodeGraphZrgbaToHlsa(color = {})",
        "function nodeGraphChromaToZrgba(color = {})",
        "function nodeGraphConvertColor(color = {}, from = \"ZRGBA\", to = \"ZRGBA\")",
        'if (value === "rgba" || value === "zrgba")',
        "Object.assign(globalThis, {",
        "nodeGraphOfficialColorStandards",
    ]:
        require(snippet in color_standards_source, f"color standards contract missing {snippet}")
    for snippet in [
        "--node-shader-token-property",
        "--node-shader-token-assignment",
        "--node-shader-token-number",
        "--node-shader-token-mode",
        "--node-shader-token-comment",
        ".node-shader-script-syntax-colors-panel",
        "#nodeShaderScriptSyntaxColorsButton",
        ".node-shader-script-camera-viewport",
        ".node-camera-preview-viewport",
        ".node-camera-preview-surface",
    ]:
        require(snippet in style_source, f"shader syntax color stylesheet contract missing {snippet}")

    codeblock_contract_sources = {
        "definitions": script_sources["./public/node-graph-module-definitions.js"],
        "store": script_sources["./public/node-graph-module-store.js"],
        "metadata": script_sources["./public/node-graph-parameter-metadata.js"],
        "patch core": script_sources["./public/node-graph-patch-core.js"],
        "parameter metadata": script_sources["./public/node-graph-parameter-metadata.js"],
        "actions": script_sources["./public/node-graph-module-actions.js"],
        "code screen": script_sources["./public/node-graph-code-screen.js"],
        "code screen model": script_sources["./public/node-graph-code-screen-model.js"],
        "clone": script_sources["./public/node-graph-patch-clone.js"],
        "header events": script_sources["./public/node-graph-header-event-bindings.js"],
        "menu": index_source,
        "menu events": script_sources["./public/node-graph-scene-menu-event-bindings.js"],
        "runtime": script_sources["./public/node-graph-live-frame-evaluator.js"]
        + script_sources["./public/modules/codeblock/codeblock-live-evaluator.js"],
        "worklet": worklet_source,
    }
    graph_contract_sources = {
        "definitions": script_sources["./public/node-graph-module-definitions.js"],
        "store": script_sources["./public/node-graph-module-store.js"],
        "utils": script_sources["./public/node-graph-graph-utils.js"],
        "default patch": script_sources["./public/node-graph-default-patch.js"],
        "patch core": script_sources["./public/node-graph-patch-core.js"],
        "patch normalizers": script_sources["./public/node-graph-patch-normalizers.js"],
        "clone": script_sources["./public/node-graph-patch-clone.js"],
        "actions": script_sources["./public/node-graph-module-actions.js"],
        "ui view": script_sources["./public/node-graph-ui-view.js"],
        "rendering": script_sources["./public/node-graph-module-rendering.js"],
        "menu events": script_sources["./public/node-graph-scene-menu-event-bindings.js"],
        "event bindings": script_sources["./public/node-graph-event-bindings.js"],
        "context menu": script_sources["./public/node-graph-context-menu.js"],
        "header events": script_sources["./public/node-graph-header-event-bindings.js"],
        "keyboard": script_sources["./public/node-graph-keyboard-shortcuts.js"],
        "runtime": script_sources["./public/node-graph-live-runtime.js"],
        "sizing": script_sources["./public/node-graph-module-sizing.js"],
        "state": script_sources["./public/node-graph-state.js"],
        "style": style_source,
        "index": index_source,
    }
    for name, source, snippets in [
        (
            "definitions",
            graph_contract_sources["definitions"],
            [
                'graph: "Graph"',
                'graph2: "Graph 2"',
                "graph: {",
                "graph2: {",
                'inputs: ["In"]',
                'layout: "graph"',
                'outputs: ["Out"]',
                'choices: ["Input", "LFO"]',
                'choices: ["Linear", "Smooth", "Meander", "Quadratic Through", "Cubic Through"]',
                'choices: ["Off", "On"]',
                'key: "mode"',
                'key: "smoothingMode"',
                'key: "lockEndpointY"',
                'label: "Lock Ends"',
                'key: "rate"',
                'key: "phase"',
                'key: "outputMin"',
                'key: "outputMax"',
            ],
        ),
        (
            "store",
            graph_contract_sources["store"],
            ["graph: {", "graph2: {", 'category: "Visual"', "Patch-local soemdsp-style graph object", "Single-algorithm graph testbed"],
        ),
        (
            "normalizer",
            graph_contract_sources["utils"],
            [
                "const nodeGraphGraphShapes",
                '"smooth"',
                '"hold"',
                "const nodeGraphDefaultGraphData",
                "const nodeGraphGraphPresets",
                "function nodeGraphGraphPresetData",
                "function nodeGraphGraphTransformedData",
                "function serializeNodeGraphGraphClipboard",
                "function parseNodeGraphGraphClipboard",
                'type: "soemdsp.graph"',
                'type === "flipY"',
                'type === "reverseX"',
                "envelope: Object.freeze",
                "sine: Object.freeze",
                "triangle: Object.freeze",
                "steps: Object.freeze",
                'shape: "hold"',
                "function normalizeNodeGraphGraph(value = {})",
                "function nodeGraphGraphEndpointYLockEnabledForNode(patchNode)",
                "function nodeGraphGraphWithLockedEndpointY(graphValue, selectedIndex = 0)",
                "function nodeGraphGraphForNode(patchNode, selectedIndex = 0)",
                "function nodeGraphGraphNextShape",
                "function nodeGraphGraphContourShape",
                "function nodeGraphGraphValueAt(graphValue, xValue, smoothingMode = \"legacy\")",
                "function addNodeGraphGraphNodeData",
                "function duplicateNodeGraphGraphNodeData",
                "function cycleNodeGraphGraphShapeData",
                "graph.nodes.length >= 32",
                "function nodeGraphGraphCurvePath(graphValue, sampleCount = 96, smoothingMode = \"legacy\")",
                "function renderNodeGraphGraphDisplay(element, graphValue, selectedIndex = null, options = {})",
                "const cursorValue = nodeGraphGraphValueAt(graph, graph.cursorX, smoothingMode)",
                "function syncNodeGraphGraphElement(moduleElement, patchNode)",
                "const graph = nodeGraphGraphForNode(patchNode)",
                "function nodeGraphGraphSvgPlotRect(svg)",
                'preserveAspectRatio: "xMidYMid meet"',
                "function nodeGraphGraphSvgToGraphPoint",
                "const rect = nodeGraphGraphSvgPlotRect(svg)",
                "function nodeGraphGraphConstrainedNodePoint",
                "function beginNodeGraphGraphNodeDrag",
                "function dragNodeGraphGraphNode",
                "function endNodeGraphGraphNodeDrag",
                "function beginNodeGraphGraphCursorDrag",
                "function nodeGraphGraphContourHandlePoint",
                "function nodeGraphGraphContourFromPoint",
                "function nodeGraphGraphSelectionState",
                "function nodeGraphGraphSelectedNodeIndex",
                "function setNodeGraphGraphSelectedNodeIndex",
                "function beginNodeGraphGraphContourDrag",
                "function addNodeGraphGraphNodeFromDisplayEvent",
                "function cycleNodeGraphGraphShapeFromDisplayEvent",
                "function removeFocusedNodeGraphGraphNode",
                "function addFocusedNodeGraphGraphNode",
                "function duplicateFocusedNodeGraphGraphNode",
                "function cycleFocusedNodeGraphGraphShape",
                "function selectFocusedNodeGraphGraphNodeOffset",
                "function nudgeFocusedNodeGraphGraphNode",
                "display?.focus?.({ preventScroll: true })",
                "data-graph-node-index",
                "data-graph-contour-index",
                "data-graph-shape-index",
                "data-selected",
                "node-module-graph-node-hit",
                "node-module-graph-contour-handle",
                "node-module-graph-shape-badge",
                "node-module-graph-grid-line",
                "node-module-graph-cursor-hit",
                "node-module-graph-cursor-value-guide",
                'data-graph-cursor',
                'mode: "cursor"',
                "mode: \"contour\"",
                "[0.25, 0.5, 0.75].forEach",
                'gridValue === 0.5 ? " major" : ""',
                "graph node added",
                "addition.added",
                "graph cursor moved",
                "graph curve shape changed",
                "graph node duplicated",
                "graph node nudged",
                "nodeGraphGraphWithLockedEndpointY(drag.graph, drag.index)",
                "event.altKey ? 0.001 : event.shiftKey ? 0.05 : 0.01",
                "nodeGraphGraphRationalCurve(p, contour)",
                "nodeGraphGraphExponentialCurve(p, contour)",
                'shape === "rational" || shape === "exponential" ? shape : "rational"',
                "function nodeGraphGraphSmoothCurve(position)",
                "const nodeGraphGraph2SmoothingModes",
                "function normalizeNodeGraphGraph2SmoothingMode(value)",
                "function nodeGraphGraphMeanderCurve(position, index = 0)",
                "function nodeGraphGraphBezierPointAt(nodes, position = 0)",
                "function nodeGraphGraphBezierValueAt(graph, xValue)",
                "function nodeGraphGraphInterpolationWindowStart(nodes, x, degree)",
                "function nodeGraphGraphLagrangeValueAt(graph, xValue, degree = 3)",
                "function nodeGraphGraphControlPolygonPath(graphValue)",
                "function nodeGraphGraphModeCurve(position, mode, index = 0)",
                "function nodeGraphGraphSmoothingModeForNode(patchNode)",
                'normalizedMode === "meander"',
                'normalizedMode === "quadratic"',
                'normalizedMode === "cubic"',
                'class: "node-module-graph-control-line"',
                "return p * p * (3 - 2 * p)",
                "smoothingMode !== \"legacy\"",
                'right.shape === "hold"',
                "? (p >= 1 ? 1 : 0)",
                'right.shape === "smooth"',
                "nodeGraphGraphSmoothCurve(p)",
                "shape: nodeGraphGraphContourShape(current.shape)",
                "cursorX: normalizeNodeGraphGraphNumber",
                ".sort((left, right) => left.x - right.x)",
            ],
        ),
        (
            "patch data",
            "\n".join([
                graph_contract_sources["default patch"],
                graph_contract_sources["patch core"],
                graph_contract_sources["clone"],
                graph_contract_sources["actions"],
            ]),
            [
                "node.graph = normalizeNodeGraphGraph(options.graph)",
                "if (nodeGraphModuleIsGraphType(type))",
                "normalizedNode.graph = nodeGraphGraphEndpointYLockEnabledForNode(normalizedNode)",
                "nodeGraphGraphWithLockedEndpointY(node.graph)",
                "nodeGraphModuleIsGraphType(node.type)",
                "graph: nodeGraphGraphEndpointYLockEnabledForNode(node)",
                "nodeGraphGraphWithLockedEndpointY(node.graph)",
                "graph: sourceNode.graph",
            ],
        ),
        (
            "render module",
            graph_contract_sources["rendering"],
            [
                'definition.layout === "graph"',
                "graph-node-layout",
                "node-module-graph-display",
                "renderNodeGraphGraphDisplay(graphSection, nodeGraphGraphForNode(patchNode), null, {",
                "smoothingMode: nodeGraphGraphSmoothingModeForNode(patchNode)",
                "const inputColumn = createNodeGraphIoColumn(node, type, inputPorts, \"input\")",
                "const outputColumn = createNodeGraphIoColumn(node, type, outputPorts, \"output\")",
                "graphSection.tabIndex = 0",
            ],
        ),
        (
            "no scope slot",
            graph_contract_sources["rendering"][
                graph_contract_sources["rendering"].find('} else if (definition.layout === "graph") {'):
                graph_contract_sources["rendering"].find('} else if (definition.layout === "filterCurve") {')
            ],
            [
                '} else if (definition.layout === "graph") {',
                "renderNodeGraphGraphDisplay(graphSection, nodeGraphGraphForNode(patchNode), null, {",
            ],
        ),
        (
            "sizing and style",
            "\n".join([graph_contract_sources["sizing"], graph_contract_sources["style"]]),
            [
                "layout === \"graph\"",
                "nodeGraphModuleIoSectionHeightGu(type)",
                ".dsp-node.graph-node-layout",
                "minmax(var(--node-io-section-min-height), auto)",
                ".node-module-graph-display",
                ".node-module-graph-display:focus-visible",
                ".node-module-graph-grid-line",
                ".node-module-graph-grid-line.major",
                ".node-module-graph-cursor",
                ".node-module-graph-cursor-hit",
                ".node-module-graph-cursor-value-guide",
                ".node-module-graph-curve",
                ".node-module-graph-control-line",
                ".node-module-graph-node",
                ".node-module-graph-node.selected",
                ".node-module-graph-node-hit",
                ".node-module-graph-node-hit.selected",
                ".node-module-graph-contour-handle",
                ".node-module-graph-contour-handle.selected",
                ".node-module-graph-shape-badge",
                ".node-module-graph-shape-badge.selected",
                "pointer-events: all",
                ".node-module-graph-display.dragging .node-module-graph-node",
                ".scene-context-graph-node-picker",
                ".scene-context-graph-node-grid",
                ".scene-context-graph-node-list",
                ".scene-context-graph-node-row",
                ".scene-context-codeblock-controls select",
            ],
        ),
        (
            "actions menu markup",
            graph_contract_sources["index"],
            [
                "nodeSceneGraphControls",
                "nodeSceneGraphCursorX",
                "nodeSceneGraphPreviousNode",
                "nodeSceneGraphNodeIndex",
                "nodeSceneGraphNextNode",
                "nodeSceneGraphNodeShape",
                "nodeSceneGraphNodeList",
                "nodeSceneGraphAddNode",
                "nodeSceneGraphDuplicateNode",
                "nodeSceneGraphRemoveNode",
                "nodeSceneGraphReset",
                "nodeSceneGraphPresetControls",
                'data-graph-preset="ramp"',
                'data-graph-preset="sine"',
                'data-graph-preset="triangle"',
                'data-graph-preset="envelope"',
                'data-graph-preset="steps"',
                '<option value="smooth">smooth</option>',
                '<option value="hold">hold</option>',
                "nodeSceneGraphRangeControls",
                'data-graph-range-min="-1"',
                'data-graph-range-max="0"',
                "nodeSceneGraphTransformControls",
                'data-graph-transform="flipY"',
                'data-graph-transform="reverseX"',
                "nodeSceneGraphCopy",
                "nodeSceneGraphPaste",
                "scene-context-graph-node-grid",
            ],
        ),
        (
            "actions helpers",
            graph_contract_sources["actions"],
            [
                "function nodeGraphGraphTargetFromContext",
                "function syncNodeGraphGraphControls",
                "setNodeGraphGraphSelectedNodeIndex(nodeId, graphData, index)",
                "function commitNodeGraphGraphEdit",
                "nodeGraphGraphWithLockedEndpointY(targetNode.graph, selectedIndex)",
                "function setNodeGraphGraphCursorFromContext",
                "function setNodeGraphGraphNodeFromContext",
                "function selectNodeGraphGraphNodeOffsetFromContext",
                "function addNodeGraphGraphNodeFromContext",
                "addNodeGraphGraphNodeData(targetNode.graph)",
                "function duplicateNodeGraphGraphNodeFromContext",
                "duplicateNodeGraphGraphNodeData(graph, selectedIndex)",
                "graph node duplicated",
                "function removeNodeGraphGraphNodeFromContext",
                "function resetNodeGraphGraphFromContext",
                "function setNodeGraphGraphPresetFromContext",
                "nodeGraphGraphPresetData(preset)",
                "function setNodeGraphGraphOutputRangeFromContext",
                'normalizeNodeGraphPatchParameter(targetNode.type, "outputMin", minValue)',
                'normalizeNodeGraphPatchParameter(targetNode.type, "outputMax", maxValue)',
                "function transformNodeGraphGraphFromContext",
                "nodeGraphGraphTransformedData(targetNode.graph, transform)",
                "async function copyNodeGraphGraphFromContext",
                "async function pasteNodeGraphGraphFromContext",
                "serializeNodeGraphGraphClipboard(graph)",
                "parseNodeGraphGraphClipboard(text)",
                "nodeGraphMvp.graphClipboard",
                "function renderNodeGraphGraphNodeList",
                "function handleNodeGraphGraphNodeListClick",
                "function handleNodeGraphGraphNodeListInput",
                "function handleNodeGraphGraphNodeListChange",
                "const hasFallback = Number.isFinite(Number(fallback))",
                "dataset?.graphNodeField",
                "selectedX",
            ],
        ),
        (
            "ui view",
            "\n".join([
                graph_contract_sources["index"],
                graph_contract_sources["ui view"],
                graph_contract_sources["actions"],
                graph_contract_sources["context menu"],
                graph_contract_sources["header events"],
                graph_contract_sources["event bindings"],
                graph_contract_sources["patch normalizers"],
                graph_contract_sources["state"],
                graph_contract_sources["style"],
            ]),
            [
                "nodeUiView",
                "nodeUiViewStage",
                "function nodeGraphUiItemTypeForNode",
                "nodeGraphModuleIsGraphType(node?.type) ? \"graphEditor\" : \"moduleControl\"",
                "const nodeGraphPatchUiItemSizeLimits = Object.freeze",
                "function clampNodeGraphUiItemSize(size = {})",
                "function beginNodeGraphUiItemDrag",
                "function beginNodeGraphUiItemResize",
                "function dragNodeGraphUiItem",
                "function endNodeGraphUiItemDrag",
                "function bindNodeGraphUiViewEvents",
                "function createNodeGraphUiGraphToolbar",
                "function createNodeGraphUiGraphStatus",
                "function createNodeGraphUiGraphInspector",
                "const usesGlobalSmoothing = sourceNode?.type === \"graph2\"",
                "Graph 2 uses one global smoothing mode.",
                'shapeLabel.textContent = "smoothing"',
                "mode.value = normalizeNodeGraphGraph2SmoothingMode(sourceNode?.params?.smoothingMode)",
                "function nodeGraphUiItemHeightGu",
                "function resizeNodeGraphUiItemHeightGu",
                "function runNodeGraphUiGraphAction",
                "function updateNodeGraphUiGraphSelectedPoint",
                "function renderNodeGraphUiView",
                "uiItemDragging: null",
                "graphEditor",
                "node-ui-graph-display",
                "node-ui-graph-toolbar",
                "node-ui-graph-inspector",
                "node-ui-graph-status",
                "point ${selectedIndex + 1}/${graph.nodes.length}",
                "height gu",
                "ui graph height changed",
                "ui graph point changed",
                "runNodeGraphUiGraphAction(button, entry.action)",
                "selectFocusedNodeGraphGraphNodeOffset(-1)",
                "addFocusedNodeGraphGraphNode",
                "duplicateFocusedNodeGraphGraphNode",
                "removeFocusedNodeGraphGraphNode",
                "cycleFocusedNodeGraphGraphShape",
                "disabled: usesGlobalSmoothing",
                "updateNodeGraphUiGraphSelectedPoint(sourceNode",
                "targetNode.type !== \"graph2\" && Object.hasOwn(updates, \"shape\")",
                "nodeGraphGraphShapes",
                "H-",
                "H+",
                "display.addEventListener(\"pointerdown\", beginNodeGraphGraphNodeDrag, true)",
                "header.addEventListener(\"pointerdown\", beginNodeGraphUiItemDrag)",
                "resize.addEventListener(\"pointerdown\", beginNodeGraphUiItemResize)",
                "bindNodeGraphUiViewEvents()",
                "Add a Graph module to UI from its action menu.",
                "Add Graph UI",
                "setNodeGraphViewMode(\"ui\")",
                ".node-ui-view",
                ".node-ui-item",
                ".node-ui-item-resize",
                ".node-ui-item.dragging",
                ".node-ui-graph-toolbar",
                ".node-ui-graph-toolbar button",
                ".node-ui-graph-inspector",
                ".node-ui-graph-inspector input",
                ".node-ui-graph-inspector select",
                ".node-ui-graph-status",
            ],
        ),
        (
            "context menu controls",
            graph_contract_sources["context menu"],
            [
                "const targetIsGraphType = nodeGraphModuleIsGraphType(targetNode?.type)",
                "graphControls.hidden = !(moduleMode && !multiModuleMode && targetIsGraphType)",
                "syncNodeGraphGraphControls(nodeGraphGraphForNode(targetNode))",
                "nodeSceneGraphCursorX",
                "nodeSceneGraphPreviousNode",
                "nodeSceneGraphNextNode",
                "graphPreviousNode.title = \"Select the previous graph node.\"",
                "graphNextNode.title = \"Select the next graph node.\"",
                "graphPreviousNode.disabled = true",
                "graphNextNode.disabled = true",
                "nodeSceneGraphNodeShape",
                "nodeSceneGraphNodeList",
                "graphNodeIndex.replaceChildren()",
                "graphNodeList.replaceChildren()",
            ],
        ),
        (
            "event bindings",
            graph_contract_sources["menu events"],
            [
                "setNodeGraphGraphCursorFromContext({ record: false })",
                "setNodeGraphGraphCursorFromContext({ record: true })",
                "selectNodeGraphGraphNodeFromContext",
                "setNodeGraphGraphNodeFromContext({ record: false })",
                "setNodeGraphGraphNodeFromContext({ record: true })",
                "addNodeGraphGraphNodeFromContext",
                "duplicateNodeGraphGraphNodeFromContext",
                "removeNodeGraphGraphNodeFromContext",
                "resetNodeGraphGraphFromContext",
                "#nodeSceneGraphPresetControls [data-graph-preset]",
                "setNodeGraphGraphPresetFromContext(button.dataset.graphPreset)",
                "#nodeSceneGraphRangeControls [data-graph-range-min][data-graph-range-max]",
                "setNodeGraphGraphOutputRangeFromContext(",
                "button.dataset.graphRangeMin",
                "button.dataset.graphRangeMax",
                "#nodeSceneGraphTransformControls [data-graph-transform]",
                "transformNodeGraphGraphFromContext(button.dataset.graphTransform)",
                "nodeSceneGraphCopy",
                "copyNodeGraphGraphFromContext",
                "nodeSceneGraphPaste",
                "pasteNodeGraphGraphFromContext",
                "nodeSceneGraphPreviousNode",
                "selectNodeGraphGraphNodeOffsetFromContext(-1)",
                "nodeSceneGraphNextNode",
                "selectNodeGraphGraphNodeOffsetFromContext(1)",
                "handleNodeGraphGraphNodeListClick",
                "handleNodeGraphGraphNodeListInput",
                "handleNodeGraphGraphNodeListChange",
                "beginNodeGraphGraphNodeDrag",
                "dragNodeGraphGraphNode",
                "endNodeGraphGraphNodeDrag",
            ],
        ),
        (
            "keyboard editing",
            graph_contract_sources["keyboard"],
            [
                "removeFocusedNodeGraphGraphNode()",
                "addFocusedNodeGraphGraphNode()",
                "duplicateFocusedNodeGraphGraphNode()",
                "cycleFocusedNodeGraphGraphShape()",
                "selectFocusedNodeGraphGraphNodeOffset(-1)",
                "selectFocusedNodeGraphGraphNodeOffset(1)",
                "nudgeFocusedNodeGraphGraphNode(event)",
                'event.key.toLowerCase() === "a"',
                'event.key.toLowerCase() === "d"',
                'event.key.toLowerCase() === "s"',
                'event.key === "["',
                'event.key === "]"',
                "event.preventDefault()",
                "deleteSelectedNodeGraphItem()",
                "function nodeGraphCanvasScriptSourceWithGridUnits(source, widthGu, heightGu)",
                "function resizeNodeGraphCanvasModuleOnGrid(patchNode, delta)",
                'nodeGraphModuleSizingCapabilities(patchNode?.type).moduleHeight !== "canvasScript"',
                "delete patchNode.widthGu;",
                "delete patchNode.heightGu;",
            ],
        ),
        (
            "script and type count",
            "\n".join([graph_contract_sources["index"], graph_contract_sources["state"], graph_contract_sources["runtime"]]),
            [
                "dynamic-module-counts-1",
                "floating-arrow-editable-1",
                "node-graph-graph-utils.js",
                "graphNodeDragging: null",
                "graphClipboard: null",
                "graphSelectedNodeIndices: new Map()",
                "graph: 0",
                "graph2: 0",
                "runtime.absoluteFrameCursor",
                "runtime.absoluteFrame = blockStartFrame + frame",
                "runtime.absoluteFrameCursor = blockStartFrame + frames",
            ],
        ),
    ]:
        for snippet in snippets:
            assert snippet in source, f"missing graph {name} contract: {snippet}"
    graph_render_branch = graph_contract_sources["rendering"][
        graph_contract_sources["rendering"].find('} else if (definition.layout === "graph") {'):
        graph_contract_sources["rendering"].find('} else if (definition.layout === "filterCurve") {')
    ]
    require(
        "registerNodeGraphModuleScopeSlot" not in graph_render_branch,
        "graph module branch must not register an oscilloscope slot",
    )

    delay_contract_sources = {
        "definitions": script_sources["./public/node-graph-module-definitions.js"],
        "store": script_sources["./public/node-graph-module-store.js"],
        "plan": script_sources["./public/node-graph-live-plan-runtime.js"],
        "runtime": node_graph_source,
        "live runtime": script_sources["./public/node-graph-live-runtime.js"],
        "worklet": worklet_source,
    }
    for name, source, snippets in [
        (
            "definitions",
            delay_contract_sources["definitions"],
            [
                'delayEffect: "Delay"',
                "delayEffect: {",
                'inputs: ["In", "Left", "Right"]',
                'outputs: ["Out", "Left", "Right", "Wet"]',
                'key: "time"',
                'key: "feedback"',
                'key: "modAmount"',
                'choices: ["Delay", "Diffuse"]',
            ],
        ),
        (
            "store",
            delay_contract_sources["store"],
            [
                "delayEffect: {",
                "SOEMDSP-style modulated fractional delay",
                'label: "Delay"',
            ],
        ),
        (
            "runtime",
            "\n".join([
                delay_contract_sources["plan"],
                delay_contract_sources["runtime"],
                delay_contract_sources["worklet"],
            ]),
            [
                "delayEffectStates",
                "createNodeGraphDelayEffectState",
                "nodeGraphDelayEffectSample",
                "createDelayEffectState",
                "delayEffectSample",
                "delayParabolSample",
                "delayInterpolateLinear",
                'node?.type === "delayEffect"',
            ],
        ),
        (
            "worklet cache",
            delay_contract_sources["live runtime"],
            ['node-live-audio-worklet-core.js?v='],
        ),
    ]:
        for snippet in snippets:
            require(snippet in source, f"missing delay {name} contract: {snippet}")

    clap_contract_sources = {
        "definitions": script_sources["./public/node-graph-module-definitions.js"],
        "store": script_sources["./public/node-graph-module-store.js"],
        "clone": script_sources["./public/node-graph-patch-clone.js"],
        "default patch": script_sources["./public/node-graph-default-patch.js"],
        "metadata": script_sources["./public/node-graph-parameter-metadata.js"],
        "patch core": script_sources["./public/node-graph-patch-core.js"],
        "execution plan": script_sources["./public/node-graph-execution-plan.js"],
        "rendering": script_sources["./public/node-graph-module-rendering.js"],
        "render output": script_sources["./public/node-graph-render-output.js"],
        "runtime": node_graph_source,
        "live runtime": script_sources["./public/node-graph-live-runtime.js"],
        "worklet": worklet_source,
        "host client": script_sources["./public/node-graph-clap-host.js"],
        "host": (ROOT / "tools" / "webui-clap-host" / "webui_clap_host.py").read_text(encoding="utf-8"),
        "launcher": (ROOT / "tools" / "webui-clap-host" / "start_webui_clap_host.ps1").read_text(encoding="utf-8"),
        "cmd launcher": (ROOT / "tools" / "webui-clap-host" / "start_webui_clap_host.cmd").read_text(encoding="utf-8"),
        "style": style_source,
    }
    for name, source, snippets in [
        (
            "definitions",
            clap_contract_sources["definitions"],
            ['clapPlugin: "CLAP Plugin"', "clapPlugin: {", 'layout: "clapPlugin"', 'inputs: ["Left", "Right"]', 'outputs: ["Left", "Right"]'],
        ),
        (
            "store",
            clap_contract_sources["store"],
            ["clapPlugin: {", 'category: "Audio"', "developerOnly: true", "Browser-side shell for a local CLAP host plugin"],
        ),
        (
            "patch persistence",
            "\n".join([clap_contract_sources["clone"], clap_contract_sources["default patch"], clap_contract_sources["patch core"]]),
            [
                "function normalizeNodeGraphClapAudioPorts",
                "function normalizeNodeGraphClapPluginBinding",
                "stateBase64",
                "stateByteCount",
                "stateSavedAt",
                "if (audioInputs.length) binding.audioInputs = audioInputs",
                "if (audioOutputs.length) binding.audioOutputs = audioOutputs",
                "node.clap = normalizeNodeGraphClapPluginBinding(options.clap)",
                "normalizedNode.clap = normalizeNodeGraphClapPluginBinding(node.clap)",
                'if (type === "clapPlugin")',
                "for (const [key, sourceMetadata] of Object.entries(node.paramMeta || {}))",
                "{ clap: normalizeNodeGraphClapPluginBinding(node.clap) }",
            ],
        ),
        (
            "dynamic ports",
            clap_contract_sources["metadata"],
            [
                "function nodeGraphPatchNodeParameterDefinitions",
                "function nodeGraphClapAudioPortLaneNames",
                "function nodeGraphPatchNodeClapAudioInputPorts",
                "function nodeGraphPatchNodeClapAudioOutputPorts",
                "for (const port of ports)",
                "function nodeGraphClapPatchParameterFallbackMetadata",
                'type === "clapPlugin"',
                "clapParamId",
                "metadata.clapParamName",
                'patchNode?.type === "clapPlugin"',
                "patchNode.clap?.audioInputs",
                "patchNode.clap?.audioOutputs",
                "nodeGraphPatchNodeParameterDefinitions(patchNode).map((parameter) => parameter.key)",
            ],
        ),
        (
            "execution plan",
            clap_contract_sources["execution plan"],
            [
                "nodeGraphModuleProducesOutputWithoutSignalInput(type)",
                "nodeGraphPatchNodeOutputPorts(source)",
                "nodeGraphPatchNodeInputPorts(destination)",
                "nodeGraphPatchNodeParameterDefinitions(destination)",
            ],
        ),
        (
            "rendering",
            clap_contract_sources["rendering"],
            [
                'definition.layout === "clapPlugin"',
                "createNodeGraphClapPluginBody(node)",
                "const parameterDefinitions = nodeGraphPatchNodeParameterDefinitions(patchNode)",
            ],
        ),
        (
            "host client",
            clap_contract_sources["host client"],
            [
                "function createNodeGraphClapPluginBody",
                "function createNodeGraphClapPluginInstance",
                "function deleteNodeGraphClapPluginInstance",
                "function refreshNodeGraphClapHostInstances",
                "function refreshNodeGraphClapPluginParameters",
                "function resetNodeGraphClapPluginSafety",
                "function openNodeGraphClapPluginEditor",
                "function closeNodeGraphClapPluginEditor",
                "function nodeGraphClapCommitInstanceSummary",
                "function nodeGraphClapInstanceSafety",
                "function nodeGraphClapInstanceEditor",
                "function nodeGraphClapEditorStatusText",
                "function nodeGraphClapInstanceLatency",
                "function nodeGraphClapLatencyStatusText",
                "function nodeGraphClapInstanceTail",
                "function nodeGraphClapTailStatusText",
                "function nodeGraphClapInstanceState",
                "function nodeGraphClapStateStatusText",
                "function saveNodeGraphClapPluginState",
                "function restoreNodeGraphClapPluginState",
                "const nodeGraphClapHostUnderConstruction = true",
                "function markNodeGraphClapHostButtonUnderConstruction(button)",
                "function createNodeGraphClapPluginActionButton(label, datasetKey, nodeId, handler)",
                "function syncNodeGraphClapPluginActionButtons(buttons, binding, staleInstance)",
                "markNodeGraphClapHostButtonsUnderConstruction([",
                'button.className = "node-secondary-button"',
                "const nodeGraphClapHostCapabilityKeys",
                "function normalizeNodeGraphClapHostCapabilities",
                "function updateNodeGraphClapHostCapabilities",
                "function nodeGraphClapHostCanProcessAudio",
                "function nodeGraphClapHostCanUseRenderSessions",
                "function nodeGraphClapHostMaxProcessFrames",
                "function nodeGraphClapHostCanProcessBatch",
                "function nodeGraphClapHostMaxProcessBatchItems",
                "function normalizeNodeGraphClapHostConfig",
                "function nodeGraphClapHostConfigSummary",
                "function nodeGraphClapInstanceIsStale",
                "const nodeGraphClapHostStorageKey",
                "function normalizeNodeGraphClapHostBaseUrl",
                "function loadNodeGraphClapHostBaseUrl",
                "function applyNodeGraphClapHostBaseUrlFromInput",
                "function nodeGraphClapHostLaunchCommand",
                "tools\\\\webui-clap-host\\\\start_webui_clap_host.cmd -BindHost ${url.hostname} -Port ${port}",
                "function copyNodeGraphClapHostLaunchCommand",
                "function nodeGraphClapHostDiagnosticsText",
                "function runNodeGraphClapHostDiagnostics",
                'fetchNodeGraphClapHostJson("/diagnostics", 15000)',
                "running host diagnostics",
                "diagnostics failed:",
                "host prototype command copied",
                "copy unavailable; run",
                "const nodeGraphClapEditorRequestTimeoutMs = 12000",
                "Forget Instance",
                "Host instance is stale. Forget it, then create a new instance.",
                "normalized.maxProcessFrames = Math.floor(maxProcessFrames)",
                "normalized.maxProcessBatchItems = Math.floor(maxProcessBatchItems)",
                "clearNodeGraphClapHostInstanceSummaries",
                "function nodeGraphClapParameterKey",
                "function nodeGraphCommitClapPluginParameterPayload",
                "function syncStoredNodeGraphClapParametersToHost",
                "syncNodeGraphClapPatchParameterFromHostSlider",
                "function queueNodeGraphClapParameterWrite",
                "node-clap-plugin-safety",
                "Reset Safety",
                "Open Editor",
                "Close Editor",
                "open: editor.open === true",
                "api: String(editor.api || \"\")",
                "width: Number.isFinite(Number(editor.width))",
                "height: Number.isFinite(Number(editor.height))",
                "!editor.canOpen",
                "nodeGraphClapEditorRequestTimeoutMs",
                "Save State",
                "Restore State",
                "createNodeParameterModulationPort(nodeId, \"clapPlugin\", definition)",
                "createNodeParameterOutputPort(nodeId, \"clapPlugin\", definition)",
                'postNodeGraphClapHostJson("/instances"',
                'fetchNodeGraphClapHostJson("/instances", 3000)',
                "await refreshNodeGraphClapHostInstances()",
                "updateNodeGraphClapHostCapabilities(payload.capabilities)",
                "Render Sample CLAP processing available",
                "nodeGraphClapHostConfigSummary()",
                "`/instances/${encodeURIComponent(binding.instanceId)}/safety/reset`",
                "`/instances/${encodeURIComponent(binding.instanceId)}/editor/open`",
                "`/instances/${encodeURIComponent(binding.instanceId)}/editor/close`",
                "`/instances/${encodeURIComponent(binding.instanceId)}/state`",
                "pluginEditorInfo",
                "pluginEditorOpening",
                "pluginLatencyInfo",
                "pluginTailInfo",
                "pluginStatePersistence",
                "audioInputs: payload.instance.audioInputs",
                "audioOutputs: payload.instance.audioOutputs",
                "nodeGraphClapCommitInstanceSummary(payload.instance)",
                "clearParameters: previous.catalogId !== next.catalogId",
                "`/instances/${encodeURIComponent(binding.instanceId)}/params`",
                "{ paramId, value }",
                "deleteNodeGraphClapHostJson(`/instances/${encodeURIComponent(binding.instanceId)}`",
            ],
        ),
        (
            "render bridge",
            clap_contract_sources["render output"],
            [
                "function nodeGraphPlanClapRenderNodes",
                "function nodeGraphClapFeedbackIssues",
                "function assertNodeGraphClapRenderFeedbackSafe",
                "function assertNodeGraphClapRenderInstancesPresent",
                "async function nodeGraphRenderExternalClapOutputs",
                "const nodeOrder = new Map((plan.order || [])",
                "nodeGraphClapHostMaxProcessFrames",
                "Number.isFinite(frames) && frames > 0",
                "feedback involving CLAP Plugin nodes is not supported yet",
                "assertNodeGraphClapRenderFeedbackSafe(plan, clapNodes)",
                "assertNodeGraphClapRenderInstancesPresent(clapNodes)",
                "CLAP host instance is stale",
                "latency: payload.latency",
                "tail: payload.tail",
                "function nodeGraphClapBase64FromF32Channel",
                "function nodeGraphClapF32ChannelFromBase64",
                "function nodeGraphReadRuntimeInputPort",
                "function nodeGraphClapRenderParameterEntries",
                "function nodeGraphRenderClapParameterValues",
                "function nodeGraphClapRenderParameterPayload",
                "function nodeGraphClapReportedLatencyFrames",
                "function nodeGraphClapReportedTailState",
                "const nodeGraphClapMaxRenderTailSeconds = 10",
                "function nodeGraphClapRenderTailFrameLimit",
                "function nodeGraphClapInitialTailState",
                "function nodeGraphClapRenderNodeDependencies",
                "function nodeGraphClapRenderBatchGroups",
                "function nodeGraphPrepareClapRenderProcessPayload",
                "function nodeGraphApplyClapRenderProcessPayload",
                "async function nodeGraphProcessClapRenderBatch",
                "async function nodeGraphBeginClapRenderSessions",
                "async function nodeGraphEndClapRenderSessions",
                "renderSessionId: renderNode.renderSessionId || \"\"",
                "/render/begin",
                "/render/end",
                "clapParamId",
                "nodeGraphPatchNodeClapAudioInputPorts(clapNode)",
                "nodeGraphPatchNodeClapAudioOutputPorts(clapNode)",
                "const renderNodes = clapNodes.map",
                "outputs.set(",
                "for (let start = 0; start < engineFrames; start += chunkFrames)",
                "for (const group of batchGroups)",
                "const chunkFrame = frame - start",
                "const outputFrame = start + frame - latencyFrames",
                "readNodeGraphLiveEffectiveParam",
                "parameters: nodeGraphClapRenderParameterPayload(processParameterEntries)",
                "runtime.externalClapOutputs = outputs",
                "runtime.tailInputFrames = inputEngineFrames",
                "runtime.tailSilencedNodeIds = renderNode.tailSilencedNodeIds",
                "outputs.clapLatencyFrames",
                "outputs.clapTailFrames",
                "outputs.clapRenderedTailFrames",
                "outputs.clapTailInfinite",
                "clapLatencyFrames",
                "clapTailFrames",
                "clapRenderedTailFrames",
                "clapTailInfinite",
                'postNodeGraphClapHostJson(\n      "/process-batch"',
                "nodeGraphClapHostCanProcessBatch",
                "(plan.connections || []).filter((connection)",
                "nodeGraphClapHostState.status !== \"connected\"",
                "nodeGraphClapHostCanProcessAudio",
                "connected CLAP host does not report audio processing support",
                "connected CLAP host does not report offline render session support",
                "postNodeGraphClapHostJson",
                'inputAudioFormat: "planar-f32-base64"',
                "returnAudio: true",
                'returnAudioFormat: "planar-f32-base64"',
                'payload.audioFormat === "planar-f32-base64"',
                "payload.safetyMuted",
                "nodeGraphClapCommitInstanceSummary",
                "CLAP safety muted",
                "runtime.externalClapOutputs = externalClapOutputs",
                "runtime.tailInputFrames = requestedEngineFrames",
                "runtime.tailSilencedNodeIds = new Set(plan.sourceNodes || [])",
                "requestedEngineFrames",
                "requestedFrames",
                "renderClapRenderedTailFrames",
                "CLAP render blocked",
            ],
        ),
        (
            "host summary",
            clap_contract_sources["host"],
            ['"audioInputs": self.audio_ports(True)', '"audioOutputs": self.audio_ports(False)'],
        ),
        (
            "host process audio",
            clap_contract_sources["host"],
            [
                '"audioProcessing": True',
                "CLAP_MAX_PROCESS_FRAMES = 48000",
                "CLAP_MAX_PROCESS_BATCH_ITEMS = 64",
                "CLAP_RENDER_SESSION_IDLE_TIMEOUT_SECONDS = 120.0",
                '"maxProcessFrames": CLAP_MAX_PROCESS_FRAMES',
                '"offlineRenderSessions": True',
                '"renderSessionIdleTimeoutSeconds": CLAP_RENDER_SESSION_IDLE_TIMEOUT_SECONDS',
                '"processBatch": True',
                '"maxProcessBatchItems": CLAP_MAX_PROCESS_BATCH_ITEMS',
                '"pluginEditorInfo": True',
                '"pluginEditorOpening": sys.platform == "win32"',
                '"pluginLatencyInfo": True',
                '"pluginTailInfo": True',
                '"pluginStatePersistence": True',
                "def host_config_payload(server: ThreadingHTTPServer) -> dict[str, Any]",
                "def build_host_config_payload(",
                "def host_diagnostics_payload(",
                "def host_doctor_payload(args: argparse.Namespace) -> dict[str, Any]",
                'mode="doctor"',
                'mode="http"',
                '"status": "pass" if issue_count == 0 else "issues"',
                '"metadataErrorCount": metadata_error_count',
                '"instantiationErrorCount": instantiation_error_count',
                '"missingExplicitPluginCount": explicit_missing_count',
                '"--doctor"',
                "print(json.dumps(host_doctor_payload(args), indent=2))",
                '"hostConfig"',
                '"pythonExecutable": sys.executable',
                '"scanDirs": [str(path) for path in scan_dirs]',
                '"explicitPlugins": [str(path) for path in explicit_plugins]',
                "frames must be in 1..{CLAP_MAX_PROCESS_FRAMES}",
                "def host_capabilities(",
                "\"capabilities\": host_capabilities(",
                'PLANAR_F32_BASE64 = "planar-f32-base64"',
                "CLAP_SAFETY_PEAK_LIMIT = 4.0",
                "plugin.process returned CLAP_PROCESS_ERROR",
                "def decode_planar_f32_base64_channels",
                "def encode_planar_f32_base64_channel",
                "def safety_state(self)",
                "def trip_safety_latch(self, reason: str, raw_peak: float)",
                "def reset_safety_latch(self)",
                "CLAP_EXT_GUI = \"clap.gui\"",
                "class ClapWindow(ctypes.Structure)",
                "class Win32EditorHostWindow",
                "WM_APP_DESTROY_EDITOR",
                "WM_APP_RUN_EDITOR_TASK",
                "def run_pending_tasks(self) -> None",
                "def invoke(self, callback: object, timeout: float = 10.0) -> object",
                "class ClapPluginGui(ctypes.Structure)",
                "def gui_extension(self) -> ClapPluginGui | None",
                "def editor_status(self) -> dict[str, Any]",
                "def open_editor(self) -> dict[str, Any]",
                "def close_editor(self) -> dict[str, Any]",
                "def assert_editor_operation_allowed(self) -> None",
                "plugin editor operations are blocked during an active render session",
                "def _close_editor_locked(self) -> None",
                '"canOpen": can_open',
                "window.invoke(create_gui, timeout=10.0)",
                "created = bool(gui.create(self.plugin_pointer, api_bytes, False))",
                "gui.set_parent(self.plugin_pointer, clap_window_pointer)",
                "gui.show(self.plugin_pointer)",
                "self._close_editor_locked()",
                "CLAP_EXT_LATENCY = \"clap.latency\"",
                "class ClapPluginLatency(ctypes.Structure)",
                "def latency_extension(self) -> ClapPluginLatency | None",
                "def latency_state(self) -> dict[str, Any]",
                "CLAP_EXT_TAIL = \"clap.tail\"",
                "CLAP_TAIL_INFINITE_SAMPLES = 2_147_483_647",
                "class ClapPluginTail(ctypes.Structure)",
                "def tail_extension(self) -> ClapPluginTail | None",
                "def tail_state(self) -> dict[str, Any]",
                "CLAP_EXT_STATE = \"clap.state\"",
                "CLAP_MAX_STATE_BYTES = 4 * 1024 * 1024",
                "class ClapPluginState(ctypes.Structure)",
                "class ClapInputStream(ctypes.Structure)",
                "class ClapOutputStream(ctypes.Structure)",
                "def state_extension(self) -> ClapPluginState | None",
                "def state_status(self) -> dict[str, Any]",
                "def save_state(self) -> dict[str, Any]",
                "def load_state(self, state_base64: str) -> dict[str, Any]",
                "plugin state operations are blocked during an active render session",
                "def begin_offline_render(self, sample_rate: float, max_block_frames: int)",
                "def end_offline_render(self, session_id: str = \"\")",
                "def _stop_offline_render_locked(self)",
                "def touch_offline_render_session(self)",
                "def expire_offline_render_if_idle(self) -> bool",
                "def locked_clap_instance_method(method)",
                "with self.lock:",
                "self.lock = threading.RLock()",
                "RENDER_SESSION_ID_COUNTER = itertools.count(1)",
                "renderSessionId",
                "render_session_id: str = \"\"",
                "instance already has an active render session",
                "render_session_id=str(item.get(\"renderSessionId\")",
                'self.match_instance_route(path, "/render/begin")',
                'self.match_instance_route(path, "/render/end")',
                'if path == "/diagnostics"',
                'self.match_instance_route(path, "/editor")',
                'self.match_instance_route(path, "/editor/open")',
                'self.match_instance_route(path, "/editor/close")',
                'self.match_instance_route(path, "/latency")',
                'self.match_instance_route(path, "/tail")',
                'self.match_instance_route(path, "/state")',
                "@locked_clap_instance_method",
                "def server_clap_instances_lock(server: ThreadingHTTPServer)",
                "server.clap_instances_lock = threading.RLock()",
                "with server_clap_instances_lock(self.server):",
                "class MultiParamInputEvents",
                "def assert_direct_parameter_write_allowed(self, allow_during_render: bool = False)",
                "direct parameter writes are blocked during an active render session",
                "def prepare_parameter_event(self, param_id: int, value: float)",
                "def flush_parameter_events(self, params: ClapPluginParams, parameter_events: list[dict[str, Any]])",
                "MultiParamInputEvents(parameter_events)",
                "def set_parameters(self, parameters: Any, allow_during_render: bool = False)",
                "instance.set_parameters(payload.get(\"parameters\"))",
                "def process_clap_batch(server: ThreadingHTTPServer, payload: dict[str, Any])",
                "items must be an array",
                "process_clap_batch(self.server, payload)",
                'if path == "/process-batch"',
                "parameter_updates: Any = None",
                "parameter_result = self.set_parameters(parameter_updates, allow_during_render=use_render_session)",
                'result["processParameters"] = parameter_result',
                "input_audio: Any = None",
                "input_audio_format: str = PLANAR_F32_JSON",
                "return_audio: bool = False",
                "return_audio_format: str = PLANAR_F32_JSON",
                "inputAudio must be an array of channel arrays",
                "input_audio_format=str(payload.get(\"inputAudioFormat\") or PLANAR_F32_JSON)",
                "return_audio_format=str(payload.get(\"returnAudioFormat\") or PLANAR_F32_JSON)",
                "input_port_channel_counts = [",
                "output_port_channel_counts = [",
                "total_input_channels = sum(input_port_channel_counts)",
                "total_output_channels = sum(output_port_channel_counts)",
                "audio_input_port_count = len(input_port_channel_counts)",
                "audio_output_port_count = len(output_port_channel_counts)",
                "def build_audio_buffers(",
                "int(audio_input_port_count)",
                "int(audio_output_port_count)",
                '"audioInputPortCount": int(audio_input_port_count)',
                '"audioOutputPortCount": int(audio_output_port_count)',
                '"audioReturned": bool(return_audio)',
                '"latency": latency_state',
                '"tail": tail_state',
                '"safety": self.safety_state()',
                '"safetyMuted": bool(self.safety_latched)',
                "if self.safety_latched:",
                "self.trip_safety_latch(safety_reason, raw_peak)",
                'self.match_instance_route(path, "/safety/reset")',
                "instance.reset_safety_latch()",
                'result["audioFormat"] = return_audio_format',
                'result["audio"] = returned_audio',
                "input_audio=payload.get(\"inputAudio\")",
                "parameter_updates=payload.get(\"parameters\") if \"parameters\" in payload else None",
                "return_audio=bool(payload.get(\"returnAudio\"))",
            ],
        ),
        (
            "launcher",
            clap_contract_sources["launcher"],
            [
                '$BindHost = "127.0.0.1"',
                "$Port = 47991",
                "$RepoRoot = Split-Path -Parent (Split-Path -Parent $ScriptDir)",
                "$HostScript = Join-Path $ScriptDir \"webui_clap_host.py\"",
                "Port must be in 1..65535.",
                "Host script not found",
                "$PythonCommand = Get-Command $Python -ErrorAction Stop",
                '"--host", $BindHost',
                '"--port", [string]$Port',
                'if (-not $NoInspectMetadata)',
                '$Arguments += "--inspect-metadata"',
                '$Arguments += @("--plugin", $PluginPath)',
                '$Arguments += @("--scan-dir", $ScanDirPath)',
                '$Arguments += "--test-instantiate"',
                "Push-Location $RepoRoot",
                '& $PythonCommand.Source @Arguments',
                "Pop-Location",
            ],
        ),
        (
            "cmd launcher",
            clap_contract_sources["cmd launcher"],
            [
                "@echo off",
                "powershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0start_webui_clap_host.ps1\" %*",
                "exit /b %ERRORLEVEL%",
            ],
        ),
        (
            "silent execution stubs",
            "\n".join([clap_contract_sources["runtime"], clap_contract_sources["worklet"]]),
            ["clapPlugin: () => ({", "Left: 0", "Right: 0"],
        ),
        (
            "live audio guard",
            clap_contract_sources["live runtime"],
            [
                "function assertNodeGraphLivePlanSupportsClap",
                "nodeGraphLiveClapNodes(plan)",
                "Live Audio does not route CLAP Plugin nodes yet. Use Render Sample for CLAP processing",
                "assertNodeGraphLivePlanSupportsClap(plan)",
            ],
        ),
        (
            "style",
            clap_contract_sources["style"],
            [
                ".node-clap-plugin-body",
                ".node-clap-plugin-select",
                ".node-clap-plugin-actions",
                ".node-clap-plugin-safety",
                ".node-clap-plugin-safety.good",
                ".node-clap-plugin-safety.warn",
                ".node-clap-plugin-param-list",
                ".node-clap-plugin-param-row",
                ".node-clap-plugin-param-value",
            ],
        ),
    ]:
        for snippet in snippets:
            assert snippet in source, f"missing CLAP plugin module {name} contract: {snippet}"

    for name, source, snippets in [
        (
            "definitions",
            codeblock_contract_sources["definitions"],
            ['codeblock: "Codeblock"', "codeblock: {", 'inputs: ["In1"]', 'outputs: ["Out1"]'],
        ),
        (
            "store",
            codeblock_contract_sources["store"],
            ["codeblock: {", 'category: "Controllers"', "Patch-local JavaScript signal processor"],
        ),
        (
            "dynamic ports",
            codeblock_contract_sources["metadata"],
            [
                "const nodeGraphCodeblockDefaultCode = \"Out1 = In1;\"",
                "function normalizeNodeGraphCodeblock",
                "function nodeGraphPatchNodeInputPorts(node)",
                "function nodeGraphPatchNodeOutputPorts(node)",
                "nodeGraphCodeblockReservedNames",
                '"state"',
                '"sampleRate"',
                '"frame"',
                '"frames"',
                '"time"',
                '"dt"',
            ],
        ),
        (
            "patch validation",
            codeblock_contract_sources["patch core"],
            [
                "normalizedNode.codeblock = normalizeNodeGraphCodeblock(node.codeblock)",
                "nodeGraphPatchNodeOutputPorts(nodes.find",
                "nodeGraphPatchNodeInputPorts(nodes.find",
            ],
        ),
        (
            "actions UI",
            codeblock_contract_sources["actions"],
            [
                "function applyNodeGraphCodeblockPortsFromContext",
                "pruneNodeGraphConnectionsForCodeblockPortChange",
                "function setNodeGraphCodeblockSourceFromContext",
                "function nodeGraphCodeblockCompileStatus",
                "const state = __state;",
                "const sampleRate = Number(__ctx.sampleRate) || 44100;",
                "const dt = 1 / sampleRate;",
            ],
        ),
        (
            "menu UI",
            codeblock_contract_sources["menu"],
            [
                "nodeSceneCodeblockControls",
                "nodeSceneCodeblockInputs",
                "nodeSceneCodeblockOutputs",
                "nodeSceneCodeblockSource",
                "nodeSceneCodeblockStatus",
                "nodeSceneCodeblockOpenCodeScreen",
                "Open in Code Screen",
            ],
        ),
        (
            "runtime",
            codeblock_contract_sources["runtime"],
            [
                "function nodeGraphEvaluateCodeblock",
                "nodeGraphCompileCodeblockFunction",
                "state: Object.create(null)",
                "fn(inputs, output, state, {",
                "time: (Number(frame) || 0) / (Number(sampleRate) || 44100)",
                "nodeGraphLiveModuleEvaluators.codeblock = (",
            ],
        ),
        (
            "worklet",
            codeblock_contract_sources["worklet"],
            [
                "evaluateCodeblock(node, mixInput, frame = 0, frames = 1",
                "compileCodeblockFunction(node)",
                "state: Object.create(null)",
                "fn(inputs, output, state, {",
                "time: (Number(inputFrame) || 0) / (Number(sampleRate) || 44100)",
                "codeblock: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput, inputFrame) => this.evaluateCodeblock(node, mixInput, frame, frames, safeRate, inputFrame),",
            ],
        ),
    ]:
        for snippet in snippets:
            assert snippet in source, f"missing codeblock {name} contract: {snippet}"

    for name, source, snippets in [
        (
            "shell",
            codeblock_contract_sources["menu"],
            [
                "nodeCodeScreenViewButton",
                "nodeCodeScreenView",
                "nodeCodeScreenLookupHelpers",
                "nodeCodeScreenLookupResults",
                "nodeCodeScreenLookupSearch",
                "nodeCodeScreenLookupNamespaces",
                "nodeCodeScreenLookupSnippets",
                "nodeCodeScreenLookupSummary",
                "nodeCodeScreenLookupTarget",
                "nodeCodeScreenLookupStatus",
                "nodeCodeScreenSaveLookupSelection",
                "nodeCodeScreenSavePinLookupSelection",
                "nodeCodeScreenClearLookupSearch",
                "Find what to type and save repeatable code.",
                "Helper Lookup",
                "Snippet Shelf",
                "Ctrl+K",
                "Shift+Enter",
                "use top",
                "open details",
                "nodeCodeScreenSections",
                "nodeCodeScreenBody",
                "node-graph-code-screen-model.js",
                "node-graph-code-screen.js",
            ],
        ),
        (
            "model",
            codeblock_contract_sources["code screen model"],
            [
                "function normalizeNodeGraphCodeScreen(value = {})",
                "category: normalizeNodeGraphCodeScreenText",
                "helpers: normalizeNodeGraphCodeScreenRegistry",
                "samples: normalizeNodeGraphCodeScreenRegistry",
                "patchTools: normalizeNodeGraphCodeScreenRegistry",
                "tagsLength: 160",
                "tags: normalizeNodeGraphCodeScreenText",
                "languageLength: 32",
                "function normalizeNodeGraphCodeScreenLanguage",
                "language: normalizeNodeGraphCodeScreenLanguage",
                "scriptLanguage: normalizeNodeGraphCodeScreenLanguage",
                "updatedAt",
                "script: String(source.script ?? \"\")",
            ],
        ),
        (
            "patch persistence",
            "\n".join([
                codeblock_contract_sources["patch core"],
                codeblock_contract_sources["clone"],
            ]),
            [
                "codeScreen: normalizeNodeGraphCodeScreen(patch.codeScreen)",
            ],
        ),
        (
            "controller",
            codeblock_contract_sources["code screen"],
            [
                "const nodeGraphCodeScreenHelperRegistry",
                "const nodeGraphCodeScreenRegistryTemplates",
                "game.signs.mageTeleport.trigger",
                "visual ui",
                "canvas shader",
                "canvas.parse(source)",
                "canvas.layers(source)",
                "canvas.module(id, source)",
                "canvas.markdown(source)",
                "ui.set(target, value)",
                "ui.show(target)",
                "signal math",
                "audio.noteToMidi(note)",
                "audio.noteToHz(note, tuning)",
                "audio.clamp(value, min, max)",
                "audio.dbToGain(db)",
                "audio.gainToDb(gain)",
                "audio.midiToHz(note, tuning)",
                "audio.hzToMidi(hz, tuning)",
                "graph utility",
                "patch.makeLead({ note, tone })",
                "patch.makeEnvelope({ attack, decay, sustain, release })",
                "recipe.list()",
                "recipe.run(name, options)",
                "recipe.markdown()",
                "patch.findNodes(query)",
                "patch.countByType()",
                "patch.connections()",
                "sample metadata",
                "sample.add(metadata)",
                "sample.reserve(id, path, description)",
                "sample.load(id)",
                "sample.list(query)",
                "sample.find(query)",
                "sample.markdown(query)",
                "sample.play(id, options)",
                "slot.use(workflow, area, slot, circuitPlan)",
                "slot.useDefault(workflow, area, slot)",
                "slot.find(workflow, area, slot)",
                "slot.all(workflow)",
                "slot.markdown(workflow)",
                "exportSample.area(area)",
                "exportSample.useCircuit(area, slot, circuitPlan)",
                "exportSample.slots()",
                "exportSample.savedSlots()",
                "exportSample.allSlots()",
                "exportSample.findSlot(area, slot)",
                "exportSample.markdown()",
                "exportSample.useDefault(area, slot)",
                "file.fromTagScript(path, tagScript)",
                "file.list(paths, tagScript)",
                "file.markdown(paths, tagScript)",
                "items.fromFiles(paths, tagScript)",
                "items.summary(items)",
                "items.filter(items, query)",
                "items.countByTag(items, tag)",
                "regex.test(text, pattern, flags)",
                "regex.match(text, pattern, flags)",
                "regex.groups(text, pattern, flags)",
                "regex.replace(text, pattern, replacement, flags)",
                "assert.that(name, condition, detail)",
                "assert.equal(name, actual, expected)",
                "assert.notEmpty(name, value)",
                "debug.table(name, values)",
                "watch.value(name, value)",
                "watch.table(name, rows)",
                "watch.snapshot(name, value)",
                "watch.diff(name, before, after)",
                "watch.vars(values, prefix)",
                "watch.list(query)",
                "watch.find(query)",
                "watch.summary()",
                "watch.markdown(query)",
                "report.summary()",
                "report.markdown(title)",
                "report.tests()",
                "report.console()",
                "help.search(query)",
                "help.namespace(name)",
                "help.namespaces()",
                "help.snippets(query)",
                "help.reference(namespace)",
                "help.markdown(query)",
                "schema.defaults(kind)",
                "schema.preview(kind, metadata)",
                "schema.validate(kind, metadata)",
                "circuitSlot",
                "slots: \"slot\"",
                "code.language(value)",
                "code.fence(source, language)",
                "code.highlight(source, language)",
                "code.stats(source)",
                "code.excerpt(source, maxLength)",
                "block.all()",
                "block.summary()",
                "block.find(query)",
                "block.template(options)",
                "block.compile(codeblock)",
                "block.inspect(target)",
                "block.markdown(query)",
                "plan.summary(plan)",
                "plan.steps(plan)",
                "plan.validate(plan)",
                "plan.markdown(plan)",
                "library.summary()",
                "library.items(kind)",
                "library.markdown()",
                "patchTools.add(metadata)",
                "patchTools.list(query)",
                "patchTools.find(query)",
                "patchTools.markdown(query)",
                "script command",
                "command.save(metadata)",
                "command.run(name, fn)",
                "command.batch(items)",
                "command.summary()",
                "command.markdown()",
                "script trigger",
                "game sign",
                "Teleport Sample",
                "Snippet Library",
                "Workspace Script",
                "Ctrl+S",
                "Ctrl+Enter",
                "Ctrl+Shift+Enter",
                "save <kbd>Ctrl+Enter</kbd> run",
                "applies all",
                "saves metadata",
                "nodeCodeScreenWorkspaceScriptSource",
                "nodeCodeScreenWorkspaceScriptLanguage",
                "nodeCodeScreenWorkspaceScriptFence",
                "nodeCodeScreenWorkspaceScriptStats",
                "nodeCodeScreenWorkspaceScriptDraftState",
                "nodeCodeScreenCopyWorkspaceDebugReport",
                "nodeCodeScreenCodeblockSummary",
                "nodeCodeScreenApplyWorkspaceScript",
                "nodeCodeScreenRunWorkspaceScript",
                "nodeCodeScreenRunSelectedWorkspaceScript",
                "nodeCodeScreenResetWorkspaceScript",
                "nodeCodeScreenApplyAll",
                "nodeCodeScreenResetCodeblockDraft",
                "nodeCodeScreenInsertTeleportScript",
                "nodeCodeScreenSaveWorkspaceSnippet",
                "nodeCodeScreenSaveWorkspacePinnedSnippet",
                "nodeCodeScreenInsertLibraryDemoScript",
                "nodeCodeScreenSaveCodeblockSnippet",
                "nodeCodeScreenSaveCodeblockPinnedSnippet",
                "nodeCodeScreenSaveHelperSnippet",
                "nodeCodeScreenSaveHelperPinnedSnippet",
                "Save Code as Snippet",
                "Save as Snippet",
                "Save + Pin",
                "Run Script",
                "Run Selection",
                "Copy Script Markdown",
                "Copy Debug Report",
                "Library Demo Script",
                "nodeCodeScreenNewCodeblock",
                "New Debug Codeblock",
                "Create Debug Codeblock",
                "nodeCodeScreenHelperSearch",
                "nodeCodeScreenClearHelperSearch",
                "codeScreenWorkspaceScriptStatus",
                "nodeCodeScreenLookupTargetSummary",
                "inserts into Workspace Script",
                "find what to type, save what repeats",
                "codeScreenCodeblockSearch",
                "codeScreenHelperDetailKey",
                "codeScreenHelperNamespaceFilter",
                "codeScreenRegistryStatus",
                "codeScreenSnippetSearch",
                "codeScreenSnippetSort",
                "codeScreenSnippetTarget",
                "codeScreenHelperSearch",
                "codeScreenLookupSearch",
                "codeScreenLookupStatus",
                "codeScreenRecentHelperKeys",
                "codeScreenWorkspaceBuildSummary",
                "codeScreenWorkspaceConsole",
                "codeScreenWorkspaceRunHistory",
                "codeScreenWorkspaceWatches",
                "Code Snippet",
                "namespace: \"snippet\"",
                "language: \"javascript\"",
                "tags: \"ui reusable\"",
                "function nodeGraphCodeScreenMarkdownLanguage",
                "function nodeGraphCodeScreenMarkdownFence",
                "function nodeGraphCodeScreenBuildSummaryMarkdownFor",
                "function nodeGraphCodeScreenBuildSummaryMarkdown",
                "function nodeGraphCodeScreenWorkspaceDebugReportMarkdown",
                "function nodeGraphCodeScreenWorkspaceScriptLanguage",
                "function copyNodeGraphCodeScreenWorkspaceScriptMarkdown",
                "function copyNodeGraphCodeScreenWorkspaceDebugReport",
                "function selectNodeGraphCodeScreenCopyFallback",
                "nodeCodeScreenCopyFallback",
                "Copy Markdown",
                "function renderNodeGraphCodeScreenWorkspaceScript",
                "function nodeGraphCodeScreenFilteredCodeblockNodes",
                "function nodeGraphCodeScreenCodeblockSearchText",
                "function nodeGraphCodeScreenCodeblockListSummary",
                "function nodeGraphCodeScreenCodeblockDraftSummary",
                "function nodeGraphCodeScreenCodeblockDraftFromInputs",
                "function nodeGraphCodeScreenCodeblockDraftChanges",
                "function nodeGraphCodeScreenCodeblockDebugRows",
                "function renderNodeGraphCodeScreenCodeblockDebugValues",
                "function updateNodeGraphCodeScreenCodeblockDraftState",
                "nodeCodeScreenCodeblockDraftState",
                "nodeCodeScreenCodeblockDebugValues",
                "Debug Values",
                "Selected Codeblock",
                "draft has unapplied changes",
                "saved draft matches module",
                "unapplied ${changes.join(\" + \")}",
                "function updateNodeGraphCodeScreenCodeblockSummary",
                "function renderNodeGraphCodeScreenSnippets",
                "function renderNodeGraphCodeScreenSnippetTagRail",
                "function nodeGraphCodeScreenSnippetBrowseChips",
                "function nodeGraphCodeScreenTagList",
                "function nodeGraphCodeScreenHasTag",
                "function nodeGraphCodeScreenToggleTag",
                "function renderNodeGraphCodeScreenSnippetTargetControls",
                "function setNodeGraphCodeScreenSnippetTarget",
                "function setNodeGraphCodeScreenSnippetTagFilter",
                "function nodeGraphCodeScreenSnippetItems",
                "function nodeGraphCodeScreenFilteredSnippetItems",
                "function nodeGraphCodeScreenNowIso",
                "function nodeGraphCodeScreenFreshHelper",
                "function nodeGraphCodeScreenUpdatedAtText",
                "function nodeGraphCodeScreenSnippetSortMode",
                "function nodeGraphCodeScreenCompareSnippetItems",
                "function nodeGraphCodeScreenSortedSnippetItems",
                "function renderNodeGraphCodeScreenSnippetSortControls",
                "function setNodeGraphCodeScreenSnippetSort",
                "helper.category",
                "helper.updatedAt",
                "data-code-screen-snippet-target",
                "data-code-screen-snippet-tag",
                "data-code-screen-snippet-sort",
                "codeScreenSnippetChipType",
                "category: ${chip.label}",
                "node-code-screen-snippet-card-tags",
                "data-code-screen-add-snippet",
                "data-code-screen-duplicate-snippet",
                "data-code-screen-use-return-snippet",
                "Pin to Shelf",
                "data-code-screen-duplicate-registry",
                "data-code-screen-json-preview",
                "Duplicate",
                "Up",
                "Down",
                "function applyNodeGraphCodeScreenWorkspaceScript",
                "function nodeGraphCodeScreenWorkspaceScriptBuilders",
                "normalizeNodeGraphCodeScreenSlot",
                "function nodeGraphCodeScreenWorkspaceAudioApi",
                "function nodeGraphCodeScreenWorkspaceCanvasApi",
                "function nodeGraphCodeScreenWorkspacePatchApi",
                "function nodeGraphCodeScreenWorkspaceModuleApi",
                "function nodeGraphCodeScreenWorkspaceCircuitApi",
                "function nodeGraphCodeScreenWorkspaceVisualApi",
                "function nodeGraphCodeScreenWorkspaceTagsApi",
                "function nodeGraphCodeScreenWorkspaceRegexApi",
                "function nodeGraphCodeScreenWorkspaceFileApi",
                "function nodeGraphCodeScreenWorkspaceItemsApi",
                "function nodeGraphCodeScreenWorkspaceLeadRecipe",
                "function nodeGraphCodeScreenWorkspaceEnvelopeRecipe",
                "function nodeGraphCodeScreenWorkspaceEventApi",
                "function nodeGraphCodeScreenWorkspaceGameApi",
                "function nodeGraphCodeScreenPatchNodeSummary",
                "function nodeGraphCodeScreenPatchConnectionSummary",
                "function nodeGraphCodeScreenPatchQueryMatch",
                "function nodeGraphCodeScreenMergeWorkspaceScriptResult",
                "function nodeGraphCodeScreenApplyWorkspaceScriptBuild",
                "function runNodeGraphCodeScreenWorkspaceScriptCode",
                "function runNodeGraphCodeScreenWorkspaceScript",
                "function runNodeGraphCodeScreenSelectedWorkspaceScript",
                "event.key === \"Enter\"",
                "function nodeGraphCodeScreenLibraryDemoScript",
                "function insertNodeGraphCodeScreenLibraryDemoScript",
                "demo script ready",
                "vision-run-demo",
                "vision-run-helper",
                "${statusPrefix}: ${total} staged, ${applied} applied",
                "library.helper(metadata)",
                "snippets.add(metadata)",
                "snippets.list(query)",
                "snippets.find(query)",
                "snippets.markdown(query)",
                "command.save({",
                "command.run(\\\"patch types\\\", () => patch.countByType())",
                "ui.add(metadata)",
                "ui.list(query)",
                "ui.find(query)",
                "ui.markdown(query)",
                "set(target, value)",
                "show(target)",
                "ui.set(\\\"demo.panel.enabled\\\", true)",
                "ui.show(\\\"demo.panel\\\")",
                "sample.reserve(\\\"teleport\\\", \\\"samples/teleport.wav\\\"",
                "const canvasModel = canvas.parse(canvasSource)",
                "const canvasModule = canvas.module(\\\"scene canvas\\\", canvasSource)",
                "watch.table(\\\"canvas layers\\\", canvasLayers)",
                "console.test(\\\"canvas module has RGBA output\\\", canvasModule.outputs.includes(\\\"RGBA\\\"))",
                "patchTools.add({",
                "const patchToolRows = patchTools.list(\\\"output\\\")",
                "const outputPatchTool = patchTools.find(\\\"Find Output\\\")",
                "const patchToolMarkdown = patchTools.markdown(\\\"output\\\")",
                "console.test(\\\"patch tools list found output tool\\\", patchToolRows.length >= 1)",
                "console.test(\\\"patch tools find found target\\\", outputPatchTool && outputPatchTool.target.includes(\\\"patch.findNodes\\\"))",
                "console.test(\\\"patch tools markdown names output tool\\\", patchToolMarkdown.includes(\\\"Find Output Modules\\\"))",
                "watch.table(\\\"patch tool rows\\\", patchToolRows)",
                "watch.value(\\\"patch tools markdown\\\", { excerpt: code.excerpt(patchToolMarkdown, 220), stats: code.stats(patchToolMarkdown) })",
                "const leadPlan = patch.makeLead({ note: \\\"C3\\\", tone: \\\"bright\\\" })",
                "const availableRecipes = recipe.list()",
                "const recipeDocs = recipe.markdown()",
                "const envelopePlan = recipe.run(\\\"envelope\\\", { attack: 0.02, decay: 0.12, sustain: 0.7, release: 0.35 })",
                "patch.connect(\\\"lead-amp.Out\\\", \\\"lead scope\\\")",
                "const leadPlanSummary = plan.summary(leadPlan)",
                "const leadPlanValidation = plan.validate(leadPlan)",
                "const leadPlanSteps = plan.steps(leadPlan)",
                "const leadPlanMarkdown = plan.markdown(leadPlan)",
                "const envelopePlanSummary = plan.summary(envelopePlan)",
                "const envelopePlanValidation = plan.validate(envelopePlan)",
                "const teleportExport = exportSample.area(\\\"teleport sample area\\\")",
                "const envelopeSlot = teleportExport.use(\\\"envelope\\\", envelopePlan)",
                "const tailSlot = teleportExport.use(\\\"tail\\\", leadPlan)",
                "const defaultTailSlot = teleportExport.useDefault(\\\"tail\\\")",
                "const visualSlot = slot.use(\\\"exportSample\\\", \\\"teleport sample area\\\", \\\"visual\\\", leadPlan)",
                "const foundEnvelopeSlot = teleportExport.find(\\\"envelope\\\")",
                "const foundVisualSlot = slot.find(\\\"exportSample\\\", \\\"teleport sample area\\\", \\\"visual\\\")",
                "const teleportExportMarkdown = teleportExport.markdown()",
                "const envelopeSlotSchema = schema.validate(\\\"slot\\\", envelopeSlot)",
                "const exportSlotMarkdown = exportSample.markdown()",
                "tags.parse(\\\"patch,circuit,note=C3,tone=bright\\\")",
                "file.parts(\\\"samples/teleport`note=C3`type=fx.wav\\\")",
                "const demoFilePaths = [",
                "samples/lead`note=C3`vel=hard.wav",
                "const demoFileTagScript = \\\"library=sandbox,stem={stem},ext={ext}\\\"",
                "library=sandbox,stem={stem},ext={ext}",
                "const demoFileList = file.list(demoFilePaths, demoFileTagScript)",
                "const demoFileMarkdown = file.markdown(demoFilePaths, demoFileTagScript)",
                "const noteMatch = regex.match(teleportFile.name, \\\"note=([A-G][#b]?\\\\\\\\d+)\\\")",
                "const itemSummary = items.summary(demoFileList)",
                "const leadItems = items.filter(demoFileList, { note: \\\"C3\\\" })",
                "const velocityCounts = items.countByTag(demoFileList, \\\"vel\\\")",
                "const leadSnapshot = watch.snapshot(\\\"lead item snapshot\\\", leadItems[0])",
                "const itemSummaryDelta = watch.diff(\\\"item summary delta\\\", { total: 0 }, { total: itemSummary.total })",
                "watch.value(\\\"watched velocity counts\\\", velocityCounts)",
                "watch.table(\\\"tagscript file rows\\\", demoFileList)",
                "watch.value(\\\"tagscript file list\\\", demoFileMarkdown)",
                "const demoVars = watch.vars({ leadPlanSummary, itemSummary, velocityCounts }, \\\"demo\\\")",
                "const recipeListAssertion = assert.notEmpty(\\\"recipe list is available\\\", availableRecipes)",
                "const envelopeSlotAssertion = assert.equal(\\\"envelope slot label\\\", envelopeSlot.slot, \\\"envelope\\\")",
                "const visualSlotAssertion = assert.that(\\\"visual slot has circuit\\\", Boolean(visualSlot.circuit), visualSlot)",
                "const slotDebugTable = debug.table(\\\"slot debug table\\\", { envelopeSlot, visualSlot, recipeCount: availableRecipes.length })",
                "console.test(\\\"lead plan has modules\\\", leadPlan.circuit.modules.length >= 4)",
                "console.test(\\\"recipe list includes envelope\\\", availableRecipes.some((item) => item.name === \\\"envelope\\\"))",
                "console.test(\\\"recipe markdown names envelope\\\", recipeDocs.includes(\\\"## envelope\\\"))",
                "console.test(\\\"envelope plan has endpoints\\\", envelopePlan.circuit.modules.some((item) => item.type === \\\"groupInput\\\") && envelopePlan.circuit.modules.some((item) => item.type === \\\"groupOutput\\\"))",
                "console.test(\\\"plan validation ok\\\", leadPlanValidation.ok)",
                "console.test(\\\"envelope plan validation ok\\\", envelopePlanValidation.ok)",
                "console.test(\\\"plan markdown names lead\\\", leadPlanMarkdown.includes(\\\"C3 bright lead\\\"))",
                "console.test(\\\"export sample slot assigned\\\", envelopeSlot.workflow === \\\"exportSample\\\" && envelopeSlot.slot === \\\"envelope\\\")",
                "console.test(\\\"export sample slot found\\\", foundEnvelopeSlot && foundEnvelopeSlot.id === envelopeSlot.id)",
                "console.test(\\\"export sample default restored\\\", defaultTailSlot.slot === \\\"tail\\\" && !exportSample.findSlot(\\\"teleport sample area\\\", \\\"tail\\\"))",
                "console.test(\\\"export sample area helper rendered markdown\\\", teleportExportMarkdown.includes(\\\"Export Sample Area: teleport sample area\\\"))",
                "console.test(\\\"generic slot authoring found visual slot\\\", foundVisualSlot && visualSlot.id === foundVisualSlot.id)",
                "console.test(\\\"export sample slot schema valid\\\", envelopeSlotSchema.ok)",
                "console.test(\\\"export sample slot markdown names envelope\\\", exportSlotMarkdown.includes(\\\"teleport sample area / envelope\\\"))",
                "console.test(\\\"file list parsed\\\", demoFileList.length === 3)",
                "console.test(\\\"file markdown displays tagscript list\\\", demoFileMarkdown.includes(\\\"tag:library\\\") && demoFileMarkdown.includes(\\\"samples/lead\\\"))",
                "console.test(\\\"first file note tag\\\", demoFileList[0].tags.note === \\\"C3\\\")",
                "console.test(\\\"items summary counted\\\", itemSummary.total === 3)",
                "console.test(\\\"items filter found lead note\\\", leadItems.length === 1)",
                "console.test(\\\"watch snapshot copied\\\", leadSnapshot.tags.note === \\\"C3\\\")",
                "console.test(\\\"watch diff changed\\\", itemSummaryDelta.changed === true)",
                "console.test(\\\"watch vars returned named values\\\", demoVars.itemSummary.total === 3 && demoVars.velocityCounts.hard === 1)",
                "console.test(\\\"assert helpers pass\\\", recipeListAssertion.ok && envelopeSlotAssertion.ok && visualSlotAssertion.ok)",
                "console.test(\\\"debug table has slot rows\\\", slotDebugTable.rows.length === 3 && slotDebugTable.rows.some((row) => row.key === \\\"visualSlot\\\"))",
                "console.test(\\\"regex note parsed\\\", noteMatch.captures[0] === \\\"C3\\\")",
                "const demoReport = report.markdown(\\\"Library Demo Report\\\")",
                "console.test(\\\"report markdown has watches\\\", demoReport.includes(\\\"## Variable Watch\\\"))",
                "const reportSummary = report.summary()",
                "console.test(\\\"report summary counted watches\\\", reportSummary.watches >= 4)",
                "const watchSummary = watch.summary()",
                "const watchMarkdown = watch.markdown()",
                "const demoWatchRows = watch.list(\\\"demo\\\")",
                "const foundVelocityWatch = watch.find(\\\"velocity\\\")",
                "const demoWatchMarkdown = watch.markdown(\\\"demo\\\")",
                "console.test(\\\"watch summary counted values\\\", watchSummary.total >= 4)",
                "console.test(\\\"watch markdown names variable scope\\\", watchMarkdown.includes(\\\"demo variables\\\") || watchMarkdown.includes(\\\"Variable Scope\\\"))",
                "console.test(\\\"watch list filters demo values\\\", demoWatchRows.length >= 3 && demoWatchRows.some((row) => row.name === \\\"demo variables\\\"))",
                "console.test(\\\"watch find locates velocity\\\", foundVelocityWatch && foundVelocityWatch.name.includes(\\\"velocity\\\"))",
                "console.test(\\\"watch markdown filters demo\\\", demoWatchMarkdown.includes(\\\"demo variables\\\") && !demoWatchMarkdown.includes(\\\"lead item snapshot\\\"))",
                "watch.value(\\\"script report summary\\\", reportSummary)",
                "watch.value(\\\"watch summary\\\", watchSummary)",
                "watch.value(\\\"watch markdown\\\", { excerpt: code.excerpt(watchMarkdown, 260), stats: code.stats(watchMarkdown) })",
                "watch.table(\\\"demo watch rows\\\", demoWatchRows)",
                "watch.value(\\\"found velocity watch\\\", foundVelocityWatch)",
                "watch.value(\\\"demo watch markdown\\\", { excerpt: code.excerpt(demoWatchMarkdown, 260), stats: code.stats(demoWatchMarkdown) })",
                "watch.value(\\\"demo report markdown\\\", { title: \\\"Library Demo Report\\\", hasVariableWatch: demoReport.includes(\\\"## Variable Watch\\\"), preview: demoReport.slice(0, 360) })",
                "const patchHelpers = help.search(\\\"patch\\\")",
                "const uiHelpers = help.namespace(\\\"ui\\\")",
                "const helperNamespaces = help.namespaces()",
                "const demoSnippets = help.snippets(\\\"demo\\\")",
                "const uiHelperReference = help.reference(\\\"ui\\\")",
                "const patchHelperMarkdown = help.markdown(\\\"patch\\\")",
                "const scriptSnippetList = snippets.list(\\\"demo\\\")",
                "const scriptCommandSnippet = snippets.find(\\\"Command Demo\\\")",
                "const scriptSnippetMarkdown = snippets.markdown(\\\"demo\\\")",
                "const librarySummary = library.summary()",
                "const librarySnippetItems = library.items(\\\"snippets\\\")",
                "const libraryMarkdown = library.markdown()",
                "const uiMetadataRows = ui.list(\\\"demo.panel\\\")",
                "const uiPanelSetting = ui.find(\\\"demo.panel.enabled\\\")",
                "const uiMetadataMarkdown = ui.markdown(\\\"demo\\\")",
                "const sampleMetadataRows = sample.list(\\\"teleport\\\")",
                "const teleportSampleMetadata = sample.find(\\\"teleport\\\")",
                "const sampleMetadataMarkdown = sample.markdown(\\\"teleport\\\")",
                "console.test(\\\"help found staged patch helper\\\", patchHelpers.some((helper) => helper.signature === \\\"patch.makeLead({ note, tone })\\\"))",
                "console.test(\\\"help found envelope recipe\\\", patchHelpers.some((helper) => helper.signature === \\\"patch.makeEnvelope({ attack, decay, sustain, release })\\\"))",
                "console.test(\\\"help namespace found ui\\\", uiHelpers.some((helper) => helper.signature === \\\"ui.set(target, value)\\\"))",
                "console.test(\\\"help reference names ui set\\\", uiHelperReference.includes(\\\"ui.set(target, value)\\\"))",
                "console.test(\\\"help markdown names patch lead\\\", patchHelperMarkdown.includes(\\\"patch.makeLead({ note, tone })\\\"))",
                "console.test(\\\"snippets list found staged snippets\\\", scriptSnippetList.length >= 2)",
                "console.test(\\\"snippets find found command snippet\\\", scriptCommandSnippet && scriptCommandSnippet.name === \\\"Vision Command Demo\\\")",
                "console.test(\\\"snippets markdown names command\\\", scriptSnippetMarkdown.includes(\\\"Vision Command Demo\\\"))",
                "console.test(\\\"library summary counted staged snippets\\\", librarySummary.staged.snippets >= 2)",
                "console.test(\\\"library items listed snippets\\\", librarySnippetItems.some((item) => item.label.includes(\\\"vision-command-demo\\\")))",
                "console.test(\\\"library markdown names samples\\\", libraryMarkdown.includes(\\\"## samples\\\"))",
                "console.test(\\\"ui metadata list found demo settings\\\", uiMetadataRows.length >= 2)",
                "console.test(\\\"ui metadata find found enabled setting\\\", uiPanelSetting && uiPanelSetting.target === \\\"demo.panel.enabled\\\")",
                "console.test(\\\"sample metadata find found teleport\\\", teleportSampleMetadata && teleportSampleMetadata.id === \\\"teleport\\\")",
                "console.test(\\\"sample metadata markdown names teleport\\\", sampleMetadataMarkdown.includes(\\\"teleport\\\"))",
                "watch.table(\\\"patch helper search\\\", patchHelpers)",
                "watch.value(\\\"helper namespaces\\\", helperNamespaces)",
                "watch.value(\\\"ui helper reference\\\", { excerpt: code.excerpt(uiHelperReference, 240), stats: code.stats(uiHelperReference) })",
                "watch.value(\\\"patch helper markdown\\\", { excerpt: code.excerpt(patchHelperMarkdown, 240), stats: code.stats(patchHelperMarkdown) })",
                "watch.table(\\\"demo snippets\\\", demoSnippets)",
                "watch.table(\\\"script snippet list\\\", scriptSnippetList)",
                "watch.value(\\\"script snippet markdown\\\", { excerpt: code.excerpt(scriptSnippetMarkdown, 240), stats: code.stats(scriptSnippetMarkdown) })",
                "debug.table(\\\"library summary table\\\", librarySummary.totals)",
                "watch.table(\\\"library snippet items\\\", librarySnippetItems)",
                "watch.value(\\\"library markdown\\\", { excerpt: code.excerpt(libraryMarkdown, 260), stats: code.stats(libraryMarkdown) })",
                "watch.table(\\\"ui metadata rows\\\", uiMetadataRows)",
                "watch.value(\\\"ui metadata markdown\\\", { excerpt: code.excerpt(uiMetadataMarkdown, 220), stats: code.stats(uiMetadataMarkdown) })",
                "watch.table(\\\"sample metadata rows\\\", sampleMetadataRows)",
                "watch.value(\\\"sample metadata markdown\\\", { excerpt: code.excerpt(sampleMetadataMarkdown, 220), stats: code.stats(sampleMetadataMarkdown) })",
                "const sampleSchema = schema.validate(\\\"sample\\\", sample.load(\\\"teleport\\\"))",
                "const uiSchema = schema.validate(\\\"ui\\\", { id: \\\"demo-panel\\\", target: \\\"demo.panel\\\", value: \\\"true\\\" })",
                "const helperSchema = schema.preview(\\\"helper\\\", schema.defaults(\\\"helper\\\").metadata)",
                "console.test(\\\"schema validates sample\\\", sampleSchema.ok)",
                "console.test(\\\"schema previews helper\\\", helperSchema.normalized.namespace === \\\"patch\\\")",
                "watch.value(\\\"sample schema\\\", sampleSchema)",
                "watch.value(\\\"ui schema\\\", uiSchema)",
                "watch.value(\\\"helper schema preview\\\", helperSchema)",
                "const codeMarkdown = code.fence(\\\"ui.set(\\\\\\\"demo.panel\\\\\\\", true)\\\", \\\"JS\\\")",
                "const codeHighlight = code.highlight(\\\"ui.set(\\\\\\\"demo.panel\\\\\\\", true)\\\", \\\"JS\\\")",
                "const codeStats = code.stats(codeMarkdown)",
                "console.test(\\\"code fence uses javascript\\\", codeMarkdown.startsWith(\\\"```javascript\\\"))",
                "console.test(\\\"code highlight normalizes language\\\", codeHighlight.language === \\\"javascript\\\" && codeHighlight.markdown.startsWith(\\\"```javascript\\\"))",
                "console.test(\\\"code stats counted lines\\\", codeStats.lines >= 3)",
                "watch.value(\\\"code markdown preview\\\", { language: code.language(\\\"JS\\\"), excerpt: code.excerpt(codeMarkdown, 160), stats: codeStats })",
                "watch.value(\\\"code highlight preview\\\", { language: codeHighlight.language, excerpt: code.excerpt(codeHighlight.markdown, 160), stats: codeHighlight.stats })",
                "const blockSummary = block.summary()",
                "const blockTemplate = block.template({ id: \\\"gate-pass\\\", inputs: [\\\"Gate\\\"], outputs: [\\\"Out\\\"], code: \\\"Out = Gate;\\\" })",
                "const blockCompile = block.compile(blockTemplate.codeblock)",
                "const blockInspect = block.inspect(blockTemplate)",
                "const blockFindResults = block.find(\\\"Gate\\\")",
                "const blockTemplateMarkdown = block.markdown(blockTemplate)",
                "const blockMarkdown = block.markdown()",
                "console.test(\\\"block summary is readable\\\", blockSummary.total >= 0)",
                "console.test(\\\"block template compiles\\\", blockCompile.ok)",
                "console.test(\\\"block inspect reports ports\\\", blockInspect.ports === 2 && blockInspect.compile === \\\"ok\\\")",
                "console.test(\\\"block find returns current patch matches\\\", Array.isArray(blockFindResults))",
                "console.test(\\\"block template markdown names gate pass\\\", blockTemplateMarkdown.includes(\\\"gate-pass\\\") && blockTemplateMarkdown.includes(\\\"Out = Gate\\\"))",
                "console.test(\\\"block markdown reports empty patch\\\", blockMarkdown.includes(\\\"No Codeblock debug modules found\\\"))",
                "watch.value(\\\"codeblock summary\\\", blockSummary)",
                "watch.value(\\\"codeblock template\\\", blockTemplate)",
                "watch.table(\\\"codeblock inspect\\\", [blockInspect])",
                "watch.table(\\\"codeblock find\\\", blockFindResults)",
                "watch.value(\\\"codeblock template markdown\\\", blockTemplateMarkdown)",
                "watch.value(\\\"codeblock markdown\\\", blockMarkdown)",
                "watch.table(\\\"codeblocks in patch\\\", block.all())",
                "event.bind(\\\"C4\\\", \\\"game.signs.mageTeleport.trigger\\\")",
                "game.signs.mageTeleport.trigger({ midi: 60, velocity: 1 })",
                "const commandBatchResults = command.batch([",
                "const commandSummary = command.summary()",
                "const commandReport = command.markdown()",
                "console.test(\\\"command summary counted runs\\\", commandSummary.total >= 3 && commandSummary.failed === 0)",
                "console.test(\\\"command markdown names command\\\", commandReport.includes(\\\"patch types\\\"))",
                "watch.value(\\\"command summary\\\", commandSummary)",
                "watch.value(\\\"command report markdown\\\", commandReport)",
                "watch.table(\\\"command batch results\\\", commandBatchResults)",
                "debug.inspect(\\\"command runs\\\", command.runs())",
                "console.log(...values)",
                "console.test(name, condition)",
                "console.clear()",
                "console.warn(...values)",
                "console.table(value)",
                "console.table(library.staged)",
                "debug.inspect(name, value)",
                "debug.inspect(\\\"audio math\\\", { c4: audio.midiToHz(60), minus6: audio.dbToGain(-6) })",
                "debug.inspect(\\\"patch summary\\\", patch.summary())",
                "debug.inspect(\\\"event bindings\\\", event.bindings())",
                "debug.inspect(\\\"event triggers\\\", event.triggers())",
                "debug.inspect(\\\"lead plan\\\", leadPlan)",
                "watch.table(\\\"easy patch recipes\\\", availableRecipes)",
                "watch.value(\\\"recipe docs\\\", { excerpt: code.excerpt(recipeDocs, 240), stats: code.stats(recipeDocs) })",
                "debug.inspect(\\\"lead plan summary\\\", leadPlanSummary)",
                "debug.inspect(\\\"lead plan validation\\\", leadPlanValidation)",
                "debug.inspect(\\\"envelope plan\\\", envelopePlan)",
                "debug.inspect(\\\"envelope plan summary\\\", envelopePlanSummary)",
                "debug.inspect(\\\"envelope plan validation\\\", envelopePlanValidation)",
                "debug.inspect(\\\"export sample envelope slot\\\", envelopeSlot)",
                "debug.inspect(\\\"export sample tail slot before default\\\", tailSlot)",
                "debug.inspect(\\\"export sample default tail slot\\\", defaultTailSlot)",
                "debug.inspect(\\\"generic visual slot\\\", visualSlot)",
                "debug.inspect(\\\"found export sample envelope slot\\\", foundEnvelopeSlot)",
                "debug.inspect(\\\"found generic visual slot\\\", foundVisualSlot)",
                "watch.value(\\\"teleport export markdown\\\", { excerpt: code.excerpt(teleportExportMarkdown, 240), stats: code.stats(teleportExportMarkdown) })",
                "debug.inspect(\\\"export sample slot schema\\\", envelopeSlotSchema)",
                "watch.value(\\\"export sample slot markdown\\\", { excerpt: code.excerpt(exportSlotMarkdown, 240), stats: code.stats(exportSlotMarkdown) })",
                "watch.table(\\\"export sample slots\\\", exportSample.slots())",
                "watch.table(\\\"all export sample slots\\\", exportSample.allSlots())",
                "watch.table(\\\"slot authoring slots\\\", slot.all(\\\"exportSample\\\"))",
                "watch.table(\\\"lead plan steps\\\", leadPlanSteps)",
                "watch.value(\\\"lead plan markdown\\\", { excerpt: code.excerpt(leadPlanMarkdown, 240), stats: code.stats(leadPlanMarkdown) })",
                "debug.inspect(\\\"circuit plan\\\", circuit.plan())",
                "debug.inspect(\\\"visual scopes\\\", visual.scopes())",
                "debug.inspect(\\\"lead tags\\\", leadTags)",
                "debug.inspect(\\\"tag check\\\", tags.validate(leadTags, [\\\"note\\\", \\\"tone\\\"]))",
                "debug.inspect(\\\"file parts\\\", teleportFile)",
                "debug.inspect(\\\"file tags\\\", file.tags(teleportFile.path))",
                "debug.inspect(\\\"file list\\\", demoFileList)",
                "debug.inspect(\\\"item summary\\\", itemSummary)",
                "debug.inspect(\\\"lead items\\\", leadItems)",
                "debug.inspect(\\\"velocity counts\\\", velocityCounts)",
                "debug.inspect(\\\"regex note\\\", noteMatch)",
                "debug.inspect(\\\"demo tests\\\", demoTests)",
                "debug.inspect(\\\"sample metadata\\\", sample.load(\\\"teleport\\\"))",
                "debug.inspect(\\\"patch types\\\", patch.countByType())",
                "debug.inspect(\\\"staged\\\", library.staged)",
                "console.table(demoFileList)",
                "Variable Watch",
                "nodeCodeScreenCopyWorkspaceWatchMarkdown",
                "nodeCodeScreenClearWorkspaceWatches",
                "Copy Value",
                "Copy Inspect",
                "Insert Inspect",
                "data-code-screen-copy-watch",
                "data-code-screen-copy-watch-inspect",
                "data-code-screen-insert-watch-inspect",
                "nodeCodeScreenClearRunHistory",
                "data-code-screen-load-run-history",
                "data-code-screen-run-history",
                "data-code-screen-save-run-history-snippet",
                "data-code-screen-copy-run-history-markdown",
                "data-code-screen-restore-run-history-watch",
                "data-code-screen-copy-run-history-report",
                "node-code-screen-variable-watch",
                "function nodeGraphCodeScreenWatchFromValue",
                "function nodeGraphCodeScreenValueLiteral",
                "function nodeGraphCodeScreenWatchInspectSnippet",
                "function nodeGraphCodeScreenWatchLiteralValue",
                "function nodeGraphCodeScreenFileListWatchRows",
                "function renderNodeGraphCodeScreenFileListWatch",
                "Tag Script File List",
                "function nodeGraphCodeScreenSlotListWatchRows",
                "function renderNodeGraphCodeScreenSlotListWatch",
                "Circuit Slot List",
                "function nodeGraphCodeScreenCodeblockListWatchRows",
                "function renderNodeGraphCodeScreenCodeblockListWatch",
                "Codeblock List",
                "function nodeGraphCodeScreenVariableGroupWatchRows",
                "function renderNodeGraphCodeScreenVariableGroupWatch",
                "Variable Scope",
                "function nodeGraphCodeScreenDebugTableWatchRows",
                "function renderNodeGraphCodeScreenDebugTableWatch",
                "Debug Table",
                "function nodeGraphCodeScreenRegexMatchWatch",
                "function renderNodeGraphCodeScreenRegexMatchWatch",
                "Regex Match",
                "function nodeGraphCodeScreenTestResultsWatchRows",
                "function renderNodeGraphCodeScreenTestResultsWatch",
                "Test Results",
                "function nodeGraphCodeScreenCircuitPlanWatch",
                "function renderNodeGraphCodeScreenCircuitPlanWatch",
                "Circuit Plan",
                "function copyNodeGraphCodeScreenWorkspaceWatch",
                "function copyNodeGraphCodeScreenWorkspaceWatchInspect",
                "function nodeGraphCodeScreenWorkspaceWatchMarkdown",
                "function copyNodeGraphCodeScreenWorkspaceWatchMarkdown",
                "function insertNodeGraphCodeScreenWorkspaceWatchInspect",
                "watch markdown copied",
                "watch markdown selected",
                "debug report copied",
                "debug report selected",
                "Build Summary",
                "node-code-screen-build-summary",
                "function nodeGraphCodeScreenStagedCounts",
                "function nodeGraphCodeScreenStagedItemLabel",
                "function nodeGraphCodeScreenStagedPreviews",
                "function nodeGraphCodeScreenScriptTests",
                "function nodeGraphCodeScreenTestSummary",
                "function nodeGraphCodeScreenBuildSummary",
                "function nodeGraphCodeScreenBuildSummarySection",
                "function setNodeGraphCodeScreenBuildSummary",
                "function renderNodeGraphCodeScreenBuildSummary",
                "function openNodeGraphCodeScreenBuildSummarySection",
                "data-code-screen-build-summary-section",
                "node-code-screen-test-summary",
                "${summary.tests.passed}/${summary.tests.total} passed",
                "summary section not found",
                "No build yet",
                "Run a Workspace Script to see library changes by type.",
                "vision-run-helper",
                "patch-make-lead",
                "vision-command-demo",
                "find-output-modules",
                "demo.panel.enabled",
                "Run History",
                "node-code-screen-run-history",
                "function nodeGraphCodeScreenRunHistoryEntry",
                "function nodeGraphCodeScreenRunHistoryWatches",
                "function nodeGraphCodeScreenRunHistoryItem",
                "function addNodeGraphCodeScreenRunHistory",
                "function renderNodeGraphCodeScreenRunHistory",
                "function loadNodeGraphCodeScreenRunHistoryItem",
                "function saveNodeGraphCodeScreenRunHistorySnippet",
                "language.value = nodeGraphCodeScreenMarkdownLanguage(item.language || \"javascript\")",
                "item.language || \"javascript\"",
                "function runNodeGraphCodeScreenRunHistoryItem",
                "function copyNodeGraphCodeScreenRunHistoryMarkdown",
                "function restoreNodeGraphCodeScreenRunHistoryWatches",
                "function copyNodeGraphCodeScreenRunHistoryReport",
                "function clearNodeGraphCodeScreenRunHistory",
                "## Tests",
                "${entry.tests.passed}/${entry.tests.total} tests",
                "history loaded",
                "history ran",
                "history snippet saved",
                "history markdown copied",
                "history markdown selected",
                "history watches restored",
                "history report copied",
                "history report selected",
                "No script runs yet.",
                "Load",
                "Run Again",
                "Restore Watch",
                "Save Snippet",
                "Copy Run Report",
                "Script Console",
                "nodeCodeScreenWorkspaceConsoleOutput",
                "nodeCodeScreenCopyWorkspaceConsoleMarkdown",
                "nodeCodeScreenClearWorkspaceConsole",
                "function nodeGraphCodeScreenValuePreview",
                "function nodeGraphCodeScreenConsoleTableText",
                "function nodeGraphCodeScreenConsoleLine",
                "nodeGraphCodeScreenConsoleLine(\"test\"",
                "function nodeGraphCodeScreenInspectLine",
                "function setNodeGraphCodeScreenWorkspaceConsole",
                "function copyNodeGraphCodeScreenWorkspaceConsoleMarkdown",
                "function setNodeGraphCodeScreenWorkspaceWatches",
                "function clearNodeGraphCodeScreenWorkspaceWatches",
                "function clearNodeGraphCodeScreenWorkspaceConsole",
                "console markdown copied",
                "console markdown selected",
                "function resetNodeGraphCodeScreenWorkspaceScriptDraft",
                "function updateNodeGraphCodeScreenWorkspaceScriptStats",
                "function updateNodeGraphCodeScreenWorkspaceScriptDraftState",
                "function nodeGraphCodeScreenStrictSelectedWorkspaceScriptText",
                "select code to run",
                "selection ran",
                "script matches saved patch",
                "unapplied script changes",
                "script has unapplied changes",
                "function saveNodeGraphCodeScreenWorkspaceSnippet",
                "function saveNodeGraphCodeScreenWorkspacePinnedSnippet",
                "function saveNodeGraphCodeScreenWorkspaceSnippetWithTags",
                "function saveNodeGraphCodeScreenCodeblockSnippet",
                "function saveNodeGraphCodeScreenCodeblockPinnedSnippet",
                "function saveNodeGraphCodeScreenCodeblockSnippetWithTags",
                "const nextStatus = document.getElementById(\"nodeCodeScreenCodeblockStatus\") || status",
                "function saveNodeGraphCodeScreenHelperDetailSnippet",
                "function saveNodeGraphCodeScreenHelperDetailPinnedSnippet",
                "function saveNodeGraphCodeScreenHelperDetailSnippetWithTags",
                "helper pinned",
                "helper saved + pinned",
                "function saveNodeGraphCodeScreenSnippetSource",
                "nodeGraphCodeScreenFreshHelper(nodeGraphCodeScreenSnippetValueFromSource",
                "function nodeGraphCodeScreenSnippetValueFromSource",
                "function nodeGraphCodeScreenSnippetValueFromSource(snippet, description, tags = \"\", language = \"javascript\")",
                "function nodeGraphCodeScreenSnippetIdFromSource",
                "normalizeNodeGraphCodeScreenId(compact, \"saved-snippet\")",
                "category: nodeGraphCodeScreenHasTag(tags, \"pinned\") ? \"pinned snippet\" : \"saved snippet\"",
                "function createNodeGraphCodeScreenDebugCodeblock",
                "debug codeblock added",
                "function addNodeGraphCodeScreenSnippetItem",
                "category: \"saved snippet\"",
                "updatedAt: nodeGraphCodeScreenNowIso()",
                "function duplicateNodeGraphCodeScreenSnippetItem",
                "function toggleNodeGraphCodeScreenSnippetPinned",
                "snippet pinned to shelf",
                "snippet unpinned",
                "function useNodeGraphCodeScreenSnippetAndReturn",
                "function duplicateNodeGraphCodeScreenRegistryItem",
                "code screen snippet duplicated",
                "code screen snippet pin changed",
                "snippet inserted",
                "code screen metadata duplicated",
                "function nodeGraphCodeScreenRegistryDraftItems",
                "function updateNodeGraphCodeScreenRegistryDraftPreview",
                "function updateNodeGraphCodeScreenRegistryDraftCard",
                "function nodeGraphCodeScreenRegistrySavedItemForCard",
                "function nodeGraphCodeScreenComparableRegistryItem",
                "delete next.updatedAt",
                "function nodeGraphCodeScreenRegistryItemsEqual",
                "function updateNodeGraphCodeScreenRegistryDraftState",
                "function updateNodeGraphCodeScreenRegistryStatus",
                "function nodeGraphCodeScreenRegistryDraftItemFromCard",
                "codeScreenRegistryDraftState",
                "metadata matches saved entry",
                "unapplied metadata changes",
                "function nodeGraphCodeScreenSourceStatsText",
                "Save Metadata",
                "Reset Draft",
                "Copy Code",
                "markdown: ${nodeGraphCodeScreenMarkdownLanguage",
                "data-code-screen-copy-registry-snippet",
                "data-code-screen-copy-markdown-registry-snippet",
                "data-code-screen-save-registry-metadata",
                "data-code-screen-reset-registry",
                "node-code-screen-snippet-stats",
                "registryStatus.id = \"nodeCodeScreenRegistryStatus\"",
                "function saveNodeGraphCodeScreenRegistryMetadata",
                "function resetNodeGraphCodeScreenRegistryDraft",
                "function copyNodeGraphCodeScreenRegistrySnippet",
                "function copyNodeGraphCodeScreenRegistryMarkdownSnippet",
                "nodeCodeScreenRegistryStatus",
                "metadata editing",
                "metadata saved",
                "metadata reset",
                "metadata not found",
                "metadata duplicated",
                "code copied",
                "markdown copied",
                "code selected",
                "markdown selected",
                "nothing to copy",
                "nothing to use",
                "node-code-screen-registry-code-call",
                "data-code-screen-registry-snippet-preview",
                "items.length === 1",
                "config.key",
                "function nodeGraphCodeScreenSelectedWorkspaceScriptText",
                "function nodeGraphCodeScreenPreviewText",
                '"line" : "lines"',
                "function updateNodeGraphCodeScreenHelperSearch",
                "function clearNodeGraphCodeScreenHelperSearch",
                "nodeCodeScreenSnippetSearch",
                "nodeCodeScreenClearSnippetSearch",
                "nodeCodeScreenCodeblockSearch",
                "nodeCodeScreenCodeblockInputs",
                "nodeCodeScreenCodeblockOutputs",
                "nodeCodeScreenClearCodeblockSearch",
                "nodeCodeScreenCreateCodeblockFromList",
                "function updateNodeGraphCodeScreenCodeblockSearch",
                "function clearNodeGraphCodeScreenCodeblockSearch",
                "input.setSelectionRange(selectionStart, selectionEnd)",
                "codeblocks shown",
                "codeblocks in patch",
                "node-code-screen-codeblock-list-summary",
                "`${inputs.length} in - ${outputs.length} out",
                "No debug Codeblocks match this search.",
                "node-code-screen-list-status",
                "snippets saved",
                "snippets shown",
                "function updateNodeGraphCodeScreenSnippetSearch",
                "function clearNodeGraphCodeScreenSnippetSearch",
                "No snippets match this search.",
                "No helpers or saved snippets match this search.",
                "helpers in",
                "function nodeGraphCodeScreenLookupItems",
                "function rememberNodeGraphCodeScreenRecentHelperSnippet",
                "function nodeGraphCodeScreenRecentHelperLookupItems",
                "function nodeGraphCodeScreenRecentHelperRank",
                "function nodeGraphCodeScreenSortHelpersByRecent",
                "const namespaceQuery",
                "item.kind.toLowerCase() === `${namespaceQuery}.`",
                "function nodeGraphCodeScreenRecentSnippetLookupItems",
                "function nodeGraphCodeScreenFirstLookupItem",
                "function insertFirstNodeGraphCodeScreenLookupItem",
                "function openFirstNodeGraphCodeScreenLookupItem",
                "function createNodeGraphCodeScreenLookupResult",
                "function syncNodeGraphCodeScreenLookupTargetControls",
                "function nodeGraphCodeScreenLookupTargetSummary",
                "function renderNodeGraphCodeScreenLookupShelf",
                "function updateNodeGraphCodeScreenLookupSearch",
                "function clearNodeGraphCodeScreenLookupSearch",
                "function focusNodeGraphCodeScreenLookupSearch",
                "lookup focused",
                "event.key.toLowerCase() === \"k\"",
                "function nodeGraphCodeScreenLookupNamespaces",
                "function saveNodeGraphCodeScreenLookupSnippet",
                "function saveNodeGraphCodeScreenLookupPinnedSnippet",
                "function saveNodeGraphCodeScreenLookupSnippetWithTags",
                "nodeGraphMvp.codeScreenLookupSearch = \"\"",
                "function copyNodeGraphCodeScreenLookupSnippet",
                "function copyNodeGraphCodeScreenLookupMarkdownSnippet",
                "function openNodeGraphCodeScreenLookupSnippet",
                "function openNodeGraphCodeScreenLookupHelper",
                "function saveNodeGraphCodeScreenLookupSelectionSnippet",
                "function saveNodeGraphCodeScreenLookupSelectionPinnedSnippet",
                "function saveNodeGraphCodeScreenLookupSelectionSnippetWithTags",
                "function nodeGraphCodeScreenSelectedEditorSnippetText",
                "function updateNodeGraphCodeScreenLookupStatus",
                "data-code-screen-lookup-snippet",
                "data-code-screen-save-lookup-snippet",
                "data-code-screen-save-pin-lookup-snippet",
                "data-code-screen-copy-lookup-snippet",
                "data-code-screen-copy-markdown-lookup-snippet",
                "data-code-screen-edit-lookup-snippet",
                "data-code-screen-lookup-helper-detail",
                "data-code-screen-lookup-namespace",
                "data-code-screen-pin-snippet",
                "const statusText = [item.category, item.availability].filter(Boolean).join(\" - \")",
                "nodeCodeScreenLookupSearch",
                "nodeCodeScreenLookupResults",
                "nodeCodeScreenLookupTarget",
                "nodeCodeScreenLookupTargetSummary",
                "nodeCodeScreenLookupStatus",
                "nodeCodeScreenNewLookupSnippet",
                "nodeCodeScreenSaveLookupSelection",
                "function createNodeGraphCodeScreenLookupHeading",
                "Pinned Snippets",
                "Recent Snippets",
                "Recent Helpers",
                "Use saved code again without leaving the editor.",
                "Helpers you inserted in this Code Screen session.",
                "Helpers",
                "Snippets",
                "select a Codeblock to insert there",
                "code screen lookup snippet saved",
                "code screen lookup selection snippet saved",
                "lookup pinned",
                "selection saved",
                "selection pinned",
                "selection saved + pinned",
                "new snippet draft",
                "lookup inserted",
                "nothing to open",
                "event.shiftKey",
                "code copied",
                "nothing to use",
                "nothing to copy",
                "snippet opened",
                "snippet not found",
                "helper opened",
                "helper not found",
                "nothing selected",
                "tags: ${item.tags}",
                "helper.tags",
                "workspace",
                "codeblock",
                "selection",
                "pinned",
                "snippet saved + pinned",
                "No Matches",
                "Try a namespace like ui. or save selected editor code as a snippet.",
                "return item.source || item.signature",
                "dataset.codeScreenHelperNamespace",
                "dataset.codeScreenLookupNamespace",
                "function nodeGraphCodeScreenActiveTextarea",
                "function insertNodeGraphCodeScreenTeleportScriptStub",
                "updateNodeGraphCodeScreenWorkspaceScriptStats();",
                "function renderNodeGraphCodeScreen()",
                "function openNodeGraphCodeScreenForNode",
                "function updateNodeGraphCodeScreenLookupSummary",
                "function nodeGraphCodeScreenSectionCount",
                "function nodeGraphCodeScreenRegistryKeyForSection",
                "function nodeGraphCodeScreenPatchLocalHelpers",
                "function nodeGraphCodeScreenAllHelpers",
                "function nodeGraphCodeScreenHelperKey",
                "function nodeGraphCodeScreenHelperByKey",
                "function nodeGraphCodeScreenHelperLookupItem",
                "helperKey: nodeGraphCodeScreenHelperKey(helper)",
                "function nodeGraphCodeScreenCountBy",
                "function renderNodeGraphCodeScreenHelperSummary",
                "data-code-screen-helper-summary-filter",
                "codeScreenHelperSummaryValue",
                "function applyNodeGraphCodeScreenHelperSummaryFilter",
                "Namespaces",
                "Categories",
                "Availability",
                "function nodeGraphCodeScreenFilteredHelpers",
                "function nodeGraphCodeScreenSelectedHelperDetail",
                "function renderNodeGraphCodeScreenHelperDetail",
                "data-code-screen-helper-detail",
                "Use Helper",
                "availability: \"patch local\"",
                "function applyNodeGraphCodeScreenCodeblockPorts",
                "pruneNodeGraphConnectionsForCodeblockPortChange",
                "function applyNodeGraphCodeScreenCodeblockSource",
                "function applyNodeGraphCodeScreenCodeblockAll",
                "function resetNodeGraphCodeScreenCodeblockDraft",
                "code screen codeblock changed",
                "draft reset",
                "function updateNodeGraphCodeScreenAutocomplete",
                ".sort(nodeGraphCodeScreenSortHelpersByRecent)",
                "function renderNodeGraphCodeScreenAutocompleteItems",
                "function setNodeGraphCodeScreenAutocompleteIndex",
                "function nodeGraphCodeScreenClampAutocompleteIndex",
                "function renderNodeGraphCodeScreenNamespaceRail",
                "function renderNodeGraphCodeScreenHelperFilterRail",
                "function setNodeGraphCodeScreenHelperNamespaceFilter",
                "data-code-screen-helper-namespace-filter",
                "dataset.codeScreenInsertPrefix",
                "dataset.codeScreenAutocompleteIndex",
                "node-code-screen-autocomplete-header",
                "String(helper.namespace || \"\").toLowerCase() === prefixKey",
                "ArrowDown",
                "ArrowUp",
                "codeScreenPendingSnippet",
                "addNodeGraphCodeScreenRegistryTemplate",
                "nodeGraphCodeScreenUniqueRegistryValue",
                "nodeGraphCodeScreenUniqueRegistryId",
                "nodeGraphCodeScreenUniqueRegistryDraftItems",
                "insertFirstNodeGraphCodeScreenAutocompleteItem",
                "function saveNodeGraphCodeScreenActiveDraftFromKeyboard",
                "event.key.toLowerCase() === \"s\"",
                "saveNodeGraphCodeScreenRegistryMetadata(",
                "saveNodeGraphCodeScreenRegistryAllMetadata(",
                "data-code-screen-save-all-registry",
                "all metadata saved",
                "insertNodeGraphCodeScreenRegistrySnippet",
                "saveNodeGraphCodeScreenRegistrySnippet",
                "saveNodeGraphCodeScreenRegistryPinnedSnippet",
                "saveNodeGraphCodeScreenRegistrySnippetWithTags",
                "moveNodeGraphCodeScreenRegistryItem",
                "data-code-screen-insert-registry",
                "data-code-screen-save-registry-snippet",
                "data-code-screen-save-pin-registry-snippet",
                "code screen registry snippet saved",
                "registry snippet pinned",
                "data-code-screen-move-registry",
                "Metadata JSON Preview",
                "Reset Draft",
                "nodeCodeScreenApplyCodeReturn",
                "nodeCodeScreenWorkspaceWatchSearch",
                "codeScreenWorkspaceWatchSearch",
                "updateNodeGraphCodeScreenWorkspaceWatchSearch",
                "filter variables",
                '"ui"',
                '"audio"',
                '"patch"',
                '"sample"',
                '"slot"',
                '"recipe"',
                '"assert"',
                '"command"',
                '"event"',
                '"game"',
                '"console"',
            ],
        ),
        (
            "events",
            "\n".join([
                codeblock_contract_sources["header events"],
                codeblock_contract_sources["menu events"],
            ]),
            [
                "bindNodeGraphCodeScreenEvents()",
                "setNodeGraphViewMode(\"code\")",
                "nodeSceneCodeblockOpenCodeScreen",
                "openNodeGraphCodeScreenForNode",
            ],
        ),
        (
            "style",
            style_source,
            [
                ".node-code-screen-view",
                ".node-code-screen-sidebar",
                ".node-code-screen-lookup",
                ".node-code-screen-lookup-actions",
                ".node-code-screen-lookup-namespaces",
                ".node-code-screen-lookup-status",
                ".node-code-screen-lookup-target",
                ".node-code-screen-lookup-target-summary",
                ".node-code-screen-lookup kbd",
                ".node-code-screen-lookup-keys",
                ".node-code-screen-lookup-heading",
                ".node-code-screen-lookup-result",
                ".node-code-screen-lookup-namespaces button[aria-pressed=\"true\"]",
                "data-code-screen-copy-lookup-snippet",
                "data-code-screen-edit-lookup-snippet",
                "data-code-screen-lookup-helper-detail",
                "data-code-screen-save-pin-lookup-snippet",
                ".node-code-screen-lookup-results",
                "#nodeCodeScreenClearLookupSearch",
                ".node-code-screen-autocomplete",
                ".node-code-screen-autocomplete-header",
                ".node-code-screen-codeblocks",
                ".node-code-screen-codeblock-panel",
                ".node-code-screen-codeblock-summary",
                ".node-code-screen-codeblock-summary.error",
                ".node-code-screen-debug-values",
                ".node-code-screen-debug-values-heading",
                ".node-code-screen-debug-values dl",
                ".node-code-screen-codeblock-draft-state",
                ".node-code-screen-codeblock-draft-state.changed",
                ".node-code-screen-codeblock-list-summary",
                ".node-code-screen-script-stats",
                ".node-code-screen-script-draft-state",
                ".node-code-screen-script-console",
                ".node-code-screen-script-console menu",
                ".node-code-screen-variable-watch-heading menu",
                ".node-code-screen-watch-filter",
                ".node-code-screen-watch-filter input:focus",
                ".node-code-screen-file-list-watch",
                ".node-code-screen-file-list-watch table",
                ".node-code-screen-codeblock-list-watch",
                ".node-code-screen-codeblock-list-watch table",
                ".node-code-screen-variable-group-watch",
                ".node-code-screen-variable-group-watch table",
                ".node-code-screen-debug-table-watch",
                ".node-code-screen-debug-table-watch table",
                ".node-code-screen-slot-list-watch",
                ".node-code-screen-slot-list-watch table",
                ".node-code-screen-regex-match-watch",
                ".node-code-screen-regex-match-watch table",
                ".node-code-screen-test-results-watch",
                ".node-code-screen-test-results-watch table",
                ".node-code-screen-circuit-plan-watch",
                ".node-code-screen-circuit-plan-watch table",
                ".node-code-screen-test-summary",
                ".node-code-screen-test-summary.error",
                ".node-code-screen-shortcut-hint",
                ".node-code-screen-script-language",
                ".node-code-screen-codeblock-search",
                ".node-code-screen-namespace-rail",
                ".node-code-screen-json-preview",
                ".node-code-screen-card-actions",
                ".node-code-screen-registry-code-call",
                ".node-code-screen-registry-status",
                ".node-code-screen-section-list button em",
                ".node-code-screen-snippet-target",
                ".node-code-screen-snippet-tag-rail",
                ".node-code-screen-snippet-sort",
                ".node-code-screen-snippet-card-tags",
                ".node-code-screen-snippet-stats",
                ".node-code-screen-snippet-updated",
                ".node-code-screen-snippet-library",
                ".node-code-screen-snippet-preview",
                ".node-code-screen-snippet-search",
                "data-code-screen-snippet-chip-type=\"category\"",
                ".node-code-screen-list-status",
                ".node-code-screen-registry-draft-state",
                ".node-code-screen-registry-draft-state.changed",
                ".node-code-screen-helper-detail",
                ".node-code-screen-helper-detail-actions",
                ".node-code-screen-helper-row",
                ".node-code-screen-helper-summary",
                ".node-code-screen-helper-summary button",
                ".node-code-screen-helper-filter-rail",
                ".node-code-screen-helper-search",
                ".node-code-screen-helper-card button code",
                ".node-code-screen-autocomplete button[aria-selected=\"true\"]",
                ".node-code-screen-autocomplete button code",
            ],
        ),
    ]:
        for snippet in snippets:
            assert snippet in source, f"missing code screen {name} contract: {snippet}"

    for name, source, snippets in [
        (
            "model",
            codeblock_contract_sources["code screen model"],
            [
                "normalizeNodeGraphCodeScreenEvent",
                "events: normalizeNodeGraphCodeScreenRegistry",
            ],
        ),
        (
            "controller",
            codeblock_contract_sources["code screen"],
            [
                'id: "events"',
                "Mage Teleport Event",
                'addLabel: "Add Event"',
                'key: "events"',
            ],
        ),
    ]:
        for snippet in snippets:
            assert snippet not in source, f"code screen {name} should keep events script-only, found: {snippet}"

    for snippet in [
        "Patch settings",
        "Patch Name",
        "Patch Author",
        "Patch Tags",
        "Patch Description",
        "Current Sample Rate",
        "Oversampling",
        "Target Sample Rate",
        "Engine Sample Rate",
        "Resulting Oversampling",
        "Output Sample Rate",
        "Grid Unit Width PX",
        "Grid Unit Height PX",
        "Grid Unit W PX",
        "Grid Unit H PX",
        "patchGridWidthPxValue",
        "patchGridHeightPxValue",
        "nodeScriptGridWidthPxValue",
        "nodeScriptGridHeightPxValue",
        "data-patch-grid-field",
        "Visual Output Mode",
        "Visual Output Scale",
        "Visual Output Style",
        "Visual Output Theme",
        "Visual Output Trail",
        "<span>Load</span><span>Patch</span>",
        "<span>View</span><span>Script</span>",
        "<span>Save</span><span>Patch</span>",
        "<span>Save</span><span>Init</span>",
        "Patch Utility",
        "Raw patch JSON for load, save, init, and recovery.",
        "Patch script editor actions",
        "Update Default",
        ">Copy</button>",
        ">Paste</button>",
        "Save Patch",
        "nodePatchCopyButton",
        "nodePatchShareLinkButton",
        "nodePatchPasteButton",
        "copyNodeUiDevSettingsButton",
        "nodeScriptStatus",
        "nodePatchPresetName",
        "nodePatchPresetSelect",
        "nodePatchPresetSaveButton",
        "nodePatchPresetLoadButton",
        "nodePatchPresetDeleteButton",
        "nodePreviousSavedPatchButton",
        "nodeNextSavedPatchButton",
        "nodePatchInitButton",
        "nodePatchSaveButton",
        "nodePatchShareLinkButton",
        "nodeSceneOpenSavedPatches",
        "nodeSavedPatchesWindow",
        "nodeSavedPatchesWindowHeading",
        "nodePatchCopyButton",
        "nodePatchPasteButton",
        "nodeSavedPatchesResizeHandle",
        "nodeSavedPatchesCloseButton",
        "nodeSavedPatchWindowList",
        "Patch Explorer",
        "updateDefaultPresetButton",
        "loadNodeGraphScriptButton",
        "nodeSettingsScriptViewButton",
        "nodeSettingsSaveScriptButton",
        "nodeUiDevButton",
        "<span>UIDEV</span>",
        "nodeUiDevHelper",
        "copyNodeUiDevSettingsButton",
        "loadNodeUiDevSettingsButton",
        "saveNodeUiDevSettingsButton",
        "updateDefaultNodeUiDevSettingsButton",
        "nodeUiDevSettingsFileInput",
        "nodeUiDevSettingsStatus",
        "nodeUiDevShowOriginMarker",
        "show world origin",
        "user UI settings actions",
        "nodeUiDevModularShaderEnabled",
        "modular shader glow",
        "nodeUiDevScopeBloomEnabled",
        "display bloom glow",
        "nodeDonateFiveButton",
        'href="https://soundemote.io/donate?amount=50"',
        'data-support-amount="50"',
        'aria-label="Download native app (under construction)"',
        "node-donate-five-button",
        "nodeDownloadFiftyButton",
        'data-support-amount="50"',
        "hidden\n            aria-label=\"Download for fifty dollars.",
        "Download$50",
        "(donation refund available)",
        "node-download-fifty-button",
        "nodeSceneOpenPostProcessing",
        "Screen Shader",
        "nodeUserUiSettingsPanel",
        "nodeUserUiSettingsHeading",
        "nodeUserUiSettingsDragHandle",
        "Move UI settings",
        "nodeUserUiSettingsSaveDefault",
        "Save UI Settings",
        "nodeUserUiSettingsStatus",
        "nodeUserUiSettingsControls",
        "exposed from UIDEV",
        "nodeUiDevSettingsHeaderTextSize",
        "nodeUiDevButtonTextSize",
        "nodeUiDevButtonTextSizeValue",
        'id="nodeUiDevButtonTextSize"\n                type="range"\n                min="0"\n                max="100"\n                step="1"\n                value="50"',
        "nodeUiDevButtonTextSizeValue\" for=\"nodeUiDevButtonTextSize\">50%",
        "nodeUiDevLiveToggleTextSize",
        "nodeUiDevLiveToggleTextSizeValue",
        'id="nodeUiDevLiveToggleTextSize"\n                type="range"\n                min="0"\n                max="100"\n                step="1"\n                value="76"',
        "nodeUiDevLiveToggleTextSizeValue\" for=\"nodeUiDevLiveToggleTextSize\">76%",
        "nodeUiDevModularHeaderButtonBackground",
        "nodeUiDevModularHeaderButtonBackgroundValue",
        "modular header button background",
        "nodeUiDevModularHeaderButtonBackgroundValue\" for=\"nodeUiDevModularHeaderButtonBackground\">62%",
        "nodeUiDevTooltipTextSize",
        "nodeUiDevTooltipTextSizeValue",
        "tooltip text size",
        "nodeUiDevTooltipTextSizeValue\" for=\"nodeUiDevTooltipTextSize\">14px",
        "nodeUiDevMinimumGridBrightness",
        "nodeUiDevMinimumGridBrightnessValue",
        "minimum grid brightness",
        "nodeUiDevMinimumGridBrightnessValue\" for=\"nodeUiDevMinimumGridBrightness\">0%",
        "nodeUiDevGridColor",
        "nodeUiDevGridColorValue",
        "grid color",
        "nodeUiDevWorkspaceBackgroundColor",
        "nodeUiDevWorkspaceBackgroundColorValue",
        "modular background color",
        "nodeUiDevSettingsHeaderTopRatio",
        "nodeUiDevSettingsHeaderPadding",
        "nodeUiDevFloatingWindowHeaderHeight",
        "nodeUiDevFloatingWindowHeaderHeightValue",
        "floating window header height",
        "nodeUiDevFloatingWindowHeaderHeightValue\" for=\"nodeUiDevFloatingWindowHeaderHeight\">30px",
        "nodeUiDevModuleTitleFont",
        "nodeUiDevModuleTitleFontValue",
        "module title font",
        "nodeUiDevModuleTitleFontValue\" for=\"nodeUiDevModuleTitleFont\">Cascadia",
        "nodeUiDevModuleTitleHeight",
        "nodeUiDevModuleTitleHeightValue",
        "nodeUiDevModuleTitleHeightValue\" for=\"nodeUiDevModuleTitleHeight\">26px",
        "nodeUiDevModuleTitleTextFill",
        "nodeUiDevModuleTitleTextFillValue",
        "nodeUiDevModuleTitleTextFillValue\" for=\"nodeUiDevModuleTitleTextFill\">62%",
        "nodeUiDevModuleIoSectionHeight",
        "nodeUiDevModuleIoSectionHeightValue",
        "in/out module section height",
        "nodeUiDevModuleIoSectionHeightValue\" for=\"nodeUiDevModuleIoSectionHeight\">24px",
        "input/output text size",
        "nodeUiDevModuleNodeSize",
        "nodeUiDevModuleNodeSizeValue",
        "module node size",
        "nodeUiDevModuleNodeSizeValue\" for=\"nodeUiDevModuleNodeSize\">57%",
        "nodeUiDevSliderWidth",
        "nodeUiDevSliderWidthValue",
        "slider width",
        "nodeUiDevSliderWidthValue\" for=\"nodeUiDevSliderWidth\">100%",
        "nodeUiDevSliderHeight",
        "nodeUiDevSliderHeightValue",
        "slider height",
        "nodeUiDevSliderHeightValue\" for=\"nodeUiDevSliderHeight\">28px",
        "nodeUiDevSliderLabelColor",
        "nodeUiDevSliderLabelColorValue",
        "slider label color",
        "nodeUiDevSliderValueColor",
        "nodeUiDevSliderValueColorValue",
        "slider value color",
        "nodeUiDevSliderUnitColor",
        "nodeUiDevSliderUnitColorValue",
        "slider unit color",
        "nodeUiDevSliderFillHoverColor",
        "nodeUiDevSliderFillHoverColorValue",
        "slider fill mouseover color",
        "nodeUiDevSliderFillHoverAlpha",
        "nodeUiDevSliderFillHoverAlphaValue",
        "slider fill mouseover alpha",
        "nodeUiDevChoiceDividerHeight",
        "nodeUiDevChoiceDividerHeightValue",
        "choice separator height",
        "nodeUiDevWirePatchPointSize",
        "nodeUiDevWirePatchPointSizeValue",
        "wire patch point size",
        "nodeUiDevWirePatchPointSizeValue\" for=\"nodeUiDevWirePatchPointSize\">36%",
        "nodeUiDevBypassIconSize",
        "nodeUiDevBypassIconSizeValue",
        "nodeUiDevBypassIconPreview",
        "nodeUiDevCloseIconSize",
        "nodeUiDevCloseIconSizeValue",
        "nodeUiDevNodeFillColor",
        "nodeUiDevNodeStrokeColor",
        "nodeUiDevNodeSelectedStrokeColor",
        "nodeUiDevNodeDraggingStrokeColor",
        "nodeUiDevPortIdleFillColor",
        "nodeUiDevPortIdleStrokeColor",
        "nodeUiDevPortHoverFillColor",
        "nodeUiDevPortHoverStrokeColor",
        "nodeUiDevInputFillColor",
        "nodeUiDevInputStrokeColor",
        "nodeUiDevOutputFillColor",
        "nodeUiDevOutputStrokeColor",
        "nodeUiDevModInputFillColor",
        "nodeUiDevModInputStrokeColor",
        "nodeUiDevParamOutputFillColor",
        "nodeUiDevParamOutputStrokeColor",
        'data-node-color-var="--node-module-fill"',
        'data-node-color-var="--node-port-hover-fill"',
        "nodeUiDevSettingsHeaderHighlights",
        "nodePatchScriptFileInput",
        "nodePatchNameHeader",
        "nodePatchTagsHeader",
        "nodePatchBankNameHeader",
        'data-patch-header-info-field="name"',
        'data-patch-header-info-field="tags"',
        'placeholder="Tags"',
        "data-patch-bank-name-field",
        "Live Audio",
        "nodeLiveInputButton",
        "nodeLiveInputDeviceSelect",
        "nodeLiveInputMeter",
        "nodeLiveInputTestStatus",
        "nodeLiveMicStatus",
        "nodeLiveOutputButton",
        "nodeLiveInputStatus",
        "nodeLiveStatus",
        "nodeLiveEngineStatus",
        "nodeLiveMeter",
        "nodeGpuAdditiveStatus",
        "nodeLivePlanStatus",
        "nodeLiveRouteStatus",
        "nodeBadValueMonitorButton",
        "nodeTripEarProtectionButton",
        "nodeBadValueMonitorStatus",
        "nodeBadValueMonitorEvidence",
        "BADVAL Monitor",
        "Trip Ear Protection",
        "nodeInteractionHelp",
        "nodeModularOnlyViewButton",
        "nodeUserUiSettingsButton",
        "nodeSettingsScriptViewButton",
        "nodeSettingsViewButton",
        "nodeSettingsView",
        "patchNameValue",
        "patchAuthorValue",
        "patchTagsValue",
        "patchDescriptionValue",
        "patchCurrentSampleRateValue",
        "patchOversamplingValue",
        "patchTargetSampleRateValue",
        "patchResultingSampleRateValue",
        "patchResultingOversamplingValue",
        "patchOutputSampleRateValue",
        "data-patch-audio-field",
        "patchVisualModeValue",
        "patchVisualScaleValue",
        "patchVisualStyleValue",
        "patchVisualThemeValue",
        "patchVisualTrailValue",
        "nodeZoomOutButton",
        "nodeZoomInButton",
        "nodeUndoButton",
        "nodeRedoButton",
        "node-toolbar-subline",
        "nodeVisibilityMenu",
        "nodeVisibilityMenuDragHandle",
        "Move visibility menu",
        "nodeVisibilityMenuResizeHandle",
        "Resize visibility menu",
        "nodeVisibilityMenuClose",
        "Workspace visibility",
        "nodeGridToggleButton",
        "Show Grid",
        "nodePatchTimingControls",
        "node-patch-timing-controls",
        "nodeModuleButtonsToggleButton",
        "Show Module Buttons",
        "nodeOscilloscopeToggleButton",
        "Show Displays",
        "nodeSceneUndoButton",
        "nodeSceneRedoButton",
        "nodeSceneOpenModuleActions",
        "nodeSceneOpenVisibility",
        "nodeSceneOpenUiSettings",
        "nodeSceneOpenPostProcessing",
        "scene-context-window-button",
        "floating-arrow-editable-1",
        "share-link-1",
        "Module Settings",
        "Visibility",
        "nodeMasterScopeLineThickness",
        "nodeMasterScopeDotCore1Enabled",
        "nodeMasterScopeDotCore1Size",
        "nodeMasterScopeDotCore1Brightness",
        "nodeMasterScopeDotCore1Color",
        "nodeMasterScopeDotCore1Preview",
        "nodeMasterScopeDotCore2Enabled",
        "nodeMasterScopeDotCore2Size",
        "nodeMasterScopeDotCore2Brightness",
        "nodeMasterScopeDotCore2Color",
        "nodeMasterScopeDotCore2Preview",
        "Trace dot image layers",
        "Dot 1",
        "Dot 2",
        "<span>size px</span>",
        'id="nodeMasterScopeDotCore1Size" type="number" min="0.01" max="10"',
        'id="nodeMasterScopeDotCore1Color" type="color"',
        'id="nodeMasterScopeDotCore2Size" type="number" min="0.01" max="10"',
        'id="nodeMasterScopeDotCore1Brightness" type="number" min="0" max="40"',
        'id="nodeMasterScopeDotCore2Brightness" type="number" min="0" max="40"',
        'id="nodeMasterScopeDotCore2Color" type="color"',
        'id="nodeMasterScopeDiscontinuitySkipSamples" type="number" min="0" max="2" step="1"',
        'data-global-scope-dot-toggle="dot1"',
        'data-global-scope-dot-toggle="dot2"',
        'aria-pressed="false">Dot 1</button>',
        'aria-pressed="true">Dot 2</button>',
        "nodeMasterScopeDotPreview",
        "Generated display dot 1 image preview",
        "Generated display dot 2 image preview",
        "Generated display combined dot image preview",
        "nodeMasterScopeBackgroundColor",
        "display background",
        "nodeGlobalScopeMenu",
        "node-scope-global-settings",
        "Internal Controls",
        "node-scope-local-settings",
        "Local Settings",
        "nodeGlobalScopeDragHandle",
        "nodeGlobalScopeCloseMenu",
        "data-global-scope-input=\"lineThickness\"",
        "data-global-scope-input=\"discontinuitySkipSamples\"",
        "data-global-scope-number-drag=\"true\"",
        "data-global-scope-input=\"dotCore1Size\"",
        "data-global-scope-input=\"dotCore1Brightness\"",
        "data-global-scope-input=\"dotCore1Color\"",
        "data-global-scope-input=\"dotCore2Size\"",
        "data-global-scope-input=\"dotCore2Brightness\"",
        "data-global-scope-input=\"dotCore2Color\"",
        "data-global-scope-input=\"backgroundColor\"",
        "nodeModuleSlidersToggleButton",
        "Hide Sliders",
        "node-shader-script-quick-actions",
        "nodePatchScript",
        "nodeWaveformCanvas",
        "nodeSignalPlotCanvas",
        "nodeVisualOutputCanvas",
        "nodeVisualOutputMeta",
        "nodeVisualOutputStatus",
        "nodeOutputSummary",
        "node-output-summary",
        "nodeVideoViewPanel",
        "nodeVideoViewStatus",
        "nodeCameraResolutionWidth",
        "nodeCameraResolutionHeight",
        "nodeCameraOverlayLayer",
        "nodeCameraPreviewViewport",
        "nodeCameraPreviewSurface",
        "Camera View",
        "Selected modular camera output",
        "nodeCopyExecutionJsonButton",
        "nodeExecutionJsonStatus",
        "nodeCopyRuntimeSketchButton",
        "nodeRuntimeSketch",
        "nodeRuntimeSketchStatus",
        "nodeGraphZoomSurface",
        "nodeModuleScopeCanvas",
        "nodeSelectionMarquee",
        "node-selection-marquee",
        "nodeSelectionCountReadout",
        "node-selection-count-readout",
        "data-selection-count-value",
        "nodePalette",
        "nodeSceneContextMenu",
        "nodeModuleShopView",
        "nodeModuleShopClose",
        "nodeModuleShopHeading",
        "nodeModuleShopResizeHandle",
        "nodeModuleDepartmentSearch",
        "nodeModuleDepartmentBack",
        "Back to module categories",
        "&larr;",
        "nodeModuleDepartmentTitle",
            "nodeModuleHomeShelfShell",
        "nodeModuleHomeShelf",
        "nodeModuleDepartmentList",
        "nodeModuleGroups",
        "nodeModuleGroupList",
        "Search modules",
        "nodeSceneOpenModuleBrowser",
        "scene-context-window-button",
        "Patch Explorer",
        "nodeSceneCopyModule",
        "nodeSceneAddToGroup",
        "Add to group",
        'id="nodeSceneAddToGroup" class="node-under-construction-control" type="button" role="menuitem" disabled aria-disabled="true" title="Module grouping is under construction."',
        "Copy",
        "Ctrl+C",
        "nodeSceneAliasControl",
        "nodeSceneAliasInput",
        "module title alias",
        "nodeSceneWidthControls",
        "nodeSceneWidthLabel",
        "nodeSceneWidthDecrease",
        "nodeSceneWidthValue",
        "nodeSceneWidthIncrease",
        "nodeSceneDisplayHeightControls",
        "nodeSceneDisplayHeightLabel",
        "nodeSceneDisplayHeightDecrease",
        "nodeSceneDisplayHeightValue",
        "nodeSceneDisplayHeightIncrease",
        "nodeIndividualScopeControls",
        "nodeSceneScopeControls",
        "nodeModuleScopeLightCanvas",
        "nodeScopeContextMenu",
        "nodeSceneScopeTime",
        "nodeSceneScopeSync",
        "nodeSceneScopeOscillatorTraceMode",
        "nodeSceneBlinkLightControls",
        "nodeSceneBlinkLightShape",
        'data-scope-input="blinkLightShape"',
        '<option value="circle">circle</option>',
        '<option value="square">square</option>',
        '<option value="diamond">diamond</option>',
        "<span>cycles</span>",
        'id="nodeSceneScopeTime"',
        'min="0"',
        'max="128"',
        'step="1"',
        'value="2"',
        'value="60"',
        'data-scope-input="cycles"',
        'data-scope-control="oscillatorTraceMode"',
        "freq reset",
        "nodeSceneTextBoxTextSizeControls",
        "nodeSceneTextBoxTextSizeDecrease",
        "nodeSceneTextBoxTextSizeValue",
        "nodeSceneTextBoxTextSizeIncrease",
        "nodeSceneTextBoxTextControls",
        "nodeSceneTextBoxTextInput",
        "nodeSceneToggleModuleEnabled",
        "nodeSceneToggleButtons",
        "nodeSceneToggleOscilloscope",
        "nodeSceneToggleSliders",
        "nodeSceneToggleTitle",
        "nodeSceneImageControls",
        "nodeSceneImageSave",
        "nodeSceneImageRefresh",
        "nodeSceneTextBoxControls",
        "nodeSceneTextBoxSingleLine",
        "nodeSceneTextBoxMultiline",
        "nodeSceneTextBoxHorizontalAlignControls",
        "nodeSceneTextBoxAlignLeft",
        "nodeSceneTextBoxAlignCenter",
        "nodeSceneTextBoxAlignRight",
        "nodeSceneTextBoxVerticalAlignControls",
        "nodeSceneTextBoxVerticalAlign",
        "nodeSceneTextBoxVerticalAlignValue",
        "nodeSceneDeleteModule",
        '<button id="nodeSceneDeleteModule" class="scene-context-danger" type="button" role="menuitem" hidden>\n          <span>🗑️ Delete</span>\n        </button>',
        "Delete",
        "nodeModuleActionsWindow",
        "nodeModuleActionsWindowHeading",
        "nodeModuleActionsDragHandle",
        "nodeModuleActionsWindowBody",
        "nodeModuleActionsClose",
        "nodeModuleActionsResizeHandle",
        "nodeSceneCloseMenu",
        "Close module actions",
        "&times;",
        "nodeDeleteButton",
        "nodeRenderButton",
        "Render Sample",
        "toggleDebugButton",
        '<body class="debug-collapsed node-boot-loading">',
        '<script src="./public/boot-loading.js?v=hide-cpu-sysinfo-20260701"></script>',
        "node-boot-loading-screen",
        'aria-label="loading"',
        "nodeBootLoadingLabel",
        "nodeBootLoadingBarFill",
        'role="progressbar"',
        'aria-valuenow="4"',
        "nodeEarProtectionFault",
        "Audio Safety Circuit Open",
        "Ear Protection Tripped",
        "Audio output was muted for safety.",
        "Close this dialog to clear the trip and continue working.",
        "nodeEarProtectionFaultClose",
        "globalThis.nodeGraphResetEarProtectionFault?.()",
        "nodeModuleDiagnosticsFault",
        "Module Diagnostics",
        "A module isn't working correctly",
        "nodeModuleDiagnosticsFaultList",
        "nodeModuleDiagnosticsFaultClose",
        "globalThis.nodeGraphResetModuleDiagnosticsFault?.()",
        "nodeCheckAllModulesButton",
        "Check All",
        "Close",
        'aria-pressed="false">Show Evidence</button>',
        "nodeParameterMetadataPopover",
        "floating-window-header-height-1",
        "nodeMissingSampleAssetsDialog",
        "Patch Assets Required",
        "Missing Samples",
        "nodeMissingSampleAssetsList",
        "nodeMissingSampleAssetsClose",
        "dismissNodeGraphMissingSampleAssetsDialog()",
        "file-grid-resources-1",
        "share-link-1",
        "ui-window-resize-limits-2",
        "ui-window-resize-limits-2",
        "ui-window-resize-limits-2",
        "node-patch-audio-player-row",
        "ui-window-resize-limits-2",
        "ui-window-resize-limits-2",
        "metadataMinValue",
        "metadataMidLabel",
        "metadataMidValue",
        "metadataMaxValue",
        "metadataDefaultValue",
        "metadataStepValue",
        "metadataMaxDigitsValue",
        "metadataKindValue",
        "metadataUnitValue",
        "metadataTooltipValue",
        "metadataChoicesValue",
        "Choices",
        "metadataDisplayChoicesValue",
        "Display choices",
        "metadataDivideChoicesValue",
        "Divide choices visibly",
        "metadataShowSignValue",
        "Always show +/-",
        "metadataWraparoundValue",
        "Wraparound",
        "metadataLinearSmoothingValue",
        "Linear smoothing",
        "metadataNonlinearSliderValue",
        "metadataSliderCurveValue",
        "metadataCurveSensitivityValue",
        "SKEW",
        '<option value="linear">off</option>',
        '<option value="skew">mid skew</option>',
        '<option value="edges">edge skew</option>',
        'data-tooltip-key="parameterSettings.skew"',
        'data-tooltip-key="parameterSettings.skewSensitivity"',
        'data-tooltip-key="parameterSettings.tooltip"',
        "SENSITIVITY",
        "metadataPopoverDragHandle",
        "metadataPopoverSubtitle",
        "Kind Template",
        "nodeModuleDepartmentList",
            "node-live-toggle-palette",
        "<span>Input</span>",
        "<span>Output</span>",
        "<span>(Off)</span>",
        "nodeClapHostStatus",
        "CLAP Host: Under Construction",
        "nodeClapHostDetail",
        "nodeClapHostUrl",
        "CLAP host URL",
        "Connect Local Host",
        "Refresh Plugins",
        'id="nodeClapHostConnectButton" class="node-under-construction-control" type="button" disabled aria-disabled="true"',
        'id="nodeClapHostPluginsButton" class="node-under-construction-control" type="button" disabled aria-disabled="true"',
        "nodeClapHostDiagnosticsButton",
        "Diagnostics",
        "nodeClapHostCommandButton",
        "Copy Host Command",
        'id="nodeClapHostDiagnosticsButton" class="node-under-construction-control" type="button" disabled aria-disabled="true"',
        'id="nodeClapHostCommandButton" class="node-under-construction-control" type="button" disabled aria-disabled="true"',
        "node-graph-clap-host.js?v=0051",
        'data-tooltip-key="settings.makePlugin"',
        'data-tooltip-key="settings.makeModule"',
        'data-tooltip-key="settings.makeWidget"',
        'data-tooltip-key="settings.sharePatchCommunity"',
        'data-tooltip-key="settings.requestFeature"',
        'data-tooltip-key="settings.reportBug"',
        'data-constraint="cpu" data-tooltip-key="constraints.cpu"',
        'data-constraint="ram" data-tooltip-key="constraints.ram"',
        'data-constraint="gpu" data-tooltip-key="constraints.gpu"',
        'class="node-constraint-stack" data-constraint-stack="cpu"',
        'class="node-constraint-stack" data-constraint-stack="ram"',
        'class="node-constraint-stack" data-constraint-stack="gpu"',
        "nodeScopeCpuMetrics",
        "nodeScopeRamMetrics",
        "nodeScopeGpuMetrics",
        'data-scope-cpu-metric="fps"',
        'data-scope-cpu-metric="lag"',
        'data-scope-cpu-debug="summary"',
        'data-scope-ram-metric="used"',
        'data-scope-ram-metric="limit"',
        'data-scope-ram-debug="summary"',
        'data-scope-gpu-metric="fps"',
        'data-scope-gpu-metric="points"',
        'data-scope-gpu-debug="summary"',
        "main fps",
        "heap",
        "display fps",
        "node-settings-script-action-group",
        "Script actions",
        "node-settings-feedback-action-group",
        "Feedback actions",
        "node-settings-dev-action-group",
        "In-development build actions",
        "makePluginButton",
        "makeModuleButton",
        "makeWidgetButton",
        "sharePatchCommunityButton",
        "<span>Make Plugin</span><span>(in development)</span>",
        "<span>Make Module</span><span>(in development)</span>",
        "<span>Make Widget</span><span>(in development)</span>",
        "<span>Share Patch</span><span>With Community</span>",
    ]:
        require(snippet in index_source, f"node graph shell missing {snippet}")

    for snippet in [
        "nodeMidiKeyboardToggleButton",
        "nodeMacroControlsToggleButton",
        "nodeKeyboardPerformanceDock",
        "nodePerformanceWheelsPanel",
        "nodeMidiKeyboardPanel",
        "nodeMacroControlsPanel",
    ]:
        require(snippet not in index_source, f"fixed performance interface should be absent: {snippet}")

    require(
        index_source.index('class="node-user-ui-settings-actions"') <
        index_source.index('id="nodeUserUiSettingsControls"') <
        index_source.index('class="node-user-ui-settings-status-row"'),
        "UI Settings actions should stay above scrollable controls with status fixed at the bottom",
    )
    require(
        "grid-template-rows: auto auto minmax(0, 1fr) auto;" in style_source
        and "height: min(620px, calc(100vh - 124px));" in style_source
        and ".node-user-ui-settings-controls" in style_source
        and "align-content: start;" in style_source
        and "overflow-y: auto;" in style_source
        and ".node-user-ui-settings-actions" in style_source
        and "border-top: 1px solid rgba(127, 199, 217, 0.16);" in style_source,
        "UI Settings should have top actions, scrollable controls, and a non-scrolling bottom status strip",
    )

    require(
        index_source.index('id="nodeSceneDisplayHeightControls"') <
        index_source.index('id="nodeSceneToggleOscilloscope"') <
        index_source.index('id="nodeSceneToggleTitle"') <
        index_source.index('id="nodeSceneToggleButtons"') <
        index_source.index('id="nodeSceneToggleInterfaceControls"') <
        index_source.index('id="nodeSceneToggleIo"') <
        index_source.index('id="nodeSceneToggleSliders"'),
        "module action visibility controls should be ordered display height, display, title, buttons, control surface, in/out, sliders",
    )
    require(
        'id="nodeSceneToggleModuleEnabled"' in index_source and "Disable module" in index_source,
        "module action controls should include an enable/disable module toggle",
    )
    require(
        index_source.index('id="nodeSceneToggleModuleEnabled"') <
        index_source.index('id="nodeSceneDeleteModule"'),
        "module enable/disable should be directly above delete",
    )
    module_action_ids_start = script_sources["./public/node-graph-context-menu.js"].index(
        "const nodeGraphModuleActionControlIds = [",
    )
    module_action_ids_end = script_sources["./public/node-graph-context-menu.js"].index(
        "];",
        module_action_ids_start,
    )
    module_action_ids_source = script_sources["./public/node-graph-context-menu.js"][
        module_action_ids_start:module_action_ids_end
    ]
    require(
        module_action_ids_source.index('"nodeSceneToggleModuleEnabled"') <
        module_action_ids_source.index('"nodeSceneDeleteModule"'),
        "module actions window runtime order should place enable/disable above delete",
    )
    require(
        'id="nodeSceneToggleIo"' in index_source and "Hide in/out" in index_source,
        "module action visibility controls should include the in/out toggle button",
    )

    shader_quick_actions_source = index_source[
        index_source.index('class="node-shader-script-quick-actions"'):
        index_source.index("</span>", index_source.index('class="node-shader-script-quick-actions"'))
    ]
    shader_bottom_actions_source = index_source[
        index_source.index('class="node-shader-script-actions"'):
        index_source.index("</div>", index_source.index('class="node-shader-script-actions"'))
    ]
    require(
        'class="node-shader-script-live-toggle-group"' in shader_quick_actions_source
        and 'role="group"' in shader_quick_actions_source,
        "shader apply/disable controls should be a grouped toggle",
    )
    require(
        'id="nodeShaderScriptApply"' in shader_quick_actions_source
        and 'id="nodeShaderScriptEnable"' in shader_quick_actions_source,
        "shader enable toggle should sit beside the Apply button",
    )
    require(
        'id="nodeShaderScriptEnable"' not in shader_bottom_actions_source
        and 'id="nodeShaderScriptStatus"' in shader_bottom_actions_source
        and 'id="nodeShaderScriptCopyStatus"' in shader_bottom_actions_source,
        "shader bottom action row should carry status and copy-error button, not the enable toggle",
    )

    view_controls_source = script_sources["./public/node-graph-view-controls.js"]
    keyboard_module_source = view_controls_source[
        view_controls_source.index("function renderNodeGraphKeyboardControllerModules()"):
        view_controls_source.index("function toggleNodeGraphVideoView()")
    ]
    require(
        "bindNodeGraphKeyboardControllerModuleEvents();" in keyboard_module_source,
        "keyboard module render should idempotently bind keyboard controls after module render",
    )
    for snippet in [
        'document.querySelectorAll(`[data-performance-wheel="${control.kind}"]`).forEach((element) => {',
        'document.querySelectorAll(`[data-performance-wheel-value="${control.valueKey}"]`).forEach((valueElement) => {',
        'element.style.setProperty("--wheel-value", String(control.position));',
    ]:
        require(snippet in view_controls_source, f"performance wheel module render missing {snippet}")
    for snippet in [
        "function renderNodeGraphMidiKeyboardToggle()",
        "function bindNodeGraphMidiKeyboardPanelEvents()",
        "function toggleNodeGraphMidiKeyboard()",
        "function toggleNodeGraphMacroControls()",
        "nodePitchWheelControl",
        "nodeModWheelControl",
    ]:
        require(snippet not in view_controls_source, f"obsolete performance toggle should be absent: {snippet}")

    scene_context_source = index_source[
        index_source.index('id="nodeSceneContextMenu"'):
        index_source.index('id="nodeModuleActionsWindow"')
    ]
    module_actions_window_source = index_source[
        index_source.index('id="nodeModuleActionsWindow"'):
        index_source.index('id="nodeGlobalScopeMenu"')
    ]
    require(
        "<span>Command</span>" in scene_context_source
        and "<small>Center</small>" in scene_context_source
        and "workspace tools" not in scene_context_source,
        "command center header should render centered Command / Center text",
    )
    command_center_button_order = [
        "nodeSceneUndoButton",
        "nodeSceneRedoButton",
        "nodeSceneOpenModuleBrowser",
        "nodeSceneOpenSavedPatches",
        "nodeSceneCopyPatch",
        "nodeScenePastePatch",
        "nodeSceneSharePatch",
        "nodeSceneOpenModuleActions",
        "nodeSceneOpenUiSettings",
        "nodeSceneOpenPostProcessing",
        "nodeSceneOpenVisibility",
    ]
    command_center_button_positions = [
        scene_context_source.index(f'id="{button_id}"')
        for button_id in command_center_button_order
    ]
    require(
        command_center_button_positions == sorted(command_center_button_positions)
        and scene_context_source.index('class="scene-context-history-controls"') <
        scene_context_source.index('id="nodeSceneGlobalSmoothingControl"')
        and '<span class="scene-context-window-button-label">Module Settings</span>' in scene_context_source
        and '<span class="scene-context-window-button-label">Visibility</span>' in scene_context_source
        and "nodeSceneOpenTraceSettings" not in scene_context_source
        and "nodeSceneOpenMetaparameters" not in scene_context_source
        and "scene-context-window-button-icon" in scene_context_source,
        "command center buttons should use the requested cleanup order and labels",
    )
    require(
        'id="nodeSceneOpenTraceSettings" class="scene-context-window-button" type="button"' not in scene_context_source
        and "Trace Settings" not in scene_context_source
        and 'bindNodeGraphSceneElementEvent("nodeSceneOpenTraceSettings"' not in script_sources["./public/node-graph-scene-menu-event-bindings.js"]
        and "function openNodeGlobalScopeMenu()" in script_sources["./public/node-graph-context-menu.js"]
        and 'rememberNodeGraphWorkspaceWindowState("oscilloscopeSettings", menu, { open: false }' in script_sources["./public/node-graph-context-menu.js"],
        "old global trace settings should not be available from command center",
    )
    scope_shader_open_source = script_sources["./public/node-graph-shader-script.js"][
        script_sources["./public/node-graph-shader-script.js"].index("function openNodeGraphScopeShaderScript(nodeId)"):
        script_sources["./public/node-graph-shader-script.js"].index("function disableNodeGraphShaderScriptLiveApply()")
    ]
    require(
        "setNodeGraphShaderScriptDialogVisible(true)" not in scope_shader_open_source
        and "return false;" in scope_shader_open_source,
        "old code-based per-display shader editor should stay inaccessible",
    )
    require(
        "function nodeSceneContextHomeModulesHasContent(homeModules)" in script_sources["./public/node-graph-context-menu.js"]
        and "homeModules.hidden = !homeMode || !nodeSceneContextHomeModulesHasContent(homeModules)" in script_sources["./public/node-graph-context-menu.js"],
        "command center should keep empty repurposed home module sections hidden",
    )
    require(
        "nodeSceneResizeHandle" not in scene_context_source
        and "beginNodeSceneContextMenuResize" not in script_sources["./public/node-graph-context-menu.js"]
        and 'bindNodeGraphSceneElementEvent("nodeSceneResizeHandle"' not in script_sources["./public/node-graph-scene-menu-event-bindings.js"],
        "command center should not expose width resize dragging",
    )
    require(
        "addToGroupButton.disabled = true" in script_sources["./public/node-graph-context-menu.js"]
        and 'addToGroupButton.setAttribute("aria-disabled", "true")' in script_sources["./public/node-graph-context-menu.js"]
        and 'addToGroupButton.classList.add("node-under-construction-control")' in script_sources["./public/node-graph-context-menu.js"],
        "add to group should be disabled and styled as under construction",
    )
    require(
        'id="nodeModuleActionsWindowBody"' in module_actions_window_source
        and "ensureNodeGraphModuleActionsWindowBody()" in script_sources["./public/node-graph-scene-menu-event-bindings.js"],
        "module actions should be hosted by the standalone module actions window",
    )
    require(
        "nodeGraphModuleActionControlIds" in script_sources["./public/node-graph-context-menu.js"]
        and '"nodeSceneDeleteModule"' in script_sources["./public/node-graph-context-menu.js"],
        "module actions controls should be moved into the standalone window at startup",
    )
    require(
        '"nodeSceneToggleModuleEnabled"' in script_sources["./public/node-graph-context-menu.js"]
        and 'bindNodeGraphSceneElementEvent("nodeSceneToggleModuleEnabled", "click", toggleNodeGraphModuleEnabledFromContext)' in script_sources["./public/node-graph-scene-menu-event-bindings.js"],
        "module settings should bind enable/disable module to the saved bypass state",
    )
    require(
        "function setNodeGraphModuleActionControlsHidden(hidden = true)" in script_sources["./public/node-graph-context-menu.js"]
        and "const hasActionSelection = !actionMode || (moduleMode ? hasModuleActionTarget : Boolean(selectedWire));" in script_sources["./public/node-graph-context-menu.js"]
        and "nodeGraphMvp.lastModuleActionTargetNode = targetNodeId" in script_sources["./public/node-graph-context-menu.js"]
        and "const multiModuleMode = moduleMode && selectedNodeIds.size > 1" in script_sources["./public/node-graph-context-menu.js"]
        and "if (actionMode && !hasActionSelection)" in script_sources["./public/node-graph-context-menu.js"]
        and "setNodeGraphModuleActionControlsHidden(true)" in script_sources["./public/node-graph-context-menu.js"]
        and "setNodeGraphModuleActionControlsHidden(false)" in script_sources["./public/node-graph-context-menu.js"],
        "module actions should remember the last selected module and show common controls for multi-select",
    )
    patch_audio_panel_source = index_source[
        index_source.index('id="nodeSavedPatchesWindow"'):
        index_source.index('id="nodeScopeContextMenu"')
    ]
    graph_controls_source = index_source[
        index_source.index('<div class="node-graph-controls">'):
        index_source.index('id="nodeParameterMetadataPopover"', index_source.index('<div class="node-graph-controls">'))
    ]
    require(
        'id="nodePreviousSavedPatchButton"' in patch_audio_panel_source
        and 'id="nodeNextSavedPatchButton"' in patch_audio_panel_source
        and 'class="node-patch-audio-player-row"' not in patch_audio_panel_source
        and 'id="audioPlayer"' not in patch_audio_panel_source
        and graph_controls_source.index('class="node-render-duration-control"') <
        graph_controls_source.index('class="node-patch-audio-player-row"') <
        graph_controls_source.index('id="audioPlayer"'),
        "patch navigation should sit in the patch bar while browser audio belongs with render controls",
    )
    patch_explorer_source = index_source[
        index_source.index('id="nodeSavedPatchesWindow"'):
        index_source.index('id="nodeSavedPatchWindowList"')
    ]
    require(
        "nodeSavedPatchesRecentList" not in patch_explorer_source
        and "Recent patches" not in patch_explorer_source,
        "patch explorer should not include a recent patches row",
    )
    require(
        'node-saved-patches-header-tools' not in patch_explorer_source
        and 'node-saved-patches-actions' not in patch_explorer_source
        and 'node-saved-patches-slot-editor' not in patch_explorer_source
        and 'node-saved-patches-tag-filter' not in patch_explorer_source
        and 'node-saved-patches-command-row' not in patch_explorer_source
        and 'nodeSavedPatchesFitInput' not in patch_explorer_source
        and '>Rows<' not in patch_explorer_source,
        "patch explorer should be patch-list only without edit/search/bank/rows controls",
    )
    patch_control_source = index_source[
        index_source.index('class="node-patch-header-fields"'):
        index_source.index('class="scene-context-scope-fields"')
    ]
    require(
        'id="nodePatchCopyButton" class="node-patch-explorer-action-button" type="button" aria-label="Copy patch" title="Copy patch">Copy</button>' in index_source
        and 'id="nodePatchPasteButton" class="node-patch-explorer-action-button" type="button" aria-label="Paste patch" title="Paste patch">Paste</button>' in index_source,
        "patch copy/paste controls should live in the patch explorer toolbar row",
    )
    require(
        'data-patch-header-info-field="name"' in patch_control_source
        and 'data-patch-header-info-field="tags"' in patch_control_source
        and 'data-patch-bank-name-field' in patch_control_source
        and 'handleNodeGraphSavedPatchInfoInput' in script_sources["./public/node-graph-file-actions.js"]
        and 'for (const field of document.querySelectorAll("[data-patch-header-info-field]")) {' in script_sources["./public/node-graph-settings-event-bindings.js"]
        and 'for (const field of document.querySelectorAll("[data-patch-bank-name-field]")) {' in script_sources["./public/node-graph-settings-event-bindings.js"],
        "patch control strip bank name, patch name, and tags fields should sync into patch metadata",
    )
    require(
        "patches.filter((patch) => patch?.filename)" in script_sources["./public/node-graph-file-actions.js"]
        and "empty.textContent = \"No saved patches\"" not in script_sources["./public/node-graph-file-actions.js"]
        and "function nodeGraphSavedPatchBankGroups(patches = [])" in script_sources["./public/node-graph-file-actions.js"]
        and "row.className = \"node-saved-patch-bank-row\"" in script_sources["./public/node-graph-file-actions.js"]
        and "row.addEventListener(\"click\", () => openNodeGraphSavedPatchBank(group.bank))" in script_sources["./public/node-graph-file-actions.js"]
        and "back.addEventListener(\"click\", showNodeGraphSavedPatchBanks)" in script_sources["./public/node-graph-file-actions.js"]
        and "bank.className = \"node-demo-patch-bank\"" in script_sources["./public/node-graph-file-actions.js"]
        and "row.append(bank, name)" in script_sources["./public/node-graph-file-actions.js"]
        and "node-demo-patch-tags" not in script_sources["./public/node-graph-file-actions.js"],
        "patch explorer should render banks first, drill into saved patches, and stay blank when empty",
    )
    patch_list_style = style_source[
        style_source.index(".node-demo-patch-list {"):
        style_source.index(".node-demo-patch-status {")
    ]
    require(
        "grid-template-columns: minmax(0, 1fr);" in patch_list_style
        and "grid-template-columns: repeat(var(--node-saved-patch-columns" not in patch_list_style
        and "aspect-ratio: auto;" in patch_list_style
        and "min-height: 34px;" in patch_list_style,
        "patch explorer should use one-column descriptive rectangles instead of grid tiles",
    )
    require(
        ".node-saved-patch-bank-row" in style_source
        and ".node-saved-patch-bank-back" in style_source
        and "grid-template-columns: minmax(0, 1fr) 4ch;" in style_source,
        "patch explorer bank rows should match the compact category-row pattern",
    )
    patch_active_style = style_source[
        style_source.index(".node-demo-patch-row.active {"):
        style_source.index(".node-demo-patch-row.selected:not(.active) {")
    ]
    patch_selected_style = style_source[
        style_source.index(".node-demo-patch-row.selected:not(.active) {"):
        style_source.index(".node-demo-patch-row.empty {")
    ]
    require(
        "rgba(127, 199, 217" in patch_active_style
        and "rgba(226, 168, 109" in patch_selected_style
        and ".node-demo-patch-row.selected.active" in patch_selected_style,
        "patch explorer should use cyan for current patch and amber for selected slot",
    )
    saved_patch_loader_source = script_sources["./public/node-graph-file-actions.js"][
        script_sources["./public/node-graph-file-actions.js"].index("async function loadNodeGraphDemoPatch(filename)"):
        script_sources["./public/node-graph-file-actions.js"].index("function nodeGraphSavedPatchProgramIndex(filename)")
    ]
    require(
        "setNodeGraphSavedPatchesWindowVisible(false)" not in saved_patch_loader_source,
        "loading a saved patch should keep patch explorer open",
    )
    module_department_search_source = index_source[
        index_source.rindex("<label", 0, index_source.index('id="nodeModuleDepartmentSearch"')):
        index_source.index("</label>", index_source.index('id="nodeModuleDepartmentSearch"'))
    ]
    require(
        "disabled" not in module_department_search_source,
        "module department search input should be enabled",
    )
    require(
        "<span>search</span>" not in module_department_search_source,
        "module department search should not show a redundant search label above the input",
    )
    require(
        "scene-context-store-department-preview" not in script_sources["./public/node-graph-module-store.js"]
        and "scene-context-store-department-preview" not in style_source,
        "module category rows should not render subtext previews",
    )
    require(
        "node-module-store-card-actions" not in script_sources["./public/node-graph-module-store.js"]
        and "node-module-store-card-action" not in style_source
        and "node-module-store-card-add" not in style_source,
        "module cards should not render a separate plus/add action strip",
    )
    require(
        "entry.implemented &&" not in script_sources["./public/node-graph-module-store.js"][
            script_sources["./public/node-graph-module-store.js"].index("function nodeGraphModuleStorePublicEntriesByDepartment"):
            script_sources["./public/node-graph-module-store.js"].index("const nodeGraphModuleShopWindowDefaultSize")
        ]
        and 'card.classList.add("under-construction")' in script_sources["./public/node-graph-module-store.js"]
        and 'status.textContent = "Under construction"' in script_sources["./public/node-graph-module-store.js"]
        and '.scene-context-store-card.under-construction' in style_source,
        "unfinished modules should render inside their category as disabled under-construction cards",
    )
    require(
        ".sort(([a], [b]) => {" in script_sources["./public/node-graph-module-store.js"]
        and "nodeGraphModuleStoreDepartments.indexOf(a)" in script_sources["./public/node-graph-module-store.js"],
        "module category rows should follow the explicit department order",
    )
    require(
        "const nodeGraphModuleStoreVisualGroups = Object.freeze([" in script_sources["./public/node-graph-module-store.js"]
        and 'label: "Generate"' in script_sources["./public/node-graph-module-store.js"]
        and 'label: "Process"' in script_sources["./public/node-graph-module-store.js"]
        and 'label: "Interact"' in script_sources["./public/node-graph-module-store.js"]
        and 'label: "Memory"' in script_sources["./public/node-graph-module-store.js"]
        and "renderNodeGraphModuleStoreDepartmentGroup(" in script_sources["./public/node-graph-module-store.js"]
        and "for (const group of nodeGraphModuleStoreVisualGroups)" in script_sources["./public/node-graph-module-store.js"]
        and ".scene-context-store-visual-group" in style_source,
        "module category landing page should be split into visual groups",
    )

    for snippet in [
        '"name": "soemdsp-sandbox tooltip master"',
        '"constraints": {',
        '"cpu": "Show CPU-constrained controls.',
        '"ram": "Show RAM-constrained controls.',
        '"gpu": "Show GPU-constrained controls.',
        '"module"',
        '"wire"',
        '"slider"',
        '"settings"',
        '"audio"',
        '"parameterSettings": {',
        '"tooltip": "Tooltip text stored in this parameter',
        '"skew": "Slider response curve.',
        '"skewSensitivity": "Edge skew strength.',
        '"max": "Highest value this parameter can reach."',
        '"Mouse: middle-drag to move the modular view freely. Touch: drag empty workspace to move the view. Ctrl+middle-drag or Alt+middle-drag slowly zooms, including over modules and controls. Ctrl+Shift+G aligns the view to the grid."',
        '"Mouse: drag to move modules. Click to select. Ctrl/Shift+click adds or removes from selection; Ctrl/Shift+drag adds to selection while moving."',
        '"Mouse: drag to move modules. Click to select; Ctrl/Shift+click adds or removes from selection. Alt+click an empty I/O section to toggle bypass. When module buttons are hidden, Alt+click the title also toggles bypass."',
        '"Display-only text. Edit content from this module\'s actions menu. Text clips to the box height and scales down to fit width. Mouse wheel zooms the modular view."',
        '"Plain drag between this output and a signal input or modulation input to create a wire."',
        '"view": "Open the Patch Script utility"',
        "Ctrl+click resets to default",
        '"Mouse: click to copy the full compiled execution JSON."',
        '"Export the current circuit to CLAP/VST/AU/other that turns a sandbox patch into a multiplatform audio plugin. (currently unavailable)"',
    ]:
        require(snippet in tooltip_source, f"tooltip master document missing {snippet}")

    for snippet in [
        "nodeClearButton",
        "Clear Wires",
        'data-palette-node="audioInput"',
        'data-context-module="audioInput"',
        'data-palette-node="osc"',
        'data-palette-node="spiral"',
        'data-palette-node="noise"',
        'data-palette-node="gain"',
        'data-palette-node="bias"',
        'id="nodeSceneAddOsc"',
        'id="nodeSceneAddHighpass"',
        'id="nodeSceneAddLowpass"',
        'data-context-module="osc"',
        'data-context-module="highpass"',
        'data-context-module="lowpass"',
        "nodeSceneScopeGain",
        "nodeScopeBurnValue",
        "nodeScopeBrightnessValue",
        "nodeScopeLineThicknessValue",
        "nodeSceneGainScopeControls",
        "nodeGainScopeMinBrightness",
        "nodeGainScopeMaxBrightness",
        "nodeGainScopeMinLineThickness",
        "nodeGainScopeMaxLineThickness",
        "nodeMasterScopeTraceColor",
        "nodeMasterScopeBackgroundOverride",
        'data-scope-input="gain"',
        'data-scope-input="screenBurn"',
        'data-scope-input="brightness"',
        'data-scope-input="lineThickness"',
        'data-scope-input="gainMinBrightness"',
        'data-scope-input="gainMaxBrightness"',
        'data-scope-input="gainMinLineThickness"',
        'data-scope-input="gainMaxLineThickness"',
        'data-global-scope-input="traceColor"',
        'data-global-scope-control="backgroundOverride"',
    ]:
        require(snippet not in index_source, f"dangerous clear wires control should be absent: {snippet}")

    require(
        "nodeSceneScopeFps" not in index_source
        and 'data-scope-input="framesPerSecond"' not in index_source,
        "scope FPS should be a master header control, not an individual oscilloscope menu field",
    )

    for snippet in [
        "Browser Patch Proof",
        "Node Wiring MVP",
    ]:
        require(snippet not in index_source, f"static patch header should be absent: {snippet}")

    settings_order = [
        index_source.index("patchNameValue"),
        index_source.index("patchTagsValue"),
        index_source.index("patchAuthorValue"),
        index_source.index("patchDescriptionValue"),
    ]
    require(settings_order == sorted(settings_order), "settings fields should be ordered name, tags, author, description")

    workspace_index = index_source.index("nodeGraphWorkspace")
    require("nodeGraphEmptyModuleButton" in index_source, "empty workspace module browser button missing")
    audio_index = index_source.index("audioPlayer")
    controls_index = index_source.index("nodeRenderButton")
    require(
        workspace_index < controls_index < audio_index,
        "primary audio widget should sit with render controls below the patch bar",
    )

    audio_player_contract_sources = {
        "clone": script_sources["./public/node-graph-patch-clone.js"],
        "definitions": script_sources["./public/node-graph-module-definitions.js"],
        "execution plan": script_sources["./public/node-graph-execution-plan.js"],
        "live plan": script_sources["./public/node-graph-live-plan-runtime.js"],
        "live runtime": script_sources["./public/node-graph-live-runtime.js"],
        "parameter metadata": script_sources["./public/node-graph-parameter-metadata.js"],
        "patch core": script_sources["./public/node-graph-patch-core.js"],
        "patch runtime": script_sources["./public/node-graph-patch-runtime.js"],
        "patch normalizers": script_sources["./public/node-graph-patch-normalizers.js"],
        "phosphor waveform": script_sources["./public/node-graph-phosphor-waveform.js"],
        "rendering": script_sources["./public/node-graph-module-rendering.js"],
        "resources": script_sources["./public/node-graph-resources.js"],
        "external ui events": script_sources["./public/node-graph-external-ui-events.js"],
        "runtime": node_graph_source,
        "samples": script_sources["./public/node-graph-samples.js"],
        "sizing": script_sources["./public/node-graph-module-sizing.js"],
        "scopes": script_sources["./public/node-graph-module-scopes.js"],
        "state": script_sources["./public/node-graph-state.js"],
        "store": script_sources["./public/node-graph-module-store.js"],
        "server": server_source,
        "styles": style_source,
        "worklet": worklet_source,
    }
    resource_manifest = json.loads((PUBLIC / "resources" / "manifest.json").read_text(encoding="utf-8"))
    require(
        resource_manifest.get("version") == 1 and isinstance(resource_manifest.get("resources"), list),
        "resource manifest should exist as a simple versioned resources list",
    )
    startup_music_resource = next(
        (
            resource
            for resource in resource_manifest.get("resources", [])
            if resource.get("id") == "chaosarp-lorenz-startup"
        ),
        None,
    )
    require(
        startup_music_resource
        and startup_music_resource.get("kind") == "audio"
        and startup_music_resource.get("path") == "audio/Elan Hickler - ChaosArp Lorenz.mp3"
        and (PUBLIC / "resources" / "audio" / "Elan Hickler - ChaosArp Lorenz.mp3").is_file(),
        "official startup music should be bundled as an audio resource",
    )
    startup_patch = json.loads((PUBLIC / "presets" / "default.json").read_text(encoding="utf-8"))
    startup_player = next(
        (node for node in startup_patch.get("nodes", []) if node.get("id") == "audioPlayer-1"),
        {},
    )
    require(
        startup_player.get("sample", {}).get("id") == "chaosarp-lorenz-startup"
        and startup_player.get("params", {}).get("transport") == 3
        and any(sample.get("id") == "chaosarp-lorenz-startup" for sample in startup_patch.get("samples", []))
        and any(asset.get("id") == "chaosarp-lorenz-startup" for asset in startup_patch.get("requiredAssets", [])),
        "default preset should start Music Player with the official startup music in Play mode",
    )
    require(
        '<script src="./public/node-graph-resources.js?v=embed-config-20260701"></script>' in index_source
        and "await loadNodeGraphResourceManifest();" in script_sources["./public/node-graph-bootstrap.js"]
        and "resources: { resources: [], version: 1 }" in script_sources["./public/node-graph-state.js"]
        and "resourceMap: new Map()" in script_sources["./public/node-graph-state.js"],
        "resource manifest loader should be wired into startup before patches resolve samples",
    )
    for name, source_text, snippets in [
        (
            "definition",
            "\n".join([audio_player_contract_sources["definitions"], audio_player_contract_sources["store"]]),
            [
                'audioPlayer: "Music Player"',
                'inputs: ["Reset", "Speed", "Phase"]',
                'outputs: ["Mono", "Left", "Right", "Phase", "Trigger"]',
                'key: "transport"',
                'choices: ["Off (reset)", "Stop", "Pause", "Loop", "Play"]',
                'defaultValue: "4"',
                'label: "Play Mode"',
                'key: "speed", label: "Speed", linearSmoothing: false',
                'max: "8"',
                'min: "0"',
                "maxDigits: 4",
                'unit: "x"',
                'key: "start", label: "Start", linearSmoothing: false, max: "1", mid: "0.5"',
                'key: "end", label: "End", linearSmoothing: false, max: "1", mid: "0.5"',
                'nonlinearSlider: false',
                '"audioPlayer"',
                "scrubbable",
                "phasor",
            ],
        ),
        (
            "sample data",
            "\n".join([
                audio_player_contract_sources["external ui events"],
                audio_player_contract_sources["samples"],
                audio_player_contract_sources["resources"],
                audio_player_contract_sources["clone"],
                audio_player_contract_sources["patch core"],
                audio_player_contract_sources["parameter metadata"],
            ]),
            [
                "channelData = Array.from",
                "nodeGraphLiveSamplesForPlan",
                "nodeGraphEnsureLiveSamplesForPlan",
                "nodeGraphSampleStatusForNode",
                "nodeGraphSampleStatusElementForNode",
                "nodeGraphSampleNameElementForNode",
                "nodeGraphSamplePhaseElementForNode",
                "nodeGraphSamplePhaseForNode",
                "nodeGraphSamplePhaseCopyTextForNode",
                "copyNodeGraphSamplePhaseForNode",
                "nodeGraphSamplePhaseForNode(nodeId).toPrecision(17)",
                'copyPhaseButton.textContent = "📋"',
                'copyPhaseButton.setAttribute("aria-label", "Copy the current phase as a full precision number")',
                "data-sample-phase-for-node",
                "node-sample-phase-readout",
                "node-sample-copy-phase-button",
                "phaseValue.textContent = nodeGraphSamplePhaseForNode(nodeId).toFixed(4)",
                "setNodeGraphSampleStatus",
                "syncNodeGraphSampleDisplayForNode",
                "stopNodeGraphSampleControlEvent",
                "protectNodeGraphSampleControl",
                "nodeGraphSampleLoadErrorMessage",
                "loadNodeGraphSampleDataUrlForNode",
                "loadNodeGraphSamplePathForNode",
                "transcodeNodeGraphSampleDataUrl",
                "/api/audio-file/transcode-data-url",
                "browser decode failed; transcoding...",
                "/api/audio-file/data-url",
                "sampleLoadErrors",
                ".wav,.wave,.mp3,.ogg,.oga,.opus,.flac,.m4a,.aac",
                "file picker opened",
                "file selection changed",
                "no file selected",
                "loading ${file.name || \"audio\"}",
                "could not decode ${format}",
                "node-sample-file-picker",
                "node-sample-file-input",
                "picker.htmlFor = inputId",
                "input.id = inputId",
                "Load music file",
                "node-sample-path-loader",
                "node-sample-path-input",
                "Load Path",
                "pathInput.value.trim()",
                'setNodeGraphSampleStatus(nodeId, isMusicPlayer ? "choose music file" : "choose sample file")',
                "input.click()",
                "if (!isMusicPlayer) {",
                'pickerText.textContent = "Load Sample"',
                "protectNodeGraphSampleControl(pathButton)",
                "protectNodeGraphSampleControl(pathInput)",
                "normalizedNode.sample = { id: normalizeNodeGraphSampleId(node.sample?.id) }",
                "samples: typeof normalizeNodeGraphPatchSamples === \"function\"",
                "requiredAssets: typeof nodeGraphRequiredAssetsForPatch === \"function\"",
                'const nodeGraphAssetKinds = Object.freeze(["image", "video", "audio", "text", "meta", "app", "misc"])',
                "function normalizeNodeGraphAssetKind",
                "function normalizeNodeGraphAssetFile(file = {}, fallback = {})",
                "function normalizeNodeGraphAssetMetadata(metadata = {}, depth = 0)",
                "function normalizeNodeGraphRequiredAsset",
                "function nodeGraphRequiredAssetsForPatch",
                "function nodeGraphMissingSampleAssets",
                "function nodeGraphMissingSampleAssetsFingerprint",
                "function dismissNodeGraphMissingSampleAssetsDialog",
                "dismissedMissingSampleAssetsFingerprint",
                "function renderNodeGraphMissingSampleAssetsDialog",
                "function loadNodeGraphMissingSampleAssetFromPath",
                "nodeGraphMissingAssetSearchNames",
                "nodeGraphMissingAssetPrimaryNodeId",
                "resourceId",
                "function normalizeNodeGraphFileGridResourceRow",
                "metadataSummary",
                "thumbnailDataUrl",
                "function registerNodeGraphResources",
                "nodeGraphResourceById",
                "nodeGraphResourceByPath",
                "resourcePathMap",
                "nodeGraphSampleReferenceFromResource",
                "function nodeGraphSetAudioPlayerResource",
                "function nodeGraphAcceptFileGridSelection",
                "soemdsp-sandbox-file-grid-selection",
                "nodeGraphDataUrlForResource",
                "nodeGraphDataUrlForSampleReference(reference = {})",
                "loadNodeGraphResourceManifest",
                "saveNodeGraphWorkingPatchToUserSettings({ immediateFile: true, returnFileSave: true })",
                "renderNodeGraphMissingSampleAssetsDialog(nodeGraphMvp.patch)",
                "Browser storage was too small, so the patch was flushed to the settings file.",
                "node-missing-sample-assets-controls",
                "Search Path",
                "/api/audio-file/find",
                "sourcePath",
                "sourceName",
                "file",
                "metadata",
                "nodeIds",
                "missing sample:",
                "type === \"audioPlayer\" && key === \"transport\"",
                'node.type === "audioPlayer"',
                'patchNode?.type === "audioPlayer"',
                'node.type === "samplePlayer" || node.type === "sampleLooper" || node.type === "audioPlayer"',
            ],
        ),
        (
            "plan runtime",
            "\n".join([
                audio_player_contract_sources["execution plan"],
                audio_player_contract_sources["live plan"],
                audio_player_contract_sources["live runtime"],
                audio_player_contract_sources["patch runtime"],
                audio_player_contract_sources["state"],
            ]),
            [
                'type === "audioPlayer"',
                "plan.samples = typeof nodeGraphLiveSamplesForPlan === \"function\"",
                "runtime.samples = new Map",
                "samplePlaybackStates",
                "for (const type of Object.keys(nodeGraphModuleDefinitions || {}))",
                "sampleBuffers: new Map()",
                "await nodeGraphEnsureLiveSamplesForPlan(plan, nodeGraphMvp.patch)",
                'node-live-audio-worklet-core.js?v=',
                "phase: Number(message.audioPlayerPhase) || 0",
            ],
        ),
        (
            "rendering",
            "\n".join([
                audio_player_contract_sources["rendering"],
                audio_player_contract_sources["samples"],
                audio_player_contract_sources["sizing"],
                audio_player_contract_sources["styles"],
            ]),
            [
                'type === "samplePlayer" || type === "sampleLooper" || type === "audioPlayer"',
                '["samplePlayer", "sampleLooper", "audioPlayer"].includes(type)',
                'classes.push("sample-module-layout")',
                'classes.push("audio-player-layout")',
                "createNodeGraphSampleModuleBody",
                "node-module-interface-controls",
                "function nodeGraphModuleTypeHasInterfaceControls(type)",
                "function nodeGraphModuleInterfaceControlsHeightGu(type, ui = {})",
                "function nodeGraphPatchNodeInterfaceControlsHeightUnits(node)",
                'if (type === "audioPlayer")',
                "return 4;",
                ".node-sample-path-loader",
                ".sample-module-layout .node-sample-module-body",
                ".sample-module-layout .dsp-node-io-section",
                ".sample-module-layout .dsp-node-body",
                "clip-path: inset(50%)",
                'type === "audioPlayer"',
                '{ id: "interfaceControls", heightGu: nodeGraphModuleInterfaceControlsHeightGu(type, ui), visible: interfaceControlsVisible }',
                '"--node-module-interface-controls-height-units"',
                "--node-module-interface-controls-height",
                ".node-sample-phase-readout",
            ],
        ),
        (
            "phosphor waveform display",
            "\n".join([
                audio_player_contract_sources["patch normalizers"],
                audio_player_contract_sources["definitions"],
                audio_player_contract_sources["rendering"],
                audio_player_contract_sources["phosphor waveform"],
            ]),
            [
                'audioPlayer: {\n    layout: "phosphorWaveform"',
                'definition.layout === "phosphorWaveform"',
                'phosphorWaveform: "phosphor-waveform-layout"',
                "function createNodeGraphPhosphorWaveformDisplay",
                "function drawNodeGraphPhosphorWaveformDisplay",
                "function nodeGraphPhosphorWaveformSampleEntry",
                "function nodeGraphPhosphorWaveformZoomAt",
                "function nodeGraphPhosphorWaveformPanBy",
            ],
        ),
        (
            "phasor playback",
            "\n".join([audio_player_contract_sources["runtime"], audio_player_contract_sources["worklet"]]),
            [
                "function nodeGraphAudioPlayerSample",
                "audioPlayerSample(node, nodeId",
                "Trigger: done",
                "const normalizedNext = (nextPhase - startPhase) / span",
                "done = normalizedNext < 0 || normalizedNext >= 1 ? 1 : 0",
                'node?.type === "audioPlayer"',
                'nodeGraphInputKey(nodeId, "Phase")',
                'this.inputKey(nodeId, "Phase")',
                "state.playing = (transportPlayOnce || transportLooping) && !state.completed",
                "transportFallback",
                "transportMode",
                "transportLooping",
                "state.completed",
                "this.samplePlaybackStates = new Map();",
                "const hasMetadataRange = Number.isFinite(min) && Number.isFinite(max) && max > min",
                "return base + modulationSignal",
                "rangeKey",
                "state.sampleId !== sampleId",
                "state.rangeKey !== rangeKey",
                "currentPhase < startPhase || currentPhase > endPhase",
                "const speed = readParam(\"speed\", 1) + speedInput",
                "const speed = readParam(\"speed\", 1) + readInput(\"Speed\")",
                "speed < 0 && nextPhase <= startPhase",
                "const collapsedRange = Math.abs(end - start) <= 0.000001",
                "const startPhase = collapsedRange ? 0 : Math.min(start, end)",
                "const endPhase = collapsedRange ? 1 : Math.max(start, end)",
                "Phase: boundedPhase",
                "audioPlayerPhase: this.audioPlayerMeterPhase",
                "this.audioPlayerMeterPhase = boundedPhase",
                "clampNodeSliderValue(readInput(\"Phase\"), 0, 1)",
                "this.clampValue(readInput(\"Phase\"), 0, 1)",
                "sampleStereoAt",
            ],
        ),
    ]:
        for snippet in snippets:
            require(snippet in source_text, f"missing audio player {name} contract: {snippet}")
    require(
        "CSS.escape" not in audio_player_contract_sources["samples"],
        "sample loader should not depend on CSS.escape in the embedded browser",
    )
    require(
        "Load Music" not in audio_player_contract_sources["samples"],
        "music player should use the Load Path button for empty-path file picking",
    )
    sample_style_start = style_source.index(".node-sample-module-body")
    sample_style_end = style_source.index(".node-wiring-panel", sample_style_start)
    sample_style_source = style_source[sample_style_start:sample_style_end]
    for snippet in [
        "document.body.append(input)",
        "input.remove()",
        "input.hidden = true",
    ]:
        require(snippet not in audio_player_contract_sources["samples"], f"sample loader should use visible native input: {snippet}")
    require(
        "opacity: 0" not in sample_style_source,
        "sample file input should be visible, not transparent",
    )
    for snippet in [
        'parsed.path == "/api/audio-file/data-url"',
        "def audio_file_data_url(self) -> None:",
        'parsed.path == "/api/audio-file/find"',
        "def audio_file_find(self) -> None:",
        "def audio_search_candidate_matches(self, candidate: Path, target_names: set[str]) -> bool:",
        "MAX_AUDIO_SEARCH_VISITS",
        "audio file not found under search path",
        "SUPPORTED_AUDIO_FILE_SUFFIXES",
        "MAX_AUDIO_FILE_BYTES",
        "MAX_AUDIO_UPLOAD_JSON_BYTES",
        "MAX_AUDIO_TRANSCODE_BYTES",
        "def audio_file_transcode_data_url(self) -> None:",
        "def transcode_audio_file_to_wav(self, target: Path)",
        "tempfile.TemporaryDirectory",
        '"ffmpeg"',
        '"pcm_s16le"',
        "data:audio/wav;base64",
        "audio path must stay inside the user home folder",
        "base64.b64encode(content).decode('ascii')",
    ]:
        require(snippet in audio_player_contract_sources["server"], f"missing local audio path server contract: {snippet}")

    fallback_index = metadata_defaults_source.index("const fallbackNodeMetadataKindTemplates")
    fallback_waveform_index = metadata_defaults_source.index("waveform: {", fallback_index)
    fallback_waveform_end = metadata_defaults_source.index("bypass: {", fallback_waveform_index)
    fallback_waveform_source = metadata_defaults_source[fallback_waveform_index:fallback_waveform_end]
    for snippet in [
        "max: 5",
        "maxDigits: 3",
        "mid: 2",
        "min: 0",
    ]:
        require(snippet in fallback_waveform_source, f"fallback waveform metadata missing {snippet}")

    for snippet in [
        "nodeSceneImageLoad",
        "nodeSceneImageFileInput",
        'type="file"\n          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"',
        'bindNodeGraphSceneElementEvent("nodeSceneImageLoad"',
        'bindNodeGraphSceneElementEvent("nodeSceneImageFileInput"',
        "input.click();",
    ]:
        require(
            snippet not in index_source
            and snippet not in script_sources["./public/node-graph-context-menu.js"]
            and snippet not in script_sources["./public/node-graph-module-actions.js"]
            and snippet not in script_sources["./public/node-graph-scene-menu-event-bindings.js"],
            f"module actions should not expose native image file picker path: {snippet}",
        )

    for snippet in [
        'createNodeGraphPatchNode("audioPlayer", { id: "audioPlayer-1"',
        'createNodeGraphPatchNode("output", { id: "output"',
        'destinationNode: "output"',
        'sourceNode: "audioPlayer-1"',
        'sourcePort: "Left"',
        'sourcePort: "Right"',
        "nodes: nodeGraphDefaultNodeConfigs.map((node) => ({ ...node }))",
        "connections: nodeGraphDefaultConnections.map((connection) => ({ ...connection }))",
        "nodeGraphEmptyModuleButton",
        "openNodeGraphModuleShop(null)",
        "workspace?.classList.toggle(\"empty-patch\", visiblePatchNodeCount === 0)",
        "emptyButton.hidden = true",
        "nodeModuleShopView",
        "nodeSceneOpenModuleBrowser",
        "positionNodeSceneContextMenuHeaderAtPoint(",
        "createNodeGraphKeyboardControllerBody",
        "createNodeGraphMacroControlsBody",
        "createNodeGraphPitchModWheelBody",
        "createNodeGraphSpeakerProtectionBody",
        "refreshNodeGraphSpeakerProtectionBodies",
        "keyboard-controller-layout",
        "macro-controls-layout",
        "pitch-mod-wheel-layout",
        "speaker-protection-layout",
        "node-midi-keyboard-module",
        "node-macro-controls-module",
        "node-performance-wheels-module",
        "node-speaker-protection-body",
        "data-speaker-protection-status",
        "nodeGraphOriginMarker",
        "node-graph-origin-marker",
        "origin-marker-visible",
        "workspace.origin",
        "nodeGraphApplyTooltip(marker, \"workspace.origin\")",
        "World origin: X 0, Y 0",
        'nodeGraphRetiredNodeTypes.has(node?.type)',
        'const nodeGraphRetiredNodeTypes = new Set(["formulaVisual", "moduleHome", "moduleShop"])',
        "timing: {",
        "tempoBpm: 120",
        "timeSignatureDenominator: 4",
        "timeSignatureNumerator: 4",
        "view: { widthGu: 20, heightGu: 20, zoom: 1 }",
        "const nodeGraphDefaultPresetUrl = \"./public/presets/default.json\"",
        "defaultPatch: cloneNodeGraphPatch(nodeGraphDefaultPatch)",
        "async function loadNodeGraphDefaultPresetPatch()",
        "nodeGraphDefaultPresetPatchIsUsable(fetchedPatch)",
        "cloneNodeGraphPatch(nodeGraphDefaultPatch)",
        "function normalizeNodeGraphParamMetaForNode(type, paramMeta = {})",
        'type === "output" && metadata.volume',
        'kind: "decimal"',
        "min: 0",
        "max: 1",
        "const nodeGraphAudioBlockSize = 512",
        "const nodeGraphModuleDefinitions",
        "label: \"Volume\"",
        "key: \"volume\"",
        "defaultValue: \"0.1\"",
        "max: \"1\"",
        "mid: \"0.1\"",
        "osc: {",
        'inputs: ["Reset", "0.1V/Oct", "Increment"]',
        "outputAliases: {",
        'Out: "Wave Out"',
        'Noise: "Wave Out"',
        '"0.1V/Oct": "0.1V"',
        'Increment: "Inc."',
        '"Wave Out": "Wave"',
        'outputs: ["Saw", "Ramp", "Square", "Tri", "Sine", "Wave Out"]',
        "polyBlep: {",
        "additiveOsc: \"Additive Osc\"",
        "additiveOsc: {",
        'choices: ["Sine", "Sawtooth", "Square", "Triangle", "SawSquare", "DoubleSaw", "TriSaw", "Organ"]',
        'outputs: ["Out"]',
        'key: "harmonics"',
        'constraint: "cpu"',
        'max: "1024"',
        'key: "dampingFilterFrequency"',
        'label: "Filter Frequency"',
        'label: "Mod A"',
        'key: "harmonicPhaseAdd"',
        'label: "Phase Multiply"',
        "ellipsoid: \"Ellipsoid\"",
        "ellipsoid: {",
        'inputs: ["Reset", "0.1V/Oct", "Increment"]',
        'outputAliases: {',
        'Out: "Mono"',
        'Wave: "Mono"',
        '"Wave Out": "Mono"',
        'outputs: ["Mono", "X", "Y"]',
        'key: "offsetX"',
        'key: "shapeY"',
        'key: "scaleX"',
        "gain: {",
        "label: \"Amplitude\"",
        "bias: {",
        "defaultValue: \"0\"",
        "key: \"offset\"",
        "max: \"1\"",
        "min: \"-1\"",
        "rotate3dTo2d: \"Rotation 3D to 2D\"",
        "rotate3dTo2d: {",
        'inputs: ["X", "Y", "Z"]',
        'outputs: ["X", "Y"]',
        'key: "rotateX"',
        'key: "rotateY"',
        'key: "rotateZ"',
        "macroKnob: \"Macro Knob\"",
        "bipolarKnob: \"Bipolar Knob\"",
        "macroKnob: {",
        'layout: "knobWidget"',
        'key: "value"',
        "bipolarKnob: {",
        "valueSlider: \"Value Slider\"",
        "valueSlider: {",
        'layout: "sliderWidget"',
        'outputs: ["Bias"]',
        'label: "Bias"',
        "passiveFilter: \"Passive Filter\"",
        "passiveFilter: {",
        'choices: ["LP", "BP", "HP"]',
        "slewLimiter: \"Up/Down Slew\"",
        "slewLimiter: {",
        "key: \"upTime\"",
        "key: \"downTime\"",
        "clock: \"Clock\"",
        "clock: {",
        'inputs: ["Reset"]',
        'Out: "Digital Out"',
        '"Analog Out": "\\u223F"',
        '"Digital Out": "\\u25AE"',
        'outputs: ["Digital Out", "Analog Out", "Pulse"]',
        "key: \"phase\"",
        "clockDivider: \"Clock Divider\"",
        "clockDivider: {",
        'inputs: ["Clock", "Reset"]',
        "key: \"duty\"",
        "delayedTrigger: \"Delayed Trigger\"",
        "delayedTrigger: {",
        "key: \"delay\"",
        "randomClock: \"Random Clock\"",
        "randomClock: {",
        'outputs: ["Trigger", "Gate"]',
        "key: \"minSeconds\"",
        "key: \"maxSeconds\"",
        "triggerCounter: \"Trigger Counter\"",
        "triggerCounter: {",
        "key: \"countMax\"",
        "triggerDivider: \"Trigger Divider\"",
        "triggerDivider: {",
        "key: \"division\"",
        "key: \"pulseTime\"",
        "stepSequencer: \"Step Sequencer\"",
        "stepSequencer: {",
        'inputs: ["Trigger", "Reset"]',
        'outputs: ["Out", "Gate"]',
        "key: \"step8\"",
        'key: "lowFrequency"',
        'key: "highFrequency"',
        "ladderFilter: {",
        "cookbookFilter: \"Multi Stage Filter\"",
        "cookbookFilter: {",
        'layout: "filterCurve"',
        'inputs: ["In", "Left", "Right"]',
        'outputs: ["Out", "Left", "Right"]',
        "choices: nodeGraphCookbookFilterModes",
        'key: "mode"',
        'key: "frequency"',
        'key: "stages"',
        'key: "q"',
        'key: "gain"',
        "ladderFilter: \"Ladder Filter\"",
        "ladderFilter: {",
        "const nodeGraphLadderFilterModes = Object.freeze",
        "choices: nodeGraphLadderFilterModes",
        'key: "resonance"',
        "sampleHold: \"Sample & Hold\"",
        "sampleHold: {",
        "midiOut: \"Midi Out\"",
        "midiOut: {",
        'inputs: ["MIDI Number"]',
        'outputs: ["Normalized", "Full Value"]',
        "key: \"midiNumber\"",
        "label: \"MIDI Number\"",
        "max: \"127\"",
        "step: \"1\"",
        "midiNotePitch: \"Midi Note Pitch\"",
        "keyboardController: \"MIDI Keyboard\"",
        "macroControls: \"Macro Controls\"",
        "pitchModWheel: \"Pitch / Mod Wheel\"",
        "midiNotePitch: {",
        'inputs: ["MIDI Note", "Octave Offset", "Pitch Offset"]',
        '"Semitone Offset": "Pitch Offset"',
        'outputs: ["Pitch 0-1", "Pitch 0-127", "Frequency"]',
        "keyboardController: {",
        'inputs: ["MIDI Note", "Gate", "Velocity", "Octave", "Reset", "Hold", "X", "Y"]',
        'layout: "keyboardController"',
        'outputs: ["Gate", "1 Sample Gate", "Key", "Q", "MIDI", "Double", "0.1V/Oct", "Increment", "Frequency", "Pitch", "X", "Y"]',
        "macroControls: {",
        'inputs: ["M1 In", "M2 In", "M3 In", "M4 In", "M5 In", "M6 In", "M7 In", "M8 In", "M9 In", "M10 In", "Reset"]',
        'layout: "macroControls"',
        'outputs: ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9", "M10"]',
        "pitchModWheel: {",
        'inputs: ["Pitch", "Mod", "Reset"]',
        'layout: "pitchModWheel"',
        'outputs: ["Pitch Wheel", "Mod Wheel"]',
        "expAdsr: \"Exp ADSR\"",
        "expAdsr: {",
        'inputs: ["Gate"]',
        "key: \"attackShape\"",
        "key: \"releaseShape\"",
        "choices: [\"Off\", \"On\"]",
        "linearEnvelope: \"Linear Envelope\"",
        "linearEnvelope: {",
        "key: \"sustain\"",
        "pluckEnvelope: \"Pluck Envelope\"",
        "pluckEnvelope: {",
        "key: \"attackFeedback\"",
        "key: \"decayModFrequency\"",
        "key: \"autoReleaseTime\"",
        "vactrolEnvelopeSeries: \"VTL5C Series\"",
        "vactrolEnvelopeCustom: \"Roll Your Own Vactrol\"",
        "vactrolEnvelopeSeries: {",
        'inputs: ["Light"]',
        "key: \"darkCurrent\"",
        "flowerChildEnvelopeFollower: \"FlowerChild Envelope Follower\"",
        "flowerChildEnvelopeFollower: {",
        'inputs: ["In"]',
        "key: \"hold\"",
        "sandboxVisuals: \"Screen Visuals\"",
        "screenSpaceShader: \"Screen Space Shader\"",
        "screenSpaceShader: {",
        'layout: "screenSpaceShader"',
        "bloomGlow: \"Bloom & Glow\"",
        "rgbaHsla: \"RGBA / HSLA\"",
        "chromaColor: \"Chroma Color\"",
        "image: \"Image\"",
        "canvas: \"Canvas\"",
        "visualOscilloscope: \"Display\"",
        "sandboxVisuals: {",
        'bufferedInputs: ["Shake", "X", "Y", "Dim", "Red", "Green", "Blue", "Scope Off", "Pause"]',
        'displayType: "trace"',
        'inputs: ["Shake", "X", "Y", "Dim", "Red", "Green", "Blue", "Scope Off", "Pause", "Trace Image"]',
        "inputAliases: {",
        '"Screen Shake": "Shake"',
        '"Screen Dim": "Dim"',
        '"Turn Off Display Traces": "Scope Off"',
        '"Pause Displays": "Pause"',
        '"Trace Texture": "Trace Image"',
        "visualInputs: [",
        'key: "screenShake"',
        'label: "Shake"',
        'port: "Shake"',
        'key: "x"',
        'port: "X"',
        'key: "y"',
        'port: "Y"',
        'key: "screenDim"',
        'label: "Dim"',
        'port: "Dim"',
        'key: "red"',
        'port: "Red"',
        'key: "green"',
        'port: "Green"',
        'key: "blue"',
        'port: "Blue"',
        'key: "scopeTracesOff"',
        'label: "Scope Off"',
        'port: "Scope Off"',
        'key: "scopePaused"',
        'label: "Pause"',
        'port: "Pause"',
        'key: "traceImage"',
        'label: "Trace Image"',
        'port: "Trace Image"',
        "visualSink: true",
        "bloomGlow: {",
        'displayType: "dot"',
        'key: "screenDim"',
        'label: "Dim"',
        'key: "visualBrightness"',
        'label: "Brightness"',
        'key: "visualBloom"',
        'label: "Bloom"',
        'key: "visualGlow"',
        'label: "Glow"',
        "rgbaHsla: {",
        'bufferedInputs: ["Red", "Green", "Blue", "Hue", "Saturation", "Lightness", "HSL Mix", "Alpha"]',
        'displayType: "trace"',
        'inputs: ["Red", "Green", "Blue", "Hue", "Saturation", "Lightness", "HSL Mix", "Alpha"]',
        '"Screen Alpha": "Alpha"',
        'key: "hslMix"',
        'label: "HSL Mix"',
        'port: "HSL Mix"',
        "chromaColor: {",
        'displayType: "dot"',
        'key: "chromaHue"',
        'label: "Hue"',
        "wraparound: true",
        'key: "chromaSaturation"',
        'label: "Chroma"',
        'key: "chromaLightness"',
        'label: "Light"',
        'key: "chromaAlpha"',
        'label: "Alpha"',
        'key: "chromaDrift"',
        'label: "Drift"',
        'key: "chromaSpread"',
        'label: "Spread"',
        'key: "visualBrightness"',
        'label: "Trace Brightness"',
        'key: "visualBloom"',
        'label: "Bloom"',
        'key: "visualGlow"',
        'label: "Glow"',
        "image: {",
        'layout: "image"',
        'Image: "RGBA"',
        'outputs: ["RGBA"]',
        "canvas: {",
        'bufferedInputs: ["a_buffer"]',
        'inputs: ["a_buffer", "a not buffer"]',
        'layout: "canvas"',
        'outputs: ["RGBA"]',
        'key: "canvasABuffer"',
        'label: "a_buffer"',
        'port: "a_buffer"',
        'key: "canvasANotBuffer"',
        'label: "a not buffer"',
        'port: "a not buffer"',
        "canvas.background = #00000000;",
        "canvas.layout = oscilloscope;",
        "canvas.grid(7, 12);",
        "canvas.face.background = checkerboard;",
        "canvas.face.screen = #000000;",
        'bufferInput("a_buffer")',
        'input("a not buffer")',
        'outputs: ["RGBA"]',
        "function parseNodeGraphCanvasScriptGrid",
        "function parseNodeGraphCanvasScriptFace",
        "function parseNodeGraphCanvasScriptLayout",
        "function parseNodeGraphCanvasScriptRatio",
        "function reduceNodeGraphCanvasScriptRatio",
        "function normalizeNodeGraphCanvasScriptHexColor",
        "function nodeGraphCanvasScriptColorIsTransparent",
        "function parseNodeGraphCanvasScriptBufferedInputs",
        "function parseNodeGraphCanvasScriptInputs",
        "aspectRatio: ratio.aspectRatio",
        "faceBackground: face.background",
        "faceFit: face.fit",
        "faceScreen: face.screen",
        "gridHeightGu: grid.heightGu",
        "gridWidthGu: grid.widthGu",
        "inputs: parseNodeGraphCanvasScriptInputs(normalizedSource)",
        "inputs: model.inputs",
        "layout: parseNodeGraphCanvasScriptLayout(normalizedSource)",
        "layout: model.layout",
        "ratioHeight: model.ratioHeight",
        "ratioWidth: model.ratioWidth",
        "function nodeGraphPatchNodeLayout(node)",
        "function nodeGraphPatchNodeCanvasScriptGridUnits(node)",
        "return normalizeNodeGraphCanvasScript(patchNode.canvasScript).inputs;",
        "function nodeGraphPatchNodeVisualInputs(node)",
        "return nodeGraphPatchNodeInputPorts(patchNode).map((port) => ({",
        "return normalizeNodeGraphScreenSpaceShader(patchNode.screenSpaceShader).visualInputs;",
        "inputs: nodeGraphPatchNodeVisualInputs(node).map((input) => ({",
        "function nodeGraphPatchNodeBufferedInputs",
        "? normalizeNodeGraphScreenSpaceShader(node.screenSpaceShader).bufferedInputs",
        "bufferSampleLimit: nodeGraphBufferedInputSampleLimit",
        "input?.buffered",
        "writeVisualInputBufferSample",
        "writeNodeGraphVisualInputBufferSample",
        "visualOscilloscope: {",
        'bufferedInputs: ["In", "X", "Y"]',
        'inputAliases: { Mono: "In" }',
        'inputLabels: { In: "Mono" }',
        'outputs: ["RGBA"]',
        'inputs: ["In", "X", "Y"]',
        'layout: "visualScope"',
        'key: "visualOscilloscope"',
        'label: "Mono"',
        'port: "In"',
        'key: "visualOscilloscopeX"',
        'label: "X"',
        'port: "X"',
        'key: "visualOscilloscopeY"',
        'label: "Y"',
        'port: "Y"',
        'traceDisplay: "1D Trace"',
        '"traceDisplay"',
        "traceDisplay: {",
        'bufferedInputs: ["In"]',
        'layout: "traceDisplay"',
        'key: "traceDisplay"',
        "drawNodeGraphTraceDisplayItem",
        'displayType: "trace"',
        "function nodeGraphModuleDisplayTypeForSlot(slot)",
        "function nodeGraphModuleDisplayRendererForSlot(slot)",
        'nodeGraphModuleDisplayRendererForSlot(slot) === "trace"',
        "nodeGraphTraceDisplaySettingsDefaults",
        "normalizeNodeGraphTraceDisplaySettings",
        "nodeGraphTraceDisplaySettingsForSlot",
        "function nodeGraphModuleDisplayTypeHasLocalSettings(displayType)",
        "function nodeGraphNodeHasLocalDisplaySettings(node)",
        "function nodeGraphNodeCanOpenDisplaySettings(node)",
        "nodeGraphPatchNodeHasHideableOscilloscope(node)",
        "function nodeGraphTraceDisplayVisibleSamples",
        "function nodeGraphTraceDisplayBufferView",
        "nodeTraceDisplaySettingsPopover",
        "nodeTraceDisplaySettingsDefaults",
        "nodeTraceDisplaySourceSync",
        "nodeTraceDisplayBrightness",
        "nodeTraceDisplayColor",
        "openNodeGraphTraceDisplaySettings",
        "function nodeGraphTraceDisplaySettingsOpenPosition(popover, sharedInspectorState = {}, replacementRect = null, event = {})",
        "nodeGraphFloatingWindowPosition(popover, x, y",
        "function nodeGraphTraceDisplaySettingsTargetLabel(node)",
        "nodeGraphPatchNodeTitle(node)",
        "if (!nodeGraphNodeCanOpenDisplaySettings(node))",
        "function cloneNodeGraphTypedDisplaySettings(node)",
        'if (displayType === "scope2d")',
        "traceDisplaySettings: normalizeNodeGraphScope2dSettings(node.traceDisplaySettings)",
        "...cloneNodeGraphTypedDisplaySettings(node)",
        'renderer === "trace") {\n    buffer = prepareNodeGraphTraceDisplayBuffer(\n      capturedBuffer,\n      nodeGraphTraceDisplaySettingsForSlot(slot),\n    );',
        '"traceDisplaySettings"',
        'traceDisplaySettings: "nodeTraceDisplaySettingsPopover"',
        "const nodeGraphSharedInspectorWindowKeys = Object.freeze([",
        '"moduleActions",\n  "metaparameters",\n  "traceDisplaySettings"',
        "function nodeGraphWorkspaceStatesWithSharedInspectorGeometry",
        "function syncNodeGraphSharedInspectorGeometry",
        "const sharedInspectorState = typeof normalizeNodeGraphSharedInspectorWindowState === \"function\"",
        "applyNodeGraphTraceDisplaySettingsWindowSize(sharedInspectorState.size)",
        "function nodeGraphModuleVisualInputs(type)",
        "function nodeGraphCanonicalInputPort(type, port)",
        "function nodeGraphCanonicalOutputPort(type, port)",
        "function nodeGraphModuleVisualInputKey(type, port)",
        "badvalMonitor: \"BADVAL Monitor\"",
        "badvalMonitor: {",
        "monitorSink: true",
        'inputs: ["In"]',
        'outputs: ["Out"]',
        "speakerProtection: \"Speaker Protection\"",
        "speakerProtection: {",
        'layout: "speakerProtection"',
        'inputs: ["In", "Left", "Right"]',
        'outputs: ["Out", "Left", "Right"]',
        "label: \"Frequency\"",
        "maxDigits: 5",
        "osc: {",
        "defaultValue: \"1\"",
        "max: \"1\"",
        "mid: \"0.5\"",
        "step: \"any\"",
        "defaultValue: \"1\"",
        "maxDigits: 5",
        "noiseGenerator: \"Noise Generator\"",
        "noiseGenerator: {",
        "choices: [\"Uniform\", \"Gaussian\", \"Brown\", \"Pink\", \"Crackle\"]",
        "randomWalk: \"Random Walk\"",
        "randomWalk: {",
        "choices: [\"White\", \"Filtered\", \"Random Steps\", \"Fixed Steps\"]",
        "fractalBrownianNoise: \"Fractal Brownian Noise\"",
        "fractalBrownianNoise: {",
        'outputs: ["Out X", "Out Y", "Out Z"]',
        "key: \"octaves\"",
        "key: \"persistence\"",
        "key: \"scale\"",
        "key: \"seed\"",
        "max: \"1\"",
        "mid: \"0.5\"",
        "nonlinearSlider: false",
        "step: \"any\"",
        "spiral: \"Spiral\"",
        "spiral: {",
        "lorenzAttractor: \"Lorenz Attractor\"",
        "lorenzAttractor: {",
        'inputs: ["Reset"]',
        'outputs: ["X", "Y", "Z"]',
        'unboundedMax: true',
        "key: \"sigma\"",
        "key: \"rho\"",
        "key: \"beta\"",
        "key: \"zDepth\"",
        "textBox: \"Text Box\"",
        "textBox: {",
        "layout: \"textBox\"",
        "normalizeNodeGraphTextBoxLayout",
        "const nodeGraphImageLayoutKind = \"image\"",
        "function normalizeNodeGraphImageLayout(layout = {})",
        "function createNodeGraphImageBody(nodeId)",
        "function nodeGraphTraceImageDataUrl()",
        "loadNodeGraphImageFromContext",
        "saveNodeGraphImageFromContext",
        "refreshNodeGraphImageFromContext",
        "handleNodeGraphImageFileInputChange",
        'outputs: ["X", "Y", "Z"]',
        "sharpCurveMult",
        "key: \"waveform\"",
        "nodeOscWaveform",
        "choices: [\"Saw\", \"Ramp\", \"Square\", \"Triangle\", \"Sine\", \"Noise\"]",
        "const nodeGraphOutputInputPorts",
        'inputs: ["Mono", "Left", "Right"]',
        'Object.freeze(["Mono", "Left", "Right"])',
        "const nodeGraphDefaultNodeConfigs",
        "params: nodeGraphDefaultParamsForType",
        "const nodeGraphZoomLimits",
        "max: 50",
        "min: 0.1",
        "buttonRatio: 1.12",
        "fineRatio: 1.05",
        "quarterRatio: 1.08",
        "wheelRatio: 1.12",
        "const fallbackNodeMetadataKindTemplates",
        "let nodeMetadataKindTemplates = Object.freeze(Object.fromEntries(",
        'amplitude: { def: 1, label: "Amplitude"',
        'label: "Decibels"',
        'decimal_bipolar: {',
        'frequency: { def: 440, label: "Frequency"',
        "frequency: { def: 440, label: \"Frequency\", linearSmoothing: true, max: 20000, maxDigits: 5, mid: 440, min: 0, step: 0",
        'phase: {',
        'label: "Phase"',
        'wraparound: true',
        'descrete: { def: 0, label: "Descrete"',
        'integer_bipolar: {',
        'label: "Integer Bipolar"',
        'waveform: {',
        'bypass: {',
        'plusminus: {',
        'onoff: {',
        'momentary: {',
        'unit: "dB"',
        "const nodeMetadataKindAliases",
        "function normalizeNodeMetadataKind(kind)",
        "function applyNodeMetadataKindTemplates(templates)",
        "typeof syncNodeMetadataScriptReference === \"function\"",
        "async function loadNodeMetadataKindTemplates()",
        'fetch("/api/node-metadata-kinds"',
        "function normalizeNodeGraphPatchInfo(info = {})",
        "function normalizeNodeGraphPatchAudio(audio = {})",
        "targetSampleRate: Number.isFinite(targetSampleRate)",
        "function nodeGraphBaseSampleRate()",
        "function nodeGraphTargetSampleRate(patch = nodeGraphMvp.patch)",
        "const nodeGraphOversamplingPresets = Object.freeze([1, 2, 4])",
        "function nodeGraphOversamplingMultiplier(baseRate, targetRate)",
        "Math.min(4, target / base)",
        "function nodeGraphOversamplingPresetForRatio(ratio)",
        'return "custom"',
        "function nodeGraphTargetSampleRateForOversampling(multiplier, baseRate = nodeGraphBaseSampleRate())",
        "function nodeGraphEffectiveSampleRate(baseRate, multiplier)",
        "function nodeGraphFormatSampleRate(sampleRate)",
        "function nodeGraphFormatOversamplingRatio(ratio)",
        "function nodeGraphAudioDerivation(patch = nodeGraphMvp.patch)",
        "clampedEngineSampleRate",
        "outputSampleRate",
        "oversamplingRatio",
        "function nodeGraphTemporaryPrefilterForResample(samples, sourceRate, outputRate)",
        "function nodeGraphResampleLinear(samples, outputFrames)",
        "function nodeGraphResampleRenderedChannel(samples, sourceRate, outputRate, outputFrames)",
        "function normalizeNodeGraphPatchVisual(visual = {})",
        "function normalizeNodeGraphPatchWindows(windows = {})",
        "function normalizeNodeGraphWindowPosition(position = {})",
        "left: Number.isFinite(left) ? left : null",
        "top: Number.isFinite(top) ? top : null",
        "function syncNodeGraphSettingsView()",
        "function readNodeGraphSettingsView()",
        "function readNodeGraphAudioSettingsView()",
        "function readNodeGraphVisualSettingsView()",
        "audio: normalizeNodeGraphPatchAudio(patch.audio)",
        "visual: normalizeNodeGraphPatchVisual(patch.visual)",
        "windows: normalizeNodeGraphPatchWindows(patch.windows)",
        "nodePatchNameHeader",
        "nodePatchTagsHeader",
        "const nodeGraphTapTempoState",
        "function createNodeGraphTapTempoButton()",
        "function handleNodeGraphTapTempo()",
        "node-header-tap-tempo-button",
        "button.addEventListener(\"click\", (event) =>",
        "createNodeGraphTapTempoButton(),",
        "Tap tempo for patch BPM",
        "status: \"tap tempo synced\"",
        "function handleNodeGraphHeaderInfoInput(event)",
        "dataset?.patchHeaderInfoField",
        'field.addEventListener("input", handleNodeGraphHeaderInfoInput)',
        "function handleNodeGraphSettingsInput(event)",
        "patch.audio = readNodeGraphAudioSettingsView()",
        'field.addEventListener("input", handleNodeGraphSettingsInput)',
        "function commitNodeGraphSettingsHistory()",
        "settings saved",
        "info: normalizeNodeGraphPatchInfo(patch.info)",
        "const nodeGraphWireInteractions = window.createNodeGraphWireInteractionController({",
        "helpers: nodeGraphWireHelpers",
        "function createNodeGraphWireInteractionController(deps)",
        "if (event.button !== 0) {\n    return;",
        "function endpointHitboxClientRect(endpoint, hitboxElement = null)",
        "const rect = element.getBoundingClientRect()",
        "const portDiameter =",
        "const patchPointRatio =",
        "const patchPointSize =",
        'if (!element.classList.contains("connected-port") || patchPointSize <= 0)',
        "nodeGraphElementPatchPointClientCenter(element, endpoint.io)",
        'element.classList.contains("node-param-port")',
        "function patchPointTargetFromPoint(clientX, clientY)",
        "nodeGraphElementPatchPointClientCenter(visualElement, endpoint.io)",
        'document.querySelectorAll(".node-port, .node-io-row, .node-param-port.modulation-input, .node-param-port.graph-input")',
        "function handlePatchPointHover(event)",
        'target.closest?.(".node-port, .node-io-row, .node-param-port.modulation-input, .node-param-port.graph-input")',
        "patch-point-hover",
        "function straightPath(from, to)",
        "pathData: explicitPathData = null",
        "function createGradient(svg, id, from, to",
        "function drawPath(svg, options)",
        "function nodeGraphSelfTraceModuleRect(nodeId)",
        "function nodeGraphSelfTracePoints(wire, from, to)",
        "function nodeGraphBackwardTracePoints(wire, from, to)",
        "to.x >= from.x",
        "const sourceSideX = Math.max(from.x + distance, sourceRect.right + distance)",
        "const destinationSideX = Math.min(to.x - distance, destinationRect.left - distance)",
        'node.querySelector(".node-header-title-row")?.getBoundingClientRect()',
        "const distance = Math.max(nodeGraphGridWidth(), nodeGraphGridHeight()) * 0.75",
        "const outX = from.x + fromDirection * distance",
        "const aboveY = Math.max(0.5, rect.top - distance)",
        "const belowTitleY = Math.max(to.y, rect.titleBottom + 0.5)",
        "{ x: outX, y: from.y }",
        "{ x: outX, y: aboveY }",
        "{ x: destinationSideX, y: aboveY }",
        "{ x: destinationSideX, y: belowTitleY }",
        "function nodeGraphManualTracePathOptions(wire, from, to)",
        "nodeGraphBackwardTracePoints(wire, from, to)",
        "nodeGraphTracePathFromPoints(from, tracePoints, to)",
        "wireType: nodeGraphWireTypes.trace",
        "function animateDestroyedWire(from, to)",
        "path.setAttribute(\"d\", helpers.straightPath(from, to))",
        "animateDestroyedWire(from, to)",
        "deps.burstZap(from)",
        "deps.burstZap(to)",
        "function connectNodeGraphPorts(",
        "function nodeGraphAutoPairPortConnections(",
        "function nodeGraphEquivalentStereoPortName(port)",
        "function nodeGraphStereoPairSiblingPort(port)",
        "nodeGraphEquivalentStereoPortName(sourcePort) !== \"left-x\"",
        "nodeGraphEquivalentStereoPortName(destinationPort) !== \"left-x\"",
        "return \"Y\";",
        "return \"Right\";",
        "wire connected +${autoConnected}",
        "triggerNodeGraphWireConnectEvent(\"signal\")",
        "function connectNodeGraphModulation(",
        "triggerNodeGraphWireConnectEvent(\"modulation\")",
        "triggerNodeGraphWireConnectEvent(\"graph\")",
        "function nodeGraphConnectionOptionsWithSelfTrace(sourceNode, destinationNode, options = {})",
        "sourceNode !== destinationNode || options.wireType || options.tracePoints?.length",
        "function disconnectNodeGraphConnection(index, kind = \"signal\")",
        "let removed = false;",
        "triggerNodeGraphWireDisconnectEvent(kind)",
        "triggerNodeGraphWindowReopenEvent(element.id || element.dataset?.windowKey || \"floating-window\")",
        "selection.index > index",
        "setNodeGraphSelection({ ...selection, index: selection.index - 1 })",
        "Render current patch sample",
        "Render blocked: ${validation.issues.join(\", \")}",
        "function createNodeSliderReadout(slider)",
        "function updateNodeSliderCurrentValue(slider, rawValue)",
        "function syncNodeGraphPatchParameterFromSlider(slider, options = {})",
        "nodeGraphGraphEndpointYLockEnabledForNode(patchNode)",
        "patchNode.graph = nodeGraphGraphWithLockedEndpointY(patchNode.graph)",
        "setNodeGraphPatchDirtyState(\"edited\")",
        "if (options.deferUi)",
        "function syncNodeSliderReadout(slider)",
        "function syncNodeGraphSliderReadouts()",
        "function limit_decimals(",
        "function formatNodeSliderNumber(value, options = {})",
        "function parseNodeSliderMathExpression(text)",
        "parseExpression()",
        'operator === "*" ? value * right : value / right',
        "nodeSliderNumberFormatSmokeCases",
        '{ value: 1456.6982, maxDigits: 5, expected: "1456.7" }',
        '{ value: 220, maxDigits: 5, expected: "220.00" }',
        '{ value: 1, maxDigits: 3, expected: "1.00" }',
        '{ value: 12.34567, maxDigits: 5, expected: "12.346" }',
        '{ value: 0.123456, maxDigits: 5, expected: "0.1235" }',
        '{ value: -0.123456, maxDigits: 5, expected: "-0.1235" }',
        '{ value: 0.123456, maxDigits: 5, showSign: true, expected: "+0.1235" }',
        '{ value: 0.123456, maxDigits: 5, reserveSignSpace: true, expected: " 0.1235" }',
        "function parseNodeMetadataChoices(value)",
        "function formatNodeMetadataChoices(choices)",
        "function nodeSliderShouldDisplayChoices(slider)",
        "function nodeSliderShouldDivideChoicesVisibly(slider)",
        "function nodeSliderShouldUseLinearSmoothing(slider)",
        "function nodeSliderShouldWraparound(slider)",
        "function nodeSliderChoiceLabel(slider)",
        "function nodeSliderChoiceIndexFromText(slider, value)",
        "prefixMatches.length === 1",
        "function nodeSliderShouldShowSign(slider)",
        "function nodeSliderElementLayoutWidth(element)",
        "function nodeSliderElementLayoutHeight(element)",
        "function nodeSliderElementVisualScale(element)",
        "const x = (clientX - rect.left) / scale",
        "function nodeSliderMetadata(slider)",
        "function formatNodeSliderMetadataTooltip(slider)",
        "reserveSignSpace",
        "showPlusMinus",
        "divideChoicesVisibly",
        "function normalizeNodeMetadataKindTemplate(template = {}, kind = \"decimal\")",
        "function normalizeNodeGraphMetadataMaxDigits(value, kind = \"decimal\")",
        "maxDigits",
        "Boolean(choices.length)",
        "linearSmoothing",
        "wraparound",
        "function syncNodeSliderMetadataTooltip(slider)",
        "function nodeSliderDebugPath(slider)",
        "function nodeGraphNodeType(node)",
        "function nodeGraphReadNodeNumber(node, key)",
        'input[data-param="${CSS.escape(key)}"]',
        "function nodeGraphDefaultParamsForType(type)",
        "function nodeGraphZoom()",
        "function nodeGraphZoomSurface()",
        "function nodeGraphGraphRect()",
        "videoViewVisible: false",
        "function renderNodeGraphMacroControls()",
        "function bindNodeGraphMacroControlModuleEvents()",
        "function bindNodeGraphKeyboardControllerModuleEvents()",
        "function renderNodeGraphKeyboardControllerModules()",
        "bindNodeGraphMacroControlModuleEvents();",
        "renderNodeGraphKeyboardControllerModules();",
        "function renderNodeGraphVideoViewToggle()",
        "function toggleNodeGraphVideoView()",
        "document.getElementById(\"nodeVideoViewButton\")?.addEventListener(\"click\", toggleNodeGraphVideoView)",
        "document.getElementById(\"nodeVideoViewPanel\")",
        "function nodeGraphGridWidth()",
        "function nodeGraphGridHeight()",
        "function nodeGraphCameraAspectRatio(camera)",
        "function nodeGraphCameraWithAspectFromCenter(camera, previousCamera)",
        "function nodeGraphCameraCloneWireSvg(liveSvg)",
        "nodeGraphDefaultPresetPatchIsUsable",
        "node-camera-preview-wire-svg",
        "clone.setAttribute(\"viewBox\", viewBox)",
        "function nodeGraphSnapCameraPoint(point)",
        "function handleNodeGraphCameraResolutionChange()",
        "function applyNodeGraphZoom()",
        "syncNodeGraphSliderReadouts();",
        "scheduleNodeGraphModuleScopeDraw();",
        "function setNodeGraphZoom(nextZoom, anchor = null)",
        "function clampNodeGraphZoom(value)",
        "Math.exp(Math.max(minLog, Math.min(maxLog, Math.log(safeZoom))))",
        "function nodeGraphZoomRatioBySteps(steps, baseRatio = nodeGraphZoomLimits.wheelRatio)",
        "function nodeGraphZoomButtonRatio(event)",
        "function nodeGraphWheelZoomSteps(event)",
        "function nodeGraphZoomBySteps(steps, anchor = null, baseRatio = nodeGraphZoomLimits.wheelRatio)",
        "x: Number(nextPan.x) || 0",
        "y: Number(nextPan.y) || 0",
        "function zoomNodeGraphBy(delta)",
        "function zoomNodeGraphAt(delta, clientX, clientY)",
        "function handleNodeGraphWorkspaceWheel(event)",
        '.addEventListener("wheel", handleNodeGraphWorkspaceWheel, { passive: false })',
        "const nodeGraphGrid",
        "const nodeGraphPatchFormat",
        "soemdsp-sandbox-node-patch",
        "const nodeGraphDefaultPatch",
        "activeCameraId: \"camera-1\"",
        "cameras: [",
        "midiTrigger: null",
        "resolutionHeight",
        "resolutionWidth",
        "function normalizeNodeGraphPatchCameras(cameras = [], activeCameraId = \"\")",
        "function normalizeNodeGraphCameraMidiTrigger(trigger = null)",
        "bypassedNodes: []",
        "view: { widthGu: 20, heightGu: 20, zoom: 1 }",
        "function cloneNodeGraphPatch(patch)",
        "activeCameraId: cameraState.activeCameraId",
        "cameras: cameraState.cameras",
        "bypassedNodes: Array.isArray(patch.bypassedNodes) ? [...patch.bypassedNodes] : []",
        "movementLocked: Boolean(source.movementLocked)",
        "format: { ...(patch.format || nodeGraphPatchFormat) }",
        "function cloneNodeGraphParamMeta(paramMeta = {})",
        "paramMeta: cloneNodeGraphParamMeta(node.paramMeta)",
        "function nodeGraphDefaultParamMetaForType(type)",
        "function createNodeGraphPatchNode(type, options = {})",
        "node.widthGu = normalizeNodeGraphModuleWidthUnits(type, options.widthGu)",
        "node.canvasScript = normalizeNodeGraphCanvasScript(options.canvasScript)",
        "!Object.hasOwn(options, \"ui\")",
        "{ buttonsHidden: true }",
        "!Object.hasOwn(node, \"ui\")",
        "patch.nodes.push(createNodeGraphPatchNode(type",
        "function normalizeNodeGraphPatchParameterMetadata(type, key, metadata = {})",
        "tooltip: String(parameter.tooltip || \"\").slice(0, 240)",
        "\"tooltip\"",
        "param.${key}.tooltip",
        "metadataTooltipValue",
        "function nodeGraphGridSnapOffset()",
        "return 6;",
        "function normalizeNodeGraphPatchView(view = {})",
        "function normalizeNodeGraphPatchViewZoom(value)",
        "zoom: normalizeNodeGraphPatchViewZoom(view?.zoom)",
        "function normalizeNodeGraphPatchGrid(grid = {})",
        "grid: normalizeNodeGraphPatchGrid(patch.grid)",
        "patch.grid = readNodeGraphGridSettingsView()",
        "nodeScriptGridWidthPxValue",
        "nodeScriptGridHeightPxValue",
        "[data-patch-grid-field]",
        "function withNodeGraphWorkspaceContentAnchored(workspace, update)",
        "function nodeGraphWorkspaceChromeSize(axis)",
        '["borderLeftWidth", "borderRightWidth", "paddingLeft", "paddingRight"]',
        "function nodeGraphWorkspaceWidthCss(widthPx)",
        "function nodeGraphWorkspaceHeightCss(heightPx)",
        "function nodeGraphWorkspaceMaxViewportGridSize(workspace = document.getElementById(\"nodeGraphWorkspace\"))",
        "function clampNodeGraphWorkspaceGridSizeToViewport(size = {}, workspace = document.getElementById(\"nodeGraphWorkspace\"))",
        "window.innerWidth - inset * 2 - nodeGraphWorkspaceChromeSize(\"x\")",
        "Math.floor(maxWidthPx / Math.max(1, nodeGraphGridWidth()))",
        "Math.max(limits.minWidthGu, Math.floor(maxWidthPx / Math.max(1, nodeGraphGridWidth())))",
        "Math.max(limits.minWidthGu, Math.min(maxSize.widthGu",
        "function applyNodeGraphWorkspaceSizeCss(workspace, widthCss = null, heightCss = null)",
        "workspace.style.setProperty(customProperty, value)",
        "workspace.style.removeProperty(customProperty)",
        "Math.round(widthPx + nodeGraphWorkspaceChromeSize(\"x\"))",
        "Math.round(heightPx + nodeGraphWorkspaceChromeSize(\"y\"))",
        "minHeightGu: 1",
        "minWidthGu: 4",
        "function applyNodeGraphWorkspaceView()",
        "const visibleView = view.widthGu > 0 && view.heightGu > 0",
        "clampNodeGraphWorkspaceGridSizeToViewport(view, workspace)",
        "applyNodeGraphWorkspaceSizeCss(workspace, widthCss, heightCss)",
        "if (typeof applyNodeGraphPan === \"function\") {\n    applyNodeGraphPan();\n  }\n  scheduleNodeGraphWorkspaceOriginSync();",
        "function scheduleNodeGraphWorkspaceOriginSync()",
        "nodeGraphMvp.workspaceOriginSyncFrame",
        "window.requestAnimationFrame(() => {",
        "syncNodeGraphWorkspaceResizeHandlePosition()",
        "workspace.parentElement?.style.setProperty(\"--node-workspace-view-width\", widthCss)",
        "workspace.parentElement?.style.removeProperty(\"--node-workspace-view-width\")",
        "const contentWidth = Math.max(0, rect.width - nodeGraphWorkspaceChromeSize(\"x\"))",
        "const contentHeight = Math.max(0, rect.height - nodeGraphWorkspaceChromeSize(\"y\"))",
        "const nodeGraphWorkspaceResizeSteps = Object.freeze",
        "function nodeGraphWorkspaceResizeDeltaGu(pixelDelta, gridSize, stepGu = 1)",
        "function beginNodeGraphWorkspaceResize(event)",
        "function dragNodeGraphWorkspaceResize(event)",
        "const visibleSize = clampNodeGraphWorkspaceGridSizeToViewport({ widthGu, heightGu }, workspace)",
        "syncNodeGraphModularViewSizeReadout(visibleSize)",
        "return visibleSize",
        "const requestedWidthGu",
        "const requestedHeightGu",
        "const { widthGu, heightGu } = clampNodeGraphWorkspaceGridSizeToViewport({",
        "applyNodeGraphWorkspaceSizeCss(",
        "const resizeGridWidth = nodeGraphGridWidth()",
        "const resizeGridHeight = nodeGraphGridHeight()",
        "nodeGraphWorkspaceResizeSteps.widthGu",
        "nodeGraphWorkspaceResizeSteps.heightGu",
        "function endNodeGraphWorkspaceResize(event)",
        "...normalizeNodeGraphPatchView(patch.view)",
        "function handleNodeGraphWindowResize()",
        "function syncNodeGraphWorkspaceResizeHandlePosition()",
        "handle.parentElement !== workspace",
        "workspace.appendChild(handle)",
        "handle.style.removeProperty(\"--node-graph-resize-handle-left\")",
        "handle.style.removeProperty(\"--node-graph-resize-handle-top\")",
        "function beginNodeGraphWorkspacePan(event)",
        "function beginNodeGraphWorkspacePinchZoom(event)",
        "function dragNodeGraphWorkspacePinchZoom(event)",
        "function endNodeGraphWorkspacePinchZoom(event)",
        "nodeGraphMvp.workspacePinchTouchPointers = new Map()",
        "setNodeGraphZoom(pinch.startZoom * (distance / pinch.startDistance), anchor)",
        "if (!nodeGraphWorkspacePanPointerAllowed(event))",
        "function nodeGraphWorkspacePanPointerAllowed(event)",
        "event.pointerType === \"touch\"",
        "return event.isPrimary !== false && nodeGraphWorkspaceTouchPanTargetAllowed(event.target)",
        "function nodeGraphWorkspaceTouchPanTargetAllowed(target)",
        "target.closest(nodeGraphWorkspaceTouchPanBlockSelector())",
        "function nodeGraphWorkspaceTouchPanBlockSelector()",
        "function beginNodeGraphSmoothZoomDrag(event)",
        "function syncNodeGraphPatchViewZoom(zoom = nodeGraphZoom())",
        "function preserveNodeGraphEditorZoomOnPatch(patch = nodeGraphMvp.patch)",
        "syncNodeGraphPatchViewZoom(zoom)",
        "syncNodeGraphPatchViewZoom(1)",
        "const ctrlZoom = event.ctrlKey",
        "const altZoom = event.altKey",
        "event.button !== 1",
        "function preventNodeGraphMiddleMouseDefault(event)",
        "function setNodeGraphPan(x, y, options = {})",
        "saveNodeGraphWorkspaceViewToUserSettings({ status: false })",
        "x: Number.isFinite(Number(x)) ? Number(x) : 0",
        "y: Number.isFinite(Number(y)) ? Number(y) : 0",
        "function alignNodeGraphViewToGrid()",
        "const zoomStep = 1 / Math.max(1, nodeGraphGridSize())",
        "snapPan(unsnappedPan.x, nodeGraphGridWidth())",
        "snapPan(unsnappedPan.y, nodeGraphGridHeight())",
        "View aligned to grid. Hotkey: Ctrl+Shift+G.",
        "event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === \"g\"",
        "function updateNodeGraphGridHeatmap()",
        "nodeGridHeatmap",
        "radial-gradient(ellipse",
        "--node-mouse-light-spread",
        "--node-mouse-light-color-rgb",
        "const mousePoint = nodeGraphMvp.mouseLightPoint",
        "maskLayers.push(",
        "function scheduleNodeGraphGridHeatmapUpdate()",
        "nodeGraphMvp.mouseLightFrame = window.requestAnimationFrame",
        "function updateNodeGraphMouseLight(event)",
        "scheduleNodeGraphGridHeatmapUpdate();",
        "function snapNodeGraphPanValueToGrid(value, gridSize, zoom = nodeGraphZoom(), options = {})",
        "const units = options.halfGrid ? 2 : 1",
        "function dragNodeGraphWorkspacePan(event)",
        "snapNodeGraphPanValueToGrid(nextX, nodeGraphGridWidth(), nodeGraphZoom(), { halfGrid: true })",
        "snapNodeGraphPanValueToGrid(nextY, nodeGraphGridHeight(), nodeGraphZoom(), { halfGrid: true })",
        "function endNodeGraphWorkspacePan(event)",
        "function preventNodeGraphMiddleMouseAuxClick(event)",
        "function nodeGraphGridToPixel(point)",
        "function nodeGraphGridSnapUnits(options = {})",
        "function roundNodeGraphGridCoordinate(value, options = {})",
        "function nodeGraphPixelToGrid(point, options = {})",
        "function snapNodeGraphPointToGrid(point, options = {})",
        "const snapOptions = { halfGrid: options.halfGrid === true }",
        "function applyNodeGraphPatchToDom()",
        "function serializeNodeGraphPatch(patch = nodeGraphMvp.patch)",
        "function nodeGraphShareProjectData(patch = nodeGraphMvp.patch)",
        'kind: "sandbox_patch"',
        "patch_data: JSON.parse(serializeNodeGraphPatch(patchToShare))",
        "function nodeGraphEncodeSharePayload(payload)",
        "function nodeGraphDecodeSharePayload(encoded = \"\")",
        "function nodeGraphPatchFromShareProjectData(projectData = {})",
        "function nodeGraphSharePayloadFromUrl(search = window.location.search)",
        "function nodeGraphShareLinkForPatch(patch = nodeGraphMvp.patch)",
        "https://soundemote.io/sandbox",
        "audio: normalizeNodeGraphPatchAudio(patch.audio)",
        "bypassedNodes: patch.bypassedNodes || []",
        "function nodeGraphRuntimeBypassedNodeIds(patch = nodeGraphMvp.patch)",
        "node.type === \"audioInput\"",
        "format: { ...nodeGraphPatchFormat }",
        "unsupported patch format",
        "view.widthGu must be 0 or at least",
        "view: normalizeNodeGraphPatchView(patch.view)",
        "output module id must be output",
        "output module cannot be bypassed",
        'destinationType === "output" && destinationPort === "In"',
        'destinationPort = "Mono"',
        "patchNode.paramMeta?.[parameter.key]",
        "function normalizeNodeGraphPatchParameter(type, key, value, metadata = null)",
        "const unboundedMin = Boolean(metadata?.unboundedMin ?? parameter?.unboundedMin)",
        "const unboundedMax = Boolean(metadata?.unboundedMax ?? parameter?.unboundedMax)",
        "if (unboundedMin && unboundedMax)",
        "function nodeGraphReadPatchParameterValue(node, key)",
        "function nodeGraphReadPatchParameterMetadata(node, key)",
        "function nodeGraphPatchChoiceLabel(metadata, value)",
        "function loadNodeGraphPatchFromScript(text)",
        "script JSON parse failed:",
        "script validation failed:",
        "function commitNodeGraphPatch(patch, options = {})",
        "preserveNodeGraphEditorZoomOnPatch(nodeGraphMvp.patch)",
        "options.autosaveWorkingPatch !== false",
        "nodeGraphMvp.patchDirtyState = \"edited\"",
        "saveNodeGraphWorkingPatchToUserSettings()",
        "let startupPatchDirtyState = nodeGraphMvp.workingPatch && [\"saved\", \"edited\", \"untouched\"].includes(nodeGraphMvp.patchDirtyState)",
        "nodeGraphSharePayloadFromUrl()",
        "nodeGraphPatchFromShareProjectData(sharePayload.project_data)",
        "patchDirtyState: startupPatchDirtyState",
        "function nodeGraphPatchScriptStatus(message = \"script synced\", ok = true)",
        "message: `${message}; schedule blocked`, ok: false",
        "scriptCommitDelayMs: 250",
        "scriptDirty: false",
        "scriptCommitTimer: 0",
        "function clearNodeGraphScriptCommitTimer()",
        "function scheduleNodeGraphScriptCommit(text)",
        "nodeGraphMvp.scriptDirty = true",
        "setNodeGraphScriptStatus(\"script editing\", true)",
        "function flushNodeGraphScriptCommit()",
        "function nodeGraphScriptReadyForGraphAction(action = \"graph action\")",
        "Fix script before ${action}",
        "function markNodeGraphRenderScriptBlocked()",
        "labelPrimaryAudioTitle(\"Fix script before rendering\", false)",
        "function markNodeGraphLiveScriptBlocked()",
        "fix script before live audio",
        "function clearNodeGraphRenderScriptBlock()",
        "function clearNodeGraphLiveScriptBlock()",
        "function clearNodeGraphScriptBlockedActions()",
        "clearNodeGraphScriptBlockedActions();",
        "schedule blocked: fix script before live audio",
        "nodeGraphScriptReadyForGraphAction(\"render\")",
        "nodeGraphScriptReadyForGraphAction(\"live audio\")",
        "nodeGraphScriptReadyForGraphAction(\"save\")",
        "nodeGraphScriptReadyForGraphAction(\"undo\")",
        "nodeGraphScriptReadyForGraphAction(\"redo\")",
        "if (mode !== \"script\")",
        "function recordNodeGraphHistory()",
        'button.removeAttribute("title")',
        "function undoNodeGraphPatch()",
        "function redoNodeGraphPatch()",
        "function setNodeGraphViewMode(mode)",
        "const settingsMode = mode === \"settings\"",
        "const codeMode = mode === \"code\"",
        "const mappingMode = mode === \"mapping\"",
        "nodeCodeScreenView",
        "nodeCodeScreenViewButton",
        "renderNodeGraphCodeScreen()",
        "setNodeGraphViewMode(\"code\")",
        "nodeMappingView",
        "nodeMappingViewButton\")?.classList.toggle",
        "renderNodeGraphMappingView()",
        "setNodeGraphViewMode(\"mapping\")",
        "nodeModuleShopView",
        "nodeSceneOpenModuleBrowser",
        "openNodeGraphModuleShop(nodeGraphMvp.sceneContextPoint, contextMenuClientPoint)",
        "function rememberNodeGraphContextMenuClientPoint(event)",
        "const currentPosition = menu.hidden ? null : nodeSceneContextMenuCurrentPosition(menu)",
        "const chosenPosition = savedPosition || currentPosition",
        "function closeNodeGraphModuleShop()",
        "panel.hidden = true;",
        'bindNodeGraphSceneElementEvent("nodeModuleShopClose", "click", closeNodeGraphModuleShop)',
        "nodeModuleShopHeading",
        "nodeModuleShopResizeHandle",
        "nodeModuleDepartmentBack",
        "setNodeGraphModuleStoreDepartment(\"\")",
        "closeNodeGraphModuleShop();",
        "openNodeGraphModuleShop(null);",
        'bindNodeGraphSceneElementEvent("nodeModuleShopView", "pointerdown", beginNodeGraphModuleShopViewDrag)',
        'bindNodeGraphSceneElementEvent("nodeModuleShopView", "keydown", handleNodeGraphModuleStoreKeydown)',
        "function applyNodeGraphModuleShopWindowSize(size = {})",
        'applyNodeGraphFloatingWindowSizeVars(panel, "node-module-shop", nodeGraphModuleShopWindowDefaultSize, normalized)',
        "function saveNodeGraphModuleShopWindowSizeToUserSettings()",
        "beginNodeGraphModuleShopViewDrag",
        "dragNodeGraphModuleShopView",
        "endNodeGraphModuleShopViewDrag",
        "beginNodeGraphModuleShopViewResize",
        'beginNodeGraphFloatingWindowResize(event, panel, "moduleShopResizing")',
        "dragNodeGraphModuleShopViewResize",
        'dragNodeGraphFloatingWindowResize(event, "moduleShopResizing", applyNodeGraphModuleShopWindowSize)',
        "endNodeGraphModuleShopViewResize",
        "setNodeGraphViewMode(\"modular\")",
        "nodeSettingsViewButton",
        "settingsVisible ? \"modular\" : \"settings\"",
        "nodeUserUiSettingsButton",
        "toggleNodeUserUiSettings",
        "nodeSettingsView",
        "function handleNodePatchScriptInput(event)",
        "scheduleNodeGraphScriptCommit(event.currentTarget.value)",
        "function saveNodeGraphScriptEditor()",
        "clearNodeGraphScriptCommitTimer()",
        "commitNodeGraphScript(script?.value || serializeNodeGraphPatch())",
        "function copyNodeGraphScriptToClipboard()",
        "navigator.clipboard.writeText(text)",
        "function pasteNodeGraphScriptFromClipboard()",
        "navigator.clipboard.readText()",
        "commitNodeGraphScript(text)",
        "function confirmNodeGraphDefaultButtonClick(button, statusCallback, options = {})",
        "function nodeGraphDefaultButtonLabel(button)",
        "function nodeGraphDefaultButtonHtml(button)",
        "button.dataset.confirmDefaultHtml",
        "button.textContent = options.confirmText || \"Confirm Default\"",
        "async function confirmAndSaveNodeGraphScript(event)",
        "{ confirmText: \"Confirm Save\" }",
        "function flashNodeGraphDefaultButtonSaved(button)",
        "button.textContent = \"Saved\"",
        "button.innerHTML = originalHtml || originalText",
        "void button.offsetWidth",
        "function updateDefaultNodeGraphPreset()",
        "function handleUpdateDefaultNodeGraphPresetClick(event)",
        "flashNodeGraphDefaultButtonSaved(event.currentTarget);\n  await updateDefaultNodeGraphPreset();",
        "flashNodeGraphDefaultButtonSaved(event.currentTarget);\n  await updateDefaultNodeUiDevSettingsPreset();",
        'fetch("/api/presets/default"',
        "nodeGraphScriptReadyForGraphAction(\"save init\")",
        "nodeGraphMvp.defaultPatch = cloneNodeGraphPatch(nodeGraphMvp.patch)",
        "updateDefaultPresetButton",
        "const nodeGraphPatchPresetStorageKey = \"soemdsp-sandbox.patchPresets.v1\"",
        "function renderNodeGraphPatchPresetControls(selectedName = \"\")",
        "function saveCurrentNodeGraphPatchPreset()",
        "function loadSelectedNodeGraphPatchPreset()",
        "function deleteSelectedNodeGraphPatchPreset()",
        "commitNodeGraphPatch(loadNodeGraphPatchFromScript(entry.text), { status: `preset loaded: ${entry.name}` })",
        "window.localStorage.setItem(nodeGraphPatchPresetStorageKey, JSON.stringify(entries))",
        "document.getElementById(\"nodePatchPresetSaveButton\").addEventListener(\"click\", saveCurrentNodeGraphPatchPreset)",
        "document.getElementById(\"nodePatchPresetLoadButton\").addEventListener(\"click\", loadSelectedNodeGraphPatchPreset)",
        "renderNodeGraphPatchPresetControls();",
        "function nodeGraphPatchFileName()",
        "function setNodeGraphCurrentSavedPatch(filename = \"\")",
        "function syncNodeGraphCurrentSavedPatchHeader()",
        "function syncNodeGraphSavedPatchRowSelection()",
        "nodeGraphMvp.currentSavedPatchFilename",
        "selectedSavedPatchFilename: \"\"",
        "nodeGraphMvp.selectedSavedPatchFilename",
        "function selectNodeGraphSavedPatch(filename = \"\", program = null)",
        "savedPatchBankIndex: 0",
        "savedPatchGridColumns: 3",
        "savedPatchExplorerView: \"banks\"",
        "savedPatchTagFilters: []",
        "savedPatchEntries: []",
        "function normalizeNodeGraphSavedPatchBankIndex(value)",
        "function normalizeNodeGraphSavedPatchTag(tag)",
        "function nodeGraphSavedPatchMatchesTagFilters(patch = {})",
        "function filteredNodeGraphSavedPatchEntries(patches = nodeGraphMvp.savedPatchEntries)",
        "input.placeholder = \"search another tag\"",
        "input.placeholder = \"search tag\"",
        "function addNodeGraphSavedPatchTagFilter(tag)",
        "function removeNodeGraphSavedPatchTagFilter(tag)",
        "function clearNodeGraphSavedPatchTagFilters()",
        "function handleNodeGraphSavedPatchTagInput(event)",
        "function normalizeNodeGraphSavedPatchProgramIndex(value)",
        "function syncNodeGraphSelectedSavedPatchEditor()",
        "function syncNodeGraphSavedPatchBankControls(patches = null)",
        "function handleNodeGraphSavedPatchBankInput(event)",
        "function handleNodeGraphSavedPatchBankNameInput(event)",
        "saveNodeGraphWorkspaceWindowStatesToUserSettings({ status: false })",
        "const tagName = info.tags && info.tags !== \"tags\"",
        "function nodeGraphPatchWithLiveHeaderInfo(patch = nodeGraphMvp.patch)",
        "function saveNodeGraphScript()",
        "syncNodeGraphScriptView(\"script synced before save\", true)",
        "`/api/patches/save?bank=${encodeURIComponent(info.bank)}&program=${encodeURIComponent(info.program)}`",
        "const patchToSave = nodeGraphPatchWithLiveHeaderInfo()",
        "const filename = result.filename || nodeGraphPatchFileName()",
        "setNodeGraphCurrentSavedPatch(filename)",
        "clearNodeGraphSavedPatchTagFilters()",
        "patch saved, but explorer did not list it",
        "return listed",
        "function renderNodeGraphDemoPatchList(listId = \"nodeSavedPatchWindowList\")",
        "function renderNodeGraphDemoPatchRows(patches = [], listId = \"nodeSavedPatchWindowList\")",
        "nodeGraphMvp.savedPatchEntries = await loadNodeGraphDemoPatchEntries()",
        "renderNodeGraphDemoPatchRows(nodeGraphMvp.savedPatchEntries, listId)",
        "row.addEventListener(\"dblclick\", () => {",
        "bank.textContent = nodeGraphSavedPatchBankLabel(patch)",
        "name.textContent = patch.name || nodeGraphSavedPatchDisplayName(patch.filename) || \"Patch\"",
        "function normalizeNodeGraphSavedPatchGridColumns(value)",
        "function syncNodeGraphSavedPatchGridColumns()",
        "nodeGraphMvp.savedPatchGridColumns = requestedColumns;",
        "function loadNodeGraphDemoPatchEntries()",
        "function loadNodeGraphDemoPatch(filename)",
        "async function loadSelectedNodeGraphSavedPatch()",
        "setNodeGraphScriptStatus(\"selected patch slot is empty\", false)",
        "row.addEventListener(\"click\", () => selectNodeGraphSavedPatch(patch.filename, program))",
        "row.classList.toggle(\"selected\", selected)",
        "row.setAttribute(\"aria-selected\", selected ? \"true\" : \"false\")",
        "setNodeGraphCurrentSavedPatch(safeFilename)",
        "function toggleNodeGraphSavedPatchesWindow()",
        "function setNodeGraphSavedPatchesWindowVisible(visible)",
        "function setNodeGraphPatchDirtyState(state = \"edited\")",
        "function saveNodeGraphWorkingPatchToUserSettings(options = {})",
        "if (typeof saveNodeGraphWorkingPatchToUserSettings === \"function\")",
        "function scheduleNodeGraphWorkingPatchFileAutosave(text, options = {})",
        "if (options.immediate) {",
        "return postNodeUiDevSettingsPreset(text).then(() => true).catch(() => {",
        "if (options.returnFileSave) {",
        "scheduleNodeGraphWorkingPatchFileAutosave(text, { immediate: Boolean(options.immediateFile) })",
        "function clearNodeGraphWorkingPatchFromUserSettings()",
        "function initNodeGraphPatchFromDefault()",
        "function confirmAndInitNodeGraphPatchFromDefault(event)",
        "{ confirmText: \"Confirm Init\" }",
        "dirtyState === \"saved\" ? \"Saved\" : dirtyState === \"edited\" ? \"Edited\" : \"\"",
        "function positionNodeGraphSavedPatchesWindow(x, y)",
        "const { left, top } = nodeGraphFloatingWindowPosition(panel, x, y)",
        'panel.style.left = `${left}px`',
        'panel.style.top = `${top}px`',
        "function beginNodeGraphSavedPatchesWindowDrag(event)",
        "const heading = document.getElementById(\"nodeSavedPatchesWindowHeading\")",
        "heading,",
        "drag.heading?.classList.remove(\"dragging\")",
        "function dragNodeGraphSavedPatchesWindow(event)",
        "function endNodeGraphSavedPatchesWindowDrag(event)",
        "fetch(\"/api/patches\")",
        'fetch(`/api/patches/file?name=${encodeURIComponent(safeFilename)}`)',
        "async function loadAdjacentNodeGraphSavedPatch(direction)",
        "document.getElementById(\"nodePatchEditButton\").addEventListener(\"click\", () => setNodeGraphViewMode(\"settings\"))",
        "document.getElementById(\"nodePreviousSavedPatchButton\").addEventListener(\"click\", () => loadAdjacentNodeGraphSavedPatch(-1))",
        "document.getElementById(\"nodeNextSavedPatchButton\").addEventListener(\"click\", () => loadAdjacentNodeGraphSavedPatch(1))",
        "document.getElementById(\"nodePatchInitButton\").addEventListener(\"click\", confirmAndInitNodeGraphPatchFromDefault)",
        "document.getElementById(\"nodePatchSaveButton\").addEventListener(\"click\", confirmAndSaveNodeGraphScript)",
        "async function setNodeGraphPatchAsDefaultFromButton(event)",
        "async function saveNodeGraphSavedPatchBank()",
        "function loadNodeGraphSavedPatchBank()",
        "async function handleNodeGraphSavedPatchBankFileLoad(event)",
        'bindNodeGraphSceneElementEvent("nodeModuleActionsResizeHandle", "pointerdown", beginNodeModuleActionsWindowResize)',
        'document.addEventListener("pointermove", dragNodeModuleActionsWindowResize)',
        'document.addEventListener("pointerup", endNodeModuleActionsWindowResize)',
        'bindNodeGraphSceneElementEvent("nodeSceneOpenModuleActions", "click", openNodeGraphModuleActionsFromContextWindow)',
        'bindNodeGraphSceneElementEvent("nodeSceneUndoButton", "click", undoNodeGraphPatch)',
        'bindNodeGraphSceneElementEvent("nodeSceneRedoButton", "click", redoNodeGraphPatch)',
        'bindNodeGraphSceneElementEvent("nodeSceneOpenSavedPatches", "click", () => {',
        'bindNodeGraphSceneElementEvent("nodeSceneOpenUiSettings", "click", () => {',
        'bindNodeGraphSceneElementEvent("nodeSceneOpenPostProcessing", "click", () => {',
        'bindNodeGraphSceneElementEvent("nodeSceneOpenVisibility", "click", () => {',
        "document.getElementById(\"nodeSavedPatchesWindowHeading\").addEventListener(\"pointerdown\", beginNodeGraphSavedPatchesWindowDrag)",
        "document.getElementById(\"nodeSavedPatchesDragHandle\").addEventListener(\"pointerdown\", beginNodeGraphSavedPatchesWindowDrag)",
        "document.getElementById(\"nodeSavedPatchesResizeHandle\").addEventListener(\"pointerdown\", beginNodeGraphSavedPatchesWindowResize)",
        "document.getElementById(\"nodePatchCopyButton\").addEventListener(\"click\", copyNodeGraphScriptToClipboard)",
        "document.getElementById(\"nodePatchPasteButton\").addEventListener(\"click\", pasteNodeGraphScriptFromClipboard)",
        'document.getElementById("nodePatchShareLinkButton").addEventListener("click", copyNodeGraphShareLinkToClipboard)',
        "document.addEventListener(\"pointermove\", dragNodeGraphSavedPatchesWindowResize)",
        "document.addEventListener(\"pointerup\", endNodeGraphSavedPatchesWindowResize)",
        "function applyNodeGraphSavedPatchesWindowSize(size = {})",
        'applyNodeGraphFloatingWindowSizeVars(panel, "node-saved-patches", nodeGraphSavedPatchesWindowDefaultSize, normalized)',
        "function beginNodeGraphSavedPatchesWindowResize(event)",
        'beginNodeGraphFloatingWindowResize(event, panel, "savedPatchesWindowResizing")',
        "function dragNodeGraphSavedPatchesWindowResize(event)",
        'dragNodeGraphFloatingWindowResize(event, "savedPatchesWindowResizing", applyNodeGraphSavedPatchesWindowSize)',
        "function endNodeGraphSavedPatchesWindowResize(event)",
        "function loadNodeGraphScript()",
        "function handleNodeGraphScriptFileLoad(event)",
        "async function copyNodeGraphShareLinkToClipboard(event)",
        "nodeGraphShareLinkForPatch(nodeGraphPatchWithLiveHeaderInfo())",
        'field.addEventListener("change", commitNodeGraphSettingsHistory)',
        "serializeNodeGraphPatch()",
        "function syncNodeGraphPatchMetadataFromSlider(slider, options = {})",
        "syncNodeGraphPatchParameterFromSlider(slider)",
        "loadNodeGraphPatchFromScript(String(reader.result || \"\"))",
        "readAsText(file)",
        "[data-patch-info-field]",
        "[data-patch-audio-field]",
        "modulations: []",
        "patch.modulations || []",
        "nodeGraphMvp.patch.modulations.map",
        "function createNodeParameterModulationPort(node, type, parameter)",
        "function createNodeParameterOutputPort(node, type, parameter)",
        "function createNodeGraphIoColumn(node, type, ports, io)",
        "node-param-port modulation-input",
        "node-param-port parameter-output node-port output",
        "row.dataset.node = node",
        "row.dataset.port = port",
        "row.dataset.io = io",
        "dataset.io = \"modulation\"",
        "dataset.io = \"output\"",
        "button.dataset.alias = nodeGraphLabel(node, port)",
        "function nodeGraphPortDisplayLabel(type, port, io)",
        "function nodeGraphPatchNodePortDisplayLabel(node, type, port, io)",
        "nodeGraphModuleDefinitions[type]?.outputLabels",
        "const portLabel = nodeGraphPatchNodePortDisplayLabel(node, type, port, io)",
        "function syncNodeGraphModulePortLabels(element, patchNode)",
        "label.textContent = portLabel",
        "button.dataset.alias = `${nodeGraphNodeDisplayName(node)}.${parameter.key} slider`",
        "button.dataset.alias = `${nodeGraphNodeDisplayName(node)}.${parameter.key} mod`",
        "function ensureNodeGraphDragHandle(node)",
        "function handleNodeGraphIoRowWireClick(event)",
        "function attachNodeGraphNodeEvents(node)",
        'for (const row of node.querySelectorAll(".node-io-row"))',
        'for (const port of node.querySelectorAll(".node-param-port.modulation-input"))',
        "status.textContent = `${script.inputs.length} inputs / ${script.visualInputs.length} controls`",
        "function applyNodeGraphScreenSpaceShaderScript(event)",
        "patch.connections = (patch.connections || []).filter((connection) =>",
        "function createNodeGraphModuleElement(type, node)",
        "function createNodeGraphTextBoxBody(node)",
        "function syncNodeGraphTextBoxElement(element, patchNode)",
        "function syncNodeGraphTextBoxContentAlignment(field",
        "function nodeGraphTextBoxWidthFitScale(field",
        "function syncNodeGraphTextBoxVisualFit(field",
        'if (layout.textMode === "singleLine") {\n    return 1;\n  }',
        "lineCount * lineHeight",
        "const nodeGraphTextBoxFitLayouts = new WeakMap()",
        "function scheduleNodeGraphTextBoxVisualFit(field, layout = normalizeNodeGraphTextBoxLayout())",
        "requestAnimationFrame(syncIfConnected)",
        "document.fonts?.ready?.then(() => requestAnimationFrame(syncIfConnected))",
        "function observeNodeGraphTextBoxVisualFit(field, layout = normalizeNodeGraphTextBoxLayout())",
        "nodeGraphTextBoxResizeObserver = new ResizeObserver",
        "observeNodeGraphTextBoxVisualFit(field, layout)",
        "function handleNodeGraphTextBoxWheel(event)",
        'replacement.addEventListener("pointerdown", (event) => {',
        "event.preventDefault();\n      event.stopPropagation();",
        "replacement.readOnly = true",
        "replacement.tabIndex = -1",
        'replacement.addEventListener("dblclick", openNodeModuleActionMenu)',
        'replacement.addEventListener("wheel", handleNodeGraphTextBoxWheel, { passive: false })',
        'const desiredTag = "TEXTAREA"',
        "function setNodeGraphTextBoxModeFromContext(textMode)",
        "function setNodeGraphTextBoxTextFromContext",
        "function nodeGraphTextBoxOneLineText(value)",
        "function normalizeNodeGraphTextBoxHorizontalAlign(value)",
        "function normalizeNodeGraphTextBoxVerticalAlignPercent(value)",
        "function normalizeNodeGraphTextBoxTextSizePercent(value)",
        "maxPercent: 1000",
        "textSizePercent: normalizeNodeGraphTextBoxTextSizePercent",
        'return ["left", "center", "right"].includes(align) ? align : "center"',
        "horizontalAlign: normalizeNodeGraphTextBoxHorizontalAlign",
        "verticalAlignPercent: normalizeNodeGraphTextBoxVerticalAlignPercent",
        "function setNodeGraphTextBoxHorizontalAlignFromContext(value)",
        "function setNodeGraphTextBoxVerticalAlignFromContext",
        "function normalizeNodeGraphPatchNodeUi(ui = {})",
        "oscilloscopeHidden: Boolean(source.oscilloscopeHidden)",
        "slidersHidden: Boolean(source.slidersHidden)",
        "function nodeGraphEffectivePatchNodeUi(ui = {})",
        "function nodeGraphPatchNodeSectionVisible(localHidden, globalVisible)",
        "return !Boolean(localHidden) && globalVisible !== false;",
        "buttonsHidden: !nodeGraphPatchNodeSectionVisible(",
        "oscilloscopeHidden: !nodeGraphPatchNodeSectionVisible(",
        "slidersHidden: !nodeGraphPatchNodeSectionVisible(",
        "function normalizeNodeGraphPatchNodeAlias(alias)",
        "function nodeGraphPatchNodeTitle(node)",
        "function setNodeGraphModuleAliasFromContext",
        "const selectionStart = input?.selectionStart ?? null",
        "if (document.activeElement !== aliasInput) {",
        "function toggleNodeGraphModuleButtonsFromContext()",
        "function toggleNodeGraphModuleEnabledFromContext()",
        "patch.bypassedNodes = [...bypassed]",
        'status: bypassed.has(targetNode.id) ? "module disabled" : "module enabled"',
        "function toggleNodeGraphModuleOscilloscopeFromContext()",
        "function toggleNodeGraphModuleSlidersFromContext()",
        "function toggleNodeGraphModuleTitleFromContext()",
        "const effectiveTargetNodeUi = nodeGraphEffectivePatchNodeUi(targetNode?.ui)",
        "? !Boolean(nodeGraphMvp.live.outputEnabled)",
        ": nodeGraphNodeDisplaysBypassed(targetNode.id)",
        'toggleModuleEnabledButton.querySelector("span").textContent = targetNodeDisabled ? "Enable module" : "Disable module"',
        "const buttonsHidden = effectiveTargetNodeUi.buttonsHidden",
        "const oscilloscopeHidden = effectiveTargetNodeUi.oscilloscopeHidden",
        'const visualFaceLabel = "display"',
        "? `Show ${visualFaceLabel}`",
        ": `Hide ${visualFaceLabel}`",
        "const slidersHidden = effectiveTargetNodeUi.slidersHidden",
        "nodeGraphPatchNodeHasHideableOscilloscope",
        "nodeGraphModuleTypeHasHideableSliders",
        "ui.buttonsHidden = !ui.buttonsHidden",
        "ui.slidersHidden = !ui.slidersHidden",
        "targetNode.alias = alias",
        "delete targetNode.alias",
        "buttonsHidden",
        "oscilloscopeHidden",
        "slidersHidden",
        "titleHidden",
        "node-text-box-body",
        "node-text-box-input",
        "body.dataset.textVerticalAlign",
        "field.dataset.textAlign",
        "--node-text-box-font-scale",
        "--node-text-box-content-offset",
        "function nodeGraphModuleBodyRowCount(type)",
        "return definition?.parameters?.length || 0",
        "function nodeGraphModuleVisibleBodyRowCount(type)",
        "return nodeGraphModuleBodyRowCount(type)",
        "function nodeGraphModuleTypeHasHideableSliders(type)",
        "function nodeGraphModuleGridWidthUnits(type)",
        "const nodeGraphModuleWidthLimits",
        "function normalizeNodeGraphModuleWidthUnits(type, widthGu)",
        "function nodeGraphModuleHeightLimitsForType(type)",
        'if (type === "audioPlayer")',
        "maxGu: nodeGraphModuleHeightLimits.maxGu + 1",
        "const minimum = Math.max(limits.minGu, Math.ceil(fallback));",
        "Math.max(minimum, value)",
        "function normalizeNodeGraphTextBoxHeightUnits(heightGu)",
        "function nodeGraphPatchNodeGridWidthUnits(node)",
        "function nodeGraphPatchNodeGridHeightUnits(node)",
        "function nodeGraphModuleHeightWidgetUnits(type, ui = {})",
        'nodeGraphModuleDefinitions[type]?.layout === "traceDisplay"',
        '{ id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 2, visible: true }',
        "const nodeGraphModuleDisplayHeightLimits",
        "minGu: 1",
        "stepGu: 1",
        "function normalizeNodeGraphModuleDisplayHeightUnits(heightGu)",
        "function nodeGraphModuleDefaultDisplayHeightUnits(type)",
        "nodeGraphModuleDefinitions[type]?.displayHeightGu ?? nodeGraphModuleLayout.moduleScopeHeightGu",
        "function normalizeNodeGraphModuleDisplayHeightOffsetUnits(typeOrOffsetGu, offsetGu = null)",
        "const hasType = offsetGu !== null;",
        "function nodeGraphModuleConfiguredDisplayHeightUnits(type, ui = {})",
        "function nodeGraphModuleDisplayVisibleForUi(type, ui = {})",
        'nodeGraphMvp?.moduleOscilloscopesVisible === false',
        "function nodeGraphModuleDisplayHeightUnits(type, ui = {})",
        "function nodeGraphModuleScopeExtraHeightUnits(type, ui = {})",
        "return nodeGraphModuleDisplayHeightUnits(type, ui)",
        "defaultHeightGu + normalizedUi.displayHeightOffsetGu",
        "+ normalizedUi.displayHeightOffsetGu",
        "function nodeGraphPatchNodeDisplayHeightUnits(node)",
        "function nodeGraphPatchNodeDisplayCssHeightUnits(node)",
        'nodeGraphPatchNodeLayout(patchNode) === "canvas"',
        "const autoHeightGu = nodeGraphModuleGridHeightUnitsForUi(node?.type, node?.ui)",
        "const nodeGraphModuleLayout",
        "bodyRowGapGu: 1 / 28",
        "ioPaddingYGu: 4 / 28",
        "ioRowGapGu: 1 / 28",
        "ioSectionMinHeightGu: 24 / 28",
        "moduleScopeHeightGu: 2",
        "textBoxBodyMinGu: 4",
        "function nodeGraphModuleSliderBodyHeightGu(type)",
        "if (rows <= 0)",
        "function nodeGraphModuleIoRowCount(type)",
        "function nodeGraphModuleIoSectionHeightGu(type)",
        "function nodeGraphModuleTypeHasInterfaceControls(type)",
        "function nodeGraphModuleInterfaceControlsHeightGu(type, ui = {})",
        "function nodeGraphModuleRequiredHeightUnits(type)",
        "function nodeGraphModuleGridHeightUnits(type)",
        'nodeGraphModuleDefinitions[type]?.layout === "knobWidget"',
        "return 4;",
        "return Math.ceil(nodeGraphModuleRequiredHeightUnitsForUi(type, ui));",
        "function createNodeGraphKnobWidgetBody(node, type)",
        "node-knob-widget-body",
        "node-knob-widget-control",
        "node-knob-widget-output",
        "function setNodeGraphKnobWidgetValue(control, value, options = {})",
        "syncNodeGraphGhostSliders();",
        "function createNodeGraphSliderWidgetBody(node, type)",
        "slider-widget-layout",
        "node-slider-widget-body",
        "node-slider-widget-row",
        "node-slider-widget-io-section",
        "if (definition.parameters?.length && definition.layout !== \"sliderWidget\" && layout !== \"knobWidget\" && definition.layout !== \"led\" && definition.layout !== \"buttonWidget\")",
        "node-header-actions",
        "node-header-title-row",
        "node-header-title",
        "node-action-button",
        "node-display-settings-button",
        'displayButton.setAttribute("aria-pressed", "true")',
        'displayButton.setAttribute("aria-pressed", patchNodeUi.oscilloscopeHidden ? "false" : "true")',
        "node-metaparameter-button",
        'nodeGraphApplyTooltip(metaparameterButton, "module.metaparameters", {}, { title: false })',
        'node.querySelector(".node-metaparameter-button")?.addEventListener("click", openNodeModuleMetaparameters)',
        "function openNodeModuleMetaparameters(event)",
        "function toggleNodeModuleSlidersVisibility(event)",
        "if (event?.altKey) {\n    toggleNodeModuleSlidersVisibility(event);",
        "node-bypass-button",
        "function nodeGraphBypassGlyph(bypassed)",
        'return "\\u{1F5F2}"',
        "bypassButton.textContent = nodeGraphBypassGlyph(bypassed)",
        'nodeGraphApplyTooltip(titleRow, "module.titleMove", {}, { title: false })',
        "node-execution-order-badge",
        "toggleNodeGraphModuleBypass",
        "function nodeGraphModuleButtonsHiddenForNode(node)",
        "function nodeGraphModuleTitleBypassModifierActive(event)",
        "function toggleNodeGraphModuleBypassFromNode(node, event)",
        "adjustNodeGraphModuleWidthFromContext",
        "adjustNodeGraphTextBoxTextSizeFromContext",
        'nodeGraphApplyTooltip(actionButton, "module.actionsTitle", {}, { title: false })',
        'actionButton.textContent = "\\u2699\\uFE0F"',
        'nodeGraphApplyTooltip(displayButton, "module.displaySettings", {}, { title: false })',
        'node.querySelector(".node-display-settings-button")?.addEventListener("click", openNodeModuleDisplaySettings)',
        'node.querySelector(".node-display-settings-button")?.addEventListener("contextmenu", openNodeModuleDisplaySettings)',
        "if (event?.altKey) {\n    toggleNodeModuleDisplayVisibility(event);",
        "function toggleNodeModuleDisplayVisibility(event)",
        "--node-grid-width-units",
        "--node-grid-height-units",
        "function registerExistingNodeGraphNodes()",
        "metadataEditorTarget",
        "metadataDragging",
        "metadataPopoverPosition",
        "metadataScriptDirty",
        "moduleActionWindowPosition",
        "function syncNodeGraphPatchWindowPosition(key, position)",
        "function setNodeSliderMetadata(slider, metadata)",
        'slider.step = metadata.step > 0 ? String(metadata.step) : "any"',
        "slider.dataset.unboundedMax = metadata.unboundedMax ? \"true\" : \"false\"",
        "slider.dataset.unboundedMin = metadata.unboundedMin ? \"true\" : \"false\"",
        "slider.dataset.unboundedValue",
        "delete slider.dataset.unboundedValue",
        "applyNodeGraphInputUnboundedValue(input, value)",
        "function normalizedNodeSliderMid(slider)",
        "function nodeSliderSkewExponent(slider)",
        "function nodeSliderShouldUseNonlinearSlider(slider)",
        "const nodeSliderMinSkewExponent = 0.25",
        "const nodeSliderMaxSkewExponent = 4",
        "function nodeSliderValueFromTravel(slider, travel)",
        "function nodeSliderValueFromPointerTravel(slider, travel)",
        "function nodeSliderValueFromRelativeTravel(slider, travel)",
        'numericTravel < 0 && slider.dataset.unboundedMin === "true"',
        'numericTravel > 1 && slider.dataset.unboundedMax === "true"',
        "function nodeSliderTravelFromValue(slider, value)",
        "function wrapNodeSliderValue(value, min, max)",
        "function shortestNodeGraphWrapDelta(from, to, min, max)",
        "const nodeGraphAutoSmoothingDefaultSeconds = 0.5",
        "function clampNodeGraphAutoSmoothingSeconds(seconds)",
        "return Math.max(0, value);",
        "function nodeGraphSmoothingFrequencyFromSeconds(seconds)",
        "return normalized <= 0 ? 0 : 1 / normalized;",
        "if (smoothingSeconds <= 0)",
        "smoother.outputBuffer = smoother.targetSignal;",
        "function nodeGraphSmoothingSamplesFromSeconds(seconds)",
        "function nodeGraphSmoothingSecondsFromSamples(samples)",
        "function nodeGraphOnePoleParameterLowpassSample(state, input, frequency, rate)",
        "function normalizeNodeGraphSmootherSignal(value, metadata = {})",
        "function denormalizeNodeGraphSmootherSignal(signal, metadata = {})",
        "function createNodeGraphParameterSmoother(initialValue",
        "function updateNodeGraphParameterSmoother(smoother",
        "function readNodeGraphSmoothedParameter(smoother, frame, frames)",
        "function finishNodeGraphParameterSmoothing(smoothers)",
        "smoother.smoothingSeconds = nodeGraphParameterSmoothingSecondsFromMetadata(metadata)",
        "nodeGraphOnePoleParameterLowpassSample(",
        "nodeGraphSmoothingFrequencyFromSeconds(smoothingSeconds)",
        "function normalizeNodeSliderValue(slider, value",
        "function normalizeNodeSliderTravel(slider, travel)",
        "return nodeSliderShouldWraparound(slider)\n    ? wrapNodeSliderValue(number, 0, 1)\n    : clampNodeSliderValue(number, 0, 1);",
        "return normalizeNodeSliderTravel(slider, (x - lane.inset) / lane.travelWidth)",
        "nodeSliderValueFromRelativeTravel(drag.slider, nextTravel)",
        "if (nextTravel <= 0 || nextTravel >= 1)",
        'wraparound: fallback.wraparound && Object.hasOwn(source, "wraparound")',
        "const midInsideRange = safeMid > safeMin && safeMid < safeMax",
        "midInsideRange && Math.abs(safeMid - (safeMin + safeMax) / 2) > Number.EPSILON",
        "const api = Object.freeze",
        "window.nodeCodeSettingsEditor = api",
        "window.codeSettingsEditor ||= api",
        "function assignmentInfo(line = \"\", options = {})",
        "function referenceHtml(options = {})",
        "function highlightHtml(text = \"\", options = {})",
        "function findTokenAt(text = \"\", index = 0, options = {})",
        "assignmentTokenPattern",
        "function openNodeMetadataPopover(event, readout)",
        "document.getElementById(\"metadataPopoverTitle\").textContent = \"PARAMETER\"",
        "document.getElementById(\"metadataPopoverSubtitle\").textContent = \"Settings\"",
        "function nodeMetadataPopoverEmptyDragTarget(event)",
        "metadataEmptyDragBound",
        "metadataCornerDragBound",
        "scriptSource.addEventListener(\"pointerdown\", (event) => event.stopPropagation())",
        "popover.addEventListener(\"pointerdown\", beginNodeMetadataPopoverDrag)",
        "cornerDrag.addEventListener(\"pointerdown\", beginNodeMetadataPopoverResize)",
        "function beginNodeMetadataPopoverDrag(event)",
        "event.currentTarget?.id === \"metadataPopoverCornerDrag\"",
        "nodeGraphDialogDragTargetIsInteractive(event)",
        "visibleWidth: Math.max(80, (rect?.width || 360) * 0.5)",
        "function applyNodeMetadataPopoverSize(size = {})",
        'applyNodeGraphFloatingWindowSizeVars(popover, "metadata-popover", nodeMetadataPopoverDefaultSize, normalized)',
        "function beginNodeMetadataPopoverResize(event)",
        'beginNodeGraphFloatingWindowResize(event, popover, "metadataResizing")',
        "function dragNodeMetadataPopoverResize(event)",
        'dragNodeGraphFloatingWindowResize(event, "metadataResizing", applyNodeMetadataPopoverSize)',
        "function endNodeMetadataPopoverResize(event)",
        "document.addEventListener(\"pointermove\", dragNodeMetadataPopoverResize)",
        "const heading = document.querySelector(\"#nodeParameterMetadataPopover .metadata-popover-heading\")",
        "drag.heading?.classList.remove(\"dragging\")",
        "function dragNodeMetadataPopover(event)",
        "function endNodeMetadataPopoverDrag(event)",
        "nodeGraphMvp.metadataPopoverPosition = { left, top }",
        "const x = hasSavedPosition",
        "const y = hasSavedPosition",
        "function populateNodeMetadataKindChoices()",
        "function formatNodeMetadataScript(slider, metadata = nodeSliderMetadata(slider))",
        "param.${key}.alias",
        "function nodeMetadataScriptPortAliasAssignment(assignment)",
        "function applyNodeMetadataScriptPortAliases(slider, portAliases = [])",
        "patchNode.portMeta = normalizeNodeGraphPatchPortMeta(nextPortMeta)",
        "function nodeMetadataScriptTemplateForKind(slider, kind)",
        "function colorizeNodeMetadataScriptLine(line = \"\")",
        "function updateNodeMetadataScriptHighlight()",
        "const nodeMetadataScriptBooleanKeys = new Set",
        "function nodeMetadataScriptTokenOptionsForKey(key = \"\")",
        "function findNodeMetadataScriptTokenAt(index)",
        "function setNodeMetadataScriptSuggestionContext(context = null)",
        "function nodeMetadataScriptReferenceContextHtml(context = null)",
        "function showNodeMetadataScriptTokenSuggestions(token)",
        "function replaceNodeMetadataScriptToken(nextToken)",
        "metadataScriptActiveToken",
        "scriptSource.addEventListener(\"pointerup\", handleNodeMetadataScriptSourcePointer)",
        "scriptSource.addEventListener(\"keyup\", handleNodeMetadataScriptSourceKeyup)",
        "data-token-option",
        "metadata-script-line-ignored",
        "window.nodeCodeSettingsEditor.highlightHtml",
        "window.nodeCodeSettingsEditor.findTokenAt",
        "window.nodeCodeSettingsEditor.referenceHtml",
        "const nodeMetadataScriptSupportedKeys = new Set",
        "\"alias\"",
        "function nodeMetadataScriptReferenceHtml(context = nodeGraphMvp.metadataScriptSuggestionContext)",
        "function syncNodeMetadataScriptReference(context = nodeGraphMvp.metadataScriptSuggestionContext)",
        "function insertNodeMetadataScriptKey(key)",
        "function insertNodeMetadataScriptKind(kind)",
        "function nodeMetadataScriptAssignmentInsertion(value, text, start, end = start)",
        "function nodeMetadataScriptIsLineBreak(character)",
        "function insertNodeMetadataScriptAssignment(text)",
        "function handleNodeMetadataScriptReferenceClick(event)",
        "function handleNodeMetadataScriptReferenceKeydown(event)",
        "function insertNodeMetadataScriptReferenceTarget(target)",
        "scriptReference.addEventListener(\"keydown\", handleNodeMetadataScriptReferenceKeydown)",
        "metadataScriptReferenceBound",
        "metadataScriptReference",
        "syncNodeMetadataScriptReference();",
        "metadata-script-reference-key",
        "metadata-script-reference-kind",
        "function resizeNodeMetadataScriptEditorToContent()",
        "role=\"button\" tabindex=\"0\"",
        "param.${paramKey}.${key} = ${value};",
        "param.${paramKey}.kind = ${normalizeNodeMetadataKind(kind)};",
        "insertNodeMetadataScriptAssignment(`param.${paramKey}.${key} = ${value};`);",
        "insertNodeMetadataScriptAssignment(`param.${paramKey}.kind = ${normalizeNodeMetadataKind(kind)};`);",
        "nodeMetadataScriptAssignmentInsertion(\"param.a.min = 0;\", \"param.a.max = 1;\", 16) === \"\\nparam.a.max = 1;\"",
        "nodeMetadataScriptAssignmentInsertion(\"param.a.min = 0;\\r\\n\", \"param.a.max = 1;\", 17) === \"param.a.max = 1;\"",
        "typeof fallbackNodeMetadataKindTemplates",
        "data-kind",
        "function nodeMetadataScriptKeyFromPath(path = \"\")",
        "function parseNodeMetadataScriptAssignments(source)",
        "function analyzeNodeMetadataScriptSource(source)",
        "function nodeMetadataScriptPreviewValueFingerprint(value)",
        "function nodeMetadataScriptPreviewValueText(value, key = \"\")",
        "function nodeMetadataScriptPreviewDetails(assignment, draftMetadata)",
        "function nodeMetadataScriptUnsupportedPreviewDetails(assignment)",
        "function nodeMetadataScriptPreviewSummary(source = metadataScriptSourceText())",
        "function nodeMetadataScriptEffectiveRows(metadata)",
        "function updateNodeMetadataScriptEffective(source = metadataScriptSourceText())",
        "function updateNodeMetadataScriptPreview(source = metadataScriptSourceText())",
        "title=\"${escapeNodeMetadataScriptHtml(`${key}: ${value}`)}\"",
        "function focusNodeMetadataScriptLine(lineNumber)",
        "source.scrollTop = Math.max(0, (line - 2) * lineHeight)",
        "function handleNodeMetadataScriptPreviewClick(event)",
        "function handleNodeMetadataScriptPreviewKeydown(event)",
        "metadataScriptPreview",
        "metadataScriptPreviewBound",
        "scriptPreview.addEventListener(\"keydown\", handleNodeMetadataScriptPreviewKeydown)",
        "line ${assignment.line}: ${assignment.path || assignment.key} = ${valueText}",
        "change",
        "=>",
        "data-line",
        "display choices",
        "expected path = value;",
        "unsupported: ${assignment.path}",
        "${diagnostics.counts.changed} changes; ${diagnostics.counts.same} same",
        "will set",
        "function nodeMetadataScriptDiagnosticMessage(source = metadataScriptSourceText())",
        "function syncNodeMetadataScriptDiagnostics()",
        "function runNodeMetadataScriptParserSelfTest()",
        "function syncNodeMetadataScriptParserSelfTestStatus()",
        "function scheduleNodeMetadataScriptParserSelfTestStatus()",
        "status.title = detail || message",
        "nodeMetadataScriptTemplateForKind(fakeSlider, \"waveform\").includes",
        "param.waveform.choices = [Saw, Ramp, Square, Triangle, Sine, Noise];",
        "unsupported ${diagnostics.unsupported.map",
        "syntax lines ${diagnostics.syntaxIgnored.join",
        "document.documentElement.dataset.metadataScriptParserSelfTest",
        "parsed.assignments[1]?.rawValue === \"[Saw, Square, Sine]\"",
        "unsaved: ${settingsText}; ${diagnostics.counts.changed} changes; ${diagnostics.counts.same} same",
        "ignored lines ${diagnostics.ignored.join(\", \")}",
        "scriptSource.addEventListener(\"keydown\", handleNodeMetadataScriptKeydown)",
        "function insertNodeMetadataScriptText(text)",
        "function handleNodeMetadataScriptKeydown(event)",
        "insertNodeMetadataScriptText(\"  \")",
        "commandKey && event.shiftKey && event.key === \"Enter\"",
        "commandKey && (event.key.toLowerCase() === \"s\" || event.key === \"Enter\")",
        "function insertNodeMetadataScriptKindTemplate()",
        "function normalizeNodeMetadataScriptEditor()",
        "scriptKindTemplate.addEventListener(\"click\", insertNodeMetadataScriptKindTemplate)",
        "scriptNormalize.addEventListener(\"click\", normalizeNodeMetadataScriptEditor)",
        "Kind template inserted for ${kind}. Save to apply.",
        "Normalize will remove ignored metadata script lines",
        "normalize canceled",
        "Review the normalized script, then Save to apply.",
        "function parseNodeMetadataScript(source, slider)",
        "function setNodeMetadataScriptDirty(dirty, message = \"\", error = false, detail = \"\")",
        "function confirmNodeMetadataScriptDiscard()",
        "function bindNodeMetadataScriptBeforeUnload()",
        "function applyNodeMetadataScriptEditor()",
        "Supported metadata was applied; ignored script lines remain unresolved.",
        "function copyNodeMetadataScriptSource()",
        "function pasteNodeMetadataScriptSource()",
        "function exportNodeMetadataScriptToDesktop()",
        "Discard unsaved metadata script changes?",
        "nodeMetadataScriptBeforeUnloadBound",
        "\"/api/metadata-script/to-desktop\"",
        "function readNodeMetadataEditorValues(slider)",
        "function syncNodeMetadataMidVisibility()",
        "function syncNodeMetadataScriptFromFields(options = {})",
        "if (!options.force && nodeGraphMvp.metadataScriptDirty && !confirmNodeMetadataScriptDiscard())",
        "scriptRefresh.addEventListener(\"click\", () => syncNodeMetadataScriptFromFields({ force: true }))",
        "Restore script text from the selected parameter's current metadata.",
        "scriptRefresh.textContent = \"Restore\"",
        "syncNodeMetadataScriptFromFields({ force: true })",
        "function applyNodeMetadataEditor(options = {})",
        "function restoreNodeMetadataEditorFields()",
        "function closeNodeMetadataPopover()",
        "function finishCloseNodeMetadataPopover()",
        "function saveAndCloseNodeMetadataPopover()",
        "function discardAndCloseNodeMetadataPopover()",
        "metadataCloseSaveBound",
        "metadataCloseDiscardBound",
        "metadataSaveFieldsBound",
        "metadataRestoreFieldsBound",
        "metadataAdvancedBound",
        "function setNodeMetadataFieldsDirty(dirty)",
        "applyNodeMetadataEditor(options = {})",
        "applyNodeMetadataEditor({ keepDirty: true })",
        "function setNodeMetadataAdvancedScriptVisible(visible)",
        "function toggleNodeMetadataAdvancedScript()",
        "function metadataStepperQuantum(input)",
        "return 0.1;",
        "function stepNodeMetadataField(event)",
        "function bindNodeGraphMetadataPopoverEvents()",
        "metadataPopoverBound",
        "metadataCloseBound",
        "metadataDragHeadingBound",
        "dragHeading.addEventListener(\"pointerdown\", beginNodeMetadataPopoverDrag)",
        "bindNodeGraphMetadataPopoverEvents();",
        "scheduleNodeMetadataScriptParserSelfTestStatus();",
        "function closeNodeSceneContextMenu(options = {})",
        "const nodeSceneContextWindowDefaultSize = Object.freeze",
        "const nodeModuleActionsWindowDefaultSize = Object.freeze",
        "width: 185",
        "height: 620",
        "minWidth: 24",
        "maxWidth: 360",
        "minHeight: 120",
        "maxHeight: 820",
        "function normalizeNodeSceneContextWindowSize(size = {})",
        "function normalizeNodeModuleActionsWindowSize(size = {})",
        "function syncNodeModuleActionsWindowHeightLimit()",
        "Number(normalized.height) || nodeModuleActionsWindowDefaultSize.height",
        "function applyNodeSceneContextWindowSize(size = nodeGraphMvp.sceneContextWindowSize)",
        "function applyNodeModuleActionsWindowSize(size = nodeGraphMvp.moduleActionWindowSize)",
        "syncNodeModuleActionsWindowHeightLimit();",
        "function saveNodeSceneContextWindowSizeToUserSettings()",
        "function saveNodeModuleActionsWindowStateToUserSettings()",
        'rememberNodeGraphWorkspaceWindowState(\n      "moduleActions"',
        "function positionNodeSceneContextMenu(menu, x, y, remember = false)",
        "function positionNodeSceneContextMenuHeaderAtPoint(menu, x, y, remember = false)",
        "(Number(x) || 0) - (menuRect.width * 0.5)",
        "(Number(y) || 0) - ((headingRect?.height || 42) * 0.5)",
        "function positionNodeScopeContextMenuAtSavedOr(menu, x, y)",
        "function beginNodeSceneContextMenuDrag(event)",
        "function clearNodeSceneContextMenuDragState()",
        "menu?.querySelector(\".scene-context-heading\")?.classList.remove(\"dragging\")",
        "menu?.querySelector(\".scene-context-drag-handle\")?.classList.remove(\"dragging\")",
        "if (nodeGraphMvp.sceneContextDragging) {\n    event.preventDefault();\n    event.stopPropagation();\n    return;\n  }",
        "function dragNodeSceneContextMenu(event)",
        "function endNodeSceneContextMenuDrag(event)",
        "function closeNodeModuleActionsWindow()",
        "function ensureNodeGraphModuleActionsWindowBody()",
        "function prepareNodeModuleActionsWindowForInspectorReplacement()",
        "prepareNodeMetadataPopoverForInspectorReplacement",
        "prepareNodeGraphTraceDisplaySettingsForInspectorReplacement",
        "nodeGraphMvp.sharedInspectorActive = \"moduleActions\"",
        "applyNodeModuleActionsWindowSize(sharedInspectorState.size)",
        "function beginNodeModuleActionsWindowDrag(event)",
        "function dragNodeModuleActionsWindow(event)",
        "function endNodeModuleActionsWindowDrag(event)",
        "function beginNodeModuleActionsWindowResize(event)",
        'beginNodeGraphFloatingWindowResize(event, menu, "moduleActionResizing")',
        "function dragNodeModuleActionsWindowResize(event)",
        'dragNodeGraphFloatingWindowResize(event, "moduleActionResizing", applyNodeModuleActionsWindowSize)',
        "function endNodeModuleActionsWindowResize(event)",
        'endNodeGraphFloatingWindowResize(event, "moduleActionResizing", saveNodeModuleActionsWindowStateToUserSettings)',
        "function beginNodeScopeContextMenuDrag(event)",
        "function dragNodeScopeContextMenu(event)",
        "function endNodeScopeContextMenuDrag(event)",
        "function beginNodeGraphVisibilityMenuDrag(event)",
        "function dragNodeGraphVisibilityMenu(event)",
        "function endNodeGraphVisibilityMenuDrag(event)",
        "function beginNodeGraphVisibilityMenuResize(event)",
        "function dragNodeGraphVisibilityMenuResize(event)",
        "function endNodeGraphVisibilityMenuResize(event)",
        "function positionNodeGraphVisibilityMenu(menu, x, y)",
        "function stopNodeGraphRenderedPlayback()",
        "stopNodeGraphRenderedPlayback();",
        "function markNodeGraphRenderPending(summary = \"\")",
        "clearNodeGraphRenderedModuleScopeBuffers();",
        "function nodeGraphOutputClipCountText(count = 0)",
        "function nodeGraphClampOutputSample(value)",
        "function nodeGraphOutputSampleClipped(value)",
        "function nodeGraphOutputSampleTripsEarProtection(value)",
        "Math.abs(number) > 1",
        "!Number.isFinite(Number(value))",
        "function nodeGraphOnePoleHighPassCoefficients(frequency, sampleRate)",
        "0.000142475857",
        "const b0 = 0.5 * (1 + a1)",
        "return { a1, b0, b1: -b0 }",
        "function createNodeGraphEarProtector(sampleRate = nodeGraphMvp.sampleRate",
        "function nodeGraphEarProtectionIsTripped()",
        "function nodeGraphTripEarProtection(details = {})",
        "globalThis.nodeGraphEarProtectionDetails = { ...details }",
        "function nodeGraphResetEarProtectionFault()",
        "globalThis.nodeGraphEarProtectionTripped = false",
        "setNodeGraphLiveOutputMuted(false)",
        "nodeGraphApplyEarProtectionFaultUi(details)",
        "refreshNodeGraphSpeakerProtectionBodies();",
        "function closeNodeGraphEarProtectionFaultUi()",
        "function bindNodeGraphEarProtectionFaultUi()",
        "nodeEarProtectionFaultDelegatedClose",
        'nodeGraphTripEarProtection({ source: "manual", protectionMuteCount: 1 })',
        "function nodeGraphModuleDiagnosticsIsTripped()",
        "function nodeGraphRecordModuleFault(details = {})",
        "function nodeGraphModuleDiagnosticsFaultDetail(details = {})",
        "function nodeGraphResetModuleDiagnosticsFault()",
        "function closeNodeGraphModuleDiagnosticsFaultUi()",
        "function bindNodeGraphModuleDiagnosticsFaultUi()",
        "function nodeGraphRecordNativeModuleFault(message = {})",
        "function nodeGraphTrackNodeSilenceWindow(nodeId, isBad, reason = \"\")",
        "function nodeGraphClearAllTrackedModuleSilence()",
        "const nodeGraphJerobeamSelfTestManifest = Object.freeze([",
        "async function nodeGraphRunJerobeamModuleSelfTest(entry, manifestEntry)",
        "async function nodeGraphRunGenericModuleLoadCheck(entry)",
        "function nodeGraphShowModuleSelfTestReport(report)",
        "async function runNodeGraphModuleSelfTest()",
        "nodeModuleDiagnosticsFaultDelegatedClose",
        "setNodeGraphAudioStats();",
        "audioStats.dataset.renderClips = String(clipCount)",
        "audioStats.dataset.renderProtectionMutes = String(protectionMuteCount)",
        "audioStats.dataset.renderBadNumbers = String(badNumberCount)",
        "nodeGraphOutputClipCountText(clipCount)",
        "ear protection muted",
        "outputSummary.textContent = summary",
        "drawNodeRenderedAudio();",
        "function setNodeMetadataDefaultsFromKind()",
        "const template = nodeMetadataKindTemplates[kind] || nodeMetadataKindTemplates.decimal",
        "const choices = template.choices || []",
        "document.getElementById(\"metadataMinValue\").value = String(template.min)",
        "document.getElementById(\"metadataMidValue\").value = String(template.mid)",
        "document.getElementById(\"metadataMaxValue\").value = String(template.max)",
        "document.getElementById(\"metadataMaxDigitsValue\").value =",
        "document.getElementById(\"metadataUnitValue\").value = template.unit",
        "document.getElementById(\"metadataChoicesValue\").value = formatNodeMetadataChoices(choices)",
        "function handleNodeMetadataKindChange()",
        "metadataRestoreDefaultButton",
        'classList.add("armed")',
        'classList.remove("armed")',
        "function handleNodeMetadataEditorInput(event)",
        "metadataNonlinearSliderValue",
        "nodeParameterMetadataPopover",
        "metadataPopoverDragHandle",
        "metadataPopoverCornerDrag",
        "metadata-script-extra-info",
        "sceneContextPoint",
        "function positionNodeGraphNode(node, point, options = {})",
        "function openNodeSceneContextMenu(event)",
        "event.target.closest?.(\".node-view-toolbar\")",
        "modulePlacement: null",
        "function showNodeGraphModule(node, point = null, options = {})",
        "return id",
        "function nodeGraphClientPointInsideWorkspace(event)",
        "function cancelNodeGraphModulePlacement(status = \"module placement cancelled\")",
        "function beginNodeGraphModulePlacement(type, point = null)",
        "function beginNodeGraphModuleStorePointerPlacement(event)",
        "function dragNodeGraphModulePlacement(event)",
        "function completeNodeGraphModulePlacement(event)",
        "function releaseNodeGraphModuleStorePointerPlacement(event)",
        "function cancelNodeGraphModuleStorePointerPlacement(event)",
        "positionNodeGraphNode(element, point, { clamp: false, snap: false })",
        "document.addEventListener(\"pointerdown\", completeNodeGraphModulePlacement, true)",
        "document.addEventListener(\"pointerup\", releaseNodeGraphModuleStorePointerPlacement)",
        "document.addEventListener(\"pointercancel\", cancelNodeGraphModuleStorePointerPlacement)",
        "finishNodeGraphModulePlacementAtCurrentPosition()",
        "clearNodeGraphSelection();",
        'element?.classList.add("placing", "dragging")',
        'commitNodeGraphPatch(patch, { status: options.status || "module added" })',
        "function nodeGraphFindCopiedModuleGridPoint(sourceNode, nodes = nodeGraphMvp.patch.nodes)",
        "function nodeGraphPatchNodeGridRect(node)",
        "function nodeGraphBypassedNodeIds(patch = nodeGraphMvp.patch)",
        "function nodeGraphNodeIsBypassed(nodeId, patch = nodeGraphMvp.patch)",
        "for (const type of Object.keys(nodeGraphModuleDefinitions || {}))",
        "return counts;",
        "function nodeGraphGridRectsOverlap(a, b)",
        "function addNodeGraphModuleFromContext(event)",
        "function addNodeGraphModuleFromShop(button)",
        "const nodeGraphModuleStoreTypes = Object.freeze(Object.keys(nodeGraphModuleDefinitions));",
        "\"additiveOsc\"",
        "\"gpuAdditiveOsc\"",
        "developerOnly: true",
        "\"ellipsoid\"",
        "\"polyBlep\"",
        "Anti-aliased PolyBLEP oscillator for clean saw, ramp, square, triangle, sine, and noise waveform outputs.",
        'notes: ["anti-aliasing", "polyblep", "realtime oscillator"]',
        "\"sineWavetable\"",
        "Table-driven sine/cosine oscillator with pitch, frequency, amplitude, and Nyquist-edge fade. Native C++/WASM.",
        'label: "SinCos"',
        'notes: ["implemented", "wavetable", "sin/cos", "native"]',
        "\"clock\"",
        "\"clockDivider\"",
        "\"delayedTrigger\"",
        "\"buttonEvents\"",
        "\"wireBreak\"",
        "\"wireConnect\"",
        "\"wireDisconnect\"",
        "\"windowReopen\"",
        "\"shootingStarTail\"",
        "\"shootingStarExplosion\"",
        "\"nextPatch\"",
        "\"previousPatch\"",
        "\"randomClock\"",
        "\"triggerCounter\"",
        "\"triggerDivider\"",
        "\"stepSequencer\"",
        "\"chordSequencer\"",
        "\"noiseGenerator\"",
        "\"randomWalk\"",
        "\"fractalBrownianNoise\"",
        "\"passiveFilter\"",
        "\"ladderFilter\"",
        "\"slewLimiter\"",
        "\"delayEffect\"",
        "\"reverbEffect\"",
        "\"sampleHold\"",
        "\"lorenzAttractor\"",
        "\"chuaAttractor\"",
        "\"expAdsr\"",
        "\"linearEnvelope\"",
        "\"pluckEnvelope\"",
        "\"vactrolEnvelopeSeries\"",
        "\"flowerChildEnvelopeFollower\"",
        "\"bloomGlow\"",
        "\"rgbaHsla\"",
        "\"chromaColor\"",
        "\"canvas\"",
        "\"visualOscilloscope\"",
        "\"sandboxVisuals\"",
        "\"macroKnob\"",
        "\"bipolarKnob\"",
        "\"valueSlider\"",
        "\"midiOut\"",
        "\"midiNotePitch\"",
        "External page button event source.",
        "buttonEvents: \"Button Events\"",
        'outputs: ["Click", "Hover", "Down", "Up", "Enter", "Leave"]',
        "wireBreak: \"Wire Break\"",
        'outputs: ["Pulse", "Gate"]',
        'category: "Game Triggers"',
        "Universe-physics wire break event source.",
        "wireConnect: \"Wire Connect\"",
        "Wire connect event source.",
        "wireDisconnect: \"Wire Disconnect\"",
        "Wire disconnect event source.",
        "windowReopen: \"Window Reopen\"",
        'outputs: ["Pulse", "Gate", "Sine"]',
        "Window attention event source.",
        "shootingStarTail: \"Shooting Star Tail\"",
        "shootingStarExplosion: \"Shooting Star Explosion\"",
        "Placeholder trigger for a shooting star tail event.",
        "Website shooting-star collision event source.",
        "Patch command receiver.",
        "nextPatch: \"Next Patch\"",
        "previousPatch: \"Previous Patch\"",
        'inputs: ["Trigger"]',
        'outputs: []',
        'layout: "patchCommand"',
        "function createNodeGraphPatchCommandState()",
        "function nodeGraphPatchCommandTriggerSample(state, trigger, threshold, command, nodeId)",
        "nodeGraphLiveModuleEvaluators.nextPatch = (",
        'queueNodeGraphLivePatchCommand(command, nodeId)',
        'message.type === "patchCommand"',
        'queueNodeGraphLivePatchCommand(message.command, message.nodeId || "")',
        '"nextPatch",',
        "\"keyboardController\"",
        "\"macroControls\"",
        "\"pitchModWheel\"",
        "\"groupInput\"",
        "\"groupOutput\"",
        "\"samplePlayer\"",
        "\"sampleLooper\"",
        "\"speakerProtection\"",
        "\"badvalMonitor\"",
        "Hard safety fuse. Trips ear and speaker protection immediately if a wired sample exceeds absolute 1.0.",
        "\"Debug\"",
        "Debug: {",
        'category: "Debug"',
        "Visual: {",
        'category: "Visual"',
        "Screen Visuals",
        "Image",
        "Canvas",
        "Layered RGBA compositor",
        "layer compositor",
        "RGBA output",
        "shader script",
        "Display",
        "shake input",
        "scope pause",
        "trace texture",
        "square display",
        "function renderNodeGraphModuleStoreCatalog()",
        "kind: \"moduleGroup\"",
        "function normalizeNodeGraphModuleGroup(value = {})",
        "function nodeGraphEvaluateModuleGroup(runtime, node, mixInput, sampleRate, frame, frames)",
        "function nodeGraphExternalButtonEventPulse(runtime, name)",
        "nodeGraphLiveModuleEvaluators.buttonEvents = (",
        'Click: nodeGraphExternalButtonEventPulse(runtime, "click")',
        "function nodeGraphWireBreakEventSample(runtime)",
        "nodeGraphLiveModuleEvaluators.wireBreak = (",
        "nodeGraphWireBreakEventSample(runtime)",
        "function nodeGraphWireDisconnectEventSample(runtime)",
        "function nodeGraphWireConnectEventSample(runtime)",
        "nodeGraphLiveModuleEvaluators.wireConnect = (",
        "nodeGraphWireConnectEventSample(runtime)",
        "nodeGraphLiveModuleEvaluators.wireDisconnect = (",
        "nodeGraphWireDisconnectEventSample(runtime)",
        "function nodeGraphWindowReopenEventSample(runtime)",
        "nodeGraphLiveModuleEvaluators.windowReopen = (",
        "nodeGraphWindowReopenEventSample(runtime)",
        "Math.sin(Math.PI",
        "externalButtonEvents: new Map()",
        "wireBreakEvent: { pulseSamples: 0, gateSamples: 0 }",
        "wireConnectEvent: { pulseSamples: 0 }",
        "wireDisconnectEvent: { pulseSamples: 0 }",
        "windowReopenEvent: { pulseSamples: 0, gateSamples: 0, totalSamples: 0 }",
        "shootingStarExplosionEvent: { pulseSamples: 0 }",
        "function triggerNodeGraphWireBreakEvent(reason = \"\")",
        "function triggerNodeGraphWireConnectEvent(reason = \"\")",
        "function triggerNodeGraphWireDisconnectEvent(reason = \"\")",
        "function triggerNodeGraphWindowReopenEvent(reason = \"\")",
        "function triggerNodeGraphGameEvent(name, payload = {})",
        "function triggerNodeGraphShootingStarExplosionEvent(payload = {})",
        "window.soemdspSandboxTriggerButtonEvent = triggerNodeGraphExternalButtonEvent",
        "window.soemdspSandboxTriggerWireBreakEvent = triggerNodeGraphWireBreakEvent",
        "window.soemdspSandboxTriggerWireConnectEvent = triggerNodeGraphWireConnectEvent",
        "window.soemdspSandboxTriggerWireDisconnectEvent = triggerNodeGraphWireDisconnectEvent",
        "window.soemdspSandboxTriggerWindowReopenEvent = triggerNodeGraphWindowReopenEvent",
        "window.soemdspSandboxTriggerGameEvent = triggerNodeGraphGameEvent",
        "window.soemdspSandboxTriggerShootingStarExplosionEvent = triggerNodeGraphShootingStarExplosionEvent",
        'message.type === "soundemote:sandbox-event"',
        "nodeGraphExternalMessageOriginAllowed(event)",
        "nodeGraphExternalSandboxEventNames.has(eventName)",
        'message.type === "soemdsp-sandbox-button-event"',
        'message.type === "soemdsp-sandbox-file-grid-selection"',
        'type: "externalButtonEvent"',
        'type: "wireBreakEvent"',
        'type: "wireConnectEvent"',
        'type: "wireDisconnectEvent"',
        'type: "windowReopenEvent"',
        'type: "shootingStarExplosionEvent"',
        "function nodeGraphBuildLivePlanForPatch(patch)",
        "moduleGroupPlan",
        "nodeGraphLiveModuleEvaluators.groupInput = (",
        "nodeGraphLiveModuleEvaluators.moduleGroup = (",
        "nodeGraphLiveModuleEvaluators.groupOutput = (",
        "function normalizeNodeGraphModuleStoreDepartment(department = \"\")",
        "return \"Sequence\";",
        "function setNodeGraphModuleStoreDepartment(department = \"\")",
        "nodeGraphMvp.moduleStoreDepartment = normalizeNodeGraphModuleStoreDepartment(department)",
        "moduleStoreDepartmentSearch",
        "function nodeGraphNormalizeModuleDepartmentSearch(value = \"\")",
        "function handleNodeGraphModuleDepartmentSearchInput(event)",
        "function handleNodeGraphModuleDepartmentSearchKeydown(event)",
        "function nodeGraphModuleStoreEntryMatchesSearch(entry, query)",
        "function nodeGraphModuleStoreDepartmentMatchesSearch(department, entries, query)",
        "function nodeGraphModuleStoreSearchResultOrder(a, b)",
        "const implementedDelta = Number(Boolean(b?.implemented)) - Number(Boolean(a?.implemented))",
        "function nodeGraphModuleStorePublicEntriesByDepartment(entries = [])",
        "for (const department of nodeGraphModuleStoreDepartments)",
        "const searchingAllModules = !selectedDepartment",
        "const visibleModuleEntries = selectedDepartment || departmentSearch",
        "[...publicEntries].sort(nodeGraphModuleStoreSearchResultOrder)",
        "shopView.classList.toggle(\"department-selected\", Boolean(selectedDepartment))",
        "departmentTitle.textContent = selectedDepartment || \"\"",
        "createNodeGraphModuleDepartmentButton(department, entries)",
        "available.classList.add(\"scene-context-store-department-list\")",
        "available.classList.toggle(\"node-module-store-list\", Boolean(selectedDepartment || searchingAllModules))",
        "if (selectedDepartment || searchingAllModules)",
        "No modules match this search.",
        "function positionNodeGraphModuleShopView(x, y)",
        "function beginNodeGraphModuleShopViewDrag(event)",
        "function dragNodeGraphModuleShopView(event)",
        "function endNodeGraphModuleShopViewDrag(event)",
        "function saveNodeGraphSelectionAsModuleGroup()",
        "function addNodeGraphModuleGroupFromBrowser(name)",
        "output: {",
        'category: "Audio"',
        'label: "Output"',
        'symbol: "OUT"',
        'node-camera-preview-wire-svg',
        "function renderNodeGraphCameraView()",
        "if (typeof drawNodeGraphWires === \"function\")",
        "element.closest(\"defs\")",
        "function beginNodeGraphCameraFrameDrag(event)",
        "function dragNodeGraphCameraFrame(event)",
        "function endNodeGraphCameraFrameDrag(event)",
        "const nodeGraphModuleGroupStorageKey",
        "const nodeGraphModuleCatalogVisibilityStorageKey",
        "soemdsp-sandbox.moduleCatalogVisibility.v2",
        "developer: true",
        "home: false",
        "const developerVisible = nodeGraphModuleIsStoreVisible(type, \"developer\")",
        "const developerOnly = nodeGraphModuleStoreCatalog[type]?.developerOnly === true",
        "const publicVisible = !developerOnly",
        "developerOnly,",
        "developerVisible,",
        "homeVisible: nodeGraphModuleIsStoreVisible(type, \"home\") && implemented",
        "shopVisible: publicVisible",
        "visible: publicVisible",
        "return true;",
        "const homeEntries = entries.filter((entry) => entry.implemented && entry.homeVisible)",
        "const publicEntries = matchingEntries.filter((entry) =>",
        "(!selectedDepartment || entry.category === selectedDepartment)",
        "function listenToNodeGraphModuleStoreDemo(entry)",
        "function watchNodeGraphModuleStoreDemo(entry)",
        "function editNodeGraphModuleStoreDemo(entry)",
        "card.dataset.contextModule = entry.type",
        "card.role = \"button\"",
        "card.tabIndex = 0",
        "function handleNodeGraphModuleStoreKeydown(event)",
        "addNodeGraphModuleFromShop(addButton)",
        "card.dataset.contextGroup = name",
        "function loadNodeGraphModuleCatalogVisibilityLocal()",
        "function saveNodeGraphModuleCatalogVisibilityLocal(value = nodeGraphModuleCatalogVisibility())",
        "data-context-group",
        "function setNodeGraphModuleCatalogVisibility(type, visible, shelf = \"shop\")",
        "const nodeGraphModuleStoreDepartments = Object.freeze([",
        "\"Oscillator\"",
        "\"Chaos\"",
        "\"Jerobeam\"",
        "\"Noise\"",
        "\"Filter\"",
        "\"Envelope\"",
        "\"Modulators\"",
        "\"Delay\"",
        "\"Drum\"",
        "\"Dynamics\"",
        "\"Sequence\"",
        "\"Audio\"",
        "\"Visual\"",
        "\"Controllers\"",
        "\"Portals\"",
        "\"Loops\"",
        "\"Samples\"",
        "\"Debug\"",
        'samplePlayer: {\n    category: "Audio"',
        'audioPlayer: {\n    category: "Audio"',
        'sampleLooper: {\n    category: "Audio"',
        'pitch: "Audio-file shelf. Empty by default',
        'pitch: "Loop-file shelf. Empty by default',
        "nodeGraphModuleStoreVisualGroups",
        "Generate",
        'spiral: {\n    category: "Jerobeam"',
        'label: "Jerobeam Spiral"',
        "Process",
        'rotate3dTo2d: {\n    category: "Dynamics"',
        'label: "Rotation 3D to 2D"',
        "Interact",
        "Memory",
        "Ellipsoid",
        "PolyBLEP",
        "GPU Additive",
        "SinCos",
        "ChordSequencer",
        "Arpeggiator",
        "Delay",
        "SabrinaReverb",
        "ExponentialEnvelope",
        "LinearEnvelope",
        "PluckEnvelope",
        "Parabol",
        "Macro Knob",
        "Bipolar Knob",
        "Value Slider",
        "MIDI Keyboard",
        "Sample Player",
        "Sample Looper",
        "Lorenz Attractor",
        "ChuaAttractor",
        "moduleCatalogVisibility",
        "moduleStoreDepartment",
        "moduleShopDragging",
        "view.moduleCatalogVisibility",
        "nodeTypeCounts",
        "slider.dataset.mid",
        "slider.dataset.default",
        "slider.dataset.step",
        'slider.step = "any"',
        "slider.dataset.kind",
        "slider.dataset.unit",
        "slider.dataset.choices",
        "slider.dataset.displayChoices",
        "slider.dataset.divideChoicesVisibly",
        "slider.dataset.linearSmoothing",
        "slider.dataset.nonlinearSlider",
        "slider.dataset.showSign",
        "slider.dataset.wraparound",
        "function beginNodeSliderReadoutEdit(readout)",
        "function commitNodeSliderReadoutEdit(input)",
        'input.type = "text"',
        'input.inputMode = "text"',
        "const normalizedValue = String(rawValue).trim()",
        "const choiceIndex = nodeSliderChoiceIndexFromText(slider, normalizedValue)",
        "const value = choiceIndex ?? parseNodeSliderMathExpression(normalizedValue)",
        "function quantizeNodeSliderDragValue(slider, value)",
        "function setNodeSliderValue(slider, value, options = {})",
        "const isDrag = options.interaction === \"drag\"",
        "slider.dataset.unboundedValue = String(number)",
        "function nodeSliderSegmentValueFromPointer(slider, surface, clientX)",
        "function setNodeChoiceSliderFromPointer(slider, surface, clientX, options = {})",
        "Math.round(current) === Math.round(value)",
        "function nodeSliderValueFromPointer(slider, surface, clientX)",
        "function nodeSliderFineTuneScale(event)",
        "nodeGraphNumericDragMultiplier(event)",
        "function nodeSliderKeyboardStep(slider, event)",
        "function stepNodeSliderFromKeyboard(event)",
        "ArrowRight",
        "Home",
        "End",
        "readout.addEventListener(\"keydown\", stepNodeSliderFromKeyboard)",
        "function reanchorNodeSliderDragAtPointer(drag, event)",
        "function nodeSliderValueAtPointer(slider, surface, event)",
        "function setNodeSliderValueAtPointer(slider, surface, event, options = {})",
        "const resetToDefaultOnClick = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey",
        "const pointerMode = \"relative\"",
        "nodeGraphNumericModifierReserved(event)",
        "const jumpToPointerOnClick = event.altKey",
        "setNodeSliderValueAtPointer(slider, surface, event, { interaction: \"drag\" })",
        "pointerMode,",
        "fineScale: nodeSliderFineTuneScale(event)",
        "const travelDelta = ((horizontalDelta + verticalDelta) / visualTravelWidth) * drag.fineScale",
        "resetToDefaultOnClick,",
        "drag.resetToDefaultOnClick && !drag.moved",
        "setNodeSliderValue(drag.slider, Number(drag.slider.dataset.default), { interaction: \"drag\" })",
        "function commitNodeSliderDragValue(slider, status = \"parameter changed\")",
        "function scheduleNodeSliderDragAutosave()",
        "parameter reset to default",
        "drag.fineScale",
        "Math.floor(progress * choices.length)",
        "deferAutosave: isDrag",
        "deferUi: true",
        "function populateNodeSliderReadoutShell(readout)",
        "markNodeGraphRenderPending();",
        "if (typeof scheduleNodeGraphModuleScopeDraw === \"function\")",
        "function beginNodeSliderDrag(event)",
        "function dragNodeSlider(event)",
        "event.altKey && !(event.shiftKey && (event.ctrlKey || event.metaKey))",
        "setNodeSliderValueAtPointer(drag.slider, drag.surface, event, { interaction: \"drag\" })",
        "function endNodeSliderDrag(event)",
        "let startTravel = nodeSliderTravelFromValue(slider, Number(slider.value))",
        "!resetToDefaultOnClick && nodeSliderShouldDisplayChoices(slider)",
        "setNodeChoiceSliderFromPointer(slider, surface, event.clientX, { interaction: \"drag\" })",
        "{ interaction: \"drag\" }",
        "startTravel = nodeSliderTravelFromValue(slider, Number(slider.value))",
        "const verticalDelta = drag.startY - event.clientY",
        "const visualTravelWidth = Math.max(1, drag.width * (Number(drag.visualScale) || 1))",
        "const travelDelta = ((horizontalDelta + verticalDelta) / visualTravelWidth) * drag.fineScale",
        "const nextTravel = drag.startTravel + travelDelta",
        "nodeSliderValueFromRelativeTravel(drag.slider, nextTravel)",
        "reanchorNodeSliderDragAtPointer(drag, event)",
        "function syncNodeSliderHiddenMouseClass()",
        "nodeGraphMvp.hideMouseWhileDragging !== false",
        'document.body.classList.add("node-slider-dragging")',
        'document.body.classList.remove("node-slider-dragging")',
        'addEventListener("pointerdown", beginNodeSliderDrag, true)',
        'document.addEventListener("pointermove", dragNodeSlider)',
        'document.addEventListener("pointerup", endNodeSliderDrag)',
        'document.addEventListener("pointercancel", endNodeSliderDrag)',
        'readout.addEventListener("contextmenu"',
        "node-slider-readout",
        "node-slider-readout-portal",
        "node-slider-readout-value",
        "node-slider-readout-unit",
        "function syncNodeSliderPortalHandle",
        "function nodeSliderChoiceDividerBackground",
        "function nodeSliderChoiceSquareRects",
        "function syncNodeSliderChoiceDebugSquares",
        "readout.classList.toggle(\"wraparound-slider\"",
        "nodeSliderShouldWraparound(slider) && !usesChoices",
        "unitText.classList.toggle(\"is-empty\", !unit)",
        "readout.dataset.choiceCount = usesChoices ? String(choices.length) : \"0\"",
        "readout.classList.toggle(\"choices-divided\", dividesChoices)",
        "--value-start",
        "--value-end",
        "readout.style.setProperty(\"--choice-divider-background\"",
        "function nodeGraphValidate()",
        "function nodeGraphModuleOutputPorts(type)",
        "function nodeGraphParameterOutputPort(typeOrNode, port)",
        "function compileNodeGraphExecutionPlan(patch = nodeGraphMvp.patch)",
        "const passthroughTypes = new Set([\"badvalMonitor\", \"bias\", \"chaoticPhaseLockingFilter\", \"cookbookFilter\", \"flowerChildFilter\", \"gain\", \"humanFilter\", \"ladderFilter\", \"papoulisFilter\", \"passiveFilter\", \"pll\", \"resonatorFilter\", \"reverbEffect\", \"rsmetFilter\", \"sampleHold\", \"slewLimiter\", \"softClipper\", \"speakerProtection\", \"superloveFilter\", \"tb303Filter\", \"yellowjacketFilter\"])",
        "nodeGraphModuleDefinitions[node?.type]?.visualSink",
        "function nodeGraphVisualSinkActiveInPlan(node, options = {})",
        "return true;",
        "nodeGraphModuleDefinitions[node.type]?.monitorSink",
        "function nodeGraphCompiledVisualSinks(graph, reachableNodes)",
        "const visualSinks = nodeGraphCompiledVisualSinks(graph, reachableNodes)",
        "function nodeGraphActiveVisualSinkExists(visualSinks = [])",
        "sink.hasParameters || (sink.inputs || []).some",
        "hasParameters: (nodeGraphModuleDefinitions[node.type]?.parameters || []).length > 0",
        "connections: (graph.inputConnections.get(nodeGraphInputKey(node.id, input.port)) || [])",
        "function nodeGraphValidateRuntimeRoute(issues, options = {})",
        '"visualOscilloscope"',
        "const hasActiveVisualSink = nodeGraphActiveVisualSinkExists(visualSinks)",
        "nodeGraphValidateRuntimeRoute(issues, {",
        '"canvas"',
        "function nodeGraphModuleIsRealtimeOscillatorType(type)",
        'return type === "osc" || type === "polyBlep" || type === "sineWavetable"',
        "nodeGraphModuleIsRealtimeOscillatorType(type)",
        "nodeGraphModuleIsRealtimeOscillatorType(type) ||",
        "const nodeGraphMidiKeyboardMinOctave = -4",
        "const nodeGraphMidiKeyboardMaxOctave = 4",
        "const nodeGraphMidiKeyboardMemoryStorageKey",
        "function normalizeNodeGraphMidiKeyboardMemorySignal(signal, options = {})",
        "function saveNodeGraphMidiKeyboardMemory()",
        "function loadNodeGraphMidiKeyboardMemory()",
        "function applyNodeGraphMidiKeyboardMemory()",
        "function ensureNodeGraphMidiKeyboardMemoryLoaded()",
        "function nodeGraphMidiKeyboardSignalFromRaw(rawMidi, options = {})",
        "function renderNodeGraphMidiKeyboardKeyLabels()",
        "nodeGraphMidiKeyboardPitchLabel(nodeGraphMidiKeyboardShiftMidi(rawMidi, octave))",
        "saveNodeGraphMidiKeyboardMemory();",
        "function changeNodeGraphMidiKeyboardOctave(delta)",
        "rawMidi",
        "octave",
        '"bloomGlow"',
        '"chromaColor"',
        '"keyboardController"',
        '"led"',
        '"macroKnob"',
        '"bipolarKnob"',
        '"midiNotePitch"',
        '"midiOut"',
        '"rgbaHsla"',
        '"sandboxVisuals"',
        'type === "keyboardController"',
        'type === "macroKnob"',
        'type === "bipolarKnob"',
        "function compileValidatedNodeGraphExecutionPlan(patch = nodeGraphMvp.patch)",
        "function nodeGraphBuildDependencyMap(patch = nodeGraphMvp.patch)",
        "const bypassedNodes = nodeGraphRuntimeBypassedNodeIds(patch)",
        "bypassedNodes.has(connection.sourceNode) || bypassedNodes.has(connection.destinationNode)",
        "bypassedNodes.has(modulation.sourceNode) || bypassedNodes.has(modulation.destinationNode)",
        "function nodeGraphTopologicalOrder(nodes, dependencies, reachableNodes)",
        "function nodeGraphDependencyPathExists(dependencies, startNode, targetNode)",
        "function nodeGraphNodeOrderIndexes(nodes)",
        "function nodeGraphCompareSchedulingEdges(a, b)",
        "function nodeGraphSchedulingEdge(sourceNode, destinationNode, kind, index, payload, nodeOrder)",
        "function nodeGraphBuildSchedulingDependencies(planGraph, reachableNodes)",
        "const orderDependencies = new Map",
        "const nodeOrder = nodeGraphNodeOrderIndexes(planGraph.nodes)",
        "const schedulingEdges = []",
        "const validSignalWires = new Set",
        "for (const [index, connection] of planGraph.connections.entries())",
        "nodeGraphDependencyPathExists(orderDependencies, edge.sourceNode, edge.destinationNode)",
        "for (const [index, modulation] of planGraph.modulations.entries())",
        "schedulingEdges.sort(nodeGraphCompareSchedulingEdges)",
        "nodeGraphTopologicalOrder(graph.nodes, scheduling.orderDependencies, reachableNodes)",
        "function readNodeGraphRuntimeOutput(runtime, frameValues, nodeId, port = \"Out\")",
        "const tailInputFrames = Number(runtime.tailInputFrames)",
        "const tailSilencedNodeIds = runtime.tailSilencedNodeIds",
        "absoluteFrame >= tailInputFrames",
        "tailSilencedNodeIds?.has(nodeId)",
        "output[port] ?? output.Out",
        "function readNodeGraphRuntimePortOutput(runtime, frameValues, nodeId, port = \"Out\"",
        "function normalizeNodeGraphParameterOutputValue(value, metadata = {})",
        "function nodeGraphSignalWireIdentity(connection)",
        "function nodeGraphModulationWireIdentity(modulation)",
        "function nodeGraphFeedbackIdentitySets(plan)",
        "function nodeGraphActiveNodeIds(plan)",
        "function nodeGraphPlanBypassedNodeIds(plan)",
        "function nodeGraphWireTouchesBypassed(wire, plan)",
        "function nodeGraphActiveSignalConnections(plan)",
        "function nodeGraphActiveModulations(plan)",
        "function nodeGraphInactiveWireReads(plan)",
        "function nodeGraphExecutionWireReads(plan)",
        "function nodeGraphExecutionWireRows(plan)",
        "function nodeGraphWireModeHelp(mode)",
        "function renderNodeGraphExecutionSummarySelection()",
        "function markNodeGraphPortConnected(node, port, io)",
        "function nodeGraphCanonicalPortForNode(node, port, io)",
        "nodeGraphCanonicalOutputPort(type, port)",
        "const canonicalPort = nodeGraphCanonicalPortForNode(node, port, io)",
        "function nodeGraphElementPatchPointClientCenter(element, io = null)",
        'element.classList?.contains("node-param-port")',
        "function nodeGraphCssPatchPointClientCenter(element, rect, io = null)",
        "function nodeGraphParameterPatchPointClientCenter(element, rect, io = null)",
        "function nodeGraphParameterPatchPointSide(element, io = null)",
        'element.classList.contains("parameter-output")',
        "? rect.right",
        "? rect.left",
        'style.getPropertyValue("--node-patch-point-x").trim()',
        "const pixelMatch = cssX.match",
        "function markNodeGraphModulationPortConnected(node, parameter)",
        "function nodeGraphWireEndpointsAreRenderable(wire)",
        "function nodeGraphWireInteractionMode(wire, identity, feedbackSet, activeWirePredicate, activeNodeIds, plan)",
        "function nodeGraphWirePathClass(...classes)",
        "function markNodeGraphWireEndpointsConnected(wire, destinationIo = \"input\")",
        "function nodeGraphDrawSignalWire(svg, connection, index, context)",
        "function nodeGraphDrawModulationWire(svg, modulation, index, context)",
        "function nodeGraphDrawTemporaryWire(svg, options)",
        "function nodeGraphResetConnectedWireClasses(workspace)",
        'port.classList.remove("connected-port")',
        "nodeGraphResetConnectedWireClasses(workspace)",
        "nodeGraphDrawSignalWire(svg, connection, index, context)",
        "nodeGraphDrawModulationWire(svg, modulation, index, context)",
        "nodeGraphDrawTemporaryWire(svg, {",
        "function nodeGraphStateReadCount(plan)",
        "function nodeGraphStateReadText(count)",
        "function nodeGraphActiveNodeText(plan)",
        "function nodeGraphActiveWireCount(plan)",
        "function nodeGraphPatchWireCount(plan)",
        "function nodeGraphActiveWireText(plan)",
        "Execution model: single-pass stored-output",
        "connections: graph.connections",
        "inactiveNodes,",
        "modulations: graph.modulations",
        "reachableNodes: [...reachableNodes]",
        "speakerOutputActive: hasOutputNode && hasOutputSpeakerInput",
        "visualSinks,",
        "function nodeGraphExecutionParameterSnapshot(plan)",
        "const nodesById = new Map((plan.nodes || []).map",
        "function nodeGraphLastRenderDebug()",
        "function nodeGraphRuntimeBoundaryDebug(plan)",
        "function nodeGraphSoemdspRuntimeMapping(plan)",
        "nodeGraphSoemdspObjectConcept",
        "Binding syncs parameter/control memory; DSP objects do not know Circuit",
        "Circuit/patch describes nodes, parameters, and raw connections; it does not own concrete DSP objects",
        "Compiler filters authoring state and emits order, active wires, parameter bindings, and state-read edges",
        "Caller owns concrete DSP objects and invokes them in compiled order",
        "soemdspMapping: nodeGraphSoemdspRuntimeMapping(plan)",
        "soemdspMapping(patch = nodeGraphMvp.patch)",
        "function nodeGraphSoemdspRuntimeSketch(plan)",
        "soemdspRuntimeSketch: nodeGraphSoemdspRuntimeSketch(plan)",
        "soemdspRuntimeSketch(patch = nodeGraphMvp.patch)",
        "processCallerOwnedDspObject(node, externalParameterMemory, storedOutputs);",
        "Binding::apply(circuit, externalParameterMemory);",
        "const sketch = document.getElementById(\"nodeRuntimeSketch\")",
        "const jsonStatus = document.getElementById(\"nodeExecutionJsonStatus\")",
        "const sketchStatus = document.getElementById(\"nodeRuntimeSketchStatus\")",
        "sketch.textContent = plan.valid",
        "runtime sketch blocked:",
        "Caller-owned C++ runtime mapping sketch",
        "function fallbackCopyTextToClipboard(text)",
        "async function copyTextToClipboard(text)",
        "async function copyNodeGraphRuntimeSketch()",
        "async function copyNodeGraphExecutionJson()",
        "navigator.clipboard?.writeText",
        "Clipboard API unavailable",
        "clipboard fallback failed",
        "document.execCommand(\"copy\")",
        "range.selectNodeContents(sketch)",
        "selection.addRange(range)",
        "sketchStatus.textContent = \"selected\"",
        "jsonStatus.textContent = \"selected\"",
        'document.getElementById("nodeCopyExecutionJsonButton").addEventListener("click", copyNodeGraphExecutionJson)',
        'document.getElementById("nodeCopyRuntimeSketchButton").addEventListener("click", copyNodeGraphRuntimeSketch)',
        'nodeGraphTooltipText("actions.copyExecutionJson")',
        'nodeGraphTooltipText("actions.copyRuntimeSketch")',
        'nodeGraphTooltipText("module.executionActive"',
        'nodeGraphTooltipText("module.executionListItem"',
        'nodeGraphTooltipText("module.drag")',
        "item.dataset.executionOrder = String(index + 1)",
        'nodeGraphTooltipText("module.executionBypassed")',
        'nodeGraphTooltipText("module.executionInactive")',
        "slider.removeAttribute(\"title\")",
        "readout.removeAttribute(\"title\")",
        "function nodeGraphPatchFingerprint(patch = nodeGraphMvp.patch)",
        "lastRender: nodeGraphLastRenderDebug()",
        "connectionCount: Number(rendered.connectionCount) || 0",
        "clipCount: Number(rendered.clipCount) || 0",
        "feedbackConnectionCount: Number(rendered.feedbackConnectionCount) || 0",
        "feedbackModulationCount: Number(rendered.feedbackModulationCount) || 0",
        "modulationCount: Number(rendered.modulationCount) || 0",
        "nodeCount: Number(rendered.nodeCount) || 0",
        "matchesCurrentPatch: rendered.patchFingerprint === currentPatchFingerprint",
        "patchFingerprint,",
        "renderNodeGraphExecutionPlanDebug();\n    drawNodeRenderedAudio();",
        "renderNodeGraphExecutionPlanDebug();\n  drawNodeRenderedAudio();",
        "function drawNodeRenderedVisualOutput(options = {})",
        "options.canvas || document.getElementById(\"nodeVisualOutputCanvas\")",
        "const includePlaybackCursor = options.includePlaybackCursor !== false",
        "const updateUi = options.updateUi !== false",
        "function renderNodeVisualOutputMeta(entries = {})",
        "drawNodeRenderedVisualOutput();",
        "canvas.dataset.visualSource = \"node graph rendered audio\"",
        "canvas.dataset.visualMode = visualMode",
        "canvas.dataset.visualModeSetting = visualSettings.mode",
        "canvas.dataset.visualPlaybackFrame",
        "canvas.dataset.visualPlaybackProgress",
        "canvas.dataset.visualPlaybackState",
        "canvas.dataset.visualPatchFingerprint",
        "canvas.dataset.visualScale = String(visualSettings.scale)",
        "canvas.dataset.visualStyle = visualSettings.style",
        "canvas.dataset.visualTheme = visualSettings.theme",
        "canvas.dataset.visualTrail = String(visualSettings.trail)",
        "context.globalAlpha = visualSettings.trail",
        "function stopNodeGraphRenderedPlayback()",
        "function resetNodeGraphRenderedPlaybackCursor(redraw = true) {",
        "function resetNodeGraphRenderedPlaybackCursor(redraw = true)",
        "function nodeGraphRenderedPlaybackFrame(maxFrames = 0)",
        "function nodeGraphVisualOutputSize(sourceCanvas = nodeGraphVisualOutputSourceCanvas())",
        'document.getElementById("nodeTripEarProtectionButton")',
        "function nodeGraphVisualThemeColors(theme = \"cyan-violet\")",
        "visualTheme.trace",
        "const visualScale = 0.42 * visualSettings.scale",
        "function drawVisualTrace({ lineWidth, strokeStyle })",
        "visualSettings.style === \"points\"",
        "renderNodeVisualOutputMeta({",
        "function serializeNodeGraphExecutionPlanDebug(plan)",
        "function serializeNodeGraphExecutionPlanApiDebug(plan)",
        "currentPatchFingerprint: nodeGraphPatchFingerprint()",
        "function installNodeGraphDebugApi()",
        "window.soemdspSandboxDebug = Object.freeze",
        "compileExecutionPlan(patch = nodeGraphMvp.patch)",
        "compileValidatedNodeGraphExecutionPlan(patch)",
        "currentPatchFingerprint()",
        "lastRender()",
        "live()",
        "function renderNodeGraphExecutionPlanDebug(plan = compileNodeGraphExecutionPlan())",
        "function renderNodeGraphExecutionOrderBadges(plan)",
        "function renderNodeGraphExecutionPlanSummary(plan)",
        "badge.dataset.executionState = \"active\"",
        "badge.dataset.executionState = \"bypassed\"",
        "setNodeGraphSelection({ type: \"wire\", kind: row.kind, index: row.index })",
        "nodeGraphWireModeHelp(row.mode)",
        "item.dataset.connectionKind = row.kind",
        "item.dataset.wireMode = row.mode",
        "const activeNodeText = nodeGraphActiveNodeText(plan)",
        "const activeWireText = nodeGraphActiveWireText(plan)",
        "].filter(Boolean).join(\" / \")",
        "function evaluateNodeGraphPlanFrame(runtime, sampleRate, frame, frames)",
        "function jerobeamSpiralSample(options)",
        "function nodeGraphLorenzAttractorSample(options = {})",
        "function createNodeGraphLorenzAttractorState()",
        "const dt = (0.75 * speed) / sampleRate;",
        "const steps = Math.max(1, Math.ceil(dt / 0.0007));",
        "function spiralRender(inX, inY, inZ, zDepth)",
        "function spiralShape(lophas, phasor, dense, div, morph)",
        "function spiralRotate(inX, inY, inZ, rotX, rotY)",
        "function spiralNextPhasor(state, key, frequency, offset, sampleRate, bipolar = false)",
        "spiralStates",
        "lorenzAttractorStates",
        "function createNodeGraphLowpassState()",
        "function createNodeGraphOscResetState()",
        "function createNodeGraphSlewLimiterState()",
        "function createNodeGraphClockState()",
        "function createNodeGraphDelayedTriggerState()",
        "function createNodeGraphSampleHoldState()",
        "function createNodeGraphStepSequencerState()",
        "function createNodeGraphTriggerCounterState()",
        "function createNodeGraphTriggerDividerState()",
        "function createNodeGraphExpAdsrState()",
        "function createNodeGraphLinearEnvelopeState()",
        "function createNodeGraphPluckEnvelopeState()",
        "function createNodeGraphVactrolEnvelopeState()",
        "function createNodeGraphFlowerChildEnvelopeFollowerState()",
        "function createNodeGraphNoiseGeneratorState()",
        "function createNodeGraphRandomWalkState()",
        "function createNodeGraphFractalBrownianNoiseState()",
        "const nodeGraphBadValueExplosionLimit = 999999999",
        "const nodeGraphBadValueDenormalLimit = 1.1754943508222875e-38",
        "function nodeGraphBadValueReason(value)",
        "return \"exploded\"",
        "return \"inf\"",
        "return \"NaN\"",
        "return \"denormal\"",
        "function nodeGraphMarkRuntimeBadNumber(runtime, nodeId, source = \"dsp\")",
        "function nodeGraphSafeFilterNumber(value, runtime, nodeId, state, source)",
        "function nodeGraphVisualControlIntensity(value, runtime, nodeId, source = \"visual control\")",
        "function nodeGraphVisualControlSigned(value, runtime, nodeId, source = \"visual control\")",
        "function nodeGraphVisualHslToRgb(hue, saturation, lightness)",
        "chromaAlpha: 0",
        "chromaHue: 0",
        "chromaSaturation: 0",
        "visualBloom: 0",
        "visualBrightness: 0",
        "visualGlow: 0",
        "function nodeGraphSmoothVisualControl(runtime, key, target, sampleRate, seconds = 0.045, min = 0, max = 1)",
        "function nodeGraphBadValueMonitorSample(value, runtime, nodeId)",
        "function nodeGraphOnePoleHighpassSample(state, input, frequency, sampleRate, runtime = null, nodeId = \"\")",
        "function nodeGraphOnePoleLowpassSample(state, input, frequency, sampleRate, runtime = null, nodeId = \"\")",
        "function nodeGraphPassiveFilterSample(state, input, mode, lowFrequency, highFrequency, sampleRate, runtime, nodeId)",
        "function nodeGraphLadderFilterSample(state, input, params, sampleRate, runtime = null, nodeId = \"\")",
        "function nodeGraphLadderFilterCoefficients(frequency, resonance, mode, stages, sampleRate, runtime = null, nodeId = \"\", state = null)",
        "nodeGraphLadderFilterComputeFeedbackFactor",
        "y[0] = coeff.g * safeInput - coeff.k * y[4]",
        "function nodeGraphSlewLimiterSample(state, input, upTime, downTime, sampleRate, runtime = null, nodeId = \"\")",
        "function nodeGraphClockAnalogWhipSample(phase, level)",
        "function nodeGraphClockSample(state, reset, phaseOffset, rate, duty, level, sampleRate, runtime = null, nodeId = \"\")",
        "const safePhaseOffset = wrapNodeSliderValue(",
        "const analog = nodeGraphClockAnalogWhipSample(phase, safeLevel)",
        "const pulse = safeRate > 0 && !resetActive && (!state.hasStarted || nextRawPhase < rawPhase) ? safeLevel : 0",
        "Pulse: pulse",
        "function createNodeGraphRandomClockState()",
        "function nodeGraphRandomClockSample(state, reset, params, sampleRate, runtime = null, nodeId = \"\")",
        "function nodeGraphDelayedTriggerSample(state, trigger, reset, params, sampleRate, runtime = null, nodeId = \"\")",
        "function nodeGraphSampleHoldSample(state, input, trigger, threshold, sampleFrequency, sampleRate, hasInConnected, runtime = null, nodeId = \"\")",
        "function nodeGraphStepSequencerSample(state, trigger, reset, params, runtime = null, nodeId = \"\")",
        "function nodeGraphTriggerCounterSample(state, trigger, reset, params, sampleRate, runtime = null, nodeId = \"\")",
        "function nodeGraphTriggerDividerSample(state, trigger, reset, params, sampleRate, runtime = null, nodeId = \"\")",
        "function nodeGraphPluckEnvelopeSample(state, trigger, release, params, sampleRate, runtime = null, nodeId = \"\")",
        "function nodeGraphLinearEnvelopeSample(state, gate, params, sampleRate, runtime = null, nodeId = \"\")",
        "function nodeGraphVactrolEnvelopeCoefficient(seconds, sampleRate)",
        "function nodeGraphVactrolEnvelopeSample(state, light, params, sampleRate, runtime = null, nodeId = \"\")",
        "1 - Math.exp(-1 / samples)",
        "function nodeGraphFlowerChildSecondsToSamples(seconds, sampleRate)",
        "function nodeGraphFlowerChildEnvelopeFollowerSample(state, input, params, sampleRate, runtime = null, nodeId = \"\")",
        "Math.abs(nodeGraphSafeFilterNumber(input",
        "state.holdCounter = holdSamples",
        "function nodeGraphExponentialCurve(value, skew)",
        "function nodeGraphNoiseGeneratorSample(state, params, runtime = null, nodeId = \"\")",
        "function nodeGraphRandomWalkSample(state, params, sampleRate, runtime = null, nodeId = \"\")",
        "function nodeGraphFractalBrownianNoiseAxisState(state, axis)",
        "function nodeGraphFractalBrownianNoiseSample(state, params, sampleRate, runtime = null, nodeId = \"\", axis = \"x\", options = {})",
        "function nodeGraphFractalBrownianNoiseVector(state, params, sampleRate, runtime = null, nodeId = \"\", reset = 0)",
        "const rawX = nodeGraphFractalBrownianNoiseSample(state, params, sampleRate, runtime, nodeId, \"x\", { raw: true })",
        "const rawY = nodeGraphFractalBrownianNoiseSample(state, params, sampleRate, runtime, nodeId, \"y\", { raw: true })",
        "const rawZ = nodeGraphFractalBrownianNoiseSample(state, params, sampleRate, runtime, nodeId, \"z\", { raw: true })",
        "function nodeGraphRationalCurve(value, skew)",
        "function nodeGraphSmoothNoise1d(x, seed)",
        "function nodeGraphExpAdsrCalcCoef(rate, targetRatio)",
        "function nodeGraphExpAdsrSample(state, gate, params, sampleRate, runtime = null, nodeId = \"\")",
        "Math.exp(-Math.log((1 + safeRatio) / safeRatio) / safeRate)",
        "b0 * safeInput + b1 * state.inputBuffer + a1 * state.outputBuffer",
        "b0 * safeInput + a1 * state.outputBuffer",
        "nodeGraphLiveModuleEvaluators.passiveFilter = (",
        "nodeGraphLiveModuleEvaluators.slewLimiter = (",
        "nodeGraphLiveModuleEvaluators.ladderFilter = (",
        "nodeGraphLiveModuleEvaluators.clockDivider = (",
        "nodeGraphLiveModuleEvaluators.randomClock = (",
        "nodeGraphLiveModuleEvaluators.delayedTrigger = (",
        "nodeGraphLiveModuleEvaluators.sampleHold = (",
        "nodeGraphLiveModuleEvaluators.midiOut = (",
        "nodeGraphLiveModuleEvaluators.midiNotePitch = (",
        "nodeGraphLiveModuleEvaluators.keyboardController = (",
        'hasInput(nodeId, "MIDI Note")',
        'hasInput(nodeId, "Velocity")',
        "const automatedPitch = resetActive || hasInput(nodeId, \"MIDI Note\") || hasInput(nodeId, \"Octave\");",
        "? Math.max(0, Math.min(24, Math.round(rawMidi) - 48))",
        "nodeGraphLiveModuleEvaluators.macroControls = (",
        'hasInput(nodeId, port)',
        "nodeGraphLiveModuleEvaluators.pitchModWheel = (",
        'hasInput(nodeId, "Pitch")',
        "nodeGraphLiveModuleEvaluators.valueSlider = (",
        "return { Bias: offset, Out: offset, offset };",
        "nodeGraphLiveModuleEvaluators.macroKnob = (",
        "return { Out: knobValue, value: knobValue };",
        "nodeGraphLiveModuleEvaluators.stepSequencer = (",
        "nodeGraphLiveModuleEvaluators.triggerCounter = (",
        "nodeGraphLiveModuleEvaluators.triggerDivider = (",
        "nodeGraphLiveModuleEvaluators.expAdsr = (",
        "nodeGraphLiveModuleEvaluators.linearEnvelope = (",
        "nodeGraphLiveModuleEvaluators.pluckEnvelope = (",
        "nodeGraphLiveModuleEvaluators.vactrolEnvelopeSeries = (",
        "nodeGraphLiveModuleEvaluators.flowerChildEnvelopeFollower = (",
        "nodeGraphLiveModuleEvaluators.sandboxVisuals = (",
        "nodeGraphLiveModuleEvaluators.screenSpaceShader = (",
        "function nodeGraphScreenSpaceShaderSample(node, readInput, runtime, nodeId, sampleRate)",
        'if (input.mode === "raw")',
        "nodeGraphLiveModuleEvaluators.bloomGlow = (",
        "nodeGraphLiveModuleEvaluators.rgbaHsla = (",
        "nodeGraphLiveModuleEvaluators.chromaColor = (",
        '"screen visuals shake"',
        '"sandbox visuals x"',
        '"sandbox visuals y"',
        '"screen visuals dim"',
        '"sandbox visuals red"',
        '"sandbox visuals green"',
        '"sandbox visuals blue"',
        '"screen visuals scope off"',
        'read("screenDim", 0)',
        'read("visualBrightness", 0.55)',
        'read("visualBloom", 0.45)',
        'read("visualGlow", 0.6)',
        '"rgba hsla hsl mix"',
        '"rgba hsla alpha"',
        'read("chromaHue", 0.58)',
        'read("visualBrightness", 0.55)',
        '"Full Value": outputMidiNumber',
        "Normalized: outputMidiNumber / 127",
        "440 * (2 ** ((pitch - 69) / 12))",
        '"Pitch 0-1": pitch / 127',
        '"Pitch 0-127": pitch',
        "const keyboardRate = Math.max(1, Number(sampleRate) || nodeGraphMvp.sampleRate || 44100);",
        "const increment = Math.max(0, frequency / keyboardRate)",
        "Increment: increment",
        "ScopeOff: scopeTracesOff",
        "nodeGraphLiveModuleEvaluators.noiseGenerator = (",
        "nodeGraphLiveModuleEvaluators.randomWalk = (",
        "nodeGraphLiveModuleEvaluators.fractalBrownianNoise = (",
        "nodeGraphLiveModuleEvaluators.groupInput = (",
        "nodeGraphLiveModuleEvaluators.moduleGroup = (",
        "nodeGraphLiveModuleEvaluators.groupOutput = (",
        "moduleGroupPlan",
        "nodeGraphLiveModuleEvaluators.badvalMonitor = (",
        "BADVAL Monitor input",
        "function nodeGraphSpeakerProtectionSample(value, runtime, nodeId)",
        "Math.abs(number) > 1",
        "runtime.speakerProtectionMuteCount",
        "nodeGraphLiveModuleEvaluators.speakerProtection = (",
        "nodeGraphSpeakerProtectionSample(speakerProtectionMono, runtime, nodeId",
        "runtime.passiveFilterStates",
        "runtime.cookbookFilterStates",
        "runtime.ladderFilterStates",
        "runtime.slewLimiterStates",
        "runtime.clockStates",
        "runtime.clockDividerStates",
        "runtime.randomClockStates",
        "runtime.delayedTriggerStates",
        "runtime.sampleHoldStates",
        "runtime.stepSequencerStates",
        "runtime.triggerCounterStates",
        "runtime.triggerDividerStates",
        "runtime.expAdsrStates",
        "runtime.linearEnvelopeStates",
        "runtime.pluckEnvelopeStates",
        "runtime.vactrolEnvelopeStates",
        "runtime.flowerChildEnvelopeFollowerStates",
        "function createNodeGraphVisualControlState()",
        "function resetNodeGraphRuntimeVisualControls(runtime)",
        "const visualControlState = createNodeGraphVisualControlState()",
        "resetNodeGraphRuntimeVisualControls(runtime)",
        "runtime.visualControls",
        "runtime.visualControlStates",
        "runtime.noiseGeneratorStates",
        "runtime.randomWalkStates",
        "runtime.fractalBrownianNoiseStates",
        "nodeGraphFeedbackText(feedbackConnections = [], feedbackModulations = [])",
        "renderNodeGraphExecutionPlanDebug(plan)",
        "function nodeGraphRenderPendingSummary()",
        "function renderedNodeGraphWavBlob(rendered)",
        "function syncNodeGraphRenderedAudioElement()",
        "function setNodeGraphAudioStats(peak = 0, rms = 0, details = {})",
        "audioStats.dataset.renderFrames = String(frames)",
        "audioStats.dataset.renderStateReads = String(stateReadCount)",
        "const earProtector = createNodeGraphEarProtector(engineSampleRate)",
        "const protectedFrame = earProtector.protect(frameOutput.left, frameOutput.right)",
        "protectionMuteCount += Number(runtime.speakerProtectionMuteCount) || 0",
        "nodeGraphTripEarProtection({",
        "source: \"render\"",
        "protectionPeak: Number(runtime.speakerProtectionPeak) || 0",
        "stateReadCount",
        "Rendered sample:",
        "outputSummary.textContent = summary || nodeGraphRenderPendingSummary()",
        "if (outputSummary) {\n      outputSummary.textContent = validation.scheduleText;\n    }",
        "syncNodeGraphRenderedAudioElement();",
        "signalInputs",
        "modulationInputs",
        "feedbackSignals",
        "feedbackModulations",
        "inactiveNodes: plan.inactiveNodes || []",
        "bypassedNodes: plan.bypassedNodes || []",
        "inactiveWireReads: nodeGraphInactiveWireReads(plan)",
        "patchNodeCount: plan.nodes?.length || 0",
        "activeNodeCount: plan.reachableNodes?.length || 0",
        "patchWireCount: nodeGraphPatchWireCount(plan)",
        "activeWireCount: nodeGraphActiveWireCount(plan)",
        "wireReads: nodeGraphExecutionWireReads(plan)",
        "nodeGraphActiveSignalConnections(plan).map",
        "nodeGraphActiveModulations(plan).map",
        'executionModel: "single-pass stored-output"',
        'schedulerPolicy: "same-pass acyclic edges; patch-node-order cycle-closing edges read stored outputs"',
        "samePassDependencies",
        "stateReadCount: nodeGraphStateReadCount(plan)",
        "storedOutputInitialValue: 0",
        "mode: feedbackSets.signal.has",
        '"state-read"',
        '"same-pass"',
        "parameters: nodeGraphExecutionParameterSnapshot(plan)",
        "runtimeBoundary: nodeGraphRuntimeBoundaryDebug(plan)",
        "DSP nodes do not know patch authoring or display fields",
        "partialOrder: plan.valid ? [] : plan.order",
        "schedule:",
        "schedule blocked:",
        "function beginNodeGraphNodeDrag(event)",
        "function nodeGraphPatchNodeMovementLocked(nodeId)",
        "function toggleNodeGraphNodeMovementLock(event)",
        "ui.movementLocked = !ui.movementLocked",
        "function nodeGraphNodeIoSectionEmptyTarget(event, handle)",
        "function nodeGraphNodeIoBypassClickCandidate(event, handle)",
        "event.altKey && nodeGraphNodeIoSectionEmptyTarget(event, handle)",
        "event.button !== undefined && event.button !== 0",
        '".node-port, .node-param-port, button:not(.node-drag-handle), input:not(.node-header-title-input), textarea, select, option, [contenteditable=\'true\']"',
        '".node-io-row, .node-port, .node-param-port, button, input, textarea, select, option, label, [contenteditable=\'true\']"',
        "handle.classList.contains(\"dsp-node-io-section\") && !nodeGraphNodeIoSectionEmptyTarget(event, handle)",
        "if (nodeGraphPatchNodeMovementLocked(node.dataset.node))",
        "ioBypassClickCandidate: nodeGraphNodeIoBypassClickCandidate(event, handle)",
        "node.querySelector(\".node-drag-handle\")?.addEventListener(\"pointerdown\", beginNodeGraphNodeDrag)",
        "node.querySelector(\".node-drag-handle\")?.addEventListener(\"dblclick\", toggleNodeGraphNodeMovementLock)",
        "node.querySelector(\".node-execution-order-badge\")?.addEventListener(\"pointerdown\", beginNodeGraphNodeDrag)",
        "node.querySelector(\".node-header-title-row\")?.addEventListener(\"pointerdown\", beginNodeGraphNodeDrag)",
        "node.querySelector(\".node-header-title-row\")?.addEventListener(\"dblclick\", openNodeModuleActionMenu)",
        "node.querySelector(\".node-led-face\")?.addEventListener(\"pointerdown\", beginNodeGraphNodeDrag)",
        "node.querySelectorAll(\".dsp-node-io-section\")",
        "node.querySelectorAll(\".node-parameter-row\")",
        "node.querySelector(\".node-bypass-button\")?.addEventListener(\"click\", toggleNodeGraphModuleBypass)",
        '".node-drag-handle, .node-execution-order-badge, .node-header-title-row, .node-led-face, .node-knob-widget-body, .dsp-node-io-section, .node-parameter-row"',
        "node.querySelector(\".node-action-button\")?.addEventListener(\"click\", openNodeModuleActionMenu)",
        "handle.setPointerCapture(event.pointerId)",
        "handle.classList.add(\"dragging\")",
        "wasSelectedAtStart",
        "new Set([node.dataset.node])",
        "Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1",
        "if (!moved) {",
        "if (ioBypassClickCandidate && toggleNodeGraphModuleBypassFromNode(node, event))",
        "nodeGraphModuleTitleBypassModifierActive(event)",
        "nodeGraphModuleButtonsHiddenForNode(node)",
        "toggleNodeGraphModuleBypassFromNode(node, event)",
        "setNodeGraphSelection(null)",
        "function dragNodeGraphNode(event)",
        "positionNodeGraphNode(dragged.element, {\n      x: dragged.startX + deltaX,\n      y: dragged.startY + deltaY,\n    }, { clamp: false });",
        "function endNodeGraphNodeDrag(event)",
        "node.style.setProperty(\"--node-x\"",
        "node.style.setProperty(\"--node-y\"",
        "function renderNodeGraphAudio()",
        "function clampNodeGraphRenderSeconds(value)",
        "function syncNodeGraphRenderSecondsFromInput(options = {})",
        "function handleNodeGraphRenderSecondsInput(event)",
        "syncNodeGraphRenderSecondsFromInput({ normalize: true })",
        'document.getElementById("nodeRenderButton").addEventListener("click", renderNodeGraphAudio)',
        'createNodeGraphHeaderRenderRangeInput("node-header-render-start-input", "Start"',
        'createNodeGraphHeaderRenderRangeInput("node-header-render-end-input", "End"',
        "function nodeGraphBuildLivePlan()",
        "const activeSignalConnections = nodeGraphActiveSignalConnections(compiled)",
        "const activeGraphConnections = nodeGraphActiveGraphConnections(compiled)",
        "const activeModulations = nodeGraphActiveModulations(compiled)",
        "modulations: activeModulations",
        "graphConnections: activeGraphConnections",
        "feedbackConnections: compiled.feedbackConnections.map",
        "feedbackGraphConnections: (compiled.feedbackGraphConnections || []).map",
        "feedbackModulations: compiled.feedbackModulations.map",
        "order: [...compiled.order]",
        '"additiveOsc"',
        'type === "additiveOsc"',
        "function createNodeGraphLiveRuntime(plan)",
        "function nodeGraphConnectionMapFromList(items = [], keyForItem)",
        "const modulationConnections = nodeGraphLiveModulationConnectionMap(plan)",
        "nodeOutputs: new Map",
        "state read",
        "function updateNodeGraphLiveRuntimePlan(runtime, plan)",
        "runtime.modulationConnections = nodeGraphLiveModulationConnectionMap(plan)",
        "runtime.order = [...(plan.order || [])]",
        "function nodeGraphApplyParameterBounds(value, metadata = {})",
        "metadata.unboundedMin && metadata.unboundedMax",
        "metadata.unboundedMax && Number.isFinite(min)",
        "function nodeGraphParameterValueToNormalizedSignal(value, metadata = {})",
        "function nodeGraphNormalizedSignalToParameterValue(signal, metadata = {})",
        "function normalizeNodeGraphParameterModulationInput(value, metadata = {})",
        "function nodeGraphApplyParameterModulation(base, modulationSignal, metadata = {})",
        "function readNodeGraphLiveEffectiveParam(",
        "normalizeNodeMetadataKind(metadata.kind) === \"frequency\" && metadata.nonlinearSlider",
        "const octaves = (Number(modulationSignal) || 0) / 0.1",
        "normalizeNodeGraphParameterModulationInput(readNodeGraphRuntimePortOutput(",
        "nodeGraphApplyParameterModulation(base, modulationSignal, metadata)",
        "function evaluateNodeGraphPlanFrame(",
        "function renderNodeGraphLiveScriptBlock(event)",
        "function nodeGraphPhaseRadians(value)",
        "function nodeGraphSineCosWavetableSample(phaseRadians, frequency, amplitude, sampleRate)",
        "function nodeGraphNyquistFadeAmplitude(frequency, sampleRate)",
        "function createNodeGraphOscResetState()",
        "function nodeGraphIsPolyBlepOscillatorType(type)",
        'return nodeGraphModuleIsRealtimeOscillatorType(type)',
        "nodeGraphLiveModuleEvaluators.sineWavetable = (",
        "function nodeGraphPolyBlep(phaseCycle, phaseIncrement)",
        "function nodeGraphPolyBlepSquare(phaseCycle, phaseIncrement)",
        "function currentNodeGraphNoiseSample(runtime, nodeId)",
        "function nodeGraphOscillatorWaveformSample(runtime, nodeId, phase, phaseIncrement, waveform)",
        "const phaseStopped = Math.abs(phaseDelta) <= 1e-12",
        "runtime.oscillatorStoppedSamples ||= new Map()",
        "runtime.oscillatorLastPhaseIncrements ||= new Map()",
        "if (phaseStopped && runtime.oscillatorStoppedSamples.has(nodeId))",
        "const renderPhaseIncrement = phaseStopped",
        "runtime.oscillatorStoppedSamples.set(nodeId, sample)",
        "runtime.oscillatorLastPhaseIncrements.set(nodeId, phaseDelta)",
        "function nodeGraphEllipsoidSample(phase, offset = 0, shape = 0, scale = 1)",
        "function nodeGraphEllipsoidVectorSample(phase, params = {})",
        "Out: x",
        "Mono: x",
        "Wave: x",
        '"Wave Out": x',
        "nodeGraphEllipsoidSample(phase - Math.PI * 0.5",
        "function nodeGraphAdditiveWaveformHarmonic(waveform, harmonic, modA = 0.5)",
        "function nodeGraphAdditiveDampingCurveValue(value = 0)",
        "function nodeGraphAdditiveDampingAlgorithmValue(value = 0)",
        "function nodeGraphAdditiveFilterFrequencyValue(value = 20000, sampleRate = nodeGraphMvp?.sampleRate || 44100)",
        "function nodeGraphRationalCurveValue(value = 0, skew = 0)",
        "const safeSkew = clampNodeSliderValue(Number(skew) || 0, -0.999999, 0.999999)",
        "((1 + safeSkew) * t) / (1 - safeSkew + 2 * safeSkew * t)",
        "function nodeGraphAdditiveHarmonicDamping(harmonic, frequency, sampleRate, curveValue = 0, algorithm = 0, filterFrequency = 20000)",
        "const safeFilterFrequency = nodeGraphAdditiveFilterFrequencyValue(filterFrequency, safeRate)",
        "const ratio = clampNodeSliderValue((Math.max(1, Number(harmonic) || 1) * safeFrequency) / safeFilterFrequency, 0, 1)",
        "function nodeGraphAdditiveDampingAmplitude({",
        "if (mode === 1)",
        "if (mode === 2)",
        "if (mode === 3)",
        "if (mode === 4)",
        "if (mode === 5)",
        "return clampNodeSliderValue(1 - nodeGraphRationalCurveValue(t, curve), 0, 1)",
        "function nodeGraphAdditiveHarmonicCurveAmount({",
        "function nodeGraphAdditiveOscillatorSample(runtime, nodeId, phase, params = {}, sampleRate = nodeGraphMvp?.sampleRate || 44100)",
        "const nodeGraphAdditiveHardMaxHarmonics = 1024",
        "Math.min(nodeGraphAdditiveHardMaxHarmonics, Math.round(Number(params.harmonics) || 32))",
        "const dampingGraphValueAt = typeof params.dampingGraphValueAt === \"function\"",
        "const phaseGraphValueAt = typeof params.phaseGraphValueAt === \"function\"",
        "const dampingX = clampNodeSliderValue((frequency * harmonic) / dampingFilterFrequency, 0, 1)",
        "Number(dampingGraphValueAt(dampingX)) || 0",
        "const harmonicPhaseAdd = clampNodeSliderValue(Number(params.harmonicPhaseAdd) || 0, 0, 1)",
        "const harmonicPhaseMultiply = clampNodeSliderValue(Number(params.harmonicPhaseMultiply) || 0, 0, 4)",
        "const phaseCurve = clampNodeSliderValue(Number(phaseGraphValueAt(harmonicRatio)) || 0, 0, 1)",
        "const phaseMultiplier = 1 + phaseCurve * harmonicPhaseMultiply",
        "const phaseOffset = (Number(partial.phase) || 0) + phaseCurve * harmonicPhaseAdd",
        "Math.sin((phase * harmonic * phaseMultiplier) + phaseOffset * Math.PI * 2)",
        "const harmonicLimit = Math.max(1, Math.min(maxHarmonics, Math.floor(Math.min(20000, safeRate * 0.45) / Math.max(1, frequency))))",
        "sample = 1 - phaseCycle * 2 + nodeGraphPolyBlepDirectional(phaseCycle, renderPhaseIncrement)",
        "triangleStates",
        "runtime.oscResetStates",
        "const resetEdge = resetState.lastReset <= 0 && resetValue > 0",
        "runtime.triangleStates.set(nodeId, 0)",
        "mixInput(nodeId, \"Increment\")",
        'mixInput(nodeId, "0.1V/Oct")',
        "const pitchedFrequency = Math.max(0, frequency * (2 ** (pitchInput / 0.1)))",
        "const phaseIncrement = (pitchedFrequency / sampleRate) + incrementInput",
        '"Wave Out": selected',
        "Noise: selected",
        "const additiveSample = nodeGraphAdditiveOscillatorSample(",
        'dampingFilterFrequency: readNodeGraphLiveEffectiveParam(runtime, node, "dampingFilterFrequency", 20000, frame, frames, frameValues)',
        'dampingGraphValueAt: (x) => graphInputValue(nodeId, "Damping Graph", x, 1)',
        'harmonicPhaseAdd: readNodeGraphLiveEffectiveParam(runtime, node, "harmonicPhaseAdd", 0, frame, frames, frameValues)',
        'harmonicPhaseMultiply: readNodeGraphLiveEffectiveParam(runtime, node, "harmonicPhaseMultiply", 0, frame, frames, frameValues)',
        'phaseGraphValueAt: (x) => graphInputValue(nodeId, "Phase Graph", x, 0)',
        "value = { Out: additiveSample }",
        "nodeGraphLiveModuleEvaluators.ellipsoid = (",
        '"ellipsoid 0.1v/oct input"',
        "value = nodeGraphEllipsoidVectorSample(phase + phaseOffset",
        'offsetX: read("offsetX", 0)',
        'shapeY: read("shapeY", 0)',
        "function nextNodeGraphNoiseSample(runtime, nodeId)",
        "nodeGraphLiveModuleEvaluators.spiral = (",
        "nodeGraphLiveModuleEvaluators.lorenzAttractor = (",
        "function readNodeGraphLiveSmoothedParam(runtime, node, key, fallback, frame, frames)",
        'readNodeGraphLiveEffectiveParam(',
        "function setNodeGraphLiveMeter(",
        "function setNodeGraphGpuAdditiveStatus(",
        "function nodeGraphGpuAdditiveRecipeText(queue = {})",
        "function nodeGraphGpuAdditiveAdapterText(adapter = null)",
        "meter.dataset.liveClips = String(clipCount)",
        "meter.dataset.liveProtectionMutes = String(protectionMuteCount)",
        "meter.dataset.liveBadNumbers = String(badNumberCount)",
        "renderTargets: new Map()",
        "deviceLostReason: \"\"",
        "function nodeGraphResetGpuAdditiveBackend(reason = \"\")",
        "nodeGraphGpuAdditiveState.renderTargets.values()",
        "nodeGraphGpuAdditiveState.deviceLostReason = reason",
        "device.lost.then((info) =>",
        "deviceLostReason: nodeGraphGpuAdditiveState.deviceLostReason || \"\"",
        "const nodeGraphGpuAdditiveMaxRenderTargets = 48",
        "function nodeGraphDestroyGpuAdditiveRenderTarget(target)",
        "function nodeGraphTrimGpuAdditiveRenderTargets()",
        "buffer.destroy()",
        "function nodeGraphGpuAdditiveRenderTarget(device, pipeline, frameCount, cacheKey = \"\")",
        "fn dampingAmplitude(harmonic: u32, maxHarmonics: u32, ratio: f32, curveValue: f32, algorithm: u32) -> f32",
        "fn harmonicAmplitude(harmonic: u32, waveform: u32, modA: f32) -> f32",
        "fn harmonicBasePhase(harmonic: u32, waveform: u32, modA: f32) -> f32",
        "paramsFloat[8] = clampNodeSliderValue(Number(params.modA) || 0, 0, 1)",
        "paramsUint[14] = 0",
        "device.queue.writeBuffer(target.paramsBuffer, 0, paramsArray)",
        "cachedTarget: Boolean(cacheKey)",
        "gpuRecipe: \"full-additive-v1\"",
        "adapter: nodeGraphGpuAdditiveState.adapterInfo || null",
        "waveform: paramsUint[5]",
        "const nodeGraphGpuAdditiveDefaultTargetChunks = 6",
        "const nodeGraphGpuAdditiveMaxTargetChunks = 11",
        "const nodeGraphGpuAdditiveMaxInFlightChunks = 3",
        "const hasGraphInput = (plan.graphConnections || []).some((connection) =>",
        "return !hasSignalInput && !hasModulationInput && !hasGraphInput",
        "function nodeGraphBeginGpuAdditivePrime(plan)",
        "function nodeGraphFinishGpuAdditivePrime(reason = \"ready\")",
        "setNodeGraphLiveStatus(\"priming\", \"warn\")",
        "setNodeGraphLiveScheduleStatus(\"gpu additive priming\", \"warn\")",
        "nodeGraphFinishGpuAdditivePrime(\"timeout\")",
        "nodeGraphFinishGpuAdditivePrime(\"ready\")",
        "nodeGraphSetLivePlanRunningStatus(plan)",
        "completedChunks: new Map()",
        "inFlightSlots: new Set()",
        "nextChunkSequence: 0",
        "pendingChunks: 0",
        "sendChunkSequence: 0",
        "const postOrderedGpuAdditiveChunks = (node, state, version) =>",
        "while (state.completedChunks.has(state.sendChunkSequence))",
        "sequence: chunk.sequence",
        "droppedChunks: Math.max(0, Number(queue.droppedChunks) || 0)",
        "heldSamples: Math.max(0, Number(queue.heldSamples) || 0)",
        "heldGain: Number.isFinite(Number(queue.heldGain)) ? Number(queue.heldGain) : 1",
        "state.queueChunks + state.pendingChunks + state.completedChunks.size < targetChunks",
        "const renderGeneration = Number(state.generation) || 0",
        "const renderSequence = state.nextChunkSequence",
        "`${node.id}:${renderGeneration}:${renderSlot}`",
        "renderMs: Math.max(0, renderEndedAt - renderStartedAt)",
        "reason: \"WebGPU additive renderer unavailable\"",
        "state.targetChunks = Math.min(",
        "protected ${protectionMuteCount}",
        "nodeGraphOutputSampleClipped(frameOutput.left)",
        "nodeGraphOutputSampleTripsEarProtection(frameOutput.left)",
        "source: \"live output > 1.0\"",
        "nodeGraphClampOutputSample(protectedFrame.left)",
        "runtime.earProtector?.protect(frameOutput.left, frameOutput.right)",
        "nodeGraphTripEarProtection({",
        "runtime.meterClipCount",
        "runtime.meterProtectionMuteCount",
        "function setNodeGraphLiveOutputMuted(muted)",
        "Ear Protection tripped. Close the dialog to reset audio.",
        "Close Dialog",
        "function setNodeGraphLiveEngineStatus(text = \"engine idle\", state = \"\")",
        "function setNodeGraphLiveEngineTitle(text = \"\")",
        "function clearNodeGraphLiveStatusTitle()",
        "function setNodeGraphLiveProcessorError(message = \"AudioWorklet processor error\")",
        "function setNodeGraphLivePlanStatus(text = \"plan idle\", state = \"\")",
        "function setNodeGraphLivePlanTitle(text = \"\")",
        "function setNodeGraphLiveEvidence(kind = \"idle\", details = {})",
        "function nodeGraphBadValueMonitorEnabled()",
        "function renderNodeGraphBadValueMonitorEvidence()",
        "function nodeGraphRecordBadValueEvent(details = {})",
        "nodeGraphMvp.badValueMonitor",
        "nodeBadValueMonitorEvidence",
        "function nodeGraphLiveDebug()",
        "connectionCount: Number(details.connectionCount ?? planEvidence.connectionCount) || 0",
        "engineSampleRate: Number(details.engineSampleRate ?? planEvidence.engineSampleRate) || 0",
        "feedbackConnectionCount: Number(details.feedbackConnectionCount ?? planEvidence.feedbackConnectionCount) || 0",
        "feedbackModulationCount: Number(details.feedbackModulationCount ?? planEvidence.feedbackModulationCount) || 0",
        "feedbackModulations: [",
        "feedbackSignals: [",
        "message: String(details.message || \"\")",
        "issues: Array.isArray(details.issues) ? details.issues.map((issue) => String(issue)) : []",
        "stack: String(details.stack || \"\")",
        "action: String(details.action || \"\")",
        "modulationCount: Number(details.modulationCount ?? planEvidence.modulationCount) || 0",
        "oversamplingRatio: Number(details.oversamplingRatio ?? planEvidence.oversamplingRatio) || 1",
        "sampleRate: Number(details.sampleRate ?? planEvidence.sampleRate) || 0",
        "stateReadCount: Number(details.stateReadCount ?? planEvidence.stateReadCount) || 0",
        "visualControls: {",
        "speakerOutputActive: Boolean(details.speakerOutputActive ?? planEvidence.speakerOutputActive)",
        "visualSinkCount: Number(details.visualSinkCount ?? planEvidence.visualSinkCount) || 0",
        "visualSinks: (details.visualSinks || planEvidence.visualSinks || []).map",
        "function nodeGraphLivePlanEvidenceDetails(plan, details = {})",
        "nodeGraphMvp.live.lastEvidence",
        "connectionCount: plan.connections.length",
        "feedbackConnectionCount: plan.feedbackConnections.length",
        "feedbackModulationCount: plan.feedbackModulations.length",
        "feedbackModulations: plan.feedbackModulations.map",
        "feedbackSignals: plan.feedbackConnections.map",
        "modulationCount: plan.modulations.length",
        "stateReadCount: nodeGraphStateReadCount(plan)",
        "visualSinkCount: (plan.visualSinks || []).length",
        "speakerOutputActive: Boolean(plan.speakerOutputActive)",
        "visualSinks: (plan.visualSinks || []).map",
        "setNodeGraphLiveEvidence(\"plan-sent\"",
        "setNodeGraphLiveEvidence(\"plan-applied\"",
        "nodeGraphMvp.live.lastEvidence.visualControls",
        "setNodeGraphLiveEvidence(\"params-sent\"",
        "setNodeGraphLiveEvidence(\"params-applied\"",
        "setNodeGraphLiveEvidence(\"script-blocked\"",
        "setNodeGraphLiveEvidence(\"processor-error\"",
        "setNodeGraphLiveEvidence(\"stopped\");",
        "setNodeGraphLiveEvidence(\"stopped\")",
        "function nodeGraphLivePlanStatusText(plan, serial = nodeGraphMvp.live.planSerial)",
        "visual-only",
        "const fingerprintText = plan.patchFingerprint ?",
        "function nodeGraphLiveBlockedStatusText(kind, error)",
        "function setNodeGraphLiveBlockedError(kind, error, options = {})",
        "function nodeGraphLivePlanScheduleTitle(order = [])",
        "worklet order:",
        "function nodeGraphLivePlanSentStatusText(serial = nodeGraphMvp.live.planSerial)",
        "function nodeGraphLiveParameterCount(nodes = [])",
        "function nodeGraphLiveParametersSentStatusText(nodes = [], serial = nodeGraphMvp.live.planSerial)",
        "function nodeGraphLiveParametersAppliedStatusText(message)",
        "function nodeGraphLivePlanAppliedStatusText(message)",
        "feedbackConnectionCount",
        "feedbackModulationCount",
        "nodeGraphFormatOversamplingRatio(oversamplingRatio)",
        "message.patchFingerprint ?",
        "function nodeGraphBuildLiveParameterNodes(activeNodeIds = null)",
        "nodeGraphMvp.live.activeNodeIds = new Set(plan.order)",
        "patchFingerprint: nodeGraphPatchFingerprint()",
        "nodeGraphBuildLiveParameterNodes(activeNodeIds)",
        "nodeGraphBuildLiveParameterNodes(nodeGraphMvp.live.activeNodeIds)",
        "function updateNodeGraphLiveRuntimeParameters(runtime, nodes)",
        "`plan${serialText}",
        "return `plan${serialText} sent`",
        "return `params${serialText} sent ${nodes.length} nodes / ${nodeGraphLiveParameterCount(nodes)} params`",
        "parameterCount: nodeGraphLiveParameterCount(nodes)",
        'message.type === "paramsApplied"',
        "function sendNodeGraphLiveParameterUpdate()",
        "const measuredSeconds = previous > 0 ? (now - previous) / 1000 : nodeGraphMvp.live.autoSmoothingSeconds",
        "if (!nodeGraphMvp.live.autoSmoothingManual)",
        "nodeGraphMvp.live.autoSmoothingSeconds = clampNodeGraphAutoSmoothingSeconds(",
        "function nodeGraphDefaultSmoothingBlockSeconds()",
        "function nodeGraphNumericModifierReserved()",
        "function nodeGraphNumericDragMultiplier(event)",
        "function nodeGraphGlobalSmoothingSeconds()",
        "return 0.01 * multiplier;",
        "function formatNodeGraphGlobalSmoothingSeconds(seconds)",
        'return limit_decimals(String(value), 5, 3, 4, false)',
        "function setNodeGraphGlobalSmoothingSeconds(seconds, options = {})",
        "function beginNodeGraphGlobalSmoothingSecondsEdit(event)",
        "function beginNodeGraphGlobalSmoothingSecondsDrag(event)",
        "function dragNodeGraphGlobalSmoothingSeconds(event)",
        "function endNodeGraphGlobalSmoothingSecondsDrag(event)",
        "function handleNodeGraphGlobalSmoothingSecondsChange()",
        'document.getElementById("nodeSceneGlobalSmoothingSeconds")',
        'bindNodeGraphSceneElementEvent("nodeSceneGlobalSmoothingSeconds", "dblclick", beginNodeGraphGlobalSmoothingSecondsEdit)',
        'bindNodeGraphSceneElementEvent("nodeSceneGlobalSmoothingSeconds", "pointerdown", beginNodeGraphGlobalSmoothingSecondsDrag)',
        'document.addEventListener("pointermove", dragNodeGraphGlobalSmoothingSeconds)',
        "globalSmoothingSeconds: clampNodeGraphAutoSmoothingSeconds(",
        "view.globalSmoothingSamples !== undefined",
        "function syncNodeGraphGlobalSmoothingControl(options = {})",
        "autoSmoothingSeconds,",
        "function scheduleNodeGraphLiveParameterSync()",
        "const audio = nodeGraphAudioDerivation(nodeGraphMvp.patch);",
        "engineSampleRate: audio.clampedEngineSampleRate",
        "oversamplingRatio: audio.oversamplingRatio",
        "error.issues = [...compiled.issues]",
        "const hadLivePlan = Boolean(",
        "const canPreservePlan = hadLivePlan && nodeGraphShouldPreservePreviousLivePlanAfterError(error);",
        "if (!canPreservePlan) {",
        "setNodeGraphLiveBlockedError(\"plan\", error, { preservePreviousPlan: canPreservePlan })",
        "setNodeGraphLiveOutputMuted(false)",
        "setNodeGraphLiveOutputMuted(true)",
        "renderNodeGraphLiveControls(true)",
        "setNodeGraphLiveBlockedError(\"params\", error, { schedule: false })",
        "message.sessionId !== nodeGraphMvp.live.sessionId",
        "message.planSerial !== nodeGraphMvp.live.planSerial",
        "planSerial: nodeGraphMvp.live.planSerial",
        "patchFingerprint,",
        "sessionId: nodeGraphMvp.live.sessionId",
        "engine worklet",
        "engine fallback",
        "engine error",
        "workletNode.onprocessorerror",
        "function setNodeGraphLiveScheduleStatus(",
        "function nodeGraphLiveOutputIsActive(",
        "function syncNodeGraphOutputBypassButton(",
        "function renderNodeGraphLiveControls(",
        "const statusText = document.getElementById(\"nodeLiveStatus\")?.textContent || \"\"",
        "const outputActive = nodeGraphLiveOutputIsActive(running)",
        "syncNodeGraphOutputBypassButton(outputEnabled)",
        'event.code === "Space"',
        'toggleNodeGraphLiveOutput();',
        "createScriptProcessor(nodeGraphAudioBlockSize, 2, 2)",
        'audioInput: "Input"',
        "audioInput: {",
        'defaultValue: "0.35"',
        'max: "1"',
        "for (const type of Object.keys(nodeGraphModuleDefinitions || {}))",
        "return counts;",
        "nodeLiveInputStatus",
        "inputStatus: \"off\"",
        "inputDeviceId: \"\"",
        "inputPermissionStatus: \"unknown\"",
        "inputMeterRms",
        "inputStream: null",
        "inputSource: null",
        "function setNodeGraphLiveInputStatus(",
        "function setNodeGraphLiveMicStatus(",
        "function nodeGraphLivePermissionStatusText(",
        "async function refreshNodeGraphLiveMicrophonePermissionState()",
        "navigator.permissions.query({ name: \"microphone\" })",
        "Microphone permission is allowed. Start OUTPUT to connect it.",
        "nodeGraphMvp.live.micStatus === \"blocked\"",
        "mic allowed",
        "mic ask ready",
        "mic permission unknown",
        "function syncNodeGraphInputModuleLiveState()",
        "function nodeGraphLiveMicStatusText(",
        "node-live-input-state-badge",
        "dataset.micState",
        "mic waits output",
        "mic asking",
        "mic live",
        "mic blocked",
        "function setNodeGraphLiveInputMeter(",
        "function updateNodeGraphLiveInputTestStatus()",
        "input test off",
        "start output",
        "allow mic",
        "input signal",
        "function refreshNodeGraphLiveInputDevices()",
        "function handleNodeGraphLiveInputDeviceChange(event)",
        "function nodeGraphLiveInputErrorMessage(error)",
        "function setNodeGraphMockInputFactory(options = {})",
        "function startNodeGraphMockInput(options = {})",
        "function stopNodeGraphMockInput()",
        "function startNodeGraphMockInputDebug(options = {})",
        "function stopNodeGraphMockInputDebug()",
        "startMockInput(options = {})",
        "stopMockInput()",
        "nodeStartMockInputDebugButton",
        "nodeStopMockInputDebugButton",
        "document.documentElement.dataset.soemdspMockInput",
        "nodeGraphMvp.live.inputStreamFactory",
        "function nodeGraphLiveInputDeviceIsUnavailable(error)",
        "function requestNodeGraphLiveInputStream(deviceId = nodeGraphMvp.live.inputDeviceId)",
        "error.nodeGraphInputError = true",
        "const inputError = Boolean(error.nodeGraphInputError)",
        "setNodeGraphLiveBlockedError(\"input\", error, { schedule: false })",
        "Selected input unavailable; retrying default input.",
        "Microphone permission was blocked. Allow microphone access in the browser, then press Output again.",
        "Browser audio input needs HTTPS or localhost.",
        "navigator.mediaDevices.enumerateDevices",
        "device.kind === \"audioinput\"",
        "nodeGraphMvp.live.inputDeviceId",
        "nodeGraphMvp.live.inputMeterPeak",
        "nodeGraphMvp.live.inputMeterRms",
        "dataset.inputPeak",
        "--node-live-input-peak",
        "deviceId: { exact: deviceId }",
        'document.getElementById("nodeLiveInputDeviceSelect")',
        "devicechange",
        "input peak",
        "inputMeterPeak",
        "inputMeterSquareSum",
        "function nodeGraphLiveInputRouteState()",
        "input connected",
        "input blocked",
        "input asking",
        "input wired",
        "input unwired",
        "function nodeGraphModuleShouldBeVisible(node)",
        "function normalizeNodeGraphPatchTiming(timing = {})",
        "function createNodeGraphHeaderTimingWidgets()",
        "function createNodeGraphHeaderSpeedPlaceholder()",
        "field.dataset.headerNumberDrag = \"true\"",
        "field.addEventListener(\"pointerdown\", beginNodeGraphScopeNumberDrag, true)",
        "input.dataset.globalScopeNumberDrag = \"true\"",
        "Speed control under construction",
        "node-header-speed-placeholder",
        "timing.speedUnderConstruction",
        "input.value = \"1.0\"",
        "function renderNodeGraphPatchTimingControls()",
        "function bindNodeGraphHeaderTimingWidgets(root = document)",
        "function updateNodeGraphPatchTimingFromHeader(input)",
        "syncNodeGraphHeaderTimingWidgets()",
        "nodePatchTimingControls",
        "node-header-timing-widgets",
        ".node-header-timing-input",
        "type !== \"audioInput\" || Boolean(nodeGraphMvp.live.inputActive)",
        "function nodeGraphPatchNodeIsVisible(nodeId)",
        "function ensureNodeGraphLiveInputModule()",
        "function nodeGraphFindFreeModuleGridPoint(type",
        "nodeGraphFindFreeModuleGridPoint(\"audioInput\"",
        "input module shown",
        "const addedInputModule = nodeGraphMvp.live.inputActive",
        'nodeGraphTooltipText("audio.liveInputVisible")',
        'nodeGraphTooltipText("audio.liveInputShow")',
        "function stopNodeGraphLiveInputSource()",
        "function syncNodeGraphLiveInputSource()",
        "navigator.mediaDevices.getUserMedia",
        "context.createMediaStreamSource(stream)",
        "function startNodeGraphLiveAudio(outputSerial = nodeGraphMvp.live.outputToggleSerial)",
        "function nodeGraphLiveOutputStartCancelled(serial)",
        "function stopNodeGraphLiveAudio()",
        'typeof clearNodeGraphModuleScopeBuffers === "function"',
        "clearNodeGraphModuleScopeBuffers();",
        "if (nodeGraphMvp.live.node || nodeGraphMvp.live.context)",
        "function scheduleNodeGraphLivePlanSync()",
        "async function sendNodeGraphLivePlan()",
        "function handleNodeGraphLiveWorkletMessage(event)",
        "nodeGraphRecordBadValueEvent({",
        "lastBadValueNodeId",
        "lastBadValueSource",
        "function createNodeGraphLiveWorkletNode(context, plan = null)",
        "async function buildNodeGraphLiveWorkletBlobUrl(sourceFiles)",
        'context.audioWorklet.addModule(blobUrl)',
        "new AudioWorkletNode(",
        "numberOfInputs: 1",
        "function createNodeGraphLiveScriptProcessorNode(context, plan)",
        'document.getElementById("nodeLiveInputButton").addEventListener("click", toggleNodeGraphLiveInput)',
        'document.getElementById("nodeLiveOutputButton").addEventListener("click", toggleNodeGraphLiveOutput)',
        "function nodeGraphStableSeed(text)",
        "function drawNodeRenderedWaveform()",
        "function drawNodeRenderedSignalPlot()",
        "function setNodeGraphSelection(selection)",
        "function nodeGraphSelectedNodeIds(selection = nodeGraphMvp.selected)",
        "function syncNodeGraphSelectionCountReadout(selection = nodeGraphMvp.selected)",
        'document.getElementById("nodeSelectionCountReadout")',
        'readout.querySelector("[data-selection-count-value]")',
        "nodeGraphSelectedNodeIds(selection).size",
        "syncNodeGraphSelectionCountReadout();",
        "function syncNodeGraphModularViewSizeReadout(size = null)",
        'document.getElementById("nodeModularViewSizeReadout")',
        "Modular view size width",
        "function recenterNodeGraphViewAtWorldOrigin(event)",
        "function handleNodeGraphWorldPositionReadoutKeydown(event)",
        "setNodeGraphPan(0, 0);",
        'event.key !== "Enter" && event.key !== " "',
        '?.addEventListener("click", recenterNodeGraphViewAtWorldOrigin)',
        '?.addEventListener("keydown", handleNodeGraphWorldPositionReadoutKeydown)',
        "function setNodeGraphNodeSelection(ids)",
        "function selectAllNodeGraphModules()",
        "setNodeGraphNodeSelection(nodeGraphMvp.patch.nodes.map((node) => node.id))",
        "function toggleNodeGraphNodeSelection(id, additive = false)",
        "const additiveSelection = event.ctrlKey || event.metaKey || event.shiftKey",
        "function nodeGraphSelectionHelpText()",
        "function composeNodeInteractionHelpText(text = \"\")",
        "function renderNodeGraphMarqueeSelection()",
        "function nodeGraphWireSelectionExists(selection = nodeGraphMvp.selected)",
        "function nodeGraphNodeCanBeDeleted(node)",
        'return Boolean(node && node.type !== "output" && node.id !== "home")',
        "function nodeGraphNodeDeleteHidesOnly(node)",
        "function nodeGraphSelectionCanDelete(selection = nodeGraphMvp.selected)",
        "function nodeGraphDeleteTitle(selection = nodeGraphMvp.selected)",
        'nodeGraphTooltipText("actions.deleteUnavailableOutput")',
        'nodeGraphTooltipText("actions.deleteWireShort")',
        "function pruneNodeGraphSelectionAfterPatch()",
        "function beginNodeGraphMarqueeSelection(event)",
        "function dragNodeGraphMarqueeSelection(event)",
        "function endNodeGraphMarqueeSelection(event)",
        "const additive = event.shiftKey || event.ctrlKey || event.metaKey",
        "startSelectedIds: [...nodeGraphSelectedNodeIds()]",
        "if (!additive) {\n    setNodeGraphSelection(null)",
        "drag.additive\n    ? [...new Set([...(drag.startSelectedIds || []), ...nodeGraphNodesInsideRect(rect)])]",
        "} else if (!drag.additive) {\n    setNodeGraphSelection(null)",
        "draggedNodes",
        "function selectNodeGraphWire(event, index, kind = \"signal\")",
        "function drawPath(svg, options)",
        "alias = \"\"",
        "mode = \"same-pass\"",
        "hitPath.dataset.alias = alias",
        "hitPath.dataset.interactionMode = mode",
        "renderedPath.dataset.alias = alias",
        "renderedPath.dataset.interactionMode = mode",
        "const activeNodeIds = nodeGraphActiveNodeIds(plan)",
        "const isInactive = !nodeGraphSignalConnectionIsActive(connection, activeNodeIds)",
        "const isInactive = !nodeGraphModulationIsActive(modulation, activeNodeIds)",
        "isInactive ? \"inactive-wire\" : \"\"",
        "isBypassed ? \" (bypassed)\" : isInactive ? \" (inactive)\" : \"\"",
        "function configureNodeSceneContextMenu(mode)",
        "function nodeGraphContextTargetSliderReadout(nodeId = nodeGraphModuleActionTargetNodeId())",
        "function openNodeGraphModuleActionsFromContextWindow()",
        "function openNodeGraphMetaparametersFromContextWindow()",
        "function openBlankNodeMetadataPopover(event = {})",
        "function showNodeModuleActionsWindow(anchorRect = null)",
        "menu.hidden = false;",
        "function openNodeModuleActionMenu(event)",
        "showNodeModuleActionsWindow(anchor?.getBoundingClientRect?.())",
        "showNodeModuleActionsWindow(button.getBoundingClientRect())",
        "function openNodeScopeContextMenu(event)",
        'event.target.closest?.(".node-module-scope-window, .node-led-face")',
        "openNodeGraphScopeShaderScript(nodeId)",
        'document.getElementById("nodeGlobalScopeMenu")',
        "positionNodeGlobalScopeMenuAtSavedOr(",
        "closeNodeScopeContextMenu()",
        "const contextNode = event.target.closest(\".dsp-node\")",
        "configureNodeSceneContextMenu(\"module\")",
        "positionNodeSceneContextMenuHeaderAtPoint(",
        "function setNodeSceneContextHeader(label, detail = \"\")",
        "function setNodeModuleActionsWindowHeader(label, detail = \"\")",
        "setNodeModuleActionsWindowHeader(\"MODULE\", detail || \"Settings\")",
        "setNodeModuleActionsWindowHeader(\"WIRE ACTIONS\", wireMode ? \"selected wire\" : \"no wire selected\")",
        "setNodeSceneContextHeader(\"Command\", \"Center\")",
        "menu.setAttribute(\"aria-label\", moduleMode ? \"Module settings\" : \"Wire actions\")",
        "document.getElementById(\"nodeModuleActionsWindow\")",
        "nodeSceneWireTypeControl",
        "nodeSceneToggleIo",
        "function toggleNodeGraphModuleIoFromContext()",
        "function createNodeGraphIoProxySection(node",
        "node-io-proxy-port",
        "function nodeGraphPortElementForWireEndpoint(node, port, io)",
        "nodeGraphNodeIoHidden(node)",
        "nodeSceneSelectedModule",
        "nodeSceneHomeModules",
        "nodeSceneHomeModuleList",
        "configureNodeSceneContextMenu(\"home\")",
        "function nodeGraphWireFromSelection(selection = nodeGraphMvp.selected)",
        "function nodeGraphWireSelectionLabel(selection = nodeGraphMvp.selected)",
        "function nodeGraphSingleSelectedNodeId(selection = nodeGraphMvp.selected)",
        "function nodeGraphModuleActionTargetNodeId()",
        "nodeGraphMvp.lastModuleActionTargetNode = selectedNode",
        "const lastNode = nodeGraphMvp.lastModuleActionTargetNode",
        "function syncNodeGraphModuleActionTargetFromSelection()",
        "const actionWindow = document.getElementById(\"nodeModuleActionsWindow\")",
        "const actionWindowOpen = actionWindow && !actionWindow.hidden",
        "if (!commandMenuOpen && !actionWindowOpen)",
        "nodeGraphMvp.sceneContextTargetNode = null",
        "configureNodeSceneContextMenu(\"wire\")",
        "const targetNodeId = moduleMode && !multiModuleMode ? nodeGraphModuleActionTargetNodeId() : null",
        "function nodeGraphModuleActionTargetNodeIds()",
        "const targetNodeIds = nodeGraphModuleActionTargetNodeIds()",
        "selectedModule.querySelector(\"strong\").textContent",
        "selectedModule.querySelector(\"span\").textContent = selectedWire?.kind === \"modulation\"",
        'nodeGraphTooltipText("actions.copyModule")',
        'nodeGraphTooltipText("actions.deleteModule")',
        'nodeGraphTooltipText("actions.deleteWire")',
        "function deleteNodeGraphSelectionFromContext()",
        "function copyNodeGraphModule(sourceNode)",
        "function copyNodeGraphModuleFromContext()",
        "const copiedNodeId = copyNodeGraphModule(sourceNode)",
        "function copySelectedNodeGraphModule()",
        "const gridPoint = nodeGraphFindCopiedModuleGridPoint(sourceNode, patch.nodes)",
        "module copied",
        'nodeGraphTooltipText("actions.copyUnavailableOutput")',
        "function deleteNodeGraphModuleFromContext()",
        "const targetNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId())",
        "function path(from, to)",
        "function normalizeNodeGraphTracePoints(points)",
        "Math.round((Number(value) || 0) - 0.5) + 0.5",
        "function nodeGraphTraceWaypointAttribute(points)",
        "function nodeGraphTracePushPoint(points, point)",
        "function nodeGraphTraceOrthogonalPoints(from, points, to)",
        "function nodeGraphTracePathFromPoints(from, points, to)",
        "wireType: nodeGraphWireTypes.trace",
        "path.dataset.tracePoints = nodeGraphTraceWaypointAttribute(tracePoints)",
        "function nodeGraphSelfTraceModuleRect(nodeId)",
        "function nodeGraphSelfTracePoints(wire, from, to)",
        'node.querySelector(".node-header-title-row")?.getBoundingClientRect()',
        "const distance = Math.max(nodeGraphGridWidth(), nodeGraphGridHeight()) * 0.75",
        "const outX = from.x + fromDirection * distance",
        "const aboveY = Math.max(0.5, rect.top - distance)",
        "const belowTitleY = Math.max(to.y, rect.titleBottom + 0.5)",
        "{ x: outX, y: from.y }",
        "{ x: outX, y: aboveY }",
        "{ x: destinationSideX, y: aboveY }",
        "{ x: destinationSideX, y: belowTitleY }",
        "manualTracePoints.length",
        "pathData: nodeGraphTracePathFromPoints(from, tracePoints, to)",
        "tracePoints: normalizeNodeGraphTracePoints(connection.tracePoints)",
        "tracePoints: normalizeNodeGraphTracePoints(modulation.tracePoints)",
        "function createGradient(svg, id, from, to, stopClass = \"node-wire-gradient-stop\", colors = null)",
        "linearGradient",
        "gradientUnits",
        '["48%", "0.36", fromColor]',
        "function nodeGraphPortWireColor(node, port, io)",
        "wireColors: [",
        "const nodeSliderHandleHalfWidthPx = 8",
        "const nodeSliderHandleLeftWallClearancePx = 1",
        "const nodeSliderHandleRightWallClearancePx = 3",
        "function nodeSliderVisualLane(surface, slider)",
        "function nodeSliderHandleRangeFromTravel(slider, surface, travel)",
        "function nodeSliderTravelFromPointer(slider, surface, clientX)",
        "function nodeGraphParameterGhostSignal(node, key)",
        "const targetSlider = nodeGraphSliderForParameter(node, key)",
        "const sourceSlider = nodeGraphSliderForParameter(modulation.sourceNode, modulation.sourcePort)",
        "function syncNodeGraphGhostSliders()",
        "syncNodeGraphGhostSliders();",
        "has-ghost-slider",
        "nodeSliderHandleRangeFromTravel(",
        '`${range.start}px`',
        '`${range.end}px`',
        "data-connection-row-index",
        "event.stopPropagation();",
        "function deleteSelectedNodeGraphItem()",
        "const hideOnlyNodeIds = new Set()",
        "const removableNodeIds = new Set()",
        "input module hidden; script preserved",
        "function nodeGraphEventTargetIsEditable(target)",
        "target.closest(\"input, textarea, select, [contenteditable='true']\")",
        "if (nodeGraphEventTargetIsEditable(event.target))",
        "(event.ctrlKey || event.metaKey) && event.key.toLowerCase() === \"a\"",
        "selectAllNodeGraphModules()",
        "(event.ctrlKey || event.metaKey) && event.key.toLowerCase() === \"c\"",
        "function showPaletteNode(node)",
        'document.addEventListener("contextmenu", openNodeSceneContextMenu)',
        "function nodeGraphScrollableInnerTarget(target)",
        "const nodeGraphFloatingWindowSelector = [",
        "function nodeGraphFloatingWindowFromTarget(target)",
        "function nodeGraphScrollTargetCanConsumeWheel(scrollTarget, event)",
        "function preventNodeGraphOuterWheelScroll(event)",
        "const floatingWindow = nodeGraphFloatingWindowFromTarget(event.target)",
        "if (!nodeGraphScrollTargetCanConsumeWheel(scrollTarget, event))",
        'addEventListener("auxclick", preventNodeGraphMiddleMouseAuxClick)',
        'addEventListener("mousedown", preventNodeGraphMiddleMouseDefault, true)',
        'document.addEventListener("wheel", preventNodeGraphOuterWheelScroll, { passive: false, capture: true })',
        'addEventListener("pointerdown", beginNodeGraphWorkspacePinchZoom, true)',
        'addEventListener("pointerdown", beginNodeGraphWorkspacePan, true)',
        'addEventListener("pointerdown", beginNodeGraphMarqueeSelection)',
        'addEventListener("pointermove", dragNodeGraphMarqueeSelection)',
        'addEventListener("pointerup", endNodeGraphMarqueeSelection)',
        'addEventListener("pointerdown", beginNodeGraphWorkspaceResize)',
        'addEventListener("pointermove", dragNodeGraphWorkspaceResize)',
        'addEventListener("pointerup", endNodeGraphWorkspaceResize)',
        'addEventListener("pointermove", dragNodeGraphWorkspacePinchZoom)',
        'addEventListener("pointerup", endNodeGraphWorkspacePinchZoom)',
        'addEventListener("pointercancel", endNodeGraphWorkspacePinchZoom)',
        'window.addEventListener("resize", handleNodeGraphWindowResize)',
        'addEventListener("pointermove", dragNodeGraphWorkspacePan)',
        'addEventListener("pointerup", endNodeGraphWorkspacePan)',
        'getElementById("nodeGridToggleButton")',
        'bindNodeGraphSceneElementEvent("nodeSceneOpenVisibility", "click", () => {',
        "button.replaceChildren()",
        'label.textContent = "Visibility"',
        'hidden.className = "node-toolbar-subline"',
        'hidden.textContent = `(${hiddenCount} hidden)`',
        'getElementById("nodeVisibilityMenuButton").addEventListener("click", toggleNodeGraphVisibilityMenu)',
        'getElementById("nodeVisibilityMenuClose")',
        'getElementById("nodeVisibilityMenuResizeHandle")',
        'addEventListener("pointerdown", beginNodeGraphVisibilityMenuResize)',
        'addEventListener("pointermove", dragNodeGraphVisibilityMenuResize)',
        'addEventListener("pointerup", endNodeGraphVisibilityMenuResize)',
        "function renderNodeGraphVisibilityMenuButton()",
        "function setNodeGraphVisibilityMenuOpen(open)",
        "positionNodeGraphVisibilityMenuNearButton(menu)",
        "function positionNodeGraphVisibilityMenuNearButton",
        "rect.right - menuRect.width",
        "applyNodeGraphVisibilityMenuSize(nodeGraphMvp.workspaceWindowStates?.visibilityMenu?.size)",
        'positionNodeGraphWorkspaceWindowFromState("visibilityMenu", menu)',
        "function nodeGraphVisibilityMenuMinimumSize",
        'typeof nodeModuleActionsWindowDefaultSize !== "undefined"',
        "Number(nodeModuleActionsWindowDefaultSize.minWidth)",
        ": 24",
        'rootStyle.getPropertyValue("--node-floating-window-header-height")',
        'rootStyle.getPropertyValue("--node-floating-window-button-height")',
        'querySelectorAll?.(".node-visibility-menu-list button").length',
        "sharedHeaderHeight + (buttonCount * sharedButtonHeight)",
        "width: Math.ceil(sharedWindowMinWidth)",
        "function nodeGraphVisibilityMenuSizeFromElement",
        'menu.style.removeProperty("height")',
        "startClientX: event.clientX",
        "startClientY: event.clientY",
        "const current = nodeGraphFloatingWindowElementPosition(element)",
        "startLeft: current.left",
        "startTop: current.top",
        "drag.startLeft + event.clientX - drag.startClientX",
        "drag.startTop + event.clientY - drag.startClientY",
        "moveNodeGraphFloatingWindowElement(",
        "{ height: false }",
        'rememberNodeGraphWorkspaceWindowState("visibilityMenu"',
        "visibleWidth: rect.width",
        "visibleHeight: rect.height",
        "function toggleNodeGraphVisibilityMenu()",
        "function nodeGraphStartupViewModeFromUrl()",
        "params.get(\"sandboxView\")",
        "value === \"modular-only\"",
        "function resetNodeGraphStartupView()",
        "setNodeGraphViewMode(nodeGraphStartupViewModeFromUrl())",
        "function renderNodeGraphGridToggle()",
        "function renderNodeGraphModuleVisibilityToggles()",
        "function normalizeNodeGraphModuleScopeLineThickness(value)",
        "function normalizeNodeGraphModuleScopeDiscontinuitySkipSamples(value)",
        "function normalizeNodeGraphModuleScopeDotCoreColor(value, fallback = \"#ffffff\")",
        "function normalizeNodeGraphModuleScopeDotCoreEnabled(value)",
        "function normalizeNodeGraphModuleScopeDotCoreSize(value, fallback = 0.5)",
        "clampNodeSliderValue(number, 0.01, 10) : fallback",
        "function normalizeNodeGraphModuleScopeDotCoreBrightness(value, fallback = 1)",
        "clampNodeSliderValue(number, 0, 40) : fallback",
        "function renderNodeGraphModuleScopeDotPreview(",
        "nodeGraphModuleScopeGeneratedDotTextureData({",
        "core1Color,\n      core1Size",
        "core2Color,\n      core2Size",
        "context.putImageData(imageData, 0, 0)",
        "function renderNodeGraphModuleScopeBrightnessControl()",
        "function setNodeGraphModuleScopeLineThickness(value)",
        "function setNodeGraphModuleScopeDiscontinuitySkipSamples(value)",
        "function setNodeGraphModuleScopeDotCoreEnabled(dotName, enabled)",
        "function toggleNodeGraphModuleScopeDotCore(dotName)",
        "function handleNodeGraphModuleScopeDotCoreToggle(event)",
        "function setNodeGraphModuleScopeDotCore1Size(value)",
        "function setNodeGraphModuleScopeDotCore1Brightness(value)",
        "function setNodeGraphModuleScopeDotCore1Color(value)",
        "function setNodeGraphModuleScopeDotCore2Size(value)",
        "function setNodeGraphModuleScopeDotCore2Brightness(value)",
        "function setNodeGraphModuleScopeDotCore2Color(value)",
        "function handleNodeGraphModuleScopeLineThicknessInput(event)",
        "function handleNodeGraphModuleScopeDiscontinuitySkipSamplesInput(event)",
        "function toggleNodeGraphGridVisibility()",
        "function setNodeGraphModuleButtonsVisibility(visible, options = {})",
        "options.clearNodeOverrides !== false",
        "ui.buttonsHidden = false",
        "delete node.ui",
        "function toggleNodeGraphModuleButtonsVisibility()",
        "setNodeGraphModuleButtonsVisibility(nodeGraphMvp.moduleButtonsVisible === false)",
        "function toggleNodeGraphOscilloscopeVisibility()",
        "renderNodeGraphGridToggle();",
        "renderNodeGraphModuleVisibilityToggles();",
        "renderNodeGraphModuleScopeBrightnessControl();",
        'getElementById("nodeSceneDeleteModule")',
        'getElementById("nodeSceneCopyModule")',
        'getElementById(actionMode ? "nodeModuleActionsClose" : "nodeSceneCloseMenu")',
        'event.target.closest(".dsp-node")',
        'event.target.closest(".node-port, .node-param-port, .node-slider-readout")',
        'for (const port of node.querySelectorAll(".node-port"))',
        'for (const row of node.querySelectorAll(".node-io-row"))',
        'for (const port of node.querySelectorAll(".node-param-port.modulation-input"))',
        "function visualEndpointElement(element)",
        'element.classList?.contains("node-io-row")',
        "function endpointFromElement(element)",
        "parameterOutput: element.classList.contains(\"parameter-output\")",
        "function connectEndpoints(a, b, options = {})",
        "function nodeGraphConnectionOptionsWithSelfTrace(sourceNode, destinationNode, options = {})",
        "sourceNode !== destinationNode || options.wireType || options.tracePoints?.length",
        "options.replaceDuplicate",
        "status: \"wire traced\"",
        "status: \"modulation traced\"",
        "function endpointsAreDuplicate(a, b)",
        "function endpointsShouldBurst(a, b)",
        "function endpointsShareNode(a, b)",
        "if (endpointsShareNode(a, b))",
        "endpointsAreDuplicate(a, b)",
        "return deps.connectModulation(a.node, a.port, b.node, b.param, options)",
        "return deps.connectModulation(b.node, b.port, a.node, a.param, reversedOptions())",
        'a.io === "output" && b.io === "output"',
        'a.io === "input" && b.io === "input"',
        "function burstNodeGraphZap(point)",
        "deps.connectPorts(b.node, b.port, a.node, a.port, reversedOptions())",
        "particle.textContent = \"\\u2301\"",
        "--zap-color",
        "--zap-glow",
        "--zap-rotate",
        "--zap-scale",
        "function closeNodeSceneContextMenu(options = {})",
        "if (!explicit) {\n    return false;",
        "function nodeGraphFloatingWindowPosition(element, x, y, options = {})",
        "const halfWidth = width * 0.5",
        "const visibleWidth = Math.max(1, Math.min(width, Number(options.visibleWidth) || halfWidth))",
        "const maxTop = viewportHeight - height * 0.5",
        'bindNodeGraphSceneElementEvent("nodeSceneCloseMenu", "click", () =>\n    closeNodeSceneContextMenu({ explicit: true }))',
        'addEventListener("click", (event) => zoomNodeGraphBy(-1, event))',
        'addEventListener("click", (event) => zoomNodeGraphBy(1, event))',
        'document.getElementById("nodeModuleButtonsToggleButton").addEventListener("click", toggleNodeGraphModuleButtonsVisibility)',
        'document.getElementById("nodeOscilloscopeToggleButton").addEventListener("click", toggleNodeGraphOscilloscopeVisibility)',
        'getElementById("nodeMasterScopeFps")',
        'addEventListener("input", handleNodeGraphModuleScopeFramesPerSecondInput)',
        'getElementById("nodeMasterScopeDotCore1Size")',
        "setNodeGraphModuleScopeDotCore1Size(event.currentTarget.value)",
        'getElementById("nodeMasterScopeDotCore1Brightness")',
        "setNodeGraphModuleScopeDotCore1Brightness(event.currentTarget.value)",
        'getElementById("nodeMasterScopeDotCore1Color")',
        "setNodeGraphModuleScopeDotCore1Color(event.currentTarget.value)",
        'getElementById("nodeMasterScopeDotCore2Size")',
        "setNodeGraphModuleScopeDotCore2Size(event.currentTarget.value)",
        'getElementById("nodeMasterScopeDotCore2Brightness")',
        "setNodeGraphModuleScopeDotCore2Brightness(event.currentTarget.value)",
        'getElementById("nodeMasterScopeDotCore2Color")',
        "setNodeGraphModuleScopeDotCore2Color(event.currentTarget.value)",
        "querySelectorAll(\"input[type='number'][data-global-scope-input]\")",
        'getElementById("nodeMasterScopeLineThickness")',
        'addEventListener("input", handleNodeGraphModuleScopeLineThicknessInput)',
        'getElementById("nodeMasterScopeDiscontinuitySkipSamples")',
        'addEventListener("input", handleNodeGraphModuleScopeDiscontinuitySkipSamplesInput)',
        'getElementById("nodeMasterScopeDotCore1Enabled")',
        'getElementById("nodeMasterScopeDotCore2Enabled")',
        'addEventListener("click", handleNodeGraphModuleScopeDotCoreToggle)',
        "[data-context-module]",
        "const nodeGraphTooltipSourceUrl",
        "const sandboxNativeTitleStorageAttribute = \"data-native-title-disabled\"",
        "function installSandboxNativeTooltipBan()",
        "setAttributeWithoutNativeTitle",
        "sandboxStripNativeTitleAttributes()",
        "async function loadNodeGraphTooltips()",
        "function nodeGraphTooltipText(key, context = {})",
        "function nodeGraphApplyTooltip(element, key, context = {}, options = {})",
        "function applyNodeGraphStaticTooltips(root = document)",
        "function nodeInteractionHelpText(target)",
        "[data-interaction-help], [data-tooltip-key]",
        "function normalizeNodeInteractionButtonLabel(value = \"\")",
        "function nodeInteractionButtonLabel(button)",
        'button.getAttribute("aria-label")',
        'button.getAttribute("title")',
        "function nodeInteractionMouseHint(element)",
        "nodeGraphElementTooltipText(element)",
        "const alias = element.dataset.alias || \"\"",
        "Alias: ${alias}",
        'nodeGraphTooltipText("wire.selected")',
        'nodeGraphTooltipText("wire.output")',
        'nodeGraphTooltipText("wire.input")',
        'nodeGraphTooltipText("wire.modulationInput")',
        'nodeGraphTooltipText("slider.numeric")',
        'nodeGraphTooltipText("slider.choices")',
        'nodeGraphTooltipText("module.actions")',
        'nodeGraphTooltipText("module.metaparameters")',
        'nodeGraphTooltipText("view.snapGrid")',
        'nodeGraphTooltipText("settings.uiSettingsOpen")',
        "function setNodeInteractionHelp(text = \"\")",
        "const composedText = composeNodeInteractionHelpText(text)",
        "if (help.textContent === composedText)",
        "function handleNodeInteractionHelp(event)",
        "function attachNodeInteractionHelpTarget(element)",
        "function normalizeNodeUiDevColor(value",
        "function nodeUiDevHexColorToRgbTriplet(value",
        "const nodeUiDevFontFamilyOptions",
        "function nodeUiDevSelectLabel(definition, value)",
        "function nodeUiDevSelectCssValue(definition, value)",
        "function nodeUiDevExposeCheckboxId(key)",
        "function installNodeUiDevExposeControls()",
        "function renderNodeUserUiSettingsControls()",
        "function setNodeUserUiSettingsVisible(visible)",
        "function toggleNodeUserUiSettings()",
        "let nodeUserUiSettingsActiveMirrorKey = null",
        "function syncNodeUserUiSettingsMirrorControls()",
        "nodeUserUiSettingsClearStartup",
        "function clearNodeUserStartupLocalStorage()",
        "function clearNodeUserStartupRuntimeState()",
        "function clearNodeUserStartupState()",
        "const text = typeof serializeNodeUiDevSettings === \"function\"",
        "saveNodeUiDevLocalDefaultSettings(text)",
        "postNodeUiDevSettingsPreset(text).catch(() => {})",
        "function handleClearNodeUserStartupStateClick(event)",
        "let nodeUserUiSettingsDragging = null",
        "function beginNodeUserUiSettingsDrag(event)",
        "function dragNodeUserUiSettings(event)",
        "function endNodeUserUiSettingsDrag(event)",
        "const nodeUiDevDefaultSettingsUrl = \"./public/presets/useruisettings.json\"",
        "const nodeUiDevDefaultSettingsStorageKey = \"soemdsp-sandbox.userUiSettings.startup.v12\"",
        "function sanitizeNodeUiDevWorkingPatchForStartup(patch)",
        'nodeGraphRetiredNodeTypes.has(node?.type)',
        "nodeGraphMissingSampleAssets(patch).length",
        "moduleOscilloscopesVisible: false",
        "soemdsp-sandbox-user-ui-settings",
        "settings_format.get(\"version\") not in (1, 2, 3)",
        "sliderLayout",
        "text-inside",
        "label-value-slider",
        "value-unit-left",
        "value-unit-right",
        "label-outside",
        "label-outside-no-unit",
        "value-outside",
        "unit-only",
        "value-focus",
        "Text Inside",
        "Label Outside",
        "Label Outside No Unit",
        "Unit Only",
        "Value Focus",
        "moduleButtonsVisible",
        "moduleOscilloscopesVisible",
        "function syncNodeGraphVisibleModuleGridHeights()",
        "element.style.setProperty(\"--node-grid-height-units\", String(heightGu))",
        "syncNodeGraphVisibleModuleGridHeights();",
        "moduleSlidersVisible",
        "moduleScopeFramesPerSecond",
        "moduleScopeLineThickness",
        "sceneContextWindowSize",
        "applyNodeSceneContextWindowSize(nodeGraphMvp.sceneContextWindowSize)",
        "moduleActionWindowSize",
        "applyNodeModuleActionsWindowSize(nodeGraphMvp.moduleActionWindowSize)",
        "workspaceWindowStates",
        "workspaceWindowStatesVersion: 1",
        '"visibilityMenu"',
        'visibilityMenu: "nodeVisibilityMenu"',
        'if (key === "visibilityMenu" && typeof applyNodeGraphVisibilityMenuSize === "function")',
        "moduleStoreDepartment",
        "normalizeNodeGraphModuleStoreDepartmentState",
        "savedPatchBankIndex",
        "savedPatchBankName",
        "savedPatchGridColumns",
        "savedPatchExplorerView",
        "...(size && (size.width || size.height) ? { size } : {})",
        "workingPatch",
        "currentSavedPatchFilename",
        "patchDirtyState",
        "function readNodeUiDevSettingsFromControls(options = {})",
        "const includeWorkingPatch = options.includeWorkingPatch !== false",
        "serializeNodeUiDevSettings({ includeWorkingPatch: false })",
        "nodeGraphMvp.workingPatch = normalized.view.workingPatch",
        "nodeGraphMvp.currentSavedPatchFilename = String(normalized.view.currentSavedPatchFilename || \"\")",
        "nodeGraphMvp.patchDirtyState = [\"saved\", \"edited\", \"untouched\"].includes(normalized.view.patchDirtyState)",
        "function nodeGraphWorkspaceWindowStatesAllOpen(states = {})",
        "function closeNodeGraphWorkspaceWindowStates(states = {})",
        "function normalizeNodeGraphWorkspaceWindowStates(states = {})",
        "function rememberNodeGraphWorkspaceWindowState(key, element, patch = {}, options = {})",
        "function pulseNodeGraphFloatingWindowAttention(element)",
        "node-floating-window-attention",
        "const shouldCapturePosition = options.capturePosition !== false",
        "{ capturePosition: false, persist: false }",
        "{ capturePosition: false, status: false }",
        "applyNodeModuleActionsWindowSize(nodeGraphMvp.sharedInspectorWindowState?.size)",
        "applyNodeGraphModuleShopWindowSize(state.size)",
        "const mode = nodeGraphMvp.selected?.type === \"wire\" ? \"wire\" : \"module\"",
        "configureNodeSceneContextMenu(mode)",
        "function applyNodeGraphWorkspaceWindowStates()",
        "rememberNodeGraphWorkspaceWindowState(\"commandCenter\"",
        "rememberNodeGraphWorkspaceWindowState(\"patchExplorer\"",
        "rememberNodeGraphWorkspaceWindowState(\"metaparameters\"",
        "moduleScopeDiscontinuitySkipSamples",
        "moduleScopeDotCore1Enabled",
        "moduleScopeDotCore1Size",
        "moduleScopeDotCore1Brightness",
        "moduleScopeDotCore1Color",
        "moduleScopeDotCore2Enabled",
        "moduleScopeDotCore2Size",
        "moduleScopeDotCore2Brightness",
        "moduleScopeDotCore2Color",
        "moduleScopeBackgroundColor",
        "sliderAmountVisible",
        "sliderPositionVisible",
        "hideMouseWhileDragging",
        "nodeGlobalScopeMenu",
        "nodeGlobalScopeDragHandle",
        "nodeGlobalScopeCloseMenu",
        "nodeMasterScopeLineThickness",
        "nodeMasterScopeDiscontinuitySkipSamples",
        "nodeMasterScopeDotCore1Enabled",
        "nodeMasterScopeDotCore2Enabled",
        "nodeMasterScopeFps",
        "nodeMasterScopeDotCore1Size",
        "nodeMasterScopeDotCore2Brightness",
        "nodeMasterScopeBackgroundColor",
        "function toggleNodeGlobalScopeMenu()",
        "function openNodeGlobalScopeMenu()",
        "function closeNodeGlobalScopeMenu()",
        "function beginNodeGlobalScopeMenuDrag(event)",
        "function dragNodeGlobalScopeMenu(event)",
        "function endNodeGlobalScopeMenuDrag(event)",
        "function setNodeGraphModuleScopeBackgroundColor(value)",
        "normalizeNodeGraphModuleScopeBackgroundColor",
        "--node-scope-background",
        "nodeModuleButtonsToggleButton",
        "nodeOscilloscopeToggleButton",
        "nodeModuleSlidersToggleButton",
        "nodeSliderAmountToggleButton",
        "nodeSliderPositionToggleButton",
        "module-buttons-hidden",
        "module-oscilloscopes-hidden",
        "module-sliders-hidden",
        "function renderNodeGraphSliderVisibilityToggles()",
        "function toggleNodeGraphModuleSlidersVisibility()",
        "createNodeUserUiSettingsModuleSlidersControl",
        "function toggleNodeGraphSliderAmount()",
        "function toggleNodeGraphSliderPosition()",
        "function normalizeNodeGraphSliderLayout(value)",
        "function cycleNodeGraphSliderLayout()",
        "target.closest?.(\".node-drag-handle, .scene-context-drag-handle\")",
        "button, a, input, textarea, select, option, label, [role='button'], [data-context-module], [contenteditable='true']",
        "function createNodeUserUiSettingsSliderLayoutControl()",
        "nodeUserSliderLayoutCycleButton",
        "ui settings view must be an object",
        "function serializeNodeUiDevSettings(options = {})",
        "function loadNodeUiDevSettingsFromScript(text)",
        "function applyNodeUiDevSettings(settings)",
        "function normalizeNodeGraphWorkspaceViewState(view = {})",
        "workspaceView: normalizeNodeGraphWorkspaceViewState",
        "nodeGraphMvp.pan = { ...workspaceView.pan }",
        "nodeGraphMvp.zoom = workspaceView.zoom",
        "workingPatchForSettings.view = {",
        "...normalizeNodeGraphPatchView(workingPatchForSettings.view)",
        "zoom: typeof nodeGraphZoom === \"function\" ? nodeGraphZoom() : nodeGraphMvp.zoom",
        "nodeGraphMvp.moduleStoreDepartment = normalizeNodeGraphModuleStoreDepartmentState",
        "function saveNodeGraphWorkspaceViewToUserSettings(options = {})",
        "function loadNodeUiDevBundledDefaultSettings()",
        "window.nodeUiDevBundledDefaultSettings",
        "document.documentElement.dataset.nodeUiDevBundledDefaultSettings",
        "./public/presets/useruisettings.js",
        "const nodeUiDevSettingSections = Object.freeze([",
        "function loadNodeUiDevDefaultSettings()",
        "function copyNodeUiDevSettingsToClipboard()",
        "function saveNodeUiDevSettingsFile()",
        "function loadNodeUiDevSettingsFile()",
        "function handleNodeUiDevSettingsFileLoad(event)",
        "function updateDefaultNodeUiDevSettingsPreset()",
        "function handleUpdateDefaultNodeUiDevSettingsPresetClick(event)",
        "function handleSaveNodeUserUiSettingsDefaultClick(event)",
        "saveNodeUiDevLocalDefaultSettings(text);",
        "window.localStorage.removeItem(nodeUiDevDefaultSettingsStorageKey);",
        'fetch("/api/presets/useruisettings"',
        "\"useruisettings.json\"",
        "let nodeLiveToggleTextResizeObserver = null",
        "function fitNodeLiveToggleText()",
        "document.querySelectorAll(\".node-live-toggle-palette .node-live-toggle span\")",
        "function scheduleNodeLiveToggleTextFit()",
        "function installNodeLiveToggleTextFitObserver()",
        "function organizeNodeUiDevSections()",
        "for (const section of nodeUiDevSettingSections)",
        'title: "modules and nodes"',
        '"nodeUiDevModuleIoSectionHeight"',
        '"nodeUiDevLiveToggleTextSize"',
        '"nodeUiDevModuleNodeSize"',
        "function syncNodeUiDevNodeColorControls()",
        "workspace.style.setProperty(property, color)",
        "document.querySelectorAll(\"[data-node-color-var]\")",
        "--node-bypass-icon-size-ratio",
        "const liveToggleTextPercent = Math.max(0, Math.min(100, Number(liveToggleTextSizeInput.value) || 0))",
        'getElementById("nodeUiDevLiveToggleTextSize")',
        'getElementById("nodeUiDevModularHeaderButtonBackground")',
        'getElementById("nodeUiDevTooltipTextSize")',
        'getElementById("nodeUiDevMinimumGridBrightness")',
        'getElementById("nodeUiDevMouseLightEnabled")',
        'getElementById("nodeUiDevShowOriginMarker")',
        'key: "showOriginMarker"',
        'getElementById("nodeUiDevModularShaderEnabled")',
        'getElementById("nodeUiDevScopeBloomEnabled")',
        "const modularShaderEnabled = Boolean(modularShaderEnabledInput.checked)",
        "const showOriginMarker = Boolean(showOriginMarkerInput.checked)",
        "const scopeBloomEnabled = Boolean(scopeBloomEnabledInput.checked)",
        "classList.toggle(\"origin-marker-visible\", showOriginMarker)",
        "nodeGraphMvp.scopeBloomEnabled = scopeBloomEnabled",
        "setNodeGraphShaderScriptEnabled(modularShaderEnabled, { persist: false })",
        "controls.showGrid ?? nodeGraphMvp.gridVisible",
        'getElementById("nodeUiDevGridColor")',
        'getElementById("nodeUiDevWorkspaceBackgroundColor")',
        "--node-workspace-bg",
        'getElementById("nodeUiDevModuleTitleFont")',
        "--node-header-title-font-family",
        "modularHeaderButtonBackgroundPercent",
        "--node-toolbar-button-bg-alpha",
        "tooltipTextSizePx",
        "--node-tooltip-text-size",
        "minimumGridBrightnessPercent",
        "--node-min-grid-brightness-alpha",
        'getElementById("nodeUiDevTextGlowLevel")',
        'key: "textGlowLevel"',
        "textGlowLevelPercent",
        "--node-text-light-level",
        "node-light-source",
        "node-light-text",
        "node-no-light",
        "setNodeGraphElementLightRole",
        "clearNodeGraphElementLightRole",
        "nodeUiDevHexColorToRgbTriplet(gridColor)",
        "const bypassIconSizePercent = Math.max(0, Math.min(100, Number(bypassIconSizeInput.value) || 0))",
        'getElementById("nodeUiDevBypassIconSize")',
        'getElementById("nodeUiDevBypassIconPreview")',
        "--node-ui-dev-bypass-preview-size",
        'getElementById("nodeUiDevModuleIoSectionHeight")',
        "--node-io-section-min-height",
        'getElementById("nodeUiDevModuleNodeSize")',
        'getElementById("nodeUiDevSliderWidth")',
        'getElementById("nodeUiDevSliderHeight")',
        'getElementById("nodeUiDevSliderLabelColor")',
        'getElementById("nodeUiDevSliderValueColor")',
        'getElementById("nodeUiDevSliderUnitColor")',
        'getElementById("nodeUiDevSliderFillHoverColor")',
        'getElementById("nodeUiDevSliderFillHoverAlpha")',
        "--node-port-diameter",
        "--node-slider-width-ratio",
        "--node-slider-readout-height",
        "--node-slider-label-color",
        "--node-slider-value-color",
        "--node-slider-unit-color",
        "--node-slider-fill-hover-rgb",
        "--node-slider-fill-hover-alpha",
        'getElementById("nodeUiDevWirePatchPointSize")',
        "--node-wire-patch-point-size",
        'getElementById("nodeUiDevTraceWireThickness")',
        'getElementById("nodeUiDevChoiceDividerHeight")',
        "--node-trace-wire-thickness",
        "--node-choice-divider-height",
        "function nodeSliderChoiceDividerHeight(readout, layerHeight)",
        'getElementById("nodeUiDevChoiceSlideDebugBoxes")',
        'getElementById("nodeUiDevCloseIconSize")',
        'getElementById("nodeUiDevShowOriginMarker")',
        '.addEventListener("change", syncNodeUiDevSettingsHeaderControls)',
        "--panel-close-glyph-size-ratio",
        'getElementById("copyNodeUiDevSettingsButton").addEventListener("click", copyNodeUiDevSettingsToClipboard)',
        'getElementById("loadNodeUiDevSettingsButton").addEventListener("click", loadNodeUiDevSettingsFile)',
        'getElementById("saveNodeUiDevSettingsButton").addEventListener("click", saveNodeUiDevSettingsFile)',
        'getElementById("updateDefaultNodeUiDevSettingsButton")',
        'getElementById("nodeUiDevSettingsFileInput")',
        'bindNodeGraphSceneElementEvent("nodeSceneOpenUiSettings", "click", () => {',
        'getElementById("nodeUserUiSettingsSaveDefault")',
        '.addEventListener("click", handleSaveNodeUserUiSettingsDefaultClick)',
        'getElementById("nodeUserUiSettingsClose").addEventListener("click", () => setNodeUserUiSettingsVisible(false))',
        'getElementById("nodeUserUiSettingsDragHandle")',
        'getElementById("nodeUserUiSettingsHeading")',
        "document.addEventListener(\"pointermove\", dragNodeUserUiSettings)",
        "installNodeUiDevExposeControls()",
        "await loadNodeUiDevDefaultSettings()",
        "element.dataset.interactionHelpReady = \"true\"",
        "const showHelp = () => setNodeInteractionHelp(nodeInteractionHelpText(element))",
        ".addEventListener(\"pointerover\", handleNodeInteractionHelp)",
        ".addEventListener(\"pointermove\", handleNodeInteractionHelp)",
        ".addEventListener(\"pointerover\", showHelp)",
        ".addEventListener(\"mouseover\", handleNodeInteractionHelp)",
        ".addEventListener(\"mousemove\", handleNodeInteractionHelp)",
        ".addEventListener(\"mouseover\", showHelp)",
        ".addEventListener(\"pointerdown\", handleNodeInteractionHelp)",
        ".addEventListener(\"pointerdown\", showHelp)",
        ".addEventListener(\"click\", showHelp)",
        ".addEventListener(\"click\", handleNodeInteractionHelp)",
        ".addEventListener(\"focusin\", handleNodeInteractionHelp)",
        "data-ready",
        "attachNodeInteractionHelpTarget(element)",
        "function toggleDebugSections()",
        "document.addEventListener(\"keydown\", handleNodeGraphKeydown)",
        "handleNodeGraphFloatingWindowKeyboardNudge(event)",
        'event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "a"',
        "openNodeGraphModuleShop(null);",
        "if (nodeGraphSelectionCanDelete()) {\n    event.preventDefault();\n    deleteSelectedNodeGraphItem();",
        "missing Output speaker input",
        "const mixInput = (nodeId, port = \"In\")",
        "Out: selected",
        '"Wave Out": selected',
        "Noise: selected",
        "nodeGraphLiveModuleEvaluators.additiveOsc = nodeGraphAdditiveOscLiveEvaluator",
        "const additiveSample = nodeGraphAdditiveOscillatorSample(",
        '"additive osc 0.1v/oct input"',
        '"additive osc increment input"',
        "readNodeGraphRuntimePortOutput(",
        "modulation.sourcePort",
        "nodeGraphLiveModuleEvaluators.graph = nodeGraphGraphTypeLiveEvaluator",
        "const graphSampleX = (node, nodeId) => {",
        'readNodeGraphLiveEffectiveParam(runtime, node, "mode", 0',
        'readNodeGraphLiveEffectiveParam(runtime, node, "rate", 1',
        'readNodeGraphLiveEffectiveParam(runtime, node, "phase", 0',
        "createNodeGraphGraphLfoState()",
        "runtime.graphLfoStates.get(nodeId)",
        "const resetValue = 0",
        "state.resetFrame = absoluteFrame",
        "wrapNodeSliderValue(((absoluteFrame - resetFrame) / safeRate) * rate + phase, 0, 1)",
        "const graphOutputValue = (node, nodeId) => {",
        "nodeGraphGraphSmoothingModeForNode(node)",
        'readNodeGraphLiveEffectiveParam(runtime, node, "outputMin", 0',
        'readNodeGraphLiveEffectiveParam(runtime, node, "outputMax", 1',
        "return outputMin + normalizedValue * (outputMax - outputMin)",
        "graphConnections: (patch.graphConnections || []).map((connection) =>",
        "graphInputConnections",
        "return graphOutputValue(node, nodeId)",
        "const outputVolume = outputNode",
        'const outputMono = mixInput(runtime.outputNode || "output", "Mono")',
        'left: (outputMono + mixInput(runtime.outputNode || "output", "Left")) * outputVolume',
        'right: (outputMono + mixInput(runtime.outputNode || "output", "Right")) * outputVolume',
        "\"waveform\"",
        "nodeGraphOscillatorWaveformSample(",
        "function nodeGraphNoiseSeedKey(nodeId, seedValue, channel = \"\")",
        "function nextNodeGraphSeededNoiseSample(runtime, nodeId, seedValue, channel = \"\")",
        "function nodeGraphNoiseSampleHoldSample(runtime, state, nodeId, seedValue, speed, sampleRate)",
        "runtime.noiseSeedKeys ||= new Map()",
        "runtime.noiseSeeds.set(noiseId, nodeGraphStableSeed(seedKey))",
        "const clockRate = safeSpeed * rate * 0.5",
        "state.held = nextNodeGraphSeededNoiseSample(runtime, nodeId, seedValue)",
        "nextNodeGraphSeededNoiseSample(",
        "\"seed\"",
        "sourceNodes",
        "stateReadCount,",
        "connectionCount: plan.connections.length",
        "feedbackConnectionCount: plan.feedbackConnections.length",
        "feedbackModulationCount: plan.feedbackModulations.length",
        "modulationCount: plan.modulations.length",
        "nodeCount: plan.nodes.length",
        "leftSamples",
        "rightSamples",
        "durationSeconds: outputFrames / outputSampleRate",
        "engineSampleRate",
        "sampleRate: outputSampleRate",
        "channels: 2",
        "const frameOutput = evaluateNodeGraphPlanFrame(",
        "nodeGraphLiveModuleEvaluators.gain = (",
        'Out: gainMono * gainAmount,',
        "nodeGraphLiveModuleEvaluators.bias = (",
        'Out: biasMono + biasOffset,',
        "disconnect-wire-button",
        "const nodeGraphModuleScopeState",
        "animationDeltaSeconds: 1 / 60",
        "animationLastTime: 0",
        "additiveHarmonicProfiles: new Map()",
        "oscillatorPhasors: new Map()",
        "renderMetrics: {",
        "renderDebug: {",
        "debugHistory: []",
        "drawCalls: 0",
        "points: 0",
        "vertices: 0",
        'phase: "boot"',
        "function nodeGraphModuleScopeCanvas()",
        "const nodeGraphShaderScriptStorageKey",
        "const nodeGraphScopeShaderModuleDefaultsStorageKey",
        "const nodeGraphShaderScriptEditorFontSizeLimits",
        "const nodeGraphShaderScriptBlendModes",
        'const nodeGraphShaderScriptScopeModes = Object.freeze(["1d_full", "1d_scan", "x_y", "one_value"])',
        "const nodeGraphShaderScriptScopeSyncModes",
        ".map((mode) => mode.replace(/[.*+?^${}()|[\\]\\\\]/g, \"\\\\$&\"))",
        "const nodeGraphShaderScriptHighlightTokenPattern",
        "const nodeGraphShaderScriptEditableTokenPattern",
        "${nodeGraphShaderScriptBlendModePatternSource}|${nodeGraphShaderScriptScopeModePatternSource}|${nodeGraphShaderScriptScopeSyncPatternSource}|none|output\\\\d+",
        "const nodeGraphShaderScriptDefaultSyntaxColors",
        "const nodeGraphShaderScriptLegacySyntaxColors",
        "function nodeGraphShaderScriptDarkRoomBloomDefaultFragment()",
        "const nodeGraphShaderScriptDefaultFragmentSource",
        "function nodeGraphShaderScriptIsLegacyDefaultFragmentSource(source = \"\")",
        "softLight(screenBloom)",
        "shouldUseStoredFragment",
        "const nodeGraphShaderScriptState = {\n  animationFrame: 0,\n  dialogMode: \"global\"",
        "scopeTargetNodeId: \"\"",
        "dialogDrag: null",
        "editorFontSizePx: nodeGraphShaderScriptEditorFontSizeLimits.defaultPx",
        "const nodeGraphScopeShaderDefaultSource",
        "video.input     = ~;",
        "scope.mode      = 1d_full;",
        "scope.mode      = x_y;",
        "scope.sync      = inherit;",
        "scope.cycles    = 2.0;",
        "scope.zoom      = 1.0;",
        "scope.length    = 1.0;",
        "scope.padding   = 0.04;",
        "scope.syncSpeed = 1.0;",
        "dot1.color      = dot1.global.color",
        "dot1.size       = 1.0 * dot1.global.size",
        "dot1.blur       = 1.0 * dot1.global.blur",
        "dot1.brightness = 1.0 * dot1.global.brightness",
        "dot2.color      = dot2.global.color",
        "dot2.size       = 1.0 * dot2.global.size",
        "dot2.blur       = 1.0 * dot2.global.blur",
        "dot2.brightness = 1.0 * dot2.global.brightness",
        'const nodeGraphScopeShaderModes = Object.freeze(["1d_full", "1d_scan", "x_y", "one_value"])',
        'const nodeGraphScopeShaderBlendModes = Object.freeze(["laser", "led", "light", "paint", "solid", "heatmap"])',
        "function nodeGraphScopeShaderDefaultSourceForType(type)",
        'moduleType === "lorenzAttractor"',
        "blend.mode      = laser",
        "function normalizeNodeGraphShaderScriptEditorFontSize(value)",
        "function normalizeNodeGraphShaderScriptSyntaxColors(value = {})",
        "normalized === nodeGraphShaderScriptLegacySyntaxColors[key] ? fallback : normalized",
        "function applyNodeGraphShaderScriptSyntaxColors()",
        "function setNodeGraphShaderScriptSyntaxColor(key, value)",
        "function resetNodeGraphShaderScriptSyntaxColors()",
        "function toggleNodeGraphShaderScriptSyntaxColorsPanel()",
        "function applyNodeGraphShaderScriptEditorFontSize()",
        "function changeNodeGraphShaderScriptEditorFontSize(delta)",
        "root.style.setProperty(\"--node-shader-script-font-size\"",
        "root.style.setProperty(`--node-shader-token-${key}`, value)",
        "syntaxColors: normalizeNodeGraphShaderScriptSyntaxColors(nodeGraphShaderScriptState.syntaxColors)",
        "function nodeGraphShaderScriptIsModeToken(token)",
        "function compactNodeGraphShaderScriptSource(source = \"\")",
        "function nodeGraphShaderScriptIsBlendModeToken(token)",
        "function nodeGraphShaderScriptModeTokenKind(token)",
        "function nodeGraphShaderScriptModeOptionsForKind(kind)",
        "function nodeGraphShaderScriptIsPropertyToken(token)",
        "function colorizeNodeGraphShaderScriptLine(line = \"\", lineStart = 0)",
        "code.matchAll(nodeGraphShaderScriptHighlightTokenPattern)",
        "text.matchAll(nodeGraphShaderScriptEditableTokenPattern)",
        "data-token-type=\"${tokenType}\"",
        "data-token-start=\"${tokenStart}\"",
        "data-token-end=\"${tokenEnd}\"",
        "style=\"color: ${normalizeNodeGraphShaderScriptColorToken(token)}\"",
        "node-shader-token-link",
        "function updateNodeGraphShaderScriptHighlight()",
        "function findNodeGraphShaderScriptEditableTokenAt(index)",
        "function replaceNodeGraphShaderScriptToken(nextToken)",
        "source.setRangeText(replacement, token.start, token.end, \"end\")",
        "function openNodeGraphShaderScriptTokenWidget(token, event)",
        "function populateNodeGraphShaderScriptModeWidget(token)",
        "button.dataset.shaderModeOption = option",
        "function findNodeGraphShaderScriptNumberTokenAtPoint(event, options = {})",
        "function beginNodeGraphShaderScriptNumberTokenDrag(event)",
        "function dragNodeGraphShaderScriptNumberToken(event)",
        "function endNodeGraphShaderScriptNumberTokenDrag(event)",
        "function normalizeNodeGraphShaderScriptColorToken(value = \"\")",
        "function nodeGraphScopeShaderDefaultModuleKey(node)",
        "function normalizeNodeGraphScopeShaderModuleDefaults(defaults = {})",
        "function nodeGraphScopeShaderCanonicalModuleDefaultSource(type, source = \"\")",
        "scope.cycles    = 1.7639;",
        "return nodeGraphScopeShaderDefaultSourceForType(type)",
        "function loadNodeGraphScopeShaderModuleDefaults()",
        "window.localStorage.setItem(nodeGraphScopeShaderModuleDefaultsStorageKey, serialized)",
        "function nodeGraphScopeShaderModuleDefaultSource(node)",
        "if (node && !Object.hasOwn(node, \"scopeShader\"))",
        "function nodeGraphShaderScriptDialogScopeVideoInput()",
        "function nodeGraphShaderScriptVideoInputChoices(node = nodeGraphShaderScriptDialogScopeNode())",
        "function replaceNodeGraphShaderScriptVideoInputLine(value)",
        "function syncNodeGraphShaderScriptVideoInputControls()",
        "node-shader-script-video-input-index",
        "node-shader-script-video-input-label",
        "button.dataset.shaderVideoInput = choice.value",
        "button.addEventListener(\"click\", () => replaceNodeGraphShaderScriptVideoInputLine(choice.value))",
        "const nodeGraphShaderScriptColorWidgetModuleUrl",
        "function destroyNodeGraphShaderScriptColorWidget",
        "function nodeGraphShaderScriptHexToHsl",
        "function loadNodeGraphShaderScriptColorWidgetModule",
        "async function mountNodeGraphShaderScriptColorWidget",
        "mountNodeGraphShaderScriptColorWidget(token)",
        "async function copyNodeGraphShaderScriptSource()",
        "async function copyNodeGraphShaderScriptStatus()",
        "status.dataset.fullText = text",
        "document.getElementById(\"nodeShaderScriptCopyStatus\")?.addEventListener(\"click\", copyNodeGraphShaderScriptStatus)",
        "async function pasteNodeGraphShaderScriptSource()",
        "async function exportNodeGraphShaderScriptToDesktop()",
        "\"/api/shader-script/to-desktop\"",
        "function renderNodeGraphCameraFeed(options = {})",
        'typeof options.decorateClone === "function"',
        "function nodeGraphUtilityCameraState()",
        "function upsertNodeGraphUtilityCamera(camera)",
        "function createNodeGraphUtilityCameraForElement(id, element, options = {})",
        "nodeGraphMvp.utilityCameras = new Map()",
        "function nodeGraphShaderScriptUtilityCameraId(nodeId = nodeGraphShaderScriptState.scopeTargetNodeId)",
        "function copyNodeGraphShaderScriptScopeCanvasCrop(sourceCanvas, sourceRect, targetSurface)",
        "const cssWidth = Math.max(1, Number(sourceRect.width) || 1)",
        "const cssHeight = Math.max(1, Number(sourceRect.height) || 1)",
        "function decorateNodeGraphShaderScriptScopePreviewClone(clone)",
        "node-shader-script-scope-crop-canvas",
        "cropCanvas.style.width = `${cssWidth}px`",
        "cropCanvas.style.height = `${cssHeight}px`",
        "document.getElementById(\"nodeModuleScopeLightCanvas\")",
        "decorateClone: decorateNodeGraphShaderScriptScopePreviewClone",
        "if (typeof drawNodeGraphModuleScopes === \"function\")",
        "drawNodeGraphModuleScopes();",
        "const nodeGraphShaderScriptUtilityCameraPadding = 18",
        "const videoInput = nodeGraphShaderScriptDialogScopeVideoInput()",
        "status.textContent = \"Video input: none.\"",
        "createNodeGraphUtilityCameraForElement(nodeGraphShaderScriptUtilityCameraId(node?.id)",
        "padding: nodeGraphShaderScriptUtilityCameraPadding",
        "removeNodeGraphUtilityCamera(nodeGraphShaderScriptUtilityCameraId())",
        "function drawNodeGraphShaderScriptScopePreview()",
        "function scheduleNodeGraphShaderScriptScopePreview()",
        "if (typeof scheduleNodeGraphModuleScopeDraw === \"function\")",
        "scheduleNodeGraphModuleScopeDraw();",
        "nodeGraphShaderScriptState.previewFrame",
        "function beginNodeGraphShaderScriptDialogDrag(event)",
        "function dragNodeGraphShaderScriptDialog(event)",
        "function endNodeGraphShaderScriptDialogDrag(event)",
        "positionNodeGraphShaderScriptDialog(event.clientX - drag.offsetX, event.clientY - drag.offsetY)",
        "nodeGraphShaderScriptDialogCanDragTarget(event.target)",
        "node-shader-token-color",
        "node-shader-token-property",
        "node-shader-token-number",
        "node-shader-token-mode",
        "node-shader-token-comment",
        "document.getElementById(\"nodeShaderScriptTextSizeDecrease\")?.addEventListener(\"click\"",
        "document.getElementById(\"nodeShaderScriptTextSizeIncrease\")?.addEventListener(\"click\"",
        "document.getElementById(\"nodeShaderScriptSyntaxColorsButton\")?.addEventListener(\"click\", toggleNodeGraphShaderScriptSyntaxColorsPanel)",
        "document.getElementById(\"nodeShaderScriptSyntaxColorsReset\")?.addEventListener(\"click\", resetNodeGraphShaderScriptSyntaxColors)",
        "document.querySelectorAll(\"[data-shader-syntax-color]\").forEach((input) => {",
        "document.getElementById(\"nodeShaderScriptCopy\")?.addEventListener(\"click\", copyNodeGraphShaderScriptSource)",
        "document.getElementById(\"nodeShaderScriptPaste\")?.addEventListener(\"click\", pasteNodeGraphShaderScriptSource)",
        "document.getElementById(\"nodeShaderScriptToDesktop\")?.addEventListener(\"click\", exportNodeGraphShaderScriptToDesktop)",
        "source?.addEventListener(\"pointerup\", handleNodeGraphShaderScriptSourcePointer)",
        "const host = document.getElementById(\"nodeShaderScriptColorWidgetHost\")",
        "source?.addEventListener(\"pointerdown\", beginNodeGraphShaderScriptNumberTokenDrag)",
        "source?.addEventListener(\"pointermove\", dragNodeGraphShaderScriptNumberToken)",
        "source?.addEventListener(\"pointerup\", endNodeGraphShaderScriptNumberTokenDrag)",
        "document.getElementById(\"nodeShaderScriptModeWidget\")?.addEventListener(\"click\"",
        "nodeGraphShaderScriptModeTokenKind(option) === optionKind",
        "source?.addEventListener(\"scroll\", updateNodeGraphShaderScriptHighlight)",
        "panel?.addEventListener(\"pointerdown\", beginNodeGraphShaderScriptDialogDrag)",
        "panel?.addEventListener(\"pointermove\", dragNodeGraphShaderScriptDialog)",
        "function normalizeNodeGraphScopeShaderVideoInput(value = \"~\")",
        "function parseNodeGraphScopeShaderVideoInput(source = \"\")",
        "output\\d+",
        "function normalizeNodeGraphScopeShaderMode(value = \"1d_full\")",
        "function parseNodeGraphScopeShaderMode(source = \"\")",
        "let mode = \"1d_full\"",
        "String(source || \"\").matchAll",
        "scope\\.mode\\s*=\\s*[\"']?(1d_full|1d_scan|x_y|one_value)[\"']?\\s*;?",
        "return normalizeNodeGraphScopeShaderMode(mode)",
        "function normalizeNodeGraphScopeShaderBlendMode(value = \"laser\")",
        "function parseNodeGraphScopeShaderBlendMode(source = \"\")",
        "blend\\.mode\\s*=\\s*[\"']?(laser|led|light|paint|solid|heatmap)[\"']?\\s*;?",
        "blendMode: normalizedBlendMode",
        "function normalizeNodeGraphScopeShaderSync(value = \"inherit\")",
        "function parseNodeGraphScopeShaderSync(source = \"\")",
        "function normalizeNodeGraphScopeShaderNumber(value, fallback, min, max)",
        "function parseNodeGraphScopeShaderNumber(source = \"\", key = \"\", fallback = 0, min = -Infinity, max = Infinity)",
        "function normalizeNodeGraphScopeShader(scopeShader = {})",
        "parseNodeGraphScopeShaderNumber(normalizedSource, \"cycles\", 2, 1, 128)",
        "parseNodeGraphScopeShaderNumber(normalizedSource, \"length\", 1, 0, 1)",
        "parseNodeGraphScopeShaderNumber(normalizedSource, \"padding\", 0.04, 0, 0.45)",
        "cycles: normalizedCycles",
        "length: normalizedLength",
        "mode: normalizedMode",
        "padding: normalizedPadding",
        "sync: normalizedSync",
        "syncSpeed: normalizedSyncSpeed",
        "videoInput: normalizedVideoInput",
        "zoom: normalizedZoom",
        "const nodeGraphCanvasScriptDefaultSource",
        "canvas.ratio(1, 1);",
        "canvas.background = #00000000;",
        "canvas.layout = oscilloscope;",
        "canvas.grid(7, 12);",
        "canvas.face.background = checkerboard;",
        "canvas.face.screen = #000000;",
        "bufferInput(\"a_buffer\");",
        "input(\"a not buffer\");",
        "layer(\"a_buffer\").input   = a_buffer;",
        "const nodeGraphScreenSpaceShaderDefaultSource",
        "input(\"Shake\");",
        "input(\"Scope Off\");",
        "input(\"Trace Image\");",
        "screen.color = zrgba(Red, Green, Blue, 1);",
        "screen.traceImage = Trace Image;",
        "function normalizeNodeGraphScreenSpaceShader(screenSpaceShader = {})",
        "kind: \"screenSpaceShader\"",
        "function parseNodeGraphCanvasScriptRatio(source = \"\")",
        "function parseNodeGraphCanvasScriptLayers(source = \"\")",
        "function parseNodeGraphCanvasScriptFace(source = \"\", canvasBackground = \"#00000000\")",
        "function parseNodeGraphCanvasScriptModel(source = \"\")",
        "function normalizeNodeGraphCanvasScript(canvasScript = {})",
        "background: model.background",
        "faceBackground: model.faceBackground",
        "faceFit: model.faceFit",
        "faceScreen: model.faceScreen",
        "kind: \"canvasScript\"",
        "layers: model.layers",
        "output: model.output",
        "const language = String(canvasScript?.language || \"canvas-js\")",
        "language,",
        "scopeShader: normalizeNodeGraphScopeShader(node.scopeShader)",
        "canvasScript: normalizeNodeGraphCanvasScript(node.canvasScript)",
        "const nodeGraphCanvasScriptModuleDefaultsStorageKey",
        "dialogDrag: null",
        "function nodeGraphCanvasScriptDialogCanDragTarget(target)",
        "function positionNodeGraphCanvasScriptDialog(left, top)",
        "function beginNodeGraphCanvasScriptDialogDrag(event)",
        "function dragNodeGraphCanvasScriptDialog(event)",
        "function endNodeGraphCanvasScriptDialogDrag(event)",
        "function openNodeGraphCanvasScript(nodeId)",
        "function openNodeGraphCanvasScriptFromContext()",
        "function saveNodeGraphCanvasScriptFromDialog()",
        "function saveNodeGraphCanvasScriptDefaultFromDialog()",
        "function bindNodeGraphCanvasScriptEvents()",
        "document.getElementById(\"nodeCanvasScriptSave\")?.addEventListener",
        "panel?.addEventListener(\"pointerdown\", beginNodeGraphCanvasScriptDialogDrag)",
        "panel?.addEventListener(\"pointermove\", dragNodeGraphCanvasScriptDialog)",
        "panel?.addEventListener(\"pointerup\", endNodeGraphCanvasScriptDialogDrag)",
        "panel?.addEventListener(\"pointercancel\", endNodeGraphCanvasScriptDialogDrag)",
        "bindNodeGraphCanvasScriptEvents();",
        "nodeSceneCanvasControls",
        "nodeSceneCanvasScript",
        "canvasControls.hidden = !(moduleMode && !multiModuleMode && targetNode?.type === \"canvas\")",
        "bindNodeGraphSceneElementEvent(\"nodeSceneCanvasScript\", \"click\", openNodeGraphCanvasScriptFromContext)",
        "function createNodeGraphCanvasBody(nodeId)",
        "function nodeGraphVisualOscilloscopeOutputDataUrl(nodeId)",
        "function nodeGraphRgbaOutputDataUrlForConnection(connection",
        "function nodeGraphCanvasLayerSourceConnection(nodeId, inputPort)",
        "function nodeGraphDrawCanvasLayerImage(context, surface, layer, image)",
        "function nodeGraphCanvasOutputDataUrl(nodeId, visited = new Set())",
        "function refreshNodeGraphCanvasBodies()",
        "if (!connection) {\n      return;\n    }",
        "if (!image?.complete || image.naturalWidth <= 0) {\n      return;\n    }",
        "const visibleLayers = (script.layers || []).filter((layer) =>",
        "nodeGraphCanvasLayerSourceConnection(nodeId, layer.input)",
        "sourceNode.type === \"visualOscilloscope\"",
        "return nodeGraphVisualOscilloscopeOutputDataUrl(sourceNode.id)",
        "return nodeGraphRgbaOutputDataUrlForConnection(connection)",
        "node-canvas-layers",
        "node-canvas-frame",
        "data-node-canvas-frame",
        "data-node-canvas-layers",
        "preview.dataset.canvasFaceBackground = script.faceBackground === \"checkerboard\" ? \"checkerboard\" : \"color\"",
        "frame.dataset.canvasScreenBackground = script.faceScreen === \"checkerboard\" ? \"checkerboard\" : \"color\"",
        "frame.dataset.canvasScreenFit = script.faceFit || \"contain\"",
        "preview.style.setProperty(\"--node-canvas-face-background\"",
        "frame.style.setProperty(\"--node-canvas-screen-background\"",
        "frame.style.setProperty(\"--node-canvas-aspect\", String(aspect))",
        "script.layers || []",
        "--node-canvas-layer-x",
        "${script.ratioWidth}:${script.ratioHeight} ${script.output || \"canvas\"}",
        "function nodeGraphModuleLayoutClassNames(type, definition, layout)",
        "classes.push(\"canvas-node-layout\")",
        "const layout = nodeGraphPatchNodeLayout(patchNode)",
        "const canvasBody = createNodeGraphCanvasBody(node)",
        "canvasBody.classList.add(\"node-module-square-scope-window\")",
        "nodeGraphModuleDefinitions[type]?.layout === \"canvas\"",
        "nodeGraphCanonicalOutputPort(sourceNode?.type, connection.sourcePort)",
        "function openNodeGraphScopeShaderScript(nodeId)",
        "function saveNodeGraphScopeShaderScriptFromDialog()",
        "function nodeGraphShaderScriptDialogIsDirty()",
        "function saveNodeGraphShaderScriptDialogChanges()",
        "function closeNodeGraphShaderScriptDialogWithDirtyCheck()",
        "Save shader changes before closing?",
        "Discard unsaved shader changes?",
        "liveApplyTimer: 0",
        "function applyNodeGraphShaderScriptLiveFromEditor()",
        "function scheduleNodeGraphShaderScriptLiveApply()",
        "function handleNodeGraphShaderScriptSourceChanged()",
        "source?.addEventListener(\"input\", handleNodeGraphShaderScriptSourceChanged)",
        "document.getElementById(\"nodeShaderScriptEnable\")?.addEventListener(\"click\", disableNodeGraphShaderScriptLiveApply)",
        "nodeGraphShaderScriptStatus(\"post processing disabled\", false)",
        "document.getElementById(\"nodeShaderScriptClose\")?.addEventListener(\"click\", () =>",
        "closeNodeGraphShaderScriptDialogWithDirtyCheck())",
        "nodeGraphShaderScriptState.dialogMode === \"scope\"",
        "Save",
        "function setNodeGraphShaderScriptEnabled(enabled, options = {})",
        "function clearNodeGraphShaderScriptCanvas()",
        "uniform vec4 uScopeRects[32]",
        "function nodeGraphShaderScriptDarkRoomBloomDefaultFragment()",
        "float roomFalloff = smoothstep(0.08, 0.82, length(roomUv));",
        "float screenBloom = 0.0;",
        "softLight(screenBloom)",
        "vec3 cyanGlow = vec3(0.12, 0.62, 0.68) * softLight(screenBloom) * NODE_SHADER_GLOW_AMOUNT;",
        "function createNodeGraphShaderProgram(gl, fragmentSource)",
        "function nodeGraphShaderScriptRects(canvas)",
        'workspace.querySelectorAll(".node-module-scope-window, .node-led-face")',
        "function drawNodeGraphShaderScriptFrame()",
        "function bindNodeGraphShaderScriptEvents()",
        "bindNodeGraphShaderScriptEvents();",
        "function setNodeGraphModuleScopesEnabled(enabled)",
        "function registerNodeGraphModuleScopeSlot(moduleElement, options = {})",
        "bindNodeGraphModuleScopeWindowEvents(scopeElement)",
        "function nodeGraphModuleScopeSlots()",
        "function beginNodeGraphRenderedScopeCapture(options = {})",
        'return type === "osc" || type === "polyBlep" || type === "sineWavetable" || type === "blit";',
        "function nodeGraphDefaultModuleScopeMonitors(patch = nodeGraphMvp?.patch)",
        "nodeGraphModuleScopeIsOscillatorType(node?.type)",
        'io: "output"',
        'port: nodeGraphOscillatorSelectedOutputPort(node)',
        "const inputs = nodeGraphPatchNodeInputPorts(node)",
        "io: \"input\"",
        "const nodeGraphModuleScopeSettingsStorageKey",
        "const nodeGraphModuleScopeDefaultDotCores = Object.freeze({",
        'traceColor: "#3de0ff"',
        "function normalizeNodeGraphModuleScopeSetting(value = {})",
        "function nodeGraphNormalizeScopeTraceColor(value)",
        "return nodeGraphModuleScopeDefaultDotCores.traceColor",
        "function nodeGraphScopeHexColorToRgb(color)",
        "function nodeGraphModuleScopeDefaultDotCore(dotName)",
        "function nodeGraphModuleScopeShaderAssignmentValue(source, dotName, key)",
        "const safeDotName = dotName === \"dot2\" ? \"dot2\" : \"dot1\"",
        "function nodeGraphModuleScopeShaderColor(source, dotName, fallback)",
        "function nodeGraphModuleScopeShaderGlobalColor(dotName)",
        "^${dotName}\\\\.(?:global|globals)\\\\.color$",
        "dot[12]\\\\.(?:global|globals)\\\\.(?:size|brightness|blur|color)",
        'blinkLightShape: "circle"',
        "blinkLightShape: [\"circle\", \"square\", \"diamond\"].includes(source.blinkLightShape)",
        "brightness: 1",
        "function nodeGraphModuleScopeExplicitShaderSourceForSlot(slot)",
        "function nodeGraphModuleScopeExplicitShaderConfigForSlot(slot)",
        "function nodeGraphModuleScopeEffectiveSettingForSlot(slot)",
        "nextSetting.shaderZoom = clampNodeSliderValue(zoom, 0.01, 50)",
        "nextSetting.syncSpeed = clampNodeSliderValue(syncSpeed, 0, 50)",
        "function normalizeNodeGraphModuleScopeFramesPerSecond(value)",
        "clampNodeSliderValue(Math.round(number), 0, 240)",
        "clampNodeSliderValue(number, 0.25, 10)",
        "clampNodeSliderValue(cycles, nodeGraphModuleScopeMinCycles, 128)",
        "clampNodeSliderValue(pan, -128, 128)",
        "const nodeGraphModuleScopeMinCycles = 1",
        "function nodeGraphModuleScopePositiveCycles(setting)",
        "function nodeGraphModuleScopeVisualGain(setting)",
        "return clampNodeSliderValue(gain * zoom, 0.01, 100)",
        "function nodeGraphModuleScopeEffectiveCycles(setting)",
        "return nodeGraphModuleScopeMinCycles",
        "clampNodeSliderValue(timeMs, 0, 10000)",
        "function applyNodeGraphModuleScopeSettings(value = {})",
        "function loadNodeGraphModuleScopeSettingsLocal()",
        "function updateNodeGraphModuleScopeSetting(nodeId, patch = {})",
        "function nodeGraphFormatScopeNumber(value)",
        "function nodeGraphScopeControlTargetNodeId()",
        "nodeGraphMvp.scopeContextTargetNode",
        "nodeGraphMvp.scopeContextDragging",
        "nodeGraphMvp.scopeContextWindowPosition",
        "nodeGraphMvp.globalScopeDragging",
        "nodeGraphMvp.globalScopeWindowPosition",
        "function renderNodeGraphSceneScopeControls(nodeId = nodeGraphScopeControlTargetNodeId())",
        "nodeGraphFormatScopeNumber(setting.cycles)",
        "document.getElementById(\"nodeSceneBlinkLightControls\")",
        "blinkLightControls.hidden = targetNode?.type !== \"clock\"",
        "blinkLightShape.value = setting.blinkLightShape",
        "Scope horizontal window in detected cycles.",
        "timeMs: Number.isFinite(timeMs)",
        "timeMs > 0",
        "function handleNodeGraphSceneScopeNumericInput(event)",
        'input.dataset.scopeInput === "cycles"',
        "updateNodeGraphModuleScopeSetting(nodeId, { cycles: value })",
        "function handleNodeGraphSceneScopeOptionInput(event)",
        'input.dataset.scopeInput === "blinkLightShape"',
        "function handleNodeGraphSceneScopeNumericKeydown(event)",
        "function nodeGraphScopeNumberInputSnapValue(input, value)",
        'input.dataset.scopeInput === "cycles"',
        "nodeGraphFormatScopeNumber(clampNodeSliderValue(Number(value) || 0, nodeGraphModuleScopeMinCycles, 128))",
        'input.dataset.scopeInput === "cycles"',
        "function nodeGraphScopeNumberDragInputFromTarget(target)",
        "target?.querySelector?.(\"input[data-global-scope-number-drag='true']\")",
        "captureTarget: event.currentTarget",
        "input.closest(\".node-header-timing-field\")?.classList.add(\"value-dragging\")",
        'input.dataset.timingField',
        "updateNodeGraphPatchTimingFromHeader(input)",
        "const baseCycles = Math.max(step / 8, (max - min) / 960)",
        "function beginNodeGraphScopeNumberDrag(event)",
        "function bindNodeGraphModuleScopeWindowEvents(scopeElement)",
        "function dragNodeGraphScopeNumber(event)",
        "function endNodeGraphScopeNumberDrag(event)",
        "function beginNodeGraphScopeNumberEdit(event)",
        "nodeGraphMvp.scopeNumberDragging",
        "setNodeGraphScopeNumberInputValue(",
        'input.dataset.globalScopeInput === "lineThickness"',
        "setNodeGraphModuleScopeLineThickness(input.value)",
        'input.dataset.globalScopeInput === "discontinuitySkipSamples"',
        "setNodeGraphModuleScopeDiscontinuitySkipSamples(input.value)",
        "if (typeof scheduleNodeGraphModuleScopeDraw === \"function\")",
        "function handleNodeGraphSceneScopeControlClick(event)",
        'updateNodeGraphModuleScopeSetting(nodeId, { sync: !setting.sync })',
        'getElementById("nodeSceneScopeTime")',
        "input.addEventListener(\"change\", handleNodeGraphSceneScopeNumericInput)",
        "input.addEventListener(\"keydown\", handleNodeGraphSceneScopeNumericKeydown)",
        "input.addEventListener(\"dblclick\", beginNodeGraphScopeNumberEdit)",
        "scopeElement.addEventListener(\"dblclick\", beginNodeGraphModuleScopeWindowNumberEdit)",
        "scopeElement.addEventListener(\"contextmenu\", beginNodeGraphModuleScopeWindowNumberEdit)",
        "function beginNodeGraphModuleScopeWindowNumberEdit(event)",
        "openNodeGraphTraceDisplaySettings(nodeId, event)",
        "function nodeGraphModuleDisplayTypeHasLocalSettings(displayType)",
        "function nodeGraphNodeHasLocalDisplaySettings(node)",
        "function nodeGraphNodeCanOpenDisplaySettings(node)",
        "if (!nodeGraphNodeCanOpenDisplaySettings(node))",
        "input.addEventListener(\"pointerdown\", beginNodeGraphScopeNumberDrag)",
        'getElementById("nodeSceneScopeSync")',
        'getElementById("nodeSceneScopeOscillatorTraceMode")',
        'addEventListener("click", handleNodeGraphSceneScopeControlClick)',
        'getElementById("nodeSceneBlinkLightShape")',
        'addEventListener("change", handleNodeGraphSceneScopeOptionInput)',
        "document.addEventListener(\"pointermove\", dragNodeGraphScopeNumber)",
        "document.addEventListener(\"pointerup\", endNodeGraphScopeNumberDrag)",
        "document.addEventListener(\"pointercancel\", endNodeGraphScopeNumberDrag)",
        "document.addEventListener(\"pointermove\", dragNodeScopeContextMenu)",
        "function beginNodeGraphLiveModuleScopeCapture(plan = {}, options = {})",
        "function updateNodeGraphLiveModuleScopeFingerprint(patchFingerprint = nodeGraphPatchFingerprint())",
        "nodeGraphModuleScopeState.buffers.clear();",
        "nodeGraphModuleScopeState.traceDisplayDrawCache.clear();",
        "nodeGraphModuleScopeState.traceDisplayScratch.clear();",
        "nodeGraphModuleScopeState.patchFingerprint = fingerprint",
        "function nodeGraphModuleScopeScalarValue(value)",
        "\"Out X\", \"Out Y\", \"Out Z\"",
        "modelFrameTimes: new Map()",
        "function resetNodeGraphModuleScopeFrameClocks()",
        "function nodeGraphModuleScopeAdvanceFixedFrameClock(state, now, fps)",
        "if (normalizedFps <= 0)",
        "lastUpdate: nextLastUpdate",
        "time: nextTime",
        "function nodeGraphModuleScopeModelFrameTime(slot)",
        "nodeGraphModuleScopeState.modelFrameTimes.get(nodeId)",
        "const tick = nodeGraphModuleScopeAdvanceFixedFrameClock(state, now, fps)",
        "nodeGraphModuleScopeState.modelFrameTimes.set(nodeId, state)",
        "function nodeGraphModuleScopeStableSeed(text)",
        "Math.imul(seed ^ character.charCodeAt(0), 16777619)",
        "Math.imul(1664525",
        "function nodeGraphModuleScopeLinearToDb(value)",
        "20 * Math.log10(amplitude)",
        "function nodeGraphModuleScopeFormatDb(value)",
        "function nodeGraphModuleScopeBufferStats(buffer)",
        "function renderNodeGraphModuleScopeAnalyzer(slot, buffer = null)",
        "querySelector?.(\".node-module-scope-analyzer\")",
        "metrics.gainDb",
        "metrics.peakDb",
        "metrics.rmsDb",
        "function nodeGraphModuleScopeOfflineSourceFrequency(nodeId",
        "function nodeGraphModuleScopeOfflineSignalSample(context, nodeId, localTime, sampleIndex",
        "const zeroFrequencyDisplayPhase = Number.isFinite(displayFrame)",
        "const scopeStartTime = Number(context.scopeStartTime)",
        "const elapsedTime = Math.max(",
        "const signalPhase = (Number(phasor.signal) || 0) +",
        "(frequency > 0 ? elapsedTime * frequency : zeroFrequencyDisplayPhase)",
        "function nodeGraphOscillatorSelectedOutputPort(node)",
        'return outputs.includes("Wave Out") ? "Wave Out" : outputs[0] || "Out"',
        'port: nodeGraphOscillatorSelectedOutputPort(node)',
        "nodeGraphCanonicalOutputPort(node.type, endpoint.port)",
        "function nodeGraphModuleScopeOfflineOscillatorSample(waveform, phaseCycle)",
        "clockPhasors: new Map()",
        "function nodeGraphModuleScopeClockPhasor(slot, rate, modelTime",
        "nodeGraphModuleScopeState.clockPhasors.get(nodeId)",
        "advanceRate * dt",
        "function nodeGraphModuleScopeClockPhaseAt(context, nodeId, rate, localTime)",
        "context.clockPhaseAnchors = new Map()",
        "nodeGraphModuleScopeClockPhaseAt(context, node.id, rate, localTime)",
        "function nodeGraphModuleScopeOscillatorPhasor(slot, frequency, cycles, modelTime",
        "nodeGraphModuleScopeState.oscillatorPhasors.get(nodeId)",
        "nodeGraphModuleScopeState.oscillatorPhasors.set(nodeId, phasor)",
        "if (phasor.renderTime === now)",
        "frequency: safeFrequency",
        "const previousSweep = Number(phasor.sweep) || 0",
        "phasor.previousSweep = previousSweep",
        "phasor.sweepDelta = sweepDelta",
        "const advanceFrequency = Math.max(0, Number(phasor.frequency) || 0)",
        "const cycleDelta = advanceFrequency * dt",
        "phasor.frequency = safeFrequency",
        "phasor.signal = wrapNodeSliderValue",
        "phasor.sweep = wrapNodeSliderValue",
        "const baseFrequency = Math.max(0, nodeGraphModuleScopeNodeParam(node, \"frequency\", 0))",
        "const level = nodeGraphModuleScopeNodeParam(node, \"level\", 0.5)",
        "nodeGraphModuleScopeModelFrameTime(slot)",
        "for (let index = 0; index < frames; index += 1)",
        "buffer.nodeGraphScopeDrawFullWindow = true",
        "buffer.nodeGraphScopeDrawProgress = 1",
        "buffer.nodeGraphScopeDrawStartProgress = 0",
        "buffer.nodeGraphScopeDrawWrap = false",
        "buffer.nodeGraphScopeUseFullWindow = true",
        "buffer.nodeGraphScopeDrawProgress = 1",
        "buffer.nodeGraphScopeMinPointSpacingPx = 0.5",
        "const x = new Float32Array(frames)",
        "const y = new Float32Array(frames)",
        "nodeGraphScopeXy: true",
        "function nodeGraphModuleScopeXyTraceFrameCount(length)",
        "return safeLength",
        "function nodeGraphModuleScopeCapturedXyTraceFrameCount(slot, length)",
        'slot?.type === "audioPlayer"',
        "Math.min(frames, 256)",
        "function nodeGraphModuleScopeCapturedCurrentLightTarget(capturedBuffer)",
        "for (let index = capturedBuffer.length - 1; index >= 0; index -= 1)",
        "return clampNodeSliderValue(Math.abs(sample), 0, 1)",
        "function nodeGraphModuleScopeCapturedFrameLightTarget(capturedBuffer)",
        "return count > 0 ? clampNodeSliderValue(sum / count, 0, 1) : null",
        "function nodeGraphModuleScopeCapturedGateLightTarget(capturedBuffer)",
        "if (transitions > 2)",
        "return nodeGraphModuleScopeCapturedCurrentLightTarget(capturedBuffer)",
        "function nodeGraphModuleScopeCapturedPulseLightTarget(capturedBuffer)",
        "peak = Math.max(peak, Math.abs(sample))",
        "function nodeGraphModuleScopeClockCapturedLightTarget(slot, capturedBuffer)",
        "selectedPort === \"Analog Out\"",
        "return nodeGraphModuleScopeCapturedCurrentLightTarget(capturedBuffer)",
        "selectedPort === \"Pulse\"",
        "return nodeGraphModuleScopeCapturedGateLightTarget(capturedBuffer)",
        "function nodeGraphModuleScopeShaderVideoInputForSlot(slot)",
        "function nodeGraphModuleScopeShaderOutputPortForSlot(slot)",
        "function nodeGraphModuleScopeClockGateFrameBrightness(previousPhase, turns, duty, level)",
        "onDuration += fullCycles * safeDuty",
        "return clampNodeSliderValue((onDuration / span) * safeLevel, 0, 1)",
        "function nodeGraphModuleScopeClockPulseFrameBrightness(previousPhase, turns, rate, level)",
        "const pulseSeconds = pulseCount / sampleRate",
        "function nodeGraphModuleScopeClockAnalogFrameBrightness(previousPhase, turns, level)",
        "return clampNodeSliderValue(sum / samples, 0, 1)",
        "function nodeGraphModuleScopeClockMonitorTarget(slot, node, phasor, duty, level)",
        "const port = nodeGraphModuleScopeShaderOutputPortForSlot(slot) || \"Digital Out\"",
        "function nodeGraphModuleScopeOfflineClockBlinkBuffer(slot, capturedBuffer = null)",
        "slot?.type !== \"clock\"",
        "const rate = Math.max(0, nodeGraphModuleScopeNodeParam(node, \"rate\", 0))",
        "const phasor = nodeGraphModuleScopeClockPhasor(",
        "const modelTarget = nodeGraphModuleScopeClockMonitorTarget(slot, node, phasor, duty, level)",
        "const capturedTarget = nodeGraphModuleScopeClockCapturedLightTarget(slot, capturedBuffer)",
        "nodeGraphScopeFrameBrightness: true",
        "nodeGraphScopeLightInstant: true",
        "nodeGraphScopeLightReleaseSeconds: 0.006",
        "nodeGraphScopeLightDisplay: true",
        "nodeGraphScopeLightShape: nodeGraphModuleScopeSetting(slot.nodeId).blinkLightShape",
        "nodeGraphScopeLightTarget: capturedTarget ?? (Number.isFinite(modelTarget) ? modelTarget : 0)",
        "nodeGraphModuleScopeOfflineClockBlinkBuffer(slot, capturedBuffer)",
        "const waveformByPort = {",
        "Saw: 0",
        "Ramp: 1",
        "Square: 2",
        "Tri: 3",
        "Sine: 4",
        'nodeGraphModuleScopeConnectionsTo(node.id, "0.1V/Oct")',
        "const frequency = Math.max(0, baseFrequency * (2 ** (pitchInput / 0.1)))",
        "nodeGraphModuleScopeIsAdditiveType(node.type)",
        "function nodeGraphModuleScopeOfflineGainAnalyzerBuffer(slot)",
        "slot?.type !== \"gain\"",
        "sourceFrequency > 0",
        "const startTime = time",
        "const inputBuffer = new Float32Array(frames)",
        "const inputConnections = nodeGraphModuleScopeConnectionsTo(node.id, \"In\")",
        "zeroFrequencyDisplayCycles: sourceFrequency > 0 ? 0 : cycles",
        "context.zeroFrequencyDisplayFrame = sourceFrequency > 0 ? null : index",
        "inputBuffer[index] = inputConnections.reduce((sum, connection) => sum + nodeGraphModuleScopeOfflineSignalSample(",
        "buffer[index] = inputBuffer[index]",
        "buffer.nodeGraphScopeAnalyzer = {",
        "gainDb: nodeGraphModuleScopeLinearToDb(amount)",
        "inputRmsDb: inputStats.rmsDb",
        "...nodeGraphModuleScopeBufferStats(buffer)",
        "buffer.nodeGraphScopePeriodSamples = sourceFrequency > 0 ? frames / cycles : 0",
        "buffer.nodeGraphScopeSourceFrequency = sourceFrequency",
        "buffer.nodeGraphScopeSyncBuffer = buffer",
        "nodeGraphModuleScopeOfflineGainAnalyzerBuffer(slot)",
        "buffer.nodeGraphScopeHoldPointSamplePosition",
        "function nodeGraphModuleScopeDisplayBuffer(slot, capturedBuffer = null)",
        'displayType: "scope2d"',
        'displayType: "scope2dTrace"',
        'renderer === "scope2dTrace"',
        'renderer === "scope2d"',
        "nodeGraphModuleScopeCapturedScope2dBuffer(slot, source",
        "function nodeGraphModuleScopeCapturedBufferForSlot(slot)",
        "const selectedPort = nodeGraphModuleScopeShaderOutputPortForSlot(slot)",
        "nodeGraphModuleScopeState.buffers.get(`${nodeId}:${selectedPort}`)",
        "nodeGraphScopeCapturedOutput: true",
        "function captureNodeGraphLiveModuleScopeOutput(runtime, nodeId, output)",
        "for (const [port, value] of Object.entries(output))",
        "const portId = `${id}:${port}`",
        "portSamples.push(nodeGraphModuleScopeScalarValue(value))",
        "const inputPort = String(input.port || \"\").trim()",
        "const portId = `${nodeId}:${inputPort}`",
        "function nodeGraphModuleScopeHasModelDisplay()",
        "slot.type === \"clock\"",
        "nodeGraphModuleScopeState.mode = \"model\"",
        "function pushNodeGraphLiveModuleScopeSnapshot(values, options = {})",
        "updateNodeGraphLiveModuleScopeFingerprint(patchFingerprint)",
        "function captureNodeGraphLiveModuleScopeFrame(runtime, sampleRate)",
        "return Boolean(nodeGraphMvp?.live?.node)\n      && nodeGraphModuleScopeState.patchFingerprint === nodeGraphPatchFingerprint();",
        "function nodeGraphModuleScopeThreshold(buffer, start = 0, end = buffer.length)",
        "function nodeGraphModuleScopeRisingCrossings(buffer, threshold, start = 1, end = buffer.length)",
        "function nodeGraphModuleScopeMedianPeriod(crossings)",
        "function nodeGraphModuleScopeLowpassSyncTrace(buffer, start, end, periodSamples = 0)",
        "const cutoff = clampNodeSliderValue(fundamental * 4, 20, sampleRate * 0.45)",
        "y4 += (y3 - y4) * alpha",
        "function nodeGraphModuleScopeTraceRisingCrossings(trace, start = 1, end = trace?.length || 0, offset = 0)",
        "function nodeGraphModuleScopeSyncBuffer(buffer)",
        "buffer?.nodeGraphScopeSyncBuffer?.length === buffer?.length",
        "function nodeGraphModuleScopeEstimatedCycle(buffer)",
        "const syncBuffer = nodeGraphModuleScopeSyncBuffer(buffer)",
        "const hintedPeriodSamples = Number(buffer?.nodeGraphScopePeriodSamples)",
        "periodSamples: hintedPeriodSamples",
        "function nodeGraphModuleScopeTriggeredStart(syncBuffer, cycleEstimate, visibleSamples)",
        "Math.max(visibleSamples + periodSamples * 6, 1024)",
        "const start = crossing",
        "const end = start + visibleSamples",
        "function nodeGraphModuleScopeVisibleSamples(buffer, settings, cycleEstimate)",
        "function nodeGraphModuleScopeBufferView(buffer, slot)",
        "if (buffer?.nodeGraphScopeUseFullWindow)",
        "const settings = nodeGraphModuleScopeEffectiveSettingForSlot(slot)",
        "gain: nodeGraphModuleScopeVisualGain(settings)",
        "const estimatedCycle = nodeGraphModuleScopeEstimatedCycle(buffer)",
        "const cycleEstimate = settings.sync ? estimatedCycle : null",
        "const visibleSamples = nodeGraphModuleScopeVisibleSamples(buffer, settings, estimatedCycle)",
        "const triggeredStart = nodeGraphModuleScopeTriggeredStart(syncBuffer, cycleEstimate, visibleSamples)",
        "const rawPanCycles = Number(settings.pan) || 0",
        "const panCycles = settings.sync && cycleEstimate",
        "? Math.round(rawPanCycles)",
        "start = clampNodeSliderValue(start - panSamples",
        "nodeGraphModuleScopeDisplayBuffer(",
        "previous <= threshold && current > threshold",
        "(index - 1) + fraction",
        "cycleEstimate.periodSamples * cycles",
        "nodeGraphModuleScopeDefaultSettings.cycles",
        "function nodeGraphModuleScopeInterpolatedSample(buffer, position)",
        "nodeGraphModuleScopeBufferValue(buffer, position, view)",
        "function nodeGraphModuleScopeTraceColors(slot)",
        "nodeGraphModuleScopeShaderGlobalColor(\"dot1\")",
        "nodeGraphModuleScopeShaderGlobalColor(\"dot2\")",
        "const halo = nodeGraphModuleScopeMixColor(haloBase, [0, 0, 0], 0.15)",
        "function nodeGraphModuleScopeDotStyle(slot, buffer)",
        "nodeGraphMvp?.moduleScopeDotCore1Enabled === false",
        "nodeGraphMvp?.moduleScopeDotCore2Enabled === false",
        "coreSize: normalizeNodeGraphModuleScopeDotCoreSize(coreSize, nodeGraphModuleScopeDefaultDotCores.dot1.size)",
        "coreBrightness: clampNodeSliderValue(coreBrightness, 0, 40)",
        "haloSize: normalizeNodeGraphModuleScopeDotCoreSize(haloSize, nodeGraphModuleScopeDefaultDotCores.dot2.size)",
        "haloBrightness: clampNodeSliderValue(haloBrightness, 0, 40)",
        "function nodeGraphModuleScopeZoomScale()",
        "function nodeGraphModuleScopeUnzoomedLength(value, zoomScale = nodeGraphModuleScopeZoomScale())",
        "function nodeGraphModuleScopeRenderedSampleWidth(rect, zoomScale = nodeGraphModuleScopeZoomScale())",
        "sampleWidth * zoom",
        "function nodeGraphModuleScopeDotTextureOptions(\n  core1SizeValue,\n  core1BrightnessValue,\n  size = 64,",
        "function nodeGraphModuleScopeGeneratedDotTextureData(...args)",
        "const options = nodeGraphModuleScopeDotTextureOptions(...args)",
        "function nodeGraphModuleScopeDotBlurMask(distanceSquared, radius, blurValue = 0)",
        "function normalizeNodeGraphModuleScopeDotBlur(value, fallback = 0)",
        "const gaussianSharpness = 2.2 + (1 - blur) * 10",
        "function nodeGraphModuleScopeGeneratedDotTexture(renderer)",
        "normalizeNodeGraphModuleScopeDotCoreSize(options.core1Size, nodeGraphModuleScopeDefaultDotCores.dot1.size)",
        "normalizeNodeGraphModuleScopeDotCoreBrightness(options.core2Brightness, nodeGraphModuleScopeDefaultDotCores.dot2.brightness)",
        "options.lineThickness ?? nodeGraphModuleScopeDefaultSettings.lineThickness",
        "const finalCore1Size = core1Size * lineThickness",
        "const finalCore2Size = core2Size * lineThickness",
        "const core1Blur = normalizeNodeGraphModuleScopeDotBlur(options.core1Blur, 0)",
        "const core2Blur = normalizeNodeGraphModuleScopeDotBlur(options.core2Blur, 0)",
        "const key = `generated:${core1Enabled}:${core1Size.toFixed(3)}:${core1Brightness.toFixed(3)}:${core1Color}:${core1Blur.toFixed(3)}:${core2Enabled}:${core2Size.toFixed(3)}:${core2Brightness.toFixed(3)}:${core2Color}:${core2Blur.toFixed(3)}:${lineThickness.toFixed(3)}`",
        "const dotDiameterPx = Math.max(1, core1Size, core2Size)",
        "const core1Radius = clampNodeSliderValue(finalCore1Size * 0.5, 0.005, 20)",
        "const core1Mask = nodeGraphModuleScopeDotBlurMask(distanceSquared, core1Radius, core1Blur)",
        "const core2Mask = nodeGraphModuleScopeDotBlurMask(distanceSquared, core2Radius, core2Blur)",
        "const dx = ((x - center) / center) * dotDiameterPx * 0.5",
        "const core1Falloff = 2.6 / Math.max(0.0001, core1Radius * core1Radius)",
        "nodeGraphMvp?.moduleScopeDotCore1Color ?? nodeGraphModuleScopeDefaultDotCores.dot1.color",
        "nodeGraphMvp?.moduleScopeDotCore2Color ?? nodeGraphModuleScopeDefaultDotCores.dot2.color",
        "core1Enabled ? \"core1-on\" : \"core1-off\"",
        "core2Enabled ? \"core2-on\" : \"core2-off\"",
        "function nodeGraphModuleScopeDotSizeScale()",
        "return clampNodeSliderValue(Math.max(core1Size, core2Size) * lineThickness, 0.01, 40)",
        "function nodeGraphModuleScopeTraceDotSizeScale(dotSize, fallback = 1)",
        "return clampNodeSliderValue(size * lineThickness, 0.01, 40)",
        "gl.texImage2D(\n    gl.TEXTURE_2D,\n    0,\n    gl.RGBA,\n    64,\n    64",
        "function nodeGraphModuleScopePhosphorFrameReady(slot)",
        "const tick = nodeGraphModuleScopeAdvanceFixedFrameClock(state, now, fps)",
        "lastUpdate: tick.lastUpdate",
        "typeof nodeGraphZoom === \"function\"",
        "Number(nodeGraphMvp?.zoom)",
        "beamProgram",
        "attribute vec2 aStart",
        "attribute vec2 aEnd",
        "attribute float aCorner",
        "varying vec2 vPosition",
        "float normalizedDistance = length(vPosition - closest) / radius",
        "float beamHalfWidth = max(uSize * 1.85, 1.5)",
        "float edgeWidth = mix(0.01, 1.0, blur)",
        "float alpha = clamp((1.0 - smoothstep(1.0 - edgeWidth, 1.0 + edgeWidth, normalizedDistance)) * uIntensity, 0.0, 1.0)",
        "gl_FragColor = vec4(uColor * alpha, alpha)",
        "traceImageTexture: {",
        "function nodeGraphModuleScopePixelPoints(points, canvas)",
        "function nodeGraphModuleScopeBeamVertices(points, canvas)",
        "function nodeGraphModuleScopeDotVertices(points, canvas, ageStart = 0, ageEnd = 1)",
        "function nodeGraphModuleScopeBufferDotVertices(buffer, rect, canvas, pixelRatio, slot, options = {})",
        "if (xyPoints.length >= 2)",
        "function nodeGraphModuleScopeSpectrumBarVertices(buffer, rect, canvas, options = {})",
        "const visibleRange = Array.isArray(options.visibleProgressRange)",
        "const firstIndex = Math.max(0, Math.floor(length * visibleRange[0]))",
        "const lastIndex = Math.min(length, Math.ceil(length * visibleRange[1]))",
        "if (!buffer?.nodeGraphScopeSpectrum || length <= 0 || rect.width <= 1 || rect.height <= 1)",
        "const x1 = left + (index / length) * (right - left)",
        "const x2 = left + ((index + 1) / length) * (right - left)",
        "pushVertex(x1, bottom)",
        "pushVertex(x2, bottom)",
        "function drawNodeGraphModuleScopeSpectrumBarsWebGl(renderer, rect, buffer, pixelRatio, options = {})",
        "if (buffer?.nodeGraphScopeSpectrum)",
        "drawNodeGraphModuleScopeSpectrumBarsWebGl(renderer, rect, buffer, pixelRatio, options)",
        "gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 2)",
        "function nodeGraphModuleScopeBufferProgressRanges(buffer)",
        "function beginNodeGraphModuleScopeRenderMetricsFrame()",
        "function recordNodeGraphModuleScopeRenderMetrics(pointCount = 0, vertexCount = 0)",
        "function commitNodeGraphModuleScopeRenderMetricsFrame(",
        "function syncNodeGraphScopeGpuMetricsDisplay()",
        "function syncNodeGraphScopeGpuDebugDisplay()",
        "function nodeGraphScopeGpuMetricsVisible(root = document.getElementById(\"nodeScopeGpuMetrics\"))",
        "function setNodeGraphModuleScopeDebugPhase(phase, extra = {})",
        "function markNodeGraphModuleScopeDebugError(error)",
        "function pushNodeGraphModuleScopeDebugHistory(reason = \"frame\")",
        "window.nodeGraphScopeDebugSnapshot = () => ({",
        "function runNodeGraphModuleScopeDrawFrame(source = \"raf\")",
        "console.error(`node graph module scope ${source} draw failed`, error)",
        "root.dataset.debugSnapshot = JSON.stringify(snapshot)",
        "document.getElementById(\"nodeScopeGpuMetrics\")",
        "root?.querySelector(\"[data-scope-gpu-debug='summary']\")",
        "root.dataset.scopeVertices = String(vertices)",
        "function startNodeGraphConstraintResourceMetrics()",
        "function syncNodeGraphConstraintResourceMetrics()",
        "function syncNodeGraphCpuConstraintMetrics()",
        "function syncNodeGraphRamConstraintMetrics()",
        "document.getElementById(\"nodeScopeCpuMetrics\")",
        "document.getElementById(\"nodeScopeRamMetrics\")",
        "metrics.mainThreadLagMs",
        "performance?.memory",
        "document.getElementsByTagName(\"*\").length",
        "DOM nodes",
        "function nodeGraphModuleScopeProgressRangeIntersection(range, clipRange)",
        "function nodeGraphModuleScopeVisibleMetricRect(rect, options = {})",
        "function nodeGraphModuleScopeBufferSegmentPoints(",
        "options = {},",
        "options.visibleProgressRange",
        "const spectrumMode = buffer?.nodeGraphScopeSpectrum === true",
        "rect.top + rect.height",
        "rect.height * nodeGraphModuleScopeTraceHalfHeightRatio(slot, buffer, rect)",
        "function nodeGraphModuleScopeSampleInfo(buffer, position)",
        "const sampleInfo = nodeGraphModuleScopeSampleInfo(buffer, samplePosition)",
        "points.nodeGraphScopeRawValues = rawValues",
        "points.nodeGraphScopeSkippedPoints = skippedPoints",
        "if (skippedPoints?.[pointIndex])",
        "nodeGraphModuleScopeDiscontinuityThreshold",
        "normalizeNodeGraphModuleScopeDiscontinuitySkipSamples(nodeGraphMvp?.moduleScopeDiscontinuitySkipSamples ?? 1)",
        "Math.abs(currentRaw - previousRaw) > nodeGraphModuleScopeDiscontinuityThreshold",
        "function nodeGraphModuleScopeCenteredSquareRect(rect)",
        "const size = Math.max(1, Math.min(Number(rect?.width) || 0, Number(rect?.height) || 0))",
        "function nodeGraphModuleScopePaddedRect(rect, padding = 0)",
        "const safePadding = clampNodeSliderValue(Number(padding) || 0, 0, 0.45)",
        "function nodeGraphModuleScopeDrawingRect(rect, buffer = null, slot = null)",
        "const paddedRect = nodeGraphModuleScopePaddedRect(rect, shaderPadding)",
        "if (buffer?.nodeGraphScopeXy)",
        "function nodeGraphModuleScopeRectIntersection(rect, bounds)",
        "function nodeGraphModuleScopeVisibleDrawGeometry(screenRect, drawRect, viewportRect, zoomScale = nodeGraphModuleScopeZoomScale())",
        "!nodeGraphModuleScopeRectIntersection(screenRect, viewportRect)",
        "const visibleDrawRect = nodeGraphModuleScopeRectIntersection(drawRect, viewportRect)",
        "const visibleProgressRange = [",
        "visibleScopeRect:",
        "function nodeGraphModuleScopeXyPoints(buffer, rect, canvas, pixelRatio, slot)",
        "if (!buffer?.nodeGraphScopeXy || !buffer.x?.length || !buffer.y?.length",
        "const gain = nodeGraphModuleScopeVisualGain(settings)",
        "for (let index = 0; index < length; index += 1)",
        "const square = nodeGraphModuleScopeCenteredSquareRect(rect)",
        "const radius = Math.max(1, square.width * 0.44)",
        "clampNodeSliderValue((Number(buffer.x[index]) || 0) * gain, -1, 1)",
        "clampNodeSliderValue((Number(buffer.y[index]) || 0) * gain, -1, 1)",
        "const drawProgress = Number.isFinite(Number(buffer?.nodeGraphScopeDrawProgress))",
        "clampNodeSliderValue(Number(buffer.nodeGraphScopeDrawProgress), 0.002, 1)",
        "const minPointSpacingPx = clampNodeSliderValue(Number(buffer.nodeGraphScopeMinPointSpacingPx) || 0.5, 0.25, 32)",
        "const metricRect = nodeGraphModuleScopeVisibleMetricRect(rect, options)",
        "function appendNodeGraphModuleScopeVertices(target, source)",
        "target.push(source[index])",
        "const sampleWidth = nodeGraphModuleScopeRenderedSampleWidth(metricRect)",
        "const metricDrawSpan = metricRect === rect ? drawSpan : 1",
        "const visibleSampleWidth = sampleWidth * metricDrawSpan",
        "const visualPointLimit = Math.max(2, Math.min(32768, Math.floor(Number(buffer.nodeGraphScopeVisualPointLimit) || 32768)))",
        "const pointCount = spectrumMode",
        "Math.max(2, Math.min(visualPointLimit, Math.ceil(visibleSamples)))",
        "buffer?.nodeGraphScopeHoldPoint === true",
        "pointIndex / Math.max(1, pointCount - 1)",
        "view.start + progress * Math.max(0, visibleSamples - 1)",
        "function nodeGraphModuleScopeScreenItems(workspace, canvas, pixelRatio)",
        "const viewportRect = {",
        "const screenRect = {",
        "const drawRect = nodeGraphModuleScopeDrawingRect(screenRect, buffer, slot)",
        "const visibleGeometry = nodeGraphModuleScopeVisibleDrawGeometry(screenRect, drawRect, viewportRect, zoomScale)",
        "if (!visibleGeometry)",
        "displayRect: screenRect",
        "fullDrawRect: drawRect",
        "screenElement: slot.scopeElement",
        "screenRect,",
        "visibleDrawRect: visibleGeometry.visibleDrawRect",
        "visibleProgressRange: visibleGeometry.visibleProgressRange",
        "visibleScopeRect: visibleGeometry.visibleScopeRect",
        "function drawNodeGraphModuleScopeCanvasDotPath(context, points, proxyCanvas, pixelRatio, heatmapMode = false, slot = null)",
        "const drawConnectedStroke = (lineWidth, shadowBlur, rgb, alpha) => {",
        "context.lineTo(x2, y2)",
        "context.stroke()",
        "const colors = heatmapMode ? nodeGraphModuleScopeHeatmapTraceColors() : nodeGraphModuleScopeDotStyle(slot, null)",
        "if (haloBrightness > 0)",
        "colors.haloColor ?? colors.halo",
        "if (coreBrightness > 0)",
        "colors.coreColor ?? colors.core",
        "const firstVisibleSlot = visibleItems[0]?.slot",
        "sampleWidth: nodeGraphModuleScopeUnzoomedLength(drawRect.width, zoomScale)",
        "sampleHeight: nodeGraphModuleScopeUnzoomedLength(drawRect.height, zoomScale)",
        "function captureNodeGraphRenderedScopeFrame(",
        "function finishNodeGraphRenderedScopeCapture(capture)",
        'oscillatorTraceMode: "frequencyReset"',
        'source.oscillatorTraceMode === "window" ? "window" : "frequencyReset"',
        'button.dataset.scopeControl === "oscillatorTraceMode"',
        'oscillatorTraceMode: setting.oscillatorTraceMode === "window" ? "frequencyReset" : "window"',
        "function drawNodeGraphModuleScopes()",
        "const nodeGraphModuleScopeMaxBackingStoreSize = 4096",
        "function nodeGraphModuleScopeBackingPixelRatio(rect, requestedPixelRatio = window.devicePixelRatio || 1)",
        "nodeGraphModuleScopeBackingPixelRatio(workspace.getBoundingClientRect())",
        "nodeGraphModuleScopeState.animationDeltaSeconds = clampNodeSliderValue(",
        "nodeGraphModuleScopeState.animationLastTime = animationTime",
        "nodeGraphMvp.moduleOscilloscopesVisible === false",
        "function scheduleNodeGraphModuleScopeDraw()",
        "function createNodeGraphModuleScopeWebGlRenderer(canvas)",
        "beamProgram",
        "beamCanvasSizeLocation",
        "beamIntensityLocation",
        "const nodeGraphModuleScopeUnipolarTypes = new Set([",
        "\"vactrolEnvelopeSeries\"",
        "setNodeGraphModuleScopeDebugPhase(\"lights\")",
        "function nodeGraphModuleScopeTracesOff()",
        "nodeGraphMvp?.visualControls?.scopeTracesOff",
        "function nodeGraphModuleScopeCircuitRunning()",
        "function nodeGraphModuleScopePaused()",
        "nodeGraphMvp?.visualControls?.scopePaused",
        "function nodeGraphModuleScopeHasRenderableSlots()",
        "!nodeGraphModuleScopeHasRenderableSlots()",
        "!nodeGraphModuleScopeCircuitRunning()",
        "if (nodeGraphModuleScopeTracesOff())",
        "nodeGraphModuleScopeState.scopeTracesOffActive",
        "clearNodeGraphModuleScopeCanvas();",
        "const scopePaused = nodeGraphModuleScopePaused();",
        "if (scopePaused && !nodeGraphModuleScopeHasModelDisplay())",
        "drawFrameRequestedAt",
        "drawFrameWatchdog",
        "drawFrameHeartbeat",
        "syncNodeGraphModuleScopeHeartbeat()",
        "function nodeGraphModuleScopeLightCanvas()",
        "return document.getElementById(\"nodeModuleScopeLightCanvas\")",
        "lightDisplayStates: new Map()",
        "function nodeGraphEffectivePatchNodeUi(ui = {})",
        "function nodeGraphModuleScopeTraceImageTexture(renderer)",
        "nodeGraphTraceImageDataUrl()",
        "return nodeGraphModuleScopeGeneratedDotTexture(renderer)",
        "function drawNodeGraphModuleScopeBufferWebGl(renderer, rect, buffer, pixelRatio, slot, options = {})",
        "let pointCount = 0",
        "pointCount += xyPoints.length / 2",
        "pointCount += points.length / 2",
        "recordNodeGraphModuleScopeRenderMetrics(pointCount, vertices.length / 6)",
        "appendNodeGraphModuleScopeVertices(vertices, nodeGraphModuleScopeBeamVertices(points, canvas))",
        "const fixedDotSizeRatio = Number(buffer?.nodeGraphScopeFixedDotSizeRatio)",
        "Math.min(visibleRect.width, visibleRect.height) * clampNodeSliderValue(fixedDotSizeRatio, 0.01, 1)",
        "gl.vertexAttribPointer(renderer.beamStartLocation, 2, gl.FLOAT, false, 24, 0)",
        "gl.vertexAttribPointer(renderer.beamEndLocation, 2, gl.FLOAT, false, 24, 8)",
        "gl.vertexAttribPointer(renderer.beamCornerLocation, 1, gl.FLOAT, false, 24, 16)",
        "gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 6)",
        "recordNodeGraphModuleScopeRenderMetrics(vertices.length / 12, vertices.length / 2)",
        "function drawNodeGraphModuleScopeLightDisplay(context, rect, buffer, pixelRatio, slot)",
        "buffer?.nodeGraphScopeLightDisplay",
        "let brightness = target",
        "const releaseSeconds = Number(buffer.nodeGraphScopeLightReleaseSeconds)",
        "if (target >= state.brightness)",
        "state.brightness = target",
        "Math.max(0.001, releaseSeconds)",
        "if (!buffer.nodeGraphScopeLightInstant)",
        "const tau = target > state.brightness ? 0.008 : 0.018",
        "const lightStyle = nodeGraphModuleScopeLightShaderStyle(slot, buffer)",
        "const core1Size = lightStyle.centerSize",
        "const core1Brightness = lightStyle.centerBrightness",
        "const core1Blur = lightStyle.centerBlur",
        "const core2Size = lightStyle.outerSize",
        "const core2Brightness = lightStyle.outerBrightness",
        "const core2Blur = lightStyle.outerBlur",
        "function nodeGraphModuleScopeShaderSizeRatio(source, dotName, fallback)",
        "function nodeGraphModuleScopeShaderExpressionValue(expression, dotName, key, fallback)",
        "function nodeGraphModuleScopeShaderGlobalValue(dotName, key, fallback)",
        "dot2.global.size",
        "dot1.global.blur",
        "dot2.global.brightness",
        "const availableSize = Math.max(1, Math.min(rect.width, rect.height))",
        "const outerSizeRatio = clampNodeSliderValue(core2Size, 0, 1)",
        "const centerSizeRatio = clampNodeSliderValue(core1Size, 0, 1)",
        "const size = Math.max(1, availableSize * outerSizeRatio)",
        "nodeGraphModuleScopeTraceBrightness(slot, settings)",
        "nodeGraphModuleScopeState.lightDisplayStates.get(nodeId)",
        "nodeGraphModuleScopeState.lightDisplayStates.delete(nodeId)",
        "lightSpriteTextures: new Map()",
        "function drawNodeGraphModuleScopeLightShape(context, shape, centerX, centerY, radius)",
        "function nodeGraphModuleScopeLightFillStyle(context, centerX, centerY, radius, rgb, alpha, blurValue = 0)",
        "const middleStop = clampNodeSliderValue(0.22 + (1 - blur) * 0.58, 0.22, 0.8)",
        "function nodeGraphModuleScopeLightSpriteKey(options)",
        "function nodeGraphModuleScopeLightSpriteTexture(options)",
        "nodeGraphModuleScopeState.lightSpriteTextures.set(key, sprite)",
        "function nodeGraphModuleScopeEmissiveShaderRgb(rgb, brightness)",
        "const targetMax = clampNodeSliderValue(72 + Math.max(0, Number(brightness) || 0) * 144, 72, 255)",
        "const visibleOuterRgb = lightStyle.usesShader",
        "context.globalCompositeOperation = lightStyle.usesShader ? \"source-over\" : \"lighter\"",
        "context.globalAlpha = alpha",
        "context.drawImage(sprite.canvas, centerX - sprite.size * 0.5, centerY - sprite.size * 0.5)",
        "if (shape === \"square\")",
        "else if (shape === \"diamond\")",
        "context.drawImage(sprite.canvas, centerX - sprite.size * 0.5, centerY - sprite.size * 0.5)",
        "centerSizeRatio / outerSizeRatio",
        "function drawNodeGraphModuleScopeLightDisplays(items, pixelRatio)",
        "drawNodeGraphModuleScopeLightDisplay(context, item.scopeRect, item.buffer, pixelRatio, item.slot)",
        "if (buffer?.nodeGraphScopeLightDisplay)",
        "drawNodeGraphModuleScopeLightDisplays(visibleItems, pixelRatio)",
        "function nodeGraphModuleScopeClippedPixelRect(canvas, rect, pixelRatio = window.devicePixelRatio || 1)",
        "if (!clipRect)",
        "return false;",
        "gl.clearColor(0, 0, 0, 0)",
        "gl.clear(gl.COLOR_BUFFER_BIT)",
        "gl.enable(gl.SCISSOR_TEST)",
        "phosphorFrame: {",
        "nodeGraphModuleScopeState.phosphorFrame = {",
        "if (!nodeGraphModuleScopePhosphorFrameReady(firstVisibleSlot))",
        'setNodeGraphModuleScopeDebugPhase("clear-current-frame")',
        "gl.bindFramebuffer(gl.FRAMEBUFFER, null)",
        "gl.clear(gl.COLOR_BUFFER_BIT)",
        'setNodeGraphModuleScopeDebugPhase("current-frame-ready")',
        "function applyNodeGraphModuleScopeTraceBlendMode(gl, blendMode = \"laser\")",
        "gl.blendFunc(gl.ONE, gl.ZERO)",
        "gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)",
        "gl.blendFunc(gl.SRC_ALPHA, gl.ONE)",
        "function nodeGraphModuleScopeTraceBlendMode(slot)",
        "nodeGraphModuleScopeShaderConfigForSlot(slot).blendMode",
        "function nodeGraphModuleScopeTraceBrightness(slot, settings)",
        "return clampNodeSliderValue(brightness, 0, 16)",
        "function nodeGraphModuleScopeTraceLineThickness(slot, settings)",
        "const masterLineThickness = normalizeNodeGraphModuleScopeLineThickness(",
        "return clampNodeSliderValue(lineThickness * masterLineThickness, 0.25, 32)",
        "applyNodeGraphModuleScopeTraceBlendMode(gl, blendMode)",
        "nodeGraphModuleScopeDotStyle(slot, buffer)",
        "const zoomScale = nodeGraphModuleScopeZoomScale()",
        "const brightness = nodeGraphModuleScopeTraceBrightness(slot, scopeSettings)",
        "const lineThickness = nodeGraphModuleScopeTraceLineThickness(slot, scopeSettings)",
        "const haloBrightness = heatmapMode",
        "const coreBrightness = heatmapMode",
        "if (haloBrightness > 0)",
        "dotSizeScale: heatmapMode\n          ? undefined\n          : nodeGraphModuleScopeTraceDotSizeScale(colors.haloSize, nodeGraphModuleScopeDefaultDotCores.dot2.size)",
        "intensity: (heatmapMode ? 0.05 : 0.034) * brightness * haloBrightness",
        "if (coreBrightness > 0)",
        "dotSizeScale: heatmapMode\n          ? undefined\n          : nodeGraphModuleScopeTraceDotSizeScale(colors.coreSize, nodeGraphModuleScopeDefaultDotCores.dot1.size)",
        "intensity: (heatmapMode ? 0.34 : 1.0) * brightness * coreBrightness",
        "thicknessPx: 3.25 * zoomScale",
        "thicknessPx: 1.25 * zoomScale",
        "const traceThicknessPx = Math.max(1, Number(options.thicknessPx) || 1)",
        "const requestedDotSizeScale = Number(options.dotSizeScale)",
        "fixedDotSizePx || (traceThicknessPx * dotSizeScale)",
        "Number.isFinite(intensity) ? Math.max(0, intensity) : 0.1",
        "gl.useProgram(renderer.colorProgram)",
        "gl.bindBuffer(gl.ARRAY_BUFFER, renderer.colorPositionBuffer)",
        "gl.vertexAttribPointer(renderer.colorPositionLocation, 2, gl.FLOAT, false, 8, 0)",
        "module-scopes-webgl-unavailable",
        "gl.enable(gl.SCISSOR_TEST)",
        "function normalizeNodeGraphPatchMonitors(monitors = [], patch = nodeGraphMvp?.patch)",
        "function toggleNodeGraphMonitorFromPortEvent(event)",
        "function syncNodeGraphMonitorIndicators(patch = nodeGraphMvp?.patch)",
        "function syncNodeGraphModuleScopeCanvas()",
        "monitors: normalizeNodeGraphPatchMonitors(patch.monitors, patch)",
        "port.addEventListener(\"pointerdown\", toggleNodeGraphMonitorFromPortEvent, true)",
        "function createNodeGraphModuleScopeSection(node, type)",
        "className = \"node-module-scope-window\"",
        "if (!patchNodeUi.oscilloscopeHidden)",
        "visualScope: \"visual-scope-layout\"",
        "filterCurve: \"filter-curve-layout\"",
        "} else if (definition.layout === \"filterCurve\") {",
        "if (!patchNodeUi.oscilloscopeHidden) {\n      article.append(createNodeGraphFilterCurveDisplay(node, type));\n    }",
        "scopeSection.classList.add(\"node-module-square-scope-window\")",
        "createNodeGraphFilterCurveDisplay(node, type)",
        "function drawNodeGraphFilterCurveDisplay(section)",
        "function nodeGraphOnePoleLowpassMagnitudeAt(cutoff, frequency, sampleRate)",
        "function nodeGraphOnePoleHighpassMagnitudeAt(cutoff, frequency, sampleRate)",
        "function nodeGraphBandpassMagnitudeAt(lowCut, highCut, frequency, sampleRate)",
        "function nodeGraphLadderFilterMagnitudeAt(params, frequency, sampleRate)",
        "function nodeGraphFilterCurveResponseAt(node, frequency, sampleRate)",
        "function nodeGraphFilterCurveCutoffFrequencies(node)",
        "Number.isFinite(value) && value >= 0",
        "const cutoffInset = cutoffLineWidth * 0.5",
        "const cutoffX = cutoffInset + cutoffRatio * cutoffDrawableWidth",
        "function scheduleNodeGraphFilterCurveDraw()",
        "function syncNodeGraphFilterCurveDisplays()",
        "node-filter-curve-display",
        "node-filter-curve-canvas",
        "section.append(canvas)",
        "syncNodeGraphFilterCurveDisplays()",
        "deferAutosave: isDrag",
        "ioSection.append(inputColumn || document.createElement(\"div\"))",
        "section.dataset.tooltipKey = \"module.scopeWindow\"",
        "nodeGraphApplyTooltip(section, \"module.scopeWindow\")",
        "className = \"node-module-scope-analyzer\"",
        "registerNodeGraphModuleScopeSlot(article, { nodeId: node, type, scopeElement: scopeSection })",
        "nodeShaderScriptDialog",
        "nodeShaderScriptHighlight",
        "nodeShaderScriptSource",
        "nodeModularShaderCanvas",
        "const scopeCapture = beginNodeGraphRenderedScopeCapture({",
        "captureNodeGraphRenderedScopeFrame(",
        "finishNodeGraphRenderedScopeCapture(scopeCapture)",
        "captureNodeGraphLiveModuleScopeFrame(runtime, sampleRate);",
        "scheduleNodeGraphModuleScopeDraw();",
        "pushNodeGraphLiveModuleScopeSnapshot(message.values || [],",
        "sampleRate: message.sampleRate",
        "beginNodeGraphLiveModuleScopeCapture(plan, {",
        "updateNodeGraphLiveModuleScopeFingerprint(patchFingerprint);",
        "clearNodeGraphModuleScopeBuffers();",
        "function normalizeNodeGraphModuleScopeBrightness(value, fallback = 1)",
        "renderedNodeGraphWavBlob(nodeGraphMvp.rendered)",
        "async function initSandboxApp()",
        "await Promise.all([",
        "nodeSandboxStartupTask(\"node graph\", initNodeGraphMvp)",
        "await markNodeSandboxInterfaceReady();",
        "applyNodeGraphWorkspaceWindowStates();",
        'document.documentElement.dataset.nodeSandboxInterfaceReady = "true";',
        'window.dispatchEvent(new CustomEvent("nodeSandboxInterfaceReady", {',
        "async function waitForNodeSandboxFontsReady",
        "Promise.race([",
        "window.setTimeout(resolve, timeoutMs)",
        "window.requestAnimationFrame(resolve)",
        "window.setTimeout(resolve, 100)",
        "async function waitForNodeSandboxStableLayout",
        "async function nodeSandboxStartupTask",
        "function setNodeSandboxStartupProgress(progress, label)",
        "nodeSandboxStartupProgress",
        "setNodeSandboxStartupProgress(88, \"settling layout\")",
        "setNodeSandboxStartupProgress(100, \"ready\")",
        "Startup step timed out:",
        "nodeSandboxStartupTask(\"manifest\", loadManifest)",
        "nodeSandboxStartupTask(\"node graph\", initNodeGraphMvp)",
        "document.documentElement.dataset.nodeSandboxInterfaceError = message;",
        "initSandboxApp().catch((error) =>",
    ]:
        require(snippet in node_graph_source, f"node graph source missing {snippet}")
    require(
        "Modules selected" not in node_graph_source,
        "selection count should not be appended to tooltips; SEL header owns that display",
    )
    require(
        'data-tooltip-key="timing.globalSmoothing"' in index_source
        and "Global smoothing time in seconds. This controls how quickly smoothed module parameters glide toward new values." in tooltip_source,
        "command center smoothing should have a specific tooltip instead of generic input help",
    )
    require(
        '"moduleOscilloscopesVisible"' in default_ui_settings_source,
        "default UI settings should explicitly define module display visibility",
    )
    for snippet in [
        "Start live OUTPUT. Press Space to toggle.",
        "Live OUTPUT is running. Press Space to stop.",
    ]:
        require(snippet in tooltip_source, f"tooltip source missing {snippet}")
    require(
        'id="nodeModularViewSizeReadout"' in index_source,
        "node graph shell missing modular view size readout",
    )
    require(
        ".node-wiring-panel.modular-only-view .node-modular-view-size-readout" in style_source,
        "node graph styles missing modular-only size readout hiding rule",
    )
    default_output_start = script_sources["./public/node-graph-default-patch.js"].index(
        'createNodeGraphPatchNode("output", { id: "output"',
    )
    default_output_end = script_sources["./public/node-graph-default-patch.js"].index(
        "},",
        default_output_start,
    )
    default_output_source = script_sources["./public/node-graph-default-patch.js"][default_output_start:default_output_end]
    default_preset = json.loads(default_preset_source)
    default_output_node = next((node for node in default_preset.get("nodes", []) if node.get("id") == "output"), {})
    require(
        "widthGu" not in default_output_source
        and "oscilloscopeHidden" not in default_output_source
        and "widthGu" not in default_output_node
        and not default_output_node.get("ui", {}).get("oscilloscopeHidden"),
        "init Output should use default GU size and show its display",
    )

    require(
        "const connections = (Array.isArray(patch.connections) ? patch.connections : []).flatMap((connection) => {" in script_sources["./public/node-graph-patch-core.js"]
        and "if (connectionKeys.has(key)) {\n      return [];\n    }" in script_sources["./public/node-graph-patch-core.js"]
        and "const modulations = (Array.isArray(patch.modulations) ? patch.modulations : [])\n    .flatMap((modulation) => {" in script_sources["./public/node-graph-patch-core.js"]
        and "if (modulationKeys.has(key)) {\n        return [];\n      }" in script_sources["./public/node-graph-patch-core.js"],
        "patch validation should skip duplicate saved wires/modulations instead of blanking the app",
    )

    shop_add_start = module_actions_source.index("function addNodeGraphModuleFromShop(button)")
    shop_add_end = module_actions_source.index("function nodeGraphModulePlacementPixelFromCursor", shop_add_start)
    shop_add_source = module_actions_source[shop_add_start:shop_add_end]
    require(
        "showNodeGraphModule(type, point, { status: \"module added\" })" in shop_add_source
        and "setNodeGraphNodeSelection([nodeId])" in shop_add_source
        and "rect.left + rect.width * 0.5" in shop_add_source,
        "keyboard module browser add should place at the visible workspace center",
    )
    require(
        "beginNodeGraphModuleStorePointerPlacement" in script_sources["./public/node-graph-scene-menu-event-bindings.js"]
        and "releaseNodeGraphModuleStorePointerPlacement" in script_sources["./public/node-graph-scene-menu-event-bindings.js"]
        and "cancelNodeGraphModuleStorePointerPlacement" in script_sources["./public/node-graph-scene-menu-event-bindings.js"]
        and "nodeGraphClientPointInsideWorkspace(event)\n    ? finishNodeGraphModulePlacementAtCurrentPosition()" in module_actions_source
        and "event.target.closest(\"[data-context-module]\")" in module_actions_source
        and "event.preventDefault();\n    event.stopPropagation();\n    return;" in module_actions_source,
        "pointer module browser add should hold a ghost, release in workspace to place, and swallow synthetic click",
    )
    event_bindings_source = script_sources["./public/node-graph-event-bindings.js"]
    require(
        "async function bindNodeGraphMvpEventGroup(label, binder)" in event_bindings_source
        and 'await bindNodeGraphMvpEventGroup("scene-menu", bindNodeGraphSceneMenuEvents);' in event_bindings_source
        and 'await bindNodeGraphMvpEventGroup("header", bindNodeGraphHeaderControlEvents);' in event_bindings_source
        and "Node graph event binding failed:" in event_bindings_source,
        "node graph event binding should isolate failures so windows still bind",
    )
    require(
        'setNodeGraphViewMode("modular")' not in shop_add_source,
        "module browser add should not close the module browser",
    )
    require(
        "closeNodeGraphModuleShop()" not in module_actions_source,
        "dragging a module out of the module browser should keep the browser window open",
    )
    module_store_source = script_sources["./public/node-graph-module-store.js"]
    module_definitions_source = script_sources["./public/node-graph-module-definitions.js"]
    patch_runtime_source = script_sources["./public/node-graph-patch-runtime.js"]
    execution_plan_source = script_sources["./public/node-graph-execution-plan.js"]
    live_frame_source = script_sources["./public/node-graph-live-frame-evaluator.js"]
    view_controls_source = script_sources["./public/node-graph-view-controls.js"]
    open_shop_start = module_store_source.index("function openNodeGraphModuleShop(")
    open_shop_end = module_store_source.index("function closeNodeGraphModuleShop()")
    open_shop_source = module_store_source[open_shop_start:open_shop_end]
    close_shop_start = open_shop_end
    close_shop_end = module_store_source.index("function loadNodeGraphModuleStoreStateLocal()", close_shop_start)
    close_shop_source = module_store_source[close_shop_start:close_shop_end]
    require(
        'setNodeGraphViewMode(' not in open_shop_source
        and 'setNodeGraphViewMode(' not in close_shop_source
        and "panel.hidden = false;" in open_shop_source
        and "panel.hidden = true;" in close_shop_source
        and '"shop"' not in view_controls_source,
        "module browser is a floating window and must never change the main view mode, in either direction",
    )
    live_plan_runtime_source = script_sources["./public/node-graph-live-plan-runtime.js"]
    header_rendering_source = script_sources["./public/node-graph-module-header-rendering.js"]
    require("transport: {" in module_store_source, "Transport should be listed in the module browser type registry")
    require('transport: "Transport"' in module_definitions_source, "Transport label should be registered")
    require("transport: {" in module_definitions_source, "Transport module definition should exist")
    require('outputs: ["0..1", "-1..1"]' in module_definitions_source, "Transport should expose 0..1 and -1..1 outputs")
    require("softClipper: {" in module_store_source, "Soft Clipper should be listed in the module browser type registry")
    require(
        "for (const type of Object.keys(nodeGraphModuleDefinitions || {}))" in patch_runtime_source
        and "softClipper: counts.softClipper" not in patch_runtime_source,
        "module type counts should be derived from definitions so new modules can spawn more than once",
    )
    soft_clipper_definition = module_definitions_source[
        module_definitions_source.index("softClipper: {"):
        module_definitions_source.index("rotate3dTo2d: {")
    ]
    require(
        'inputs: ["In", "Left", "Right"]' in soft_clipper_definition
        and 'outputs: ["Out", "Left", "Right"]' in soft_clipper_definition
        and 'key: "center"' in soft_clipper_definition
        and 'key: "width"' in soft_clipper_definition
        and 'defaultValue: "2"' in soft_clipper_definition,
        "Soft Clipper should expose stereo Mono/Left/Right ports plus Center and Width controls",
    )
    require(
        'softClipper: {\n    category: "Dynamics"' in module_store_source
        and 'label: "Soft Clipper"' in module_store_source
        and "Native soft clipper with center bias" in module_store_source,
        "Soft Clipper should be an implemented native-backed Dynamics module",
    )
    require("reverbEffect: {" in module_store_source, "Sabrina Reverb should be listed in the module browser type registry")
    require('reverbEffect: "Sabrina Reverb"' in module_definitions_source, "Sabrina Reverb label should be registered")
    reverb_definition = module_definitions_source[
        module_definitions_source.index("reverbEffect: {"):
        module_definitions_source.index("slewLimiter: {")
    ]
    require(
        'inputs: ["In", "Left", "Right"]' in reverb_definition
        and 'outputs: ["Mono Dry", "Left Dry", "Right Dry", "Mono Mix", "Left Mix", "Right Mix"]' in reverb_definition
        and 'key: "mix"' in reverb_definition
        and 'key: "diffusionSize"' in reverb_definition
        and 'key: "diffusionAmount"' in reverb_definition
        and 'key: "delaySize"' in reverb_definition
        and 'key: "recycle"' in reverb_definition
        and 'key: "lfoAmplitude"' in reverb_definition
        and 'key: "lfoBaseSpeed"' in reverb_definition
        and 'key: "lfoVariation"' in reverb_definition
        and 'control: "number", defaultValue: "0", key: "seed"' in reverb_definition,
        "Sabrina Reverb should expose stereo I/O and raw Sabrina controls",
    )
    require(
        'control: String(parameter.control || "").trim() === "number" ? "number" : ""' in script_sources["./public/node-graph-parameter-metadata.js"]
        and 'input.dataset.control = metadata?.control || "";' in script_sources["./public/node-graph-module-factories.js"]
        and "function nodeSliderReadoutIsNumberOnly(readout)" in script_sources["./public/node-graph-slider-readout-controls.js"]
        and 'slider?.dataset?.control === "number"' in script_sources["./public/node-graph-slider-readout-controls.js"]
        and 'readout.addEventListener("pointerdown", stopNodeSliderReadoutPointer);' in script_sources["./public/node-graph-slider-readout-controls.js"]
        and 'readout.addEventListener("pointerdown", beginNodeSliderDrag);' in script_sources["./public/node-graph-slider-readout-controls.js"],
        "number-only module controls should double-click edit without pointer-dragging",
    )
    require(
        'reverbEffect: {\n    category: "Delay"' in module_store_source
        and 'label: "Sabrina Reverb"' in module_store_source
        and "serial diffusion stages with cross-feedback delay" in module_store_source,
        "Sabrina Reverb should be an implemented raw Sabrina port",
    )
    require('category: "Sequence"' in module_store_source, "Transport and timing modules should live in Sequence")
    require('category: "Sequencer"' not in module_store_source, "module browser catalog should not use Sequencer category")
    require('"Sequencer",' not in module_store_source and '"Time",' not in module_store_source, "module browser department list should not show Sequencer or Time")
    require('departments: Object.freeze(["Filter", "Modulators", "Dynamics"])' in module_store_source, "Process group should not include Time, Delay, or Envelope")
    require('departments: Object.freeze(["Oscillator", "Chaos", "Jerobeam", "Noise", "Drum", "Envelope"])' in module_store_source, "Generate group should include Envelope but not Sequence")
    require('departments: Object.freeze(["Audio", "Delay", "Loops", "Samples", "Sequence"])' in module_store_source, "Memory group should include Delay and Sequence")
    require('slewLimiter: {\n    category: "Filter",' in module_store_source, "Slew Limiter should live in Filter category")
    require("width: 180" in module_store_source, "Module Browser fresh default width should be 180px")
    require("const workingCount = entries.filter((entry) => entry.visible && entry.implemented).length" in module_store_source, "module browser counts should include only working modules")
    require('if (value === "Sequencer")' in module_store_source and 'return "Sequence";' in module_store_source, "old Sequencer state should normalize to Sequence")
    require('"Oscilloscope",' in module_store_source, "Module Browser should expose an Oscilloscope category")
    require('departments: Object.freeze(["Controllers", "Game Triggers", "Portals", "Oscilloscope", "Visual", "Debug"])' in module_store_source, "Oscilloscope and Game Triggers categories should live under Interact")
    require('"Game Triggers",' in module_store_source and "wireBreak: {" in module_store_source and "wireConnect: {" in module_store_source and "wireDisconnect: {" in module_store_source and "windowReopen: {" in module_store_source and '"shootingStarTail"' in module_store_source and "shootingStarExplosion: {" in module_store_source, "Game Triggers should expose wire, window, and shooting star trigger modules")
    wire_connect_definition = module_definitions_source[
        module_definitions_source.index("wireConnect: {"):
        module_definitions_source.index("wireDisconnect: {")
    ]
    require(
        'outputs: ["Pulse"]' in wire_connect_definition
        and '"Gate"' not in wire_connect_definition,
        "Wire Connect should expose only a one-sample Pulse output",
    )
    wire_disconnect_definition = module_definitions_source[
        module_definitions_source.index("wireDisconnect: {"):
        module_definitions_source.index("windowReopen: {")
    ]
    require(
        'outputs: ["Pulse"]' in wire_disconnect_definition
        and '"Gate"' not in wire_disconnect_definition,
        "Wire Disconnect should expose only a one-sample Pulse output",
    )
    window_reopen_definition = module_definitions_source[
        module_definitions_source.index("windowReopen: {"):
        module_definitions_source.index("nextPatch: {")
    ]
    require(
        'outputs: ["Pulse", "Gate", "Sine"]' in window_reopen_definition,
        "Window Reopen should expose Pulse, Gate, and Sine outputs",
    )
    require('canvas: {\n    category: "Oscilloscope"' in module_store_source, "Canvas should live in Oscilloscope")
    require('traceDisplay: {\n    category: "Oscilloscope"' in module_store_source, "Trace Display should live in Oscilloscope")
    require("dotOscilloscope: {" in module_store_source and 'label: "0D Burn"' in module_store_source, "0D Burn oscilloscope should exist")
    require("valueOscilloscope: {" in module_store_source and 'label: "0D Value"' in module_store_source, "0D Value oscilloscope should exist")
    require("lineBurnOscilloscope: {" in module_store_source and 'label: "1D Burn"' in module_store_source, "1D Burn oscilloscope should exist")
    require("scope2d: {" in module_store_source and 'label: "2D Burn"' in module_store_source, "2D Burn oscilloscope should exist")
    require("scope2dTrace: {" in module_store_source and 'label: "2D Trace"' in module_store_source, "2D Trace oscilloscope should exist")
    require("dotOscilloscope: {" in module_store_source and "oscilloscopeBank: {" in module_store_source and "valueOscilloscope: {" in module_store_source and "numberReadout: {" in module_store_source and "lineBurnOscilloscope: {" in module_store_source and "scope2d: {" in module_store_source and "scope2dTrace: {" in module_store_source, "Oscilloscope modules should be listed together")
    require("oscilloscopeBank: {" in module_store_source and 'label: "Oscilloscope Bank"' in module_store_source, "Oscilloscope Bank should exist")
    require('nodeGraphModuleStoreUnderConstructionTypes = Object.freeze(new Set([\n  "canvas",\n  "graph",\n  "graph2",\n  "groupInput",\n  "groupOutput",\n  "humanFilter",\n  "shootingStarTail",\n]));' in module_store_source, "Canvas, graph modules, group portals, Human Filter, and shooting star tail should be under construction in the store set")
    for oscilloscope_type in ["dotOscilloscope", "valueOscilloscope", "numberReadout", "lineBurnOscilloscope", "scope2d", "scope2dTrace"]:
        require(f"{oscilloscope_type}: {{" in module_definitions_source, f"{oscilloscope_type} should have a spawnable module definition")
    require('displayType: "dot"' in module_definitions_source, "0D Burn oscilloscope should declare dot display type")
    require('displayType: "value"' in module_definitions_source, "0D Value oscilloscope should declare value display type")
    require('displayType: "lineBurn"' in module_definitions_source, "1D Burn oscilloscope should declare lineBurn display type")
    require('displayType: "scope2d"' in module_definitions_source, "2D Burn should declare scope2d display type")
    require('displayType: "scope2dTrace"' in module_definitions_source, "2D Trace should declare scope2dTrace display type")
    require('displayType: "numberReadout"' in module_definitions_source, "Number Readout should declare its own numberReadout display type")
    require(
        'numberReadout: {\n    bufferedInputs: ["In"],\n    displayHeightGu: 1,\n    displayType: "numberReadout",' in module_definitions_source
        and 'outputs: []' in module_definitions_source,
        "Number Readout should be its own module type, not a variant of 0D Value, with no audio outputs and a 1gu minimum height",
    )
    number_readout_defaults_start = node_graph_source.index("const nodeGraphNumberReadoutSettingsDefaults")
    number_readout_defaults_end = node_graph_source.index("const nodeGraphScope2dSettingsDefaults", number_readout_defaults_start)
    number_readout_defaults_source = node_graph_source[number_readout_defaults_start:number_readout_defaults_end]
    number_readout_normalize_start = node_graph_source.index("function normalizeNodeGraphNumberReadoutSettings")
    number_readout_normalize_end = node_graph_source.index("function normalizeNodeGraphScope2dSettings", number_readout_normalize_start)
    number_readout_normalize_source = node_graph_source[number_readout_normalize_start:number_readout_normalize_end]
    require(
        "const nodeGraphNumberReadoutSettingsDefaults = Object.freeze({" in number_readout_defaults_source
        and "brightness: 0.92," in number_readout_defaults_source
        and "color: \"#75ebff\"," in number_readout_defaults_source
        and "decimals: 2," in number_readout_defaults_source
        and "zoomSeconds" not in number_readout_defaults_source
        and "cycles" not in number_readout_defaults_source
        and "burn" not in number_readout_defaults_source
        and "decay" not in number_readout_defaults_source
        and "capSize" not in number_readout_defaults_source
        and "capLength" not in number_readout_defaults_source
        and "lineThickness" not in number_readout_defaults_source
        and "scale" not in number_readout_defaults_source
        and "sourceSync" not in number_readout_defaults_source
        and "skipDiscontinuities" not in number_readout_defaults_source
        and "function normalizeNodeGraphNumberReadoutSettings(settings = {})" in number_readout_normalize_source
        and "zoomSeconds" not in number_readout_normalize_source
        and "cycles" not in number_readout_normalize_source
        and "burn" not in number_readout_normalize_source
        and "decay" not in number_readout_normalize_source
        and "capSize" not in number_readout_normalize_source
        and "capLength" not in number_readout_normalize_source
        and "lineThickness" not in number_readout_normalize_source
        and "scale" not in number_readout_normalize_source
        and "sourceSync" not in number_readout_normalize_source
        and "skipDiscontinuities" not in number_readout_normalize_source,
        "Number Readout settings must not inherit Trace, Dot, Caps, Burn, Zoom, Sync, or 2D fields",
    )
    require(
        'numberReadout: Object.freeze({\n    fields: Object.freeze(["decimals", "dot1Brightness"]),\n    colors: Object.freeze(["dot1Color"]),\n    toggles: Object.freeze([]),' in node_graph_source,
        "Number Readout active display-settings controls should be limited to decimals, brightness, and color",
    )
    require(
        '} else if (slot?.type === "numberReadout") {\n    // Number Readout must only ever show real captured input' in node_graph_source
        and "buffer = capturedBuffer;" in node_graph_source,
        "Number Readout must read only real captured input, never an offline model-guess buffer",
    )
    require(
        '["traceDisplay", "dotOscilloscope", "valueOscilloscope", "numberReadout", "lineBurnOscilloscope"].includes(slot?.type)' in node_graph_source
        and "function nodeGraphNumberReadoutUnitForSlot(slot)" in node_graph_source
        and 'sourceNode?.type === "helmholtzPitch" && connection.sourcePort === "Frequency"' in node_graph_source
        and 'const text = unit ? `${valueText} ${unit}` : valueText;' in node_graph_source,
        "Number Readout should capture wired In and label Helmholtz Frequency as Hz",
    )
    require(
        "function nodeGraphNumberReadoutCanvasForSlot(slot)" in node_graph_source
        and '.node-number-readout-canvas' in node_graph_source
        and "function syncNodeGraphNumberReadoutCanvas(canvas, screenElement, pixelRatio)" in node_graph_source
        and "nodeGraphScope2dBurnCanvasForSlot" not in node_graph_source[
            node_graph_source.index("function nodeGraphNumberReadoutCanvasForSlot"):
            node_graph_source.index("function drawNodeGraphNumberReadoutItem")
        ],
        "Number Readout should own a dedicated canvas, not the shared 1D/2D burn retained canvas",
    )
    require(
        "canvas._nodeGraphNumberReadoutText === text" in node_graph_source
        and "canvas._nodeGraphNumberReadoutColor === settings.color" in node_graph_source
        and "canvas._nodeGraphNumberReadoutBrightness === settings.brightness" in node_graph_source,
        "Number Readout should redraw only when the formatted value or its style changes, not per sample",
    )
    require(
        "numberReadout: drawNodeGraphNumberReadoutItem," in node_graph_source,
        "Number Readout should have its own renderer dispatch entry",
    )
    require(
        'if (nodeGraphModuleDefinitions?.[type]) {\n    return "trace";\n  }' in node_graph_source
        and 'nodeGraphModuleDisplayRendererForNode(node) !== "legacy"' in script_sources["./public/node-graph-execution-plan.js"],
        "Known modules without specialized displays should default to 1D Trace capture",
    )
    require(
        "function nodeGraphModuleDisplaySignalsForType(type)" in node_graph_source
        and "function nodeGraphModuleDisplayModesForType(type)" in node_graph_source
        and "function nodeGraphModuleDefaultDisplayModeKeyForType(type)" in node_graph_source
        and "function nodeGraphModuleSelectedDisplayMode(node)" in node_graph_source
        and "function nodeGraphModuleDisplayRendererForNode(node)" in node_graph_source
        and "function nodeGraphModuleDisplaySettingsSchemaForNode(node)" in node_graph_source,
        "Display mode contract helpers should exist before renderer/buffer refactors",
    )
    require(
        "function nodeGraphModuleDisplayRendererForSlot(slot)" in node_graph_source
        and "function nodeGraphModuleDisplaySettingsSchemaForSlot(slot)" in node_graph_source
        and "return nodeGraphModuleDisplayRendererForSlot(slot);" in node_graph_source
        and "nodeGraphModuleDisplaySettingsSchemaForNode(node)" in node_graph_source,
        "Renderer and settings selection should route through selected display modes",
    )
    require(
        node_graph_source.count("nodeGraphModuleDisplayTypeForSlot(") == 1
        and node_graph_source.count("nodeGraphModuleDisplayTypeForType(") == 3,
        "Legacy display type helpers should remain compatibility wrappers, not active renderer decision points",
    )
    require(
        "nodeGraphModuleImplicitDisplayModeForType(type)" in node_graph_source
        and "nodeGraphModuleDeclaredDisplayTypeForType(type)" in node_graph_source
        and "nodeGraphModuleOutputPortsForType(type)" in node_graph_source,
        "Display modes should keep compatibility with existing displayType and outputs",
    )
    require(
        "function nodeGraphModuleDisplaySourceForSlot(slot)" in node_graph_source
        and 'const sourcePort = String(source?.value || "").trim();' in node_graph_source
        and "nodeGraphModuleScopeCapturedScope2dBuffer(slot, source" in node_graph_source
        and "const xPort = String(options.xPort || \"X\").trim() || \"X\";" in node_graph_source,
        "Scope buffers should read scalar and XY sources from selected display modes",
    )
    require(
        'id="nodeTraceDisplayModeSelect"' in node_graph_source
        and "function syncNodeGraphTraceDisplayModeSelector(node = null)" in node_graph_source
        and "nodeGraphModuleDisplayModesForType(node.type)" in node_graph_source
        and "modes.length <= 1" in node_graph_source
        and "function changeNodeGraphTraceDisplayMode(event)" in node_graph_source
        and "assignNodeGraphDisplayModeKeyEverywhere(node, select.value)" in node_graph_source
        and "setNodeGraphTraceDisplaySettingsFormType(node);" in node_graph_source,
        "Display Settings should expose a compact Mode selector only for modules with multiple explicit modes",
    )
    require(
        'displayModeKey: String(source.displayModeKey || "").trim()' in script_sources["./public/node-graph-patch-clone.js"]
        and "function normalizeNodeGraphPatchNodeDisplayModeKey(type, value = \"\")" in script_sources["./public/node-graph-patch-clone.js"]
        and "ui.displayModeKey = normalizeNodeGraphPatchNodeDisplayModeKey(node.type, ui.displayModeKey);" in script_sources["./public/node-graph-patch-clone.js"]
        and "ui.displayModeKey = normalizeNodeGraphPatchNodeDisplayModeKey(type, ui.displayModeKey);" in script_sources["./public/node-graph-patch-core.js"]
        and "ui.buttonsHidden || ui.displayModeKey || ui.ioHidden" in script_sources["./public/node-graph-patch-clone.js"]
        and "modes.some((mode) => mode.key === key)" in script_sources["./public/node-graph-patch-clone.js"]
        and "ui.buttonsHidden || ui.displayModeKey || ui.ioHidden" in script_sources["./public/node-graph-patch-core.js"],
        "Display mode choices should persist through ui.displayModeKey and stale keys should normalize away cleanly",
    )
    require(
        "function nodeGraphWirelessVideoCatalog(options = {})" in node_graph_source
        and "function nodeGraphCanvasVideoApi()" in node_graph_source
        and "window.nodeGraphCanvasVideoApi = nodeGraphCanvasVideoApi;" in node_graph_source
        and "window.nodeGraphWirelessVideoCatalog = nodeGraphWirelessVideoCatalog;" in node_graph_source
        and "modes: modes.map((mode) => ({" in node_graph_source
        and "signals: signals.map((signal) => ({" in node_graph_source
        and "renderer: mode.renderer" in node_graph_source
        and "settingsSchema: mode.settingsSchema" in node_graph_source,
        "Canvas wireless video catalog should expose read-only node/mode/signal discovery",
    )
    require(
        "const video = Object.freeze({" in script_sources["./public/node-graph-code-screen.js"]
        and 'signature: "canvas.video.list()"' in script_sources["./public/node-graph-code-screen.js"]
        and "nodeGraphCanvasVideoApi().list(options)" in script_sources["./public/node-graph-code-screen.js"]
        and "video," in script_sources["./public/node-graph-code-screen.js"],
        "Code Screen canvas API should expose canvas.video.list() for wireless video discovery",
    )
    wireless_video_source = node_graph_source[
        node_graph_source.index("function nodeGraphWirelessVideoCatalogNode"):
        node_graph_source.index("function nodeGraphModuleDisplayTypeHasLocalSettings")
    ]
    require(
        "commitNodeGraphPatch" not in wireless_video_source
        and "scheduleNodeGraphLivePlanSync" not in wireless_video_source
        and "connections" not in wireless_video_source
        and "modulations" not in wireless_video_source
        and ".buffer" not in wireless_video_source
        and ".value" not in wireless_video_source,
        "Wireless video discovery should not read values, create routes, or mutate audio/patch state",
    )
    require(
        'fractalBrownianNoise: {' in module_definitions_source
        and 'displaySignals:' in module_definitions_source
        and 'key: "xyBurn", label: "X/Y Burn", renderer: "scope2d", settingsSchema: "scope2d", source: { x: "Out X Raw", y: "Out Y Raw" }' in module_definitions_source
        and 'key: "xyTrace", label: "X/Y Trace", renderer: "scope2dTrace", settingsSchema: "scope2dTrace", source: { x: "Out X Raw", y: "Out Y Raw" }' in module_definitions_source
        and 'key: "zTrace", label: "Z Trace", renderer: "trace", settingsSchema: "trace", source: { value: "Out Z Raw" }' in module_definitions_source,
        "Fractal Brownian Noise should declare explicit display modes for the pre-level Out X/Y/Z Raw signals",
    )
    require(
        'ellipsoid: {\n    displayType: "scope2d",\n    displaySignals:' in module_definitions_source
        and 'spiral: {\n    displayType: "scope2d",\n    displaySignals:' in module_definitions_source
        and 'lorenzAttractor: {\n    displayType: "scope2d",\n    displaySignals:' in module_definitions_source,
        "Chaos modules should declare explicit display modes",
    )
    require(
        "function normalizeNodeGraphScope2dTraceSettings(settings = {})" in node_graph_source
        and 'scope2dTrace: Object.freeze({' in node_graph_source
        and '"historySeconds"' in node_graph_source
        and '"scale"' in node_graph_source,
        "2D Trace should have independent sample-history settings",
    )
    require(
        "function drawNodeGraphScope2dTraceItem" in node_graph_source
        and 'if (displayType === "scope2dTrace") {' in node_graph_source
        and "scope2dTrace: drawNodeGraphScope2dTraceItem," in node_graph_source,
        "2D Trace should dispatch to its own renderer instead of 2D Burn",
    )
    trace_display_definition = module_definitions_source[
        module_definitions_source.index("traceDisplay: {"):
        module_definitions_source.index("dotOscilloscope: {")
    ]
    require(
        "parameters: []" in trace_display_definition
        and 'label: "Gain"' not in trace_display_definition
        and 'label: "Offset"' not in trace_display_definition,
        "1D Trace should expose raw captured input without Gain or Offset sliders",
    )
    require(
        'canvas: {\n    bufferedInputs: ["a_buffer"],\n    displayHeightGu: 5,' in module_definitions_source
        and 'valueOscilloscope: {\n    bufferedInputs: ["In"],\n    displayHeightGu: 5,' in module_definitions_source
        and 'scope2d: {\n    bufferedInputs: ["X", "Y"],\n    displayHeightGu: 5,' in module_definitions_source,
        "Canvas, Value, and 2D Scope should default to 5 GU display height",
    )
    require("function drawNodeGraphDotOscilloscopeItem" in node_graph_source, "Dot oscilloscope should have a renderer")
    require(
        "function nodeGraphModuleScopeDotOscilloscopeLightBuffer(capturedBuffer = null)" in node_graph_source
        and 'renderer === "dot"' in node_graph_source
        and "capturedBuffer.nodeGraphScopeLightTarget =" in node_graph_source
        and "capturedBuffer.nodeGraphScopeBipolarLightTarget =" in node_graph_source
        and "nodeGraphModuleScopeCapturedFramePositiveLightTarget(capturedBuffer) ??" in node_graph_source
        and "nodeGraphModuleScopeCapturedFrameBipolarLightTarget(capturedBuffer) ??" in node_graph_source
        and "nodeGraphModuleScopeCapturedCurrentPositiveLightTarget(capturedBuffer) ??" in node_graph_source
        and "nodeGraphModuleScopeCapturedCurrentLightTarget(capturedBuffer) ??" in node_graph_source
        and "return capturedBuffer;" in node_graph_source,
        "0D Burn should keep the captured signal buffer and annotate it with unipolar and bipolar frame brightness",
    )
    dot_buffer_start = node_graph_source.index("function nodeGraphModuleScopeDotOscilloscopeLightBuffer")
    dot_buffer_end = node_graph_source.index("function nodeGraphModuleScopeDisplayBuffer", dot_buffer_start)
    dot_buffer_source = node_graph_source[dot_buffer_start:dot_buffer_end]
    require(
        "nodeGraphScopeLightDisplay" not in dot_buffer_source
        and "nodeGraphScopeLightShape" not in dot_buffer_source
        and "nodeGraphScopeLightReleaseSeconds" not in dot_buffer_source,
        "0D Burn should not route through the generic light-display renderer",
    )
    dot_draw_start = node_graph_source.index("function drawNodeGraphDotOscilloscopeItem")
    dot_draw_end = node_graph_source.index("function drawNodeGraphValueOscilloscopeItem", dot_draw_start)
    dot_draw_source = node_graph_source[dot_draw_start:dot_draw_end]
    require(
        "settings.bipolarBrightness ? buffer.nodeGraphScopeBipolarLightTarget : buffer.nodeGraphScopeLightTarget" in dot_draw_source
        and dot_draw_source.count("drawNodeGraphOscilloscopeBeam(") >= 2
        and "dotHalfLength" in dot_draw_source
        and "clampNodeSliderValue(settings.dot1Size, 0, 1)" in dot_draw_source
        and "clampNodeSliderValue(settings.dot2Size, 0, 1)" in dot_draw_source
        and "blur: settings.lineThickness" in dot_draw_source
        and "blur: settings.dot2LineThickness" in dot_draw_source
        and "nodeGraphZeroDBurnSettingsForNode(nodeGraphModuleScopeNodeForSlot(item.slot))" in dot_draw_source
        and "nodeGraphTraceDisplaySettingsForNode" not in dot_draw_source
        and "outerThickness" in dot_draw_source
        and "innerThickness" in dot_draw_source,
        "0D Burn should draw its own frame-brightness dot mark with normalized size and thick controls",
    )
    require(
        'uniform float uBlur;' in node_graph_source
        and 'float edgeWidth = mix(0.01, 1.0, blur);' in node_graph_source
        and 'float alpha = clamp((1.0 - smoothstep(1.0 - edgeWidth, 1.0 + edgeWidth, normalizedDistance)) * uIntensity, 0.0, 1.0);' in node_graph_source
        and "float gaussianFalloff" not in node_graph_source
        and "float solidAlpha" not in node_graph_source
        and "float softAlpha" not in node_graph_source
        and "mix(solidAlpha" not in node_graph_source
        and "beamBlurLocation" in node_graph_source
        and "gl.uniform1f(renderer.beamBlurLocation, clampNodeSliderValue(Number(options.blur) || 0, 0, 1));" in node_graph_source,
        "0D Burn blur should be a direct shader control from solid disc to soft dot",
    )
    value_draw_start = node_graph_source.index("function drawNodeGraphValueOscilloscopeItem")
    value_draw_end = node_graph_source.index("function nodeGraphOneDimensionalBurnSample", value_draw_start)
    value_draw_source = node_graph_source[value_draw_start:value_draw_end]
    require(
        "function drawNodeGraphValueOscilloscopeItem" in node_graph_source
        and "nodeGraphValueOscilloscopeSettingsDefaults" in node_graph_source
        and "function normalizeNodeGraphValueOscilloscopeSettings(settings = {})" in node_graph_source
        and "function nodeGraphValueOscilloscopeTrailSamples(buffer)" in node_graph_source
        and "function drawNodeGraphValueOscilloscopeTrail(item, pixelRatio, geometry, settings)" in node_graph_source
        and "nodeGraphOneDimensionalBurnFadeTrail(context, canvas, settings)" in node_graph_source
        and "for (let index = 0; index < buffer.length; index += 1)" in node_graph_source
        and "const sampleLines = samples.map((sample) =>" in node_graph_source
        and "lineLength: 0.88" in node_graph_source
        and "burn: 0" in node_graph_source
        and "decay: 0" in node_graph_source
        and "const lineLength = clampNodeSliderValue(settings.lineLength, 0, 1)" in value_draw_source
        and "const displayWidth = Math.max(1, Number(rect.width) || 1)" in value_draw_source
        and "const halfLine = displayWidth * 0.5 * lineLength" in value_draw_source
        and "nodeGraphTraceDisplaySettingsForNode(node)" in value_draw_source
        and "drawNodeGraphValueOscilloscopeTrail(item, pixelRatio" in value_draw_source
        and "drawNodeGraphOscilloscopeBeam(renderer, item, pixelRatio, x1, y, x2, y, options)" in value_draw_source
        and "settings.capEnabled !== false && capLength > 0 && capThickness > 0" in value_draw_source
        and "capLength = square.height * clampNodeSliderValue(settings.capLength, 0, 1) * 0.5" in value_draw_source
        and "capThickness = Math.max(0, lineBase * clampNodeSliderValue(settings.capSize, 0, 1))" in value_draw_source
        and "drawNodeGraphOscilloscopeBeam(renderer, item, pixelRatio, x1, y - capLength, x1, y + capLength, options)" in value_draw_source
        and "drawNodeGraphOscilloscopeBeam(renderer, item, pixelRatio, x2, y - capLength, x2, y + capLength, options)" in value_draw_source
        and "settings.dot1Enabled" in value_draw_source
        and "settings.dot2Enabled" in value_draw_source,
        "0D Value should draw the latest line and burn every captured sample into its retained value trail",
    )
    require("function drawNodeGraphLineBurnOscilloscopeItem" in node_graph_source, "LineBurn oscilloscope should have a renderer")
    line_burn_start = node_graph_source.index("function drawNodeGraphLineBurnOscilloscopeItem")
    line_burn_end = node_graph_source.index("function drawNodeGraphScope2dItem", line_burn_start)
    line_burn_source = node_graph_source[line_burn_start:line_burn_end]
    require(
        "function nodeGraphOneDimensionalBurnSampleToY(sample, rect)" in node_graph_source
        and "function nodeGraphOneDimensionalBurnInitTriggerState(buffer, sampleRate)" in node_graph_source
        and "function nodeGraphOneDimensionalBurnPointBudget(canvas)" in node_graph_source
        and "return Math.max(64, Math.min(2048, Math.ceil(width * 4)));" in node_graph_source
        and "function reduceNodeGraphOneDimensionalBurnSubpath(points, start, end, budget, output)" in node_graph_source
        and "function reduceNodeGraphOneDimensionalBurnPoints(points, budget)" in node_graph_source
        and "const important = [bucketStart, minIndex, maxIndex, bucketEnd - 1]" in node_graph_source
        and "function drawNodeGraphRetainedBurnPath(item, pixelRatio, pathPoints, settings, options = {})" in node_graph_source
        and "function drawNodeGraphOneDimensionalBurnTrail(item, pixelRatio, points, settings, buffer = null)" in node_graph_source
        and "drawNodeGraphRetainedBurnPath(item, pixelRatio, canvasPoints, settings" in node_graph_source
        and "nodeGraphOneDimensionalBurnFramePoints(canvas, buffer, rect, settings)" in line_burn_source
        and "lineBurnMode" not in line_burn_source
        and "function nodeGraphOneDimensionalBurnSample(" not in node_graph_source
        and "function nodeGraphOneDimensionalBurnSweepX(" not in node_graph_source
        and "function nodeGraphOneDimensionalBurnSweepProgress(" not in node_graph_source
        and "scrollNodeGraphOneDimensionalBurnCanvas" not in node_graph_source
        and 'mode === "scroll"' not in node_graph_source
        and "nodeGraphOneDimensionalBurnCanvasForSlot" not in node_graph_source
        and "drawNodeGraphOneDimensionalBurnCanvasDot" not in node_graph_source
        and "drawNodeGraphScopeCanvasSegment(context" not in node_graph_source
        and "clearNodeGraphModuleScopeLocalFallback(item.slot)" not in line_burn_source
        and "drawNodeGraphModuleScopeBufferWebGl" not in line_burn_source,
        "1D Burn should feed the shared retained burn path instead of per-sample dot spam, scroll mode, or the full trace-line renderer",
    )
    require(
        "const nodeGraphLineBurnSettingsDefaults = Object.freeze" in node_graph_source
        and "burn: 0.82" in node_graph_source
        and "decay: 0.12" in node_graph_source
        and "dot1Brightness: 0.92" in node_graph_source
        and "dot1Color: \"#75ebff\"" in node_graph_source
        and "function normalizeNodeGraphLineBurnSettings(settings = {})" in node_graph_source
        and "dot1Brightness: normalizeNodeGraphTraceDisplayNumber(\n      source.dot1Brightness ?? source.brightness" in node_graph_source
        and "dot1Color: normalizeNodeGraphTraceDisplayColor(source.dot1Color ?? source.color, defaults.dot1Color)" in node_graph_source
        and 'data-trace-display-field="burn"' in node_graph_source
        and 'data-trace-display-field="decay"' in node_graph_source
        and "lineBurnMode" not in node_graph_source
        and 'popover.addEventListener("change", commitNodeGraphTraceDisplaySettingsChange)' in node_graph_source,
        "1D Burn settings should use the retained burn dot1 vocabulary and expose Burn/Decay without Sweep/Scroll mode",
    )
    line_burn_registry_source = node_graph_source[
        node_graph_source.index("  lineBurn: Object.freeze({"):
        node_graph_source.index("  value: Object.freeze({", node_graph_source.index("  lineBurn: Object.freeze({"))
    ]
    require(
        '"burn"' in line_burn_registry_source
        and '"decay"' in line_burn_registry_source
        and '"cycles"' in line_burn_registry_source
        and '"dot1Size"' in line_burn_registry_source
        and '"lineThickness"' in line_burn_registry_source
        and '"dot1Brightness"' in line_burn_registry_source
        and '"dot1Color"' in line_burn_registry_source
        and '"dot1Enabled"' in line_burn_registry_source
        and '"dot2Size"' not in line_burn_registry_source
        and '"dot2Brightness"' not in line_burn_registry_source
        and '"dot2Enabled"' not in line_burn_registry_source,
        "1D Burn display settings should match the 2D Burn dot1 settings plus trigger-synced cycles",
    )
    display_settings_apply_start = node_graph_source.index("function applyNodeGraphTraceDisplaySettingsForm(options = {})")
    display_settings_apply_end = node_graph_source.index("function setNodeGraphTraceDisplaySettingsDefaults()", display_settings_apply_start)
    display_settings_apply_source = node_graph_source[display_settings_apply_start:display_settings_apply_end]
    require(
        "const settings = readNodeGraphTraceDisplaySettingsForm();" in display_settings_apply_source
        and "assignNodeGraphTypedDisplaySettingsEverywhere(node, settingsSchema, settings);" in display_settings_apply_source
        and "scheduleNodeGraphModuleScopeDraw();" in display_settings_apply_source
        and "persistNodeGraphTraceDisplaySettingsSoon" in display_settings_apply_source
        and "markNodeGraphRenderPending" not in display_settings_apply_source
        and "clearNodeGraphModuleScopeBuffers" not in display_settings_apply_source
        and "clearNodeGraphModuleScopeCanvas" not in display_settings_apply_source
        and "clearNodeGraphRenderedModuleScopeBuffers" not in display_settings_apply_source
        and "traceDisplayDrawCache.clear" not in display_settings_apply_source
        and "traceDisplayScratch.clear" not in display_settings_apply_source
        and "lightDisplayStates.clear" not in display_settings_apply_source
        and "scheduleNodeGraphLivePlanSync" not in display_settings_apply_source,
        "Display Settings live edits should apply directly, redraw displays, and avoid rebuilding or clearing scope state",
    )
    for removed_display_settings_symbol in [
        "nodeTraceDisplaySettingsSave",
        "nodeTraceDisplaySettingsRestore",
        "function saveNodeGraphTraceDisplaySettings",
        "function restoreNodeGraphTraceDisplaySettings(",
        "traceDisplaySettingsDirty",
        "setNodeGraphTraceDisplaySettingsDirty",
    ]:
        require(
            removed_display_settings_symbol not in node_graph_source,
            f"Display Settings save/draft symbol should be removed: {removed_display_settings_symbol}",
        )
    require(
        "function toggleNodeGraphTraceDisplaySettingRow(event)" in node_graph_source
        and 'event.target.closest("label, .metadata-section-title")' in node_graph_source
        and 'toggleRow?.querySelector?.("[data-trace-display-toggle]")' in node_graph_source
        and "input.checked = !input.checked;" in node_graph_source
        and "function suppressNodeGraphTraceDisplaySettingRowClick(event)" in node_graph_source
        and 'popover.addEventListener("pointerdown", toggleNodeGraphTraceDisplaySettingRow, true);' in node_graph_source
        and 'popover.addEventListener("click", suppressNodeGraphTraceDisplaySettingRowClick, true);' in node_graph_source
        and ".node-trace-display-settings-popover [data-trace-display-toggle]" in style_source
        and "pointer-events: none;" in style_source,
        "Display Settings toggle rows should have one pointer-owned checkbox toggle path",
    )
    require(
        "function assignNodeGraphTypedDisplaySettingsToNode(node, displayType, settings)" in node_graph_source
        and "function persistNodeGraphTraceDisplaySettingsSoon(persistMode = \"debounce\")" in node_graph_source
        and "const patchNode = nodeGraphMvp.patch?.nodes?.find((candidate) => candidate.id === node.id);" in node_graph_source
        and "assignNodeGraphTypedDisplaySettingsToNode(patchNode, displayType, settings);" in node_graph_source
        and "assignNodeGraphTypedDisplaySettingsToNode(workingNode, displayType, settings);" in node_graph_source
        and "saveNodeGraphWorkingPatchToUserSettings({ immediateFile: persistMode === \"immediate\" });" in node_graph_source,
        "Display Settings live edits should force typed settings into the patch and working patch for refresh persistence",
    )
    require(
        "typeof readNodeGraphTraceDisplaySettingsForm === \"function\"" not in script_sources["./public/node-graph-ui-settings-persistence.js"]
        and "readNodeGraphTraceDisplaySettingsForm()," not in script_sources["./public/node-graph-ui-settings-persistence.js"]
        and "workingPatch: workingPatchForSettings" in script_sources["./public/node-graph-ui-settings-persistence.js"],
        "UI settings serialization should not secretly flush a Display Settings draft",
    )
    require(
        "Object.assign(normalizedNode, cloneNodeGraphTypedDisplaySettings(node));" in script_sources["./public/node-graph-patch-core.js"],
        "Patch validation should preserve typed display settings through save/load normalization",
    )
    require(
        "popover.dataset.displaySettingsTargetNode = node?.id ? String(node.id) : \"\";" in node_graph_source
        and "function nodeGraphTraceDisplaySettingsTargetNodeId()" in node_graph_source
        and "document.getElementById(\"nodeTraceDisplaySettingsPopover\")?.dataset.displaySettingsTargetNode" in node_graph_source
        and "nodeGraphPatchNode(nodeGraphTraceDisplaySettingsTargetNodeId())" in display_settings_apply_source,
        "Display Settings live apply should use the visible window target node as a fallback target",
    )
    require("function drawNodeGraphScope2dItem" in node_graph_source, "2D Scope should have a renderer")
    require(
        "const nodeGraphScope2dSettingsDefaults = Object.freeze({" in node_graph_source
        and "function normalizeNodeGraphScope2dSettings(settings = {})" in node_graph_source
        and "function nodeGraphScope2dSettingsForNode(node)" in node_graph_source
        and "scope2d: Object.freeze({" in node_graph_source
        and '"burn",\n      "decay",' in node_graph_source
        and 'colors: Object.freeze(["dot1Color", "dot2Color"])' in node_graph_source,
        "2D Burn should have local settings defaults, normalization, and active controls",
    )
    scope2d_active_controls_start = node_graph_source.index("scope2d: Object.freeze({")
    scope2d_active_controls_end = node_graph_source.index("colors: Object.freeze([\"dot1Color\", \"dot2Color\"])", scope2d_active_controls_start)
    scope2d_active_controls_source = node_graph_source[scope2d_active_controls_start:scope2d_active_controls_end]
    require(
        '"dot1Size"' in scope2d_active_controls_source
        and '"dot1Brightness"' in scope2d_active_controls_source
        and '"dot2Size"' in scope2d_active_controls_source
        and '"dot2Brightness"' in scope2d_active_controls_source
        and '"lineThickness"' not in scope2d_active_controls_source
        and '"dot2LineThickness"' in scope2d_active_controls_source,
        "2D Burn settings should expose Dot 1 and Dot 2 controls without Dot 1 Blur controls",
    )
    scope2d_stroke_space_start = node_graph_source.index("function nodeGraphScope2dStrokeSpace(canvas)")
    scope2d_stroke_space_end = node_graph_source.index("function drawNodeGraphOneDimensionalBurnTrail", scope2d_stroke_space_start)
    scope2d_stroke_space_source = node_graph_source[scope2d_stroke_space_start:scope2d_stroke_space_end]
    require(
        "return Math.min(canvas?.width || 0, canvas?.height || 0);" in scope2d_stroke_space_source
        and "nodeGraphModuleScopeZoomScale" not in scope2d_stroke_space_source,
        "2D Burn stroke thickness should be local-display relative, not inverse workspace zoom relative",
    )
    require(
        "const nodeGraphTraceDisplaySectionControls = Object.freeze({" in node_graph_source
        and "function nodeGraphTraceDisplaySectionHasActiveControls(section" in node_graph_source
        and "function setNodeGraphTraceDisplaySectionVisible(popover, section, visible)" in node_graph_source
        and 'setNodeGraphTraceDisplaySectionVisible(popover, "dot2", nodeGraphTraceDisplaySectionHasActiveControls("dot2", formType));' in node_graph_source
        and 'toggles: Object.freeze(["dot1Enabled", "dot2Enabled"])' in node_graph_source
        and "for (const key of activeToggles)" in node_graph_source
        and "next[key] = input.checked;" in node_graph_source,
        "Display Settings should show and persist only active typed controls, including Dot 2 toggles",
    )
    require(
        'data-trace-display-choice-row="lineBurnMode"' not in node_graph_source
        and 'data-trace-display-choice="lineBurnMode"' not in node_graph_source
        and ".node-trace-display-settings-popover [hidden]" in style_source
        and "display: none !important;" in style_source,
        "Display Settings should not expose the removed 1D Burn Sweep/Scroll choice row",
    )
    require(
        'id="nodeTraceDisplaySettingsTarget"' in node_graph_source
        and "function setNodeGraphTraceDisplaySettingsHeader(" in node_graph_source
        and "function nodeGraphTraceDisplaySettingsTargetLabel(node)" in node_graph_source
        and "nodeGraphPatchNodeTitle(node)" in node_graph_source
        and 'setNodeGraphTraceDisplaySettingsHeader("DISPLAY", "Settings", "Global")' in node_graph_source
        and "nodeGraphTraceDisplaySettingsTargetLabel(node)," in node_graph_source,
        "Display Settings should show the specific target module in a tertiary header line",
    )
    require(
        'ellipsoid: {\n    displayType: "scope2d"' in module_definitions_source
        and 'spiral: {\n    displayType: "scope2d"' in module_definitions_source
        and 'lorenzAttractor: {\n    displayType: "scope2d"' in module_definitions_source
        and 'visualOscilloscope: {\n    bufferedInputs: ["In", "X", "Y"],\n    displayType: "scope2dTrace"' in module_definitions_source
        and 'renderer === "scope2dTrace"' in node_graph_source
        and 'renderer === "scope2d")' in node_graph_source
        and "buffer = nodeGraphModuleScopeCapturedScope2dBuffer(slot, {" in node_graph_source
        and "function nodeGraphModuleScopeCapturedOutputPairXyBuffer" not in node_graph_source
        and "function nodeGraphModuleScopeCapturedVisualOscilloscopeXyBuffer" not in node_graph_source
        and 'slot?.type === "spiral" || slot?.type === "ellipsoid" || slot?.type === "lorenzAttractor"' not in node_graph_source,
        "legacy visual source modules should use typed scope renderers instead of old special display branches",
    )
    scope2d_start = node_graph_source.index("function drawNodeGraphScope2dItem")
    scope2d_end = node_graph_source.index("function drawNodeGraphModuleScopes", scope2d_start)
    scope2d_source = node_graph_source[scope2d_start:scope2d_end]
    scope2d_buffer_start = node_graph_source.index("function nodeGraphModuleScopeCapturedScope2dBuffer")
    scope2d_buffer_end = node_graph_source.index("function captureNodeGraphLiveModuleScopeOutput", scope2d_buffer_start)
    scope2d_buffer_source = node_graph_source[scope2d_buffer_start:scope2d_buffer_end]
    scope2d_helper_start = node_graph_source.index("function nodeGraphScope2dFiniteSample")
    scope2d_helper_source = node_graph_source[scope2d_helper_start:scope2d_start]
    scope2d_resize_start = node_graph_source.index("function resizeNodeGraphScope2dBurnRenderer")
    scope2d_resize_end = node_graph_source.index("function bindNodeGraphScope2dQuad", scope2d_resize_start)
    scope2d_resize_source = node_graph_source[scope2d_resize_start:scope2d_resize_end]
    scope2d_burn_start = node_graph_source.index("function nodeGraphScope2dBurnLayers")
    scope2d_burn_end = node_graph_source.index("function drawNodeGraphOneDimensionalBurnTrail", scope2d_burn_start)
    scope2d_burn_source = node_graph_source[scope2d_burn_start:scope2d_burn_end]
    require(
        "function nodeGraphScope2dSourceFrameCount(sampleRate, fps, validLength)" in node_graph_source
        and "nodeGraphScope2dSourceFrameCount(sampleRate, fps, validLength)" in scope2d_buffer_source
        and "function nodeGraphScopeAvailableSampleCount(buffer)" in node_graph_source
        and "nodeGraphScopeAvailableSampleCount(xBuffer)" in scope2d_buffer_source
        and "nodeGraphScopeAvailableSampleCount(yBuffer)" in scope2d_buffer_source
        and "nodeGraphTraceDisplayRenderPointBudget()" not in scope2d_buffer_source
        and "nodeGraphScopeVisualPointLimit" not in scope2d_buffer_source
        and "function nodeGraphScopeBufferRecentSampleCount(buffer)" in node_graph_source
        and "const xRecentSamples = nodeGraphScopeBufferRecentSampleCount(xBuffer)" in scope2d_buffer_source
        and "const yRecentSamples = nodeGraphScopeBufferRecentSampleCount(yBuffer)" in scope2d_buffer_source
        and "if (hasRecentSampleMetadata && !(xRecentSamples > 0 && yRecentSamples > 0))" in scope2d_buffer_source
        and "return null;" in scope2d_buffer_source
        and "function nodeGraphScope2dFiniteSample(value)" in scope2d_helper_source
        and "return Number.isFinite(sample) ? sample : null;" in scope2d_helper_source
        and "function nodeGraphScope2dLayerRadiusPx(settings, dotSpace, dotName)" in scope2d_helper_source
        and "function nodeGraphScope2dContinuitySpacingPx(settings, dotSpace)" in scope2d_helper_source
        and "return Math.max(0.5, radius * 0.18);" in scope2d_helper_source
        and "function nodeGraphScope2dInterpolationSpacingPx(settings = {}, dotSpace = 1)" in scope2d_helper_source
        and "return nodeGraphScope2dContinuitySpacingPx(settings, dotSpace);" in scope2d_helper_source
        and "if (sampleX === null || sampleY === null) {\n    return null;\n  }" in scope2d_helper_source
        and "skippedCenterSamples" not in scope2d_helper_source
        and "function nodeGraphScope2dDrawStartIndex(state, buffer, count)" in node_graph_source
        and "state?._nodeGraphScope2dLastDrawnFrame" in node_graph_source
        and "function copyNodeGraphScope2dBurnSurface(renderer, sourceSurface, targetSurface, width, height)" in node_graph_source
        and "function nodeGraphScope2dBurnTextureFormats(gl)" in node_graph_source
        and 'gl.getExtension("OES_texture_half_float")' in node_graph_source
        and 'gl.getExtension("EXT_color_buffer_half_float")' in node_graph_source
        and 'label: "rgba16f"' in node_graph_source
        and "gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE" in node_graph_source
        and "const previousReadSurface = renderer.readSurface" in scope2d_resize_source
        and "copyNodeGraphScope2dBurnSurface(renderer, previousReadSurface, nextReadSurface, safeWidth, safeHeight)" in scope2d_resize_source
        and "renderer.lastPoint = null;" in scope2d_resize_source
        and "renderer.lastFrame = NaN;" not in scope2d_resize_source
        and "renderer._nodeGraphScope2dLastDrawnFrame = endFrame;" in scope2d_burn_source
        and "canvas._nodeGraphScope2dLastDrawnFrame = endFrame;" in scope2d_burn_source
        and "function nodeGraphScope2dStrokeSpace(canvas)" in node_graph_source
        and "return Math.min(canvas?.width || 0, canvas?.height || 0);" in node_graph_source
        and "function nodeGraphScope2dPointBudget()" not in scope2d_helper_source
        and "function nodeGraphScope2dApplyPointBudget" not in scope2d_helper_source
        and "const budgetedPathPoints = nodeGraphScope2dApplyPointBudget(pathPoints)" not in scope2d_helper_source
        and "function drawNodeGraphScope2dRetainedBurn(item, pixelRatio, square, buffer, settings)" in scope2d_burn_source
        and "const backingPixelRatio = nodeGraphModuleScopeBackingPixelRatio(rect, pixelRatio);" in node_graph_source
        and "Math.round(Math.max(1, rect.width) * backingPixelRatio)" in node_graph_source
        and "function nodeGraphScope2dBurnCanvasSquare(canvas)" in scope2d_helper_source
        and "const canvasSquare = nodeGraphScope2dBurnCanvasSquare(canvas);" in scope2d_burn_source
        and "buildNodeGraphScope2dPathPoints(canvasSquare, buffer, drawStartIndex, { interpolate: true, settings })" in scope2d_burn_source
        and "pathPoints = bridgeNodeGraphScope2dAdjacentFramePath(" in scope2d_burn_source
        and "nodeGraphScope2dInterpolationSpacingPx(settings, Math.min(canvasSquare.width, canvasSquare.height))" in scope2d_burn_source
        and "drawNodeGraphRetainedBurnPath(item, pixelRatio, pathPoints, settings" in scope2d_burn_source
        and "function drawNodeGraphRetainedBurnPath(item, pixelRatio, pathPoints, settings, options = {})" in scope2d_burn_source
        and "buildNodeGraphScope2dBurnVertices(points)" in scope2d_burn_source
        and "if (distance < 0.01) {" in scope2d_burn_source
        and "end.x = from.x + 0.01;" in scope2d_burn_source
        and "float sigma = max(uRadius * mix(0.34, 1.0, blur), 0.55);" in node_graph_source
        and "gl.blendFunc(gl.ONE, gl.ONE)" in scope2d_burn_source
        and "function nodeGraphScope2dSampleHasVisibleOffset" not in scope2d_helper_source
        and "function nodeGraphScope2dSampleIsFinite(x, y)" in scope2d_helper_source
        and "if (!nodeGraphScope2dSampleIsFinite(buffer.x[index], buffer.y[index]))" in scope2d_helper_source
        and "function buildNodeGraphScope2dPathPoints(square, buffer, startIndex = 0, options = {})" in scope2d_helper_source
        and "function nodeGraphScope2dCenterRunMask" not in scope2d_helper_source
        and "centerRunMask" not in scope2d_helper_source
        and "function breakNodeGraphScope2dPath(points)" in scope2d_helper_source
        and "breakNodeGraphScope2dPath(pathPoints);" in scope2d_helper_source
        and "points.push(null);" in scope2d_helper_source
        and "function nodeGraphScope2dPathStartOffsetPx()" not in scope2d_helper_source
        and "bridgeNodeGraphScope2dPathFromCanvas" not in scope2d_helper_source
        and "_nodeGraphScope2dBridgePoint" not in scope2d_helper_source
        and "function nodeGraphScope2dBurnLayers(settings, dotSpace)" in scope2d_burn_source
        and "scrubNodeGraphScope2dCanvasCenter" not in scope2d_helper_source
        and "if (!nodeGraphScope2dSampleIsFinite(buffer.x[index], buffer.y[index])) {" in scope2d_helper_source
        and "previousPoint = null;" in scope2d_helper_source
        and "if (distance < safeSpacing) {\n    points.push(point);\n    return;\n  }" in scope2d_helper_source
        and "appendNodeGraphScope2dSegment(pathPoints, previousPoint, point, interpolationSpacingPx)" in scope2d_helper_source
        and "const spacingPx = nodeGraphScope2dContinuitySpacingPx(" in scope2d_helper_source
        and "previousPoint = appendNodeGraphScope2dSegment(points, previousPoint, point, spacingPx);" in scope2d_helper_source
        and "let pathPoints = drawStartIndex < count" in scope2d_burn_source
        and "let previousPoint = null" in scope2d_helper_source
        and "scope2dLastPoints" not in node_graph_source
        and "canContinueFromPreviousPoint" not in scope2d_helper_source
        and "PointStateFromSample" not in scope2d_helper_source
        and "SampleJumpIsPlausible" not in scope2d_helper_source
        and "firstIndex < count - 1" not in scope2d_helper_source
        and "nodeGraphScope2dSettingsForNode" in scope2d_source
        and "drawNodeGraphScope2dRetainedBurn(item, pixelRatio, square, buffer, settings)" in scope2d_source
        and "settings?.dot1Enabled !== false" in scope2d_burn_source
        and "settings?.dot2Enabled !== false" in scope2d_burn_source
        and "settings?.burn" in node_graph_source
        and "settings?.decay" in node_graph_source
        and "function drawNodeGraphScope2dDotPass" not in node_graph_source
        and "function nodeGraphScope2dAgeIntensity" not in node_graph_source
        and "centerX - radius" not in scope2d_source
        and "centerX + radius" not in scope2d_source,
        "2D Burn should draw a retained WebGL interpolated trail from source audio-frame slices, independent of point budget",
    )
    require(
        "function nodeGraphModuleScopeSlotIsDrawable(slot)" in node_graph_source
        and "function nodeGraphModuleScopeHasDrawableSlots()" in node_graph_source
        and "return nodeGraphModuleScopeSlots().filter(nodeGraphModuleScopeSlotIsDrawable);" in node_graph_source,
        "module scope drawing should be gated by drawable slots",
    )
    live_scope_capture_source = node_graph_source[
        node_graph_source.index("function beginNodeGraphLiveModuleScopeCapture("):
        node_graph_source.index("function updateNodeGraphLiveModuleScopeFingerprint(")
    ]
    require(
        "const canReuseBuffers = nodeGraphModuleScopeState.mode === \"live\" &&" in live_scope_capture_source
        and "nodeGraphModuleScopeState.patchFingerprint === patchFingerprint;" in live_scope_capture_source
        and "resizeNodeGraphLiveModuleScopeBuffer(previous, frameCapacity)" in live_scope_capture_source
        and "nextBuffers.set(key, resizeNodeGraphLiveModuleScopeBuffer(previous, frameCapacity));" in live_scope_capture_source,
        "live scope capture restart should preserve same-patch buffers instead of redrawing startup as a flat zero line",
    )
    require(
        ".node-module-scope-canvas {\n  z-index: 4;" in style_source
        and ".node-module-scope-light-canvas {\n  z-index: 4;" in style_source
        and ".node-graph-zoom-surface" in style_source
        and "z-index: 1" in style_source,
        "module scope canvases should layer above the zoom surface so drawn traces are visible",
    )
    display_buffer_start = node_graph_source.index("function nodeGraphModuleScopeDisplayBuffer")
    display_buffer_end = node_graph_source.index("const nodeGraphTraceDisplaySettingsWindowSize", display_buffer_start)
    display_buffer_source = node_graph_source[display_buffer_start:display_buffer_end]
    captured_buffer_start = node_graph_source.index("function nodeGraphModuleScopeCapturedBufferForSlot")
    captured_buffer_end = node_graph_source.index("const nodeGraphTraceDisplaySettingsDefaults", captured_buffer_start)
    captured_buffer_source = node_graph_source[captured_buffer_start:captured_buffer_end]
    screen_items_start = node_graph_source.index("function nodeGraphModuleScopeScreenItems")
    screen_items_end = node_graph_source.index("function nodeGraphModuleScopeTraceDisplayFrameUnchanged", screen_items_start)
    screen_items_source = node_graph_source[screen_items_start:screen_items_end]
    require(
        "function nodeGraphModuleScopeCapturedScope2dBuffer(slot, options = {})" in node_graph_source
        and "return nodeGraphModuleScopeCapturedScope2dBuffer(slot, source" in captured_buffer_source
        and "nodeGraphModuleScopeCapturedBufferForSlot(slot)" in screen_items_source
        and "function nodeGraphModuleScopeConnectedSourceBuffer(nodeId, port = \"In\")" in node_graph_source
        and 'nodeGraphModuleScopeConnectedSourceBuffer(nodeId, "In")' in node_graph_source
        and "nodeGraphModuleScopeConnectedSourceBuffer(slot.nodeId, xPort)" in node_graph_source
        and "nodeGraphModuleScopeConnectedSourceBuffer(slot.nodeId, yPort)" in node_graph_source
        and "nodeGraphModuleScopeOfflineInputDisplayBuffer" not in display_buffer_source
        and "nodeGraphModuleScopeOfflineScope2dBuffer" not in display_buffer_source,
        "oscilloscope testbed displays should measure captured wire buffers without offline fallback",
    )
    require(
        '["traceDisplay", "dotOscilloscope", "valueOscilloscope", "lineBurnOscilloscope"].includes(slot.type)' in node_graph_source
        and '["scope2d", "scope2dTrace"].includes(renderer)' in node_graph_source
        and 'outputs.includes("X") && outputs.includes("Y")' in node_graph_source
        and 'nodeGraphModuleScopeConnectionsTo(slot.nodeId, "Y").length > 0' in node_graph_source,
        "connected oscilloscope display modules should count as model displays while waiting for captured buffers",
    )
    require(
        "scopeSlots = slotDebug" in node_graph_source
        and 'entry.skip = "no-buffer"' in node_graph_source
        and 'entry.skip = "offscreen"' in node_graph_source,
        "module scope debug state should record per-slot buffer and geometry status",
    )
    require(
        "function nodeGraphModuleScopeDebugSnapshot()" in node_graph_source
        and "window.nodeGraphModuleScopeDebugSnapshot = nodeGraphModuleScopeDebugSnapshot;" in node_graph_source,
        "module scope debug snapshot should be readable from browser dev tools",
    )
    require(
        "moduleScopeBurn" not in node_graph_source
        and "moduleScopeDecay" not in node_graph_source
        and "screenBurn" not in node_graph_source
        and "nodeGraphModuleScopeTraceBurn" not in node_graph_source
        and "drawNodeGraphModuleScopePhosphorFade" not in node_graph_source
        and "drawNodeGraphModuleScopeTexturedQuad" not in node_graph_source,
        "global burn/decay and old phosphor fade code should stay removed from module scopes",
    )
    require(
        "moduleScopeBurn" not in default_ui_settings_source
        and "moduleScopeDecay" not in default_ui_settings_source
        and "moduleScopeBurn" not in script_sources["./public/node-graph-ui-settings-persistence.js"]
        and "moduleScopeDecay" not in script_sources["./public/node-graph-ui-settings-persistence.js"],
        "global burn/decay should not persist through default UI settings",
    )
    require(
        "function nodeGraphOneDimensionalBurnFadeTrail(context, canvas, settings)" in node_graph_source
        and "const burn = clampNodeSliderValue(Number(settings?.burn) || 0, 0, 1)" in node_graph_source
        and "const decay = clampNodeSliderValue(Number(settings?.decay) || 0, 0, 1)" in node_graph_source
        and "function drawNodeGraphScope2dRetainedBurn(item, pixelRatio, square, buffer, settings)" in node_graph_source
        and "decayNodeGraphScope2dBurn(renderer, settings)" in node_graph_source
        and "settings?.burn" in node_graph_source
        and "settings?.decay" in node_graph_source,
        "burn displays should own local burn/decay behavior instead of using global burn settings",
    )
    require('"transport"' in execution_plan_source and 'type === "transport"' in execution_plan_source, "execution plan should treat Transport as a supported source")
    require('"softClipper"' in execution_plan_source, "execution plan should treat Soft Clipper as a supported passthrough processor")
    require("timing: normalizeNodeGraphPatchTiming(patch.timing)" in execution_plan_source, "compiled live plan should carry patch timing")
    require("function nodeGraphTransportSample" in node_graph_source and "nodeGraphLiveModuleEvaluators.transport = (" in node_graph_source, "browser fallback should evaluate Transport")
    require(
        "function nodeGraphSoftClipperSample(input, center = 0, width = 2)" in node_graph_source
        and "const scaleX = 2 / safeWidth" in node_graph_source
        and "Math.tanh(scaleX * (Number(input) || 0) + shiftX)" in node_graph_source
        and "nodeGraphLiveModuleEvaluators.softClipper = (" in node_graph_source
        and "Left: nodeGraphSoftClipperSample(mixInput(nodeId, \"Left\") + softClipperMono, softClipperCenter, softClipperWidth)" in node_graph_source
        and "Right: nodeGraphSoftClipperSample(mixInput(nodeId, \"Right\") + softClipperMono, softClipperCenter, softClipperWidth)" in node_graph_source,
        "browser fallback should retain a stereo Soft Clipper evaluator for non-worklet fallback",
    )
    require("timing: normalizeNodeGraphPatchTiming(plan.timing)" in live_plan_runtime_source, "fallback runtime should retain plan timing")
    require("return this.transportSample(" in worklet_source and "transport: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {" in worklet_source, "AudioWorklet should evaluate Transport")
    require("this.transportStates.get(nodeId) || this.createTransportState()" in worklet_source, "AudioWorklet Transport should keep persistent per-node state instead of recomputing phase from the per-callback frame index")
    require(
        "nativeSoftClipperSample(input, center = 0, width = 2)" in worklet_source
        and 'name === "soft_clipper" || targetType === "softClipper"' in worklet_source
        and "this.nativeSoftClipper?.soemdsp_soft_clipper_sample" in worklet_source
        and "softClipper: (node, nodeId, frame, frames, frameValues, mixInput) => {" in worklet_source
        and "Out: this.nativeSoftClipperSample(softClipperMono, softClipperCenter, softClipperWidth)" in worklet_source
        and "Left: this.nativeSoftClipperSample(mixInput(nodeId, \"Left\") + softClipperMono, softClipperCenter, softClipperWidth)" in worklet_source
        and "Right: this.nativeSoftClipperSample(mixInput(nodeId, \"Right\") + softClipperMono, softClipperCenter, softClipperWidth)" in worklet_source
        and "softClipperSample(input, center = 0, width = 2)" not in worklet_source,
        "AudioWorklet should evaluate stereo Soft Clipper through native wasm instead of the old JS DSP branch",
    )
    require('"reverbEffect"' in execution_plan_source, "execution plan should treat Sabrina Reverb as a supported passthrough processor")
    require(
        'const inputPorts = type === "reverbEffect" ? ["In", "Left", "Right"] : ["In"]' in execution_plan_source
        and "count + (graph.inputConnections.get(nodeGraphInputKey(nodeId, port)) || []).length" in execution_plan_source,
        "Sabrina Reverb schedule validation should accept stereo Left/Right inputs, not only In",
    )
    require(
        "nodeGraphSabrinaReverbSample(" in node_graph_source
        and "createNodeGraphSabrinaReverbState()" in node_graph_source
        and "nodeGraphLiveModuleEvaluators.reverbEffect = (" in node_graph_source,
        "browser fallback should evaluate Sabrina Reverb through the raw stateful DSP port",
    )
    require(
        "const native = runtime?.nativeSabrinaReverbReady ? runtime?.nativeSabrinaReverb : null" in node_graph_source
        and "return dry;" in node_graph_source
        and '"Left Mix": dryLeft' in node_graph_source
        and '"Mono Mix": dryMono' in node_graph_source
        and '"Right Mix": dryRight' in node_graph_source,
        "browser fallback should dry-through Sabrina mix outputs when the native DSP core is unavailable",
    )
    require(
        "sabrinaReverbSample(state, leftInput, rightInput, params" in worklet_source
        and 'node?.type === "reverbEffect"' in worklet_source
        and "this.sabrinaReverbSample(" in worklet_source,
        "AudioWorklet should evaluate Sabrina Reverb through the raw stateful DSP port",
    )
    require(
        "return { \"Left Dry\": dryLeft, \"Mono Dry\": dryMono, \"Right Dry\": dryRight, \"Left Mix\": dryLeft, \"Mono Mix\": dryMono, \"Right Mix\": dryRight };" in worklet_source,
        "AudioWorklet should dry-through Sabrina mix outputs when the native DSP core is unavailable",
    )
    require('id="nodeSceneTimingControls"' in index_source, "Command Center should host timing controls")
    require("function createNodeGraphCommandCenterTimingWidgets" in header_rendering_source, "Command Center timing widgets should reuse header timing inputs")
    require("node-command-center-timing-widgets" in style_source, "Command Center timing controls should have compact row styling")

    require(
        "`Program ${String(index).padStart(3, \"0\")}`" not in script_sources["./public/node-graph-file-actions.js"]
        and "patch.modifiedUtc" not in script_sources["./public/node-graph-file-actions.js"],
        "patch explorer cards should not show date or program metadata",
    )

    for removed_module_browser_snippet in [
        "function createNodeGraphModuleStorePreview(entry)",
        "function appendNodeGraphModuleStoreNotes(target, entry)",
        "homeButton.dataset.storeToggleShelf = \"home\"",
        "homeButton.textContent",
        "toggle.dataset.storeToggleShelf = \"home\"",
        "Add To Home",
        "Remove From Home",
        "Add to Home",
        "Remove from Home",
        "Hide App Wide",
        "Show App Wide",
        "listen.textContent = \"Listen\"",
        "watch.textContent = \"Watch\"",
        "edit.textContent = \"Edit\"",
        "add.textContent = \"Add Module\"",
    ]:
        require(
            removed_module_browser_snippet not in script_sources["./public/node-graph-module-store.js"],
            f"module browser catalog should not render old preview/action UI: {removed_module_browser_snippet}",
        )
    for retired_shell_module_snippet in [
        'moduleHome: "Home"',
        'moduleShop: "Module Browser"',
        'layout: "moduleHome"',
        'layout: "moduleShop"',
        "function createNodeGraphModuleHomeBody",
        "function createNodeGraphModuleShopBody",
        "module-home-layout",
        "module-shop-layout",
    ]:
        require(
            retired_shell_module_snippet not in node_graph_source
            and retired_shell_module_snippet not in script_sources["./public/node-graph-module-definitions.js"]
            and retired_shell_module_snippet not in script_sources["./public/node-graph-module-rendering.js"]
            and retired_shell_module_snippet not in script_sources["./public/node-graph-module-factories.js"],
            f"retired patch-local shell module should stay removed: {retired_shell_module_snippet}",
        )
    for removed_module_browser_style in [
        ".scene-context-store-preview",
        ".scene-context-store-preview-shell",
        ".scene-context-store-preview-core",
        ".scene-context-store-manual-note",
        ".scene-context-store-card-actions",
        ".scene-context-store-card-description",
    ]:
        require(
            removed_module_browser_style not in style_source,
            f"module browser stylesheet should not restore old preview/action UI: {removed_module_browser_style}",
        )

    for snippet in [
        "node-header-bpm-tap-target",
        "caption.role = \"button\"",
        "caption.tabIndex = 0",
        "tapBpm",
    ]:
        require(snippet not in node_graph_source and snippet not in style_source, f"BPM widget should not own tap tempo: {snippet}")

    for snippet in [
        "copyNodeGraphViewportImageToClipboard",
        "ClipboardItem({ \"image/png\": image.pngBlob })",
        "PNG copied to clipboard",
    ]:
        require(snippet not in node_graph_source, f"viewport PNG export should not use clipboard path: {snippet}")

    for snippet in [
        "vec3 adjustSaturation(vec3 color, float saturation)",
        "vec3 adjustGamma(vec3 color, float gammaValue)",
        "vec3 adjustTemperature(vec3 color, float temperature)",
        "vec3 tintShadowsHighlights(vec3 color, vec3 shadows, vec3 highlights, float amount)",
        "vec3 posterize(vec3 color, float levels, float amount)",
        "vec3 chromaticGlitch(vec3 color, vec2 uv, float amount)",
        "vec3 scanlineGlow(vec3 color, vec2 uv, float amount)",
        "float saturation = 1.08",
        "float posterizeAmount = 0.0",
    ]:
        require(snippet not in node_graph_source, f"default shader should stay focused on dark-room bloom, not old preset effects: {snippet}")

    require(
        "function nodeGraphShaderScriptDarkRoomBloomDefaultFragment()" in shader_script_source
        and "const nodeGraphShaderScriptDefaultFragmentSource = nodeGraphShaderScriptDarkRoomBloomDefaultFragment();" in shader_script_source
        and "const nodeGraphDefaultScreenShaderPrefs = Object.freeze({" in shader_script_source
        and "NODE_SHADER_SCENE_EXPOSURE" in shader_script_source
        and "NODE_SHADER_BLOOM_AMOUNT" in shader_script_source
        and "NODE_SHADER_GLOW_AMOUNT" in shader_script_source
        and "enabled: true," in shader_script_source
        and "softLight(screenBloom)" in shader_script_source
        and ".node-graph-workspace.shader-enabled .node-wire-path:not(.inactive-wire)" in style_source
        and ".node-graph-workspace.shader-enabled .node-module-scope-window" in style_source
        and "--node-text-light-level: 0.46;" in style_source
        and ".node-graph-workspace.shader-enabled .dsp-node" in style_source
        and ".node-slider-readout-value," in style_source
        and "node-graph-shader-script.js?v=" in index_source,
        "world shader should default to the dark-room bloom glow pass with wire and screen illumination hooks",
    )

    removed_module_source = "\n".join([node_graph_source, style_source, index_source, default_preset_source])
    for snippet in [
        "moduleGoods",
        "moduleServices",
        "modulePlaceholder",
        "module-placeholder-layout",
        "node-module-placeholder",
        '"id": "goods"',
        '"id": "services"',
    ]:
        require(snippet not in removed_module_source, f"removed goods/services module artifact still present: {snippet}")

    removed_visual_export_source = "\n".join([
        index_source,
        node_graph_source,
        style_source,
        tooltip_source,
        server_source,
    ])
    for snippet in [
        "nodeRenderWavButton",
        "nodeRenderMp4Button",
        "nodeRenderOggButton",
        "nodeRenderFlacButton",
        "nodeRenderMp4AltButton",
        "nodeRenderMp4VideoOnlyButton",
        "nodeExportVisualVideoButton",
        "nodeSaveVisualOutputButton",
        "nodeCopyVisualOutputButton",
    ]:
        require(
            snippet not in removed_visual_export_source,
            f"removed visual output debug button still present: {snippet}",
        )

    require(
        "vertices.push(..." not in script_sources["./public/node-graph-module-scopes.js"],
        "scope renderer should append generated vertices without spread-push stack risk",
    )

    screen_shader_preset_source = "\n".join([index_source, shader_script_source])
    for snippet in [
        "nodeShaderScriptDefault",
        "nodeShaderScriptSaveDefault",
        "nodeShaderScriptGreenPreset",
        "nodeShaderScriptAmberPreset",
        "nodeShaderScriptCoolWhitePreset",
        "nodeShaderScriptRgbPixelPreset",
        "nodeShaderScriptRedPreset",
        "Ghost Phosphor",
        "Scope Starter",
        "Green Tube",
        "Amber Tube",
        "Cool White",
        "RGB Pixels",
        "Darkroom Red",
        "applyNodeGraphShaderScriptPreset",
        "applyNodeGraphShaderScriptGreenPreset",
        "applyNodeGraphShaderScriptAmberPreset",
        "applyNodeGraphShaderScriptCoolWhitePreset",
        "applyNodeGraphShaderScriptRgbPixelPreset",
        "applyNodeGraphShaderScriptRedPreset",
    ]:
        require(snippet not in screen_shader_preset_source, f"removed screen shader preset artifact still present: {snippet}")

    require(
        "nodeGraphDrawCanvasLayerPlaceholder(context, surface, layer, index)" not in node_graph_source,
        "origin canvas output should not draw the decorative layer placeholder",
    )

    for snippet in [
        "droppedChunks: 0",
        "expectedSequence: 0",
        "heldGain: 1",
        "heldSamples: 0",
        "lastSample: 0",
        "resetCount: 0",
        "queue.heldSamples < 2048",
        "queue.heldSamples > 128",
        "queue.heldGain = Math.max(0, (Number(queue.heldGain) || 1) * 0.9975)",
        "return queue.lastSample * queue.heldGain",
        "queue.heldGain = 1",
        "queue.lastSample = sample",
        "queue.heldSamples = 0",
        "queue.droppedChunks += sequence - queue.expectedSequence",
        "sequence > queue.expectedSequence",
        "expectedSequence: queue.expectedSequence",
        "rotate3dTo2d: (node, nodeId, frame, frames, frameValues, mixInput) => {",
        'this.readEffectiveParameter(node, "rotateX"',
        "x * cosZ - y * sinZ",
        'this.setExternalButtonEvent(message.name)',
        'Click: this.externalButtonEventPulse("click")',
        'this.setWireBreakEvent()',
        "wireBreak: () => this.wireBreakEventSample(),",
        'wireBreakGateSamples()',
        'event.gateSamples = Math.max(Number(event.gateSamples) || 0, this.wireBreakGateSamples())',
        'this.setWireConnectEvent()',
        "wireConnect: () => this.wireConnectEventSample(),",
        'this.setWireDisconnectEvent()',
        "wireDisconnect: () => this.wireDisconnectEventSample(),",
        'this.setWindowReopenEvent()',
        "windowReopen: () => this.windowReopenEventSample(),",
        'windowReopenGateSamples()',
        'this.setShootingStarExplosionEvent(message.speed)',
        "shootingStarExplosion: (node, nodeId, frame, frames, frameValues) => this.shootingStarExplosionEventSample(",
    ]:
        require(snippet in worklet_source, f"worklet source missing {snippet}")

    for snippet in [
        "nodeGraphScopeLightAccumulate",
        "nodeGraphScopeEventAccumulation",
        "nodeGraphModuleScopeCapturedPeakLightTarget",
        "nodeGraphModuleScopeClockGatePeak",
        "nodeGraphModuleScopeClockPulsePeak",
        "nodeGraphModuleScopeClockAnalogPeak",
        "if (buffer.nodeGraphScopeLightAccumulate)",
    ]:
        require(
            snippet not in node_graph_source,
            f"clock frame-brightness display should not use phosphor accumulation: {snippet}",
        )

    for snippet in [
        "nodeShaderScriptNumberWidget",
        "nodeShaderScriptNumberDecrease",
        "nodeShaderScriptNumberInput",
        "nodeShaderScriptNumberIncrease",
        "function beginNodeGraphShaderScriptTokenWidgetDrag(event)",
        "function dragNodeGraphShaderScriptTokenWidget(event)",
        "function endNodeGraphShaderScriptTokenWidgetDrag(event)",
        "function changeNodeGraphShaderScriptNumberToken(delta)",
        "document.getElementById(\"nodeShaderScriptNumberInput\")?.addEventListener(\"input\"",
        "nodeGraphShaderScriptState.tokenWidget?.type === \"number\"",
        ".node-shader-script-token-widget:has(#nodeShaderScriptNumberWidget:not([hidden]))",
        ".node-shader-script-token-widget-section input[type=\"number\"]",
    ]:
        require(
            snippet not in node_graph_source
            and snippet not in index_source
            and snippet not in style_source,
            f"shader number popup contract should be absent: {snippet}",
        )

    for snippet in [
        "scopeViewDragging",
        "bindNodeGraphModuleScopeViewDrag",
        "beginNodeGraphModuleScopeViewDrag",
        "dragNodeGraphModuleScopeView",
        "endNodeGraphModuleScopeViewDrag",
        "view-dragging",
        "data.scopeViewDragBound",
    ]:
        require(
            snippet not in node_graph_source
            and snippet not in style_source,
            f"oscilloscope mouse-drag feature should be absent: {snippet}",
        )

    model_display_source = node_graph_source[
        node_graph_source.index("function nodeGraphModuleScopeHasModelDisplay()"):
        node_graph_source.index("function resetNodeGraphModuleScopeFrameClocks()")
    ]

    require(
        "selectedDepartmentCount" not in script_sources["./public/node-graph-module-store.js"]
        and "`${selectedDepartment} Â·" not in script_sources["./public/node-graph-module-store.js"],
        "module browser selected category title should not append module count",
    )
    require(
        "nodeGraphModuleScopeOfflineTraceDisplayBuffer" not in node_graph_source,
        "Trace Display must draw only its captured In buffer, not secretly evaluate upstream modules through wires",
    )
    require(
        'clock: {\n    displayType: "dot"' in module_definitions_source
        and 'if (type === "clock") {\n    return "clock";\n  }' not in node_graph_source
        and 'slot?.type === "clock"' in node_graph_source
        and "nodeGraphModuleScopeDotOscilloscopeLightBuffer(capturedBuffer) ||\n      nodeGraphModuleScopeOfflineClockBlinkBuffer(slot, capturedBuffer)" in node_graph_source,
        "Clock display should use the shared 0D Burn dot renderer path",
    )
    require(
        'osc: {\n    displayType: "trace"' in module_definitions_source
        and 'polyBlep: {\n    displayType: "lineBurn"' in module_definitions_source
        and "return nodeGraphModuleDisplayModesForType(type)[0]?.renderer || nodeGraphModuleDeclaredDisplayTypeForType(type);" in node_graph_source,
        "Oscillator module faces should resolve to their declared typed renderers",
    )
    trace_slot_settings_source = node_graph_source[
        node_graph_source.index("function nodeGraphTraceDisplaySettingsForSlot"):
        node_graph_source.index("function prepareNodeGraphTraceDisplayBuffer")
    ]
    require(
        'nodeGraphModuleDisplaySettingsSchemaForSlot(slot) === "trace"' in trace_slot_settings_source
        and "return nodeGraphGlobalTraceSettings();" in trace_slot_settings_source
        and 'slot?.type !== "traceDisplay"' not in trace_slot_settings_source,
        "All trace displays should share global Trace Settings until local overrides are deliberately restored",
    )
    trace_buffer_view_source = node_graph_source[
        node_graph_source.index("function nodeGraphTraceDisplayBufferView"):
        node_graph_source.index("function nodeGraphModuleScopeBufferProgressRanges")
    ]
    trace_webgl_source = node_graph_source[
        node_graph_source.index("function drawNodeGraphModuleScopeBufferWebGl"):
        node_graph_source.index("const vertices = []", node_graph_source.index("function drawNodeGraphModuleScopeBufferWebGl"))
    ]
    trace_segment_source = node_graph_source[
        node_graph_source.index("function nodeGraphModuleScopeDiscontinuitySkipSamplesForSlot"):
        node_graph_source.index("function nodeGraphModuleScopeBufferSegmentPoints")
    ]
    require(
        'nodeGraphModuleDisplayRendererForSlot(slot) === "trace"' in trace_buffer_view_source
        and 'nodeGraphModuleDisplayRendererForSlot(slot) === "trace"' in trace_webgl_source
        and 'nodeGraphModuleDisplayRendererForSlot(slot) === "trace"' in trace_segment_source
        and 'slot?.type === "traceDisplay"' not in trace_buffer_view_source
        and 'slot?.type === "traceDisplay"' not in trace_webgl_source
        and 'slot?.type === "traceDisplay"' not in trace_segment_source
        and "const availableSamples = nodeGraphScopeAvailableSampleCount(buffer)" in trace_buffer_view_source
        and "const validStart = availableSamples > 0" in trace_buffer_view_source
        and "visibleSamples = Math.min(validSamples, nodeGraphTraceDisplayVisibleSamples(buffer, settings))" in trace_buffer_view_source
        and "triggeredStart !== null && triggeredStart >= validStart" in trace_buffer_view_source
        and 'slot?.type !== "traceDisplay"' not in trace_segment_source,
        "Typed trace displays should use the same recent-tail buffer view and WebGL trace renderer as 1D Trace",
    )
    require(
        "function normalizeNodeGraphTraceDisplayZoomSeconds(value, fallback)" in node_graph_source
        and "const nodeGraphTraceDisplayMaxZoomSeconds = 2;" in node_graph_source
        and "return clampNodeSliderValue(number, 0, nodeGraphTraceDisplayMaxZoomSeconds);" in node_graph_source
        and "return Number.isFinite(safeFallback) ? clampNodeSliderValue(safeFallback, 0, nodeGraphTraceDisplayMaxZoomSeconds) : 0;" in node_graph_source
        and "zoomSeconds: normalizeNodeGraphTraceDisplayZoomSeconds(zoomSeconds, defaults.zoomSeconds)" in node_graph_source
        and "nodeGraphLineBurnSettingsForNode(nodeGraphModuleScopeNodeForSlot(slot))" in node_graph_source,
        "1D Trace should clamp to the current stable zero-to-two-second zoom range and 1D Burn should use local preparation settings",
    )
    trace_vertices_source = node_graph_source[
        node_graph_source.index("function buildNodeGraphTraceDisplayVertices"):
        node_graph_source.index("function nodeGraphModuleScopeXyBeamVertices")
    ]
    require(
        "if (view.end <= view.start) {" in trace_vertices_source
        and "appendNodeGraphTraceDisplayBeamSegment(" in trace_vertices_source
        and "rect.left * pixelRatio" in trace_vertices_source
        and "(rect.left + rect.width) * pixelRatio" in trace_vertices_source
        and "pointCount: 1" in trace_vertices_source,
        "Trace zero zoom should draw a horizontal value line instead of an edge line",
    )
    line_burn_render_source = node_graph_source[
        node_graph_source.index("function drawNodeGraphLineBurnOscilloscopeItem"):
        node_graph_source.index("function drawNodeGraphScope2dItem")
    ]
    require(
        "nodeGraphOneDimensionalBurnFramePoints(canvas, buffer, rect, settings)" in line_burn_render_source
        and "drawNodeGraphOneDimensionalBurnTrail(" in line_burn_render_source
        and "nodeGraphScope2dBurnCanvasForSlot(item?.slot)" in line_burn_render_source
        and "drawNodeGraphOneDimensionalBurnDot" not in node_graph_source,
        "1D Burn should use the captured-buffer retained burn path without the removed live-dot helper",
    )
    global_trace_settings_open_source = node_graph_source[
        node_graph_source.index("function openNodeGraphGlobalTraceSettings"):
        node_graph_source.index("function beginNodeGraphTraceDisplaySettingsDrag")
    ]
    module_trace_settings_open_source = node_graph_source[
        node_graph_source.index("function openNodeGraphTraceDisplaySettings"):
        node_graph_source.index("function nodeGraphTraceDisplayVisibleSamples")
    ]
    require(
        'nodeGraphMvp.traceDisplaySettingsTargetNode === "__globalTraceSettings"' in global_trace_settings_open_source
        and "pulseNodeGraphFloatingWindowAttention(existingPopover)" in global_trace_settings_open_source
        and "nodeGraphMvp.traceDisplaySettingsTargetNode === node.id" in module_trace_settings_open_source
        and "pulseNodeGraphFloatingWindowAttention(existingPopover)" in module_trace_settings_open_source
        and "writeNodeGraphTraceDisplaySettingsForm(nodeGraphTraceDisplayCurrentSettingsForFormType())" in module_trace_settings_open_source,
        "Display settings should pulse when already open and read current settings through the selected display mode",
    )
    require(
        "function nodeGraphTraceDisplaySettingsEditingTraceDefaults()" in node_graph_source
        and "if (nodeGraphTraceDisplaySettingsEditingGlobal()) {" in node_graph_source
        and 'nodeGraphModuleDisplaySettingsSchemaForNode(node) === "trace"' in node_graph_source
        and "nodeGraphMvp.traceSettings = normalizeNodeGraphTraceDisplaySettings(settings)" in node_graph_source
        and "nodeGraphTraceDisplayCurrentSettingsForFormType()" in module_trace_settings_open_source,
        "Trace display settings form should edit the global trace defaults used by all trace displays",
    )
    trace_value_normalize_source = node_graph_source[
        node_graph_source.index("function nodeGraphTraceDisplayClampUnit"):
        node_graph_source.index("function nodeGraphTraceDisplayFieldFromTarget")
    ]
    require(
        "const nodeGraphTraceDisplaySharedValueClamps = Object.freeze({" in trace_value_normalize_source
        and "const nodeGraphTraceDisplayFormTypeValueClampOverrides = Object.freeze({" in trace_value_normalize_source
        and "dot: Object.freeze({" in trace_value_normalize_source
        and "scope2d: Object.freeze({" in trace_value_normalize_source
        and "scope2dTrace: Object.freeze({" in trace_value_normalize_source
        and "dot1Brightness: nodeGraphTraceDisplayClampBrightness," in trace_value_normalize_source
        and "dot2Brightness: nodeGraphTraceDisplayClampBrightness," in trace_value_normalize_source
        and "function normalizeNodeGraphTraceDisplaySettingValueForKey(key, value)" in trace_value_normalize_source
        and "nodeGraphTraceDisplayFormTypeValueClampOverrides[formType]?.[key] ||" in trace_value_normalize_source,
        "Trace settings clamp rules should be isolated per display type, not a shared cascading if-chain",
    )
    for snippet in [
        "function nodeGraphTraceDisplayTimingEnabled()",
        "function nodeGraphTraceDisplayTimingObject(slot)",
        "function finishNodeGraphTraceDisplayTiming(timing)",
        "traceDisplayTiming",
        "bufferViewMs",
        "pointGenerationMs",
        "vertexGenerationMs",
        "glBufferDataMs",
        "drawArraysMs",
        "window.nodeGraphTraceDisplayTimingEnabled",
        'localStorage?.getItem?.("nodeGraphTraceDisplayTiming") === "1"',
    ]:
        require(snippet in node_graph_source, f"Trace Display timing instrumentation missing: {snippet}")
    for snippet in [
        "traceDisplayDrawCache: new Map()",
        "traceDisplayScratch: new Map()",
        "versionSerial: 0",
        "buffer.nodeGraphScopeVersion = nodeGraphModuleScopeState.versionSerial",
        "function nodeGraphTraceDisplayDrawSignature(slot, item, buffer, settings)",
        "function nodeGraphModuleScopeTraceDisplayFrameUnchanged(visibleItems)",
        'setNodeGraphModuleScopeDebugPhase("trace-unchanged")',
    ]:
        require(snippet in node_graph_source, f"Trace Display unchanged-frame skip missing: {snippet}")
    trace_unchanged_source = node_graph_source[
        node_graph_source.index("if (!scopePaused && nodeGraphModuleScopeTraceDisplayFrameUnchanged(visibleItems))"):
        node_graph_source.index("if (!nodeGraphModuleScopePhosphorFrameReady(firstVisibleSlot))")
    ]
    require(
        "gl.clear" not in trace_unchanged_source
        and "scheduleNodeGraphModuleScopeDraw" not in trace_unchanged_source,
        "Trace Display unchanged-frame skip should happen before canvas clear and should not schedule another draw",
    )
    for snippet in [
        "function nodeGraphTraceDisplayScratchForSlot(slot, requiredFloats)",
        "new Float32Array(capacity)",
        "function buildNodeGraphTraceDisplayVertices(buffer, rect, canvas, pixelRatio, slot, options = {})",
        "buildNodeGraphTraceDisplayVertices(buffer, rect, canvas, pixelRatio, slot, options)",
        "traceGeometry.vertices.subarray(0, traceGeometry.vertexFloatCount)",
    ]:
        require(snippet in node_graph_source, f"Trace Display reusable typed-buffer renderer missing: {snippet}")
    trace_display_geometry_source = node_graph_source[
        node_graph_source.index("function nodeGraphTraceDisplayVisualPointCount(rect, buffer)"):
        node_graph_source.index("function nodeGraphModuleScopeXyBeamVertices(points, canvas, sparkSizePx = 2)")
    ]
    require(
        "Math.ceil(visualWidth * 2)" in trace_display_geometry_source
        and "const pointCount = nodeGraphTraceDisplayVisualPointCount(metricRect, buffer)" in trace_display_geometry_source
        and "visibleSampleWidth" not in trace_display_geometry_source
        and "minPointSpacingPx" not in trace_display_geometry_source,
        "Trace Display point density should stay screen-space stable across zoom",
    )
    visual_sink_capacity_source = execution_plan_source[
        execution_plan_source.index("function nodeGraphVisualSinkBufferSampleLimit(node)"):
        execution_plan_source.index("function nodeGraphNodeSignalOutputRequired")
    ]
    visual_input_buffer_source = node_graph_source[
        node_graph_source.index("function createNodeGraphVisualInputBuffer"):
        node_graph_source.index("function nodeGraphModuleScopeBuffersCurrent")
    ]
    worklet_visual_buffer_source = worklet_source[
        worklet_source.index("createVisualInputBuffer(capacity = 262144)"):
        worklet_source.index("captureModuleScopeOutput(nodeId, output)")
    ]
    require(
        "const nodeGraphVisualSinkHistorySeconds = 10;" in execution_plan_source
        and "Math.ceil(sampleRate * nodeGraphVisualSinkHistorySeconds)" in visual_sink_capacity_source
        and "zoomSeconds" not in visual_sink_capacity_source
        and "nodeGraphGlobalTraceSettings" not in visual_sink_capacity_source
        and "nodeGraphLineBurnSettingsForNode" not in visual_sink_capacity_source
        and "nodeGraphVisualSinkBufferSampleLimit(node)" in execution_plan_source
        and "function normalizeNodeGraphVisualInputBufferCapacity" in visual_input_buffer_source
        and "function resizeNodeGraphVisualInputBufferState" in visual_input_buffer_source
        and "runtime.visualInputBuffers.set(key, resizeNodeGraphVisualInputBufferState(current, capacity))" in visual_input_buffer_source
        and "Math.min(1048576" not in visual_input_buffer_source
        and "normalizeVisualInputBufferCapacity(capacity = 262144)" in worklet_visual_buffer_source
        and "resizeVisualInputBufferState(state, capacity = 262144)" in worklet_visual_buffer_source
        and "this.visualInputBuffers.set(key, this.resizeVisualInputBufferState(current, capacity))" in worklet_visual_buffer_source
        and "Math.min(1048576" not in worklet_visual_buffer_source,
        "Trace Display zoom should reinterpret fixed retained visual input buffers without resizing from the current zoom",
    )
    require(
        "applyNodeGraphTraceDisplaySettingsWindowSize(metadataRect" not in node_graph_source
        and "applyNodeMetadataPopoverSize(displayRect ||" not in node_graph_source,
        "display/metaparameter right-click opens should not steal another inspector window's size",
    )
    for snippet in [
        'data-trace-display-field="sampleFrames"',
        'data-trace-display-field="pointLimit"',
        'data-trace-display-field="minPointSpacingPx"',
        "nodeTraceDisplayDot1Preview",
        "nodeTraceDisplayDot2Preview",
        "traceDisplaySettings.sampleFrames",
        "traceDisplaySettings.pointLimit",
        "traceDisplaySettings.minPointSpacingPx",
        "buffer.nodeGraphScopeVisualPointLimit = Math.min(\n    traceSettings.pointLimit",
    ]:
        require(
            snippet not in node_graph_source and snippet not in tooltip_source,
            f"Trace Display should not expose fake trace sample/point-limit controls: {snippet}",
        )
    require(
        'data-trace-display-field="dot1Size"' in node_graph_source
        and 'data-trace-display-field="dot2Size"' in node_graph_source
        and 'data-trace-display-field="lineThickness"' in node_graph_source
        and 'data-trace-display-field="dot2LineThickness"' in node_graph_source
        and 'data-trace-display-field="dot1Blur"' not in node_graph_source
        and 'data-trace-display-field="dot2Blur"' not in node_graph_source
        and 'data-trace-display-field="dot1Brightness"' in node_graph_source
        and 'data-trace-display-toggle="bipolarBrightness"' in node_graph_source
        and 'data-trace-display-toggle="dot1Enabled"' in node_graph_source
        and 'data-trace-display-toggle="dot2Enabled"' in node_graph_source
        and 'data-trace-display-color="dot1Color"' in node_graph_source
        and "const nodeGraphZeroDBurnSettingsDefaults = Object.freeze" in node_graph_source
        and "bipolarBrightness: false" in node_graph_source
        and "function normalizeNodeGraphZeroDBurnSettings(settings = {})" in node_graph_source
        and "bipolarBrightness: source.bipolarBrightness === true" in node_graph_source
        and "function nodeGraphZeroDBurnSettingsForNode(node)" in node_graph_source
        and "node.zeroDBurnSettings = normalizeNodeGraphZeroDBurnSettings" in node_graph_source
        and "lineThickness: normalizeNodeGraphTraceDisplayNumber(" in node_graph_source
        and "dot2LineThickness: normalizeNodeGraphTraceDisplayNumber(" in node_graph_source
        and "dot1Enabled: source.dot1Enabled !== false" in node_graph_source
        and "dot2Enabled: source.dot2Enabled !== false" in node_graph_source
        and "dot1Size: normalizeNodeGraphTraceDisplayNumber(" in node_graph_source
        and "dot2Size: normalizeNodeGraphTraceDisplayNumber(" in node_graph_source
        and "gl.uniform1f(renderer.beamBlurLocation, clampNodeSliderValue(Number(options.blur) || 0, 0, 1))" in node_graph_source
        and "const outerThickness = Math.max(0, dotSpace * clampNodeSliderValue(settings.dot2Size, 0, 1))" in node_graph_source
        and "const innerThickness = Math.max(0, dotSpace * clampNodeSliderValue(settings.dot1Size, 0, 1))" in node_graph_source
        and "settings.dot2Enabled !== false && settings.dot2Brightness > 0 && outerThickness > 0" in node_graph_source
        and "settings.dot1Enabled !== false && settings.dot1Brightness > 0 && innerThickness > 0" in node_graph_source
        and "const nodeGraphTraceDisplaySharedValueClamps = Object.freeze({" in node_graph_source
        and "const nodeGraphTraceDisplayFormTypeValueClampOverrides = Object.freeze({" in node_graph_source
        and "function setNodeGraphTraceDisplaySettingsFormType(node = null)" in node_graph_source
        and "nodeGraphTraceDisplayActiveControlsByType" in node_graph_source
        and "dot: Object.freeze({" in node_graph_source
        and '"bipolarBrightness", "dot1Enabled", "dot2Enabled"' in node_graph_source
        and "const activeToggles = nodeGraphTraceDisplayActiveControlSet(\"toggles\", formType)" in node_graph_source
        and "normalizeNodeGraphTraceDisplaySettingValueForKey(key, value)" in node_graph_source
        and "function nodeGraphTraceDisplaySizeControlField(key)" in node_graph_source
        and "function nodeGraphTraceDisplaySensitiveControlField(key)" in node_graph_source
        and "[\"dot1Size\", \"dot2Size\", \"capSize\"].includes(key)" in node_graph_source
        and "[\"dot1Brightness\", \"dot2Brightness\"].includes(key)" in node_graph_source
        and "const nodeGraphTraceDisplaySensitiveControlExponent = 3;" in node_graph_source
        and "function nodeGraphTraceDisplaySizeToControlValue(value, max = 1)" in node_graph_source
        and "1 / nodeGraphTraceDisplaySensitiveControlExponent" in node_graph_source
        and "function nodeGraphTraceDisplayControlToSizeValue(value, max = 1)" in node_graph_source
        and "return Math.pow(control, nodeGraphTraceDisplaySensitiveControlExponent) * max;" in node_graph_source
        and "if (!nodeGraphTraceDisplaySensitiveControlField(key))" in node_graph_source
        and "adjustNodeGraphTraceDisplaySettingByControlDelta(drag.key, startValue, controlDelta)" in node_graph_source
        and "adjustNodeGraphTraceDisplaySettingByControlDelta(key, baseValue, direction * quantum)" in node_graph_source
        and "for (const key of activeColors)" in node_graph_source
        and "0D Burn brightness mode. Off: only 0..1 lights up. On: -1 and +1 are equally bright." in tooltip_source
        and "zeroDBurnSettings: normalizeNodeGraphZeroDBurnSettings(node.zeroDBurnSettings)" in node_graph_source,
        "0D Burn settings should expose real normalized dot sizes, bipolar brightness mode, and both dot colors",
    )
    require(
        '["lineThickness", "Dot 1 blur"]' in node_graph_source
        and '["dot2LineThickness", "Dot 2 blur"]' in node_graph_source
        and "<span>Blur</span>" in node_graph_source
        and "grid-template-columns: 30px minmax(0, 1fr);" in style_source
        and "font-size: 20px;" in style_source
        and "Blur of the 1D Trace Dot 1 beam." in tooltip_source
        and "Blur of the 1D Trace Dot 2 beam." in tooltip_source,
        "Oscilloscope settings should present Thick controls as Blur",
    )
    require(
        "const nodeGraphTraceDisplayActiveControlsByType = Object.freeze({" in node_graph_source
        and "function nodeGraphTraceDisplayActiveControlsForType(type = nodeGraphTraceDisplaySettingsFormType())" in node_graph_source
        and "function nodeGraphTraceDisplayActiveControlSet(kind, type = nodeGraphTraceDisplaySettingsFormType())" in node_graph_source
        and "for (const key of activeFields)" in node_graph_source
        and "for (const key of activeToggles)" in node_graph_source
        and "for (const field of nodeGraphTraceDisplaySettingControlKeys.fields)" in node_graph_source
        and "setControlHidden(" in node_graph_source,
        "Display settings should use an active-control registry for each display type",
    )
    require(
        "node-trace-display-caps-title" in node_graph_source
        and "node-trace-display-caps-section" in node_graph_source
        and "node-trace-display-value-title" in node_graph_source
        and "node-trace-display-value-section" in node_graph_source
        and 'data-trace-display-toggle="capEnabled"' in node_graph_source
        and 'data-trace-display-field="lineLength"' in node_graph_source
        and 'data-trace-display-field="capSize"' in node_graph_source
        and 'data-trace-display-field="capLength"' in node_graph_source
        and 'value: Object.freeze({' in node_graph_source
        and '"lineLength",' in node_graph_source
        and '"burn",' in node_graph_source
        and '"decay",' in node_graph_source
        and '"capSize",' in node_graph_source
        and '"capLength",' in node_graph_source
        and 'setNodeGraphTraceDisplaySectionVisible(popover, "value", nodeGraphTraceDisplaySectionHasActiveControls("value", formType));' in node_graph_source
        and 'traceTitle.textContent = formType === "value"' in node_graph_source
        and "capEnabled: \"traceDisplaySettings.capEnabled\"" in node_graph_source
        and "lineLength: \"traceDisplaySettings.lineLength\"" in node_graph_source
        and "capSize: \"traceDisplaySettings.capSize\"" in node_graph_source
        and "capLength: \"traceDisplaySettings.capLength\"" in node_graph_source
        and "0D Value line length. 1 reaches the display edge; lower values pull both ends inward." in tooltip_source
        and "0D Value cap thickness as a 0..1 fraction of the display square." in tooltip_source,
        "0D Value settings should expose line, burn/decay, and Value-only Caps controls",
    )
    value_registry_source = node_graph_source[
        node_graph_source.index("  value: Object.freeze({"):
        node_graph_source.index("});", node_graph_source.index("  value: Object.freeze({"))
    ]
    require(
        '"zoomSeconds"' not in value_registry_source
        and '"padding"' not in value_registry_source
        and '"skipSamples"' not in value_registry_source
        and '"sourceSync"' not in value_registry_source
        and '"lineBurnMode"' not in value_registry_source,
        "0D Value display settings should not expose trace-only or line-burn mode controls",
    )
    require(
        "function nodeGraphTraceDisplayNumberDragMultiplier(event)" in node_graph_source
        and "nodeGraphNumericDragMultiplier(event)" in node_graph_source
        and "typeof nodeGraphNumericModifierReserved === \"function\" && nodeGraphNumericModifierReserved(event)" in node_graph_source
        and "multiplier: nodeGraphTraceDisplayNumberDragMultiplier(event)" in node_graph_source
        and "drag.quantum * drag.multiplier" in node_graph_source,
        "Display settings number dragging should share the app-wide numeric mouse modifier policy",
    )
    require(
        "function readNodeGraphTraceDisplaySettingsForm()" in node_graph_source
        and "sanitizeNodeGraphNumericText(input.value)" in node_graph_source
        and "next[key] = sanitizedValue;" in node_graph_source,
        "Display settings numeric fields should sanitize invalid typed characters before normalization",
    )
    require(
        "function preventNodeGraphTraceDisplayReadonlyFieldTextInteraction(event)" in node_graph_source
        and "if (event.type === \"focusin\")" in node_graph_source
        and "popover.addEventListener(\"focusin\", preventNodeGraphTraceDisplayReadonlyFieldTextInteraction, true)" in node_graph_source
        and "popover.addEventListener(\"selectstart\", preventNodeGraphTraceDisplayReadonlyFieldTextInteraction, true)" in node_graph_source
        and "popover.addEventListener(\"dragstart\", preventNodeGraphTraceDisplayReadonlyFieldTextInteraction, true)" in node_graph_source,
        "Display settings number fields should drag by default and only become text-editable after double click",
    )
    require(
        "function setNodeGraphTraceDisplayZoomEditActive(active)" in node_graph_source
        and "nodeGraphMvp.traceDisplayZoomEditActive = Boolean(active)" in node_graph_source
        and "const zoomEditActive = Boolean(nodeGraphMvp?.traceDisplayZoomEditActive)" in node_graph_source
        and 'input.dataset.traceDisplayField === "zoomSeconds"' in node_graph_source,
        "Trace display zoom edits should still suppress sync re-triggering while actively dragging/typing",
    )
    require(
        "function nodeGraphTraceDisplayStabilizedSyncStart(buffer, syncBuffer, cycleEstimate, visibleSamples, validStart, validEnd)" in node_graph_source
        and "buffer.nodeGraphScopeLastSyncStart" in node_graph_source
        and "buffer.nodeGraphScopeLastSyncTotalSampleCount" in node_graph_source
        and "totalSampleCount - prevTotalSampleCount" in node_graph_source
        and "periodDrift < 0.15" in node_graph_source,
        "Trace sync should hold the previous lock's absolute phase (via nodeGraphScopeTotalSampleCount) across frames, "
        "not re-anchor from scratch every frame -- otherwise a scrolling buffer makes the trigger jump constantly",
    )
    require(
        "Sync to source" not in node_graph_source
        and "Sync (work in progress)" not in node_graph_source
        and '>\n          Sync\n        </label>' in node_graph_source,
        "Trace settings source-sync label should no longer be marked WIP now that trigger-hold is implemented",
    )
    require(
        "nodeGraphModuleLabel(" not in node_graph_source,
        "Display settings opener should not call a nonexistent module-label helper",
    )
    require(
        'slot.type === "noise"' not in model_display_source
        and 'slot.type === "stereoNoise"' not in model_display_source,
        "noise scopes should draw captured output instead of using the model display path",
    )
    display_buffer_source = node_graph_source[
        node_graph_source.index("function nodeGraphModuleScopeDisplayBuffer(slot, capturedBuffer = null)"):
        node_graph_source.index("function pushNodeGraphLiveModuleScopeSamples")
    ]
    require(
        "function nodeGraphModuleScopeOfflineAdditiveOscillatorBuffer(slot)" not in node_graph_source,
        "additive scopes should no longer use the old generated offline oscilloscope buffer",
    )
    require(
        "logShape" not in node_graph_source
        and "expShape" not in node_graph_source
        and "linShape" not in node_graph_source,
        "additive damping should use the rational curve shaper instead of log/exp/linear branches",
    )

    for snippet in [
        'led: "LED"',
        "led: {",
        'bufferedInputs: ["In"]',
        'displayType: "dot"',
        'layout: "led"',
        'outputs: ["Out"]',
        'visualInputs: [\n      { key: "led", label: "In", port: "In" },\n    ]',
        "visualSink: true",
        '"led"',
        "One-grid-unit signal light",
        "function createNodeGraphLedFace(node, type)",
        "face.className = \"node-led-face\"",
        "face.append(createNodeGraphPort(node, type, \"In\", \"input\"))",
        'led: "led-layout"',
        "viewDrag: false",
        "nodeGraphModuleDefinitions[type]?.layout === \"led\"",
        "node.led = normalizeNodeGraphLedLayout(options.led)",
        "? { led: normalizeNodeGraphLedLayout(node.led) }",
        "normalizedNode.led = normalizeNodeGraphLedLayout(node.led)",
        "function nodeGraphModuleScopeCapturedCurrentLightTarget(capturedBuffer)",
        "renderer === \"dot\"",
        "nodeGraphModuleScopeDotOscilloscopeLightBuffer(capturedBuffer)",
        "function nodeGraphModuleScopeDefaultShaderSourceForNode(node)",
        "function nodeGraphModuleScopeShaderSourceForSlot(slot)",
        "function nodeGraphModuleScopeShaderBlurRatio(source, dotName, fallback = 0)",
        "function nodeGraphModuleScopeLightShaderStyle(slot, buffer)",
        "centerBlur: nodeGraphModuleScopeShaderBlurRatio(source, \"dot1\", 0)",
        "outerBlur: nodeGraphModuleScopeShaderBlurRatio(source, \"dot2\", 0)",
        "nodeGraphModuleScopeDefaultShaderSourceForNode(node)",
        "usesShader: Boolean(source)",
        "nodeGraphScopeLightInstant: true",
        "for (const sink of runtime.visualSinks || [])",
        "setNodeGraphLedColorFromContext",
        "nodeSceneLedControls",
        "nodeSceneLedColor",
        "nodeGraphLiveModuleEvaluators.led = (",
        '"led input"',
    ]:
        require(snippet in node_graph_source, f"LED module contract missing {snippet}")
    require(
        "function nodeGraphModuleScopeOfflineLedBuffer" not in node_graph_source
        and "nodeGraphModuleScopeOfflineLedBuffer(slot, capturedBuffer)" not in node_graph_source,
        "LED should use 0D Burn/dot display routing instead of an LED-specific scope fallback",
    )

    for snippet in [
        ".dsp-node.led-layout",
        ".node-led-face",
        ".node-led-face .node-port.input",
        "width: calc((var(--node-grid-width) * var(--node-grid-width-units, 1)) - (var(--node-module-grid-inset) * 2))",
        "height: calc((var(--node-grid-height) * var(--node-grid-height-units, 1)) - (var(--node-module-grid-inset) * 2))",
        "outline-color: color-mix(in srgb, var(--muted) 42%, transparent)",
    ]:
        require(snippet in style_source, f"LED module style contract missing {snippet}")

    require(
        'slot.type === "led" && nodeGraphModuleScopeConnectionsTo(slot.nodeId, "In").length > 0' not in node_graph_source,
        "LED should not be treated as a model display; it must draw from captured live/input level samples",
    )
    require(
        "localTime * frequency" not in node_graph_source,
        "model scope oscillators should use accumulated phasor phase when frequency changes",
    )
    require(
        "nodeGraphModuleScopeSyncRoundedCycles" not in node_graph_source,
        "scope sync should round only for drawing, not mutate the displayed cycles value",
    )
    require(
        "clockLedStates" not in node_graph_source
        and "updateNodeGraphModuleClockLed" not in node_graph_source
        and "node-clock-led" not in node_graph_source
        and "node-clock-led" not in style_source,
        "clock oscilloscope should not include LED drawing state, DOM, updater, or CSS",
    )
    require(
        "node-shader-script-clock-blinker" not in node_graph_source
        and "node-shader-script-clock-blinker" not in style_source,
        "shader scope camera preview should not add a separate clock blink overlay",
    )
    light_display_source = node_graph_source[
        node_graph_source.index("function drawNodeGraphModuleScopeLightDisplay("):
        node_graph_source.index("function drawNodeGraphModuleScopeLightDisplays(", node_graph_source.index("function drawNodeGraphModuleScopeLightDisplay("))
    ]
    require(
        "shadowBlur" not in light_display_source and "shadowColor" not in light_display_source,
        "clock light display should not add private blur or glow outside screen-space settings",
    )
    require(
        "strokeStyle" not in light_display_source
        and "lineWidth" not in light_display_source
        and ".stroke()" not in light_display_source,
        "clock light display should not draw an extra outline stroke",
    )
    require(
        "const lightStyle = nodeGraphModuleScopeLightShaderStyle(slot, buffer)" in light_display_source
        and "const outerColor = lightStyle.outerColor" in light_display_source
        and "const size = Math.max(1, availableSize * outerSizeRatio)" in light_display_source
        and ": lightStyle.usesShader ? 1 : 0.38" in light_display_source
        and "nodeGraphModuleScopeEmissiveShaderRgb(outerRgb, core2Brightness)" in light_display_source
        and "context.globalCompositeOperation = lightStyle.usesShader ? \"source-over\" : \"lighter\"" in light_display_source
        and "const frameBrightnessMode = buffer.nodeGraphScopeFrameBrightness === true" in light_display_source
        and "const sharedFrameAlphaFactor = frameBrightnessMode ? 1 : null" in light_display_source
        and "const outerAlphaFactor = sharedFrameAlphaFactor ?? clampNodeSliderValue(core2Brightness * outerAlphaScale, 0, 1)" in light_display_source
        and "const centerAlphaFactor = sharedFrameAlphaFactor ?? clampNodeSliderValue(core1Brightness * centerAlphaScale, 0, 1)" in light_display_source
        and "const sprite = nodeGraphModuleScopeLightSpriteTexture({" in light_display_source
        and "context.globalAlpha = alpha" in light_display_source
        and "context.drawImage(sprite.canvas, centerX - sprite.size * 0.5, centerY - sprite.size * 0.5)" in light_display_source,
        "clock light display should stamp one cached dot texture with shared frame brightness",
    )
    require(
        "Math.max(0.42, outerAlpha)" not in light_display_source
        and "context.fillStyle = nodeGraphModuleScopeLightFillStyle(" not in light_display_source,
        "frame-brightness clock lights must not draw live gradients or force tiny/off frames through a shader minimum alpha floor",
    )
    require(
        "const centerColor = lightStyle.centerColor" in light_display_source
        and "const centerRatio = Math.max(" in light_display_source
        and ": lightStyle.usesShader ? 1 : 0.5" in light_display_source
        and "nodeGraphScopeLightCenterAlphaScale" in light_display_source,
        "LED and clock light display should be able to draw a separate bright center dot",
    )
    require(
        "if (cycles === 0) {\n    return buffer.length;\n  }" not in node_graph_source,
        "zero scope cycles should use the normal zoom path instead of switching to a full-buffer view",
    )

    scope_draw_source = node_graph_source[
        node_graph_source.index("function drawNodeGraphModuleScopes()"):
        node_graph_source.index("function scheduleNodeGraphModuleScopeDraw()")
    ]
    fps_gate_start = scope_draw_source.index("if (!nodeGraphModuleScopePhosphorFrameReady(firstVisibleSlot)) {")
    fps_gate_end = scope_draw_source.index('  setNodeGraphModuleScopeDebugPhase("clear-current-frame")', fps_gate_start)
    fps_gate_source = scope_draw_source[fps_gate_start:fps_gate_end]
    require(
        "scheduleNodeGraphModuleScopeDraw();" in fps_gate_source
        and "return;" in fps_gate_source,
        "master oscilloscope FPS gate should reschedule without drawing when not ready",
    )
    require(
        "drawNodeGraphModuleScopePhosphorFade(" not in fps_gate_source
        and "compositeNodeGraphModuleScopePhosphor(" not in fps_gate_source,
        "master oscilloscope FPS gate should prevent all phosphor drawing between global frames",
    )
    fixed_clock_source = node_graph_source[
        node_graph_source.index("function nodeGraphModuleScopeAdvanceFixedFrameClock("):
        node_graph_source.index("function nodeGraphModuleScopeModelFrameTime(")
    ]
    require(
        "const resyncDuration = Math.max(0.5, frameDuration * 4);" in fixed_clock_source
        and "elapsed > resyncDuration" in fixed_clock_source,
        "scope fixed-frame clock should scale its resync threshold with the requested FPS",
    )
    require(
        "elapsed > 0.5" not in fixed_clock_source,
        "scope fixed-frame clock should not force 1 FPS scopes to update at 2 FPS",
    )
    header_scope_source = script_sources["./public/node-graph-module-header-rendering.js"]
    fps_header_start = header_scope_source.index('"nodeMasterScopeFps"')
    fps_header_end = header_scope_source.index("createNodeGraphHeaderSpeedPlaceholder()", fps_header_start)
    fps_header_source = header_scope_source[fps_header_start:fps_header_end]
    require(
        "min: 0" in fps_header_source
        and 'scopeInput: "framesPerSecond"' in fps_header_source,
        "header FPS drag number should allow 0 to freeze displays",
    )
    require(
        "nodeMasterScopePointBudget" not in header_scope_source
        and "Display point budget" not in header_scope_source,
        "display point budget should not be exposed as a normal header quality knob",
    )
    scope_drag_scale_start = script_sources["./public/node-graph-module-scopes.js"].index(
        "function nodeGraphScopeNumberDragScale"
    )
    scope_drag_scale_end = script_sources["./public/node-graph-module-scopes.js"].index(
        "function beginNodeGraphScopeNumberDrag", scope_drag_scale_start
    )
    scope_drag_scale_source = script_sources["./public/node-graph-module-scopes.js"][
        scope_drag_scale_start:scope_drag_scale_end
    ]
    require(
        'input.dataset.globalScopeInput === "framesPerSecond"' in scope_drag_scale_source
        and "return (step / 10) * multiplier;" in scope_drag_scale_source,
        "header FPS drag should move one declared step per ten pixels",
    )
    require(
        "function commitNodeGraphHeaderNumberInput(input)" in header_scope_source
        and "input.readOnly = true;" in header_scope_source
        and "input.addEventListener(\"change\", () => commitNodeGraphHeaderNumberInput(input))" in header_scope_source
        and "input.addEventListener(\"blur\", () => commitNodeGraphHeaderNumberInput(input))" in header_scope_source,
        "header number fields should relock after text edit",
    )
    timing_input_start = header_scope_source.index("function createNodeGraphHeaderTimingInput")
    timing_input_end = header_scope_source.index("function createNodeGraphTapTempoButton", timing_input_start)
    timing_input_source = header_scope_source[timing_input_start:timing_input_end]
    require(
        'field.dataset.headerNumberDrag = "true";' in timing_input_source
        and 'input.dataset.globalScopeNumberDrag = "true";' in timing_input_source
        and 'input.addEventListener("dblclick", beginNodeGraphScopeNumberEdit)' in header_scope_source,
        "header BPM/Beats/Unit fields should be drag-adjustable and double-click editable",
    )
    require(
        "if (input.dataset.timingField && input.readOnly)" in header_scope_source
        and "event.preventDefault();" in header_scope_source
        and ".node-header-timing-input[data-timing-field][readonly]" in style_source
        and "caret-color: transparent;" in style_source,
        "header BPM/Beats/Unit fields should not text-select or focus until double-click edit",
    )
    require(
        "if (input.dataset.timingField)" in scope_drag_scale_source
        and "return (step / 10) * multiplier;" in scope_drag_scale_source,
        "header BPM/Beats/Unit drag should move one declared step per ten pixels",
    )
    require(
        "const headerField = drag.input.closest(\".node-header-timing-field\")" in script_sources["./public/node-graph-module-scopes.js"]
        and "drag.input.readOnly = Boolean(headerField)" in script_sources["./public/node-graph-module-scopes.js"],
        "header number drag should relock inputs after pointer drag",
    )

    for function_name in [
        "setNodeGraphModuleScopeFramesPerSecond",
        "setNodeGraphModuleScopeBackgroundColor",
        "refreshNodeGraphModuleScopeGeneratedDot",
    ]:
        start = node_graph_source.find(f"function {function_name}")
        require(start >= 0, f"node graph source missing {function_name}")
        next_function = node_graph_source.find("\nfunction ", start + 1)
        body = node_graph_source[start: next_function if next_function >= 0 else len(node_graph_source)]
        require(
            "clearNodeGraphModuleScopeCanvas" not in body,
            f"{function_name} should update scope settings without clearing phosphor canvas",
        )
        if function_name == "setNodeGraphModuleScopeFramesPerSecond":
            require(
                "resetNodeGraphModuleScopeFrameClocks" not in body,
                "changing oscilloscope FPS should not reset model frame clocks or signal phase",
            )

    require(
        "nodeGraphCycleOption" not in node_graph_source
        and "nodeGraphModuleScopeTimeOptions" not in node_graph_source
        and "nodeGraphModuleScopeGainOptions" not in node_graph_source,
        "module scope time/gain settings should use typed numeric fields rather than cycle buttons",
    )

    require(
        "actionRow.append(createNodeGraphHeaderTimingWidgets())" not in node_graph_source,
        "patch timing controls should live in the modular header, not every module header",
    )

    require(
        "timeMs: value * 1000" not in node_graph_source
        and 'data-scope-input="time"' not in index_source
        and "<span>sec</span>" not in index_source,
        "module scope horizontal setting should be typed as detected cycles, not seconds",
    )

    require(
        "time * frequency" not in node_graph_source,
        "oscillator model scopes should advance from stored phasors, not wall-time frequency products",
    )

    require(
        'const sweepCycles = settings.oscillatorTraceMode === "window" ? visibleCycles : 1' not in node_graph_source,
        "oscillator frequency-reset scope should sweep the same cycle count it draws",
    )

    require(
        "function nodeGraphModuleScopeOfflineOscillatorBuffer" not in node_graph_source,
        "oscillator displays should use captured typed trace buffers, not old offline generated buffers",
    )

    require(
        "const startTime = time" in node_graph_source and "buffer[index] = inputBuffer[index]" in node_graph_source,
        "gain module scope should draw the realtime input signal",
    )

    require(
        'output: {\n    displayType: "trace"' in module_definitions_source
        and "function nodeGraphModuleScopeOfflineOutputAnalyzerBuffer(slot)" not in node_graph_source
        and "function nodeGraphModuleScopeShouldPreferOfflineOutputAnalyzer(slot, buffer)" not in node_graph_source
        and "function nodeGraphModuleScopeCapturedOutputAnalyzerBuffer(slot, capturedBuffer = null)" not in node_graph_source
        and "const capturedAnalyzer = nodeGraphModuleScopeCapturedOutputAnalyzerBuffer(slot, capturedBuffer)" not in node_graph_source,
        "output module scope should use the typed 1D Trace display path and no output-specific analyzer",
    )
    require(
        "outputTraceMode" not in node_graph_source
        and "nodeSceneScopeOutputTraceMode" not in index_source
        and "nodeGraphScopeClassicOutputDecay" not in node_graph_source,
        "old output oscilloscope scroll/decay controls should be removed",
    )

    gain_scope_source = node_graph_source[
        node_graph_source.find("function nodeGraphModuleScopeOfflineGainAnalyzerBuffer"):
        node_graph_source.find("function nodeGraphModuleScopeOutputInputConnections")
    ]
    output_scope_source = ""
    require(
        "* 4" not in gain_scope_source and "* 4" not in output_scope_source,
        "gain and output scope cycles should use the requested cycle count directly",
    )
    require(
        "function nodeGraphModuleScopeApplyShaderDisplayMode" not in node_graph_source
        and "buffer.nodeGraphScopeDrawFullWindow = true" in node_graph_source
        and "buffer.nodeGraphScopeUseFullWindow = true" in node_graph_source,
        "typed trace display prep should replace the old shader display adapter",
    )

    require(
        "setNodeGraphNodeSelection([placement.nodeId])" not in node_graph_source,
        "placing a newly added module should not leave that module selected",
    )

    require(
        "monitored-port" in style_source
        and "--node-monitor-color" in style_source
        and "data-monitor-state" in node_graph_source,
        "monitored ports should have a visible indicator contract",
    )

    require(
        'data-wire-type="trace"' in index_source
        and 'data-wire-type="wire"' not in index_source,
        "wire actions should expose Trace but not unfinished Wire",
    )
    require(
        'trace: "trace",' in wire_actions_source
        and 'wire: "wire"' not in wire_actions_source
        and '"actions.wireType.wire"' not in node_graph_source,
        "production wire types should be limited to Cable and Trace",
    )

    choice_divider_helper_source = slider_readout_source[
        slider_readout_source.index("function nodeSliderChoiceDividerBackground"):
        slider_readout_source.index("function syncNodeSliderReadout")
    ]
    require(
        "Array.from({ length: Math.max(0, choices.length - 1)" in choice_divider_helper_source,
        "choice slider dividers should be generated only for internal choice boundaries",
    )
    require(
        "const selectedCellRects = cellRects" in slider_readout_source
        and "index === activeChoiceIndex" in slider_readout_source
        and "syncNodeSliderChoiceDebugSquares(readout, choices, true, Number(slider.value))" in slider_readout_source,
        "choice slider should draw only the selected choice cell",
    )
    require(
        "const debugCellStrokes = cellRects.map((cell, index) => {" in slider_readout_source
        and "node-choice-debug-cell-debug" in slider_readout_source,
        "choice slider debug mode should keep red cell boxes for every choice",
    )
    require(
        "const debugWalls = cellWallXs.map((wallX, index) => {" in slider_readout_source
        and "node-choice-debug-wall" in slider_readout_source
        and "...debugWalls" in slider_readout_source,
        "choice slider debug mode should draw the source wall positions",
    )
    require(
        "const engineSliderWallXs = [" in slider_readout_source
        and "node-choice-debug-slider-wall" in slider_readout_source
        and "...debugSliderWalls" in slider_readout_source,
        "choice slider debug mode should draw explicit slider wall positions",
    )
    require(
        'marker.setAttribute("class", "node-choice-debug-square node-choice-debug-cell node-choice-debug-cell-stroke")' in slider_readout_source
        and 'marker.setAttribute("x", cell.left.toFixed(3))' in slider_readout_source
        and 'marker.setAttribute("height", cell.height.toFixed(3))' in slider_readout_source
        and "zeroBorderOutset" not in slider_readout_source
        and "trailingStrokeOutset" not in slider_readout_source,
        "choice slider selected stroke should use the same cell rect as debug boxes",
    )
    require(
        "const segmentRects = nodeSliderChoiceCellRects(layerWidth, layerHeight, choices)" in slider_readout_source
        and "const cellWallXs = [" in slider_readout_source
        and "const cellRects = nodeSliderChoiceCellRectsFromWalls(" in slider_readout_source
        and "layerRect.top" in slider_readout_source
        and "...dividerLines.map((divider) => divider.x)" in slider_readout_source,
        "choice slider cells should derive from the painted divider walls",
    )
    require(
        "const strokeInset = 0.5;" in slider_readout_source
        and "const bottomExtensionPx = 2;" in slider_readout_source
        and "height - boundedEmptyPixelBorder - strokeInset - trailingPixelCorrection + bottomExtensionPx" in slider_readout_source
        and "const trailingPixelCorrection = boundedEmptyPixelBorder > 0 ? 1 : 0;" in slider_readout_source
        and "visualScale = 1" in slider_readout_source
        and "nodeSliderSnapStrokeCoordinate(" in slider_readout_source,
        "choice slider cell rect should account for SVG stroke painting outside the rect and extend two pixels at the bottom",
    )
    require(
        "nodeUiDevChoiceSlideEdgeBrightness" not in node_graph_source
        and "nodeUiDevChoiceSlideGlowLevel" not in node_graph_source
        and "nodeUiDevChoiceSlideColor" not in node_graph_source
        and "nodeUiDevChoiceSlideEdgeBrightness" not in index_source
        and "nodeUiDevChoiceSlideGlowLevel" not in index_source
        and "nodeUiDevChoiceSlideColor" not in index_source
        and "--node-choice-slide-color" not in style_source
        and "--node-choice-slide-edge-brightness" not in style_source
        and "--node-slider-fill-rgb: 127 199 217;" in style_source
        and "--node-slider-fill-alpha: 0.14;" in style_source
        and "background: rgb(var(--node-slider-fill-rgb) / var(--node-slider-fill-alpha));" in style_source
        and "fill: rgb(var(--node-slider-fill-rgb) / var(--node-slider-fill-alpha));" in style_source
        and ".node-slider-readout.choices-divided.value-hovering .node-choice-debug-cell-fill" in style_source,
        "choice slider slide element should inherit normal slider styling controls",
    )
    require(
        "((index + 1) / choices.length) * 100" in choice_divider_helper_source,
        "choice slider dividers should skip the leftmost and rightmost edges",
    )
    choice_divider_source = slider_readout_source[
        slider_readout_source.index("if (dividesChoices)"):
        slider_readout_source.index("syncNodeSliderPortalHandle(readout, slider, position, false);")
    ]
    require(
        'readout.style.removeProperty("--value-start")' in choice_divider_source,
        "choice slider should clear the numeric selected-handle start marker",
    )
    require(
        'readout.style.removeProperty("--value-end")' in choice_divider_source,
        "choice slider should clear the numeric selected-handle end marker",
    )
    require(
        'readout.style.setProperty("--value-start"' not in choice_divider_source,
        "choice slider should not draw a selected choice start marker",
    )
    require(
        'readout.style.setProperty("--value-end"' not in choice_divider_source,
        "choice slider should not draw a selected choice end marker",
    )
    require(
        "--choice-divider-width" not in slider_readout_source,
        "choice slider should not use edge-prone repeating divider widths",
    )

    choice_divider_style = style_source[
        style_source.index(".node-slider-readout.choices-divided {"):
        style_source.index(".node-slider-readout.choices-divided::before")
    ]
    require(
        "repeating-linear-gradient" not in choice_divider_style,
        "choice slider should not use a repeating gradient that paints the outer edge",
    )
    require(
        "var(--choice-divider-background, none)" in choice_divider_style,
        "choice slider should draw only explicit internal divider layers",
    )
    choice_selected_marker_start = style_source.index("\n.node-slider-readout.choices-divided::before")
    choice_selected_marker_style = style_source[
        choice_selected_marker_start:
        style_source.index("\n.node-slider-readout-label", choice_selected_marker_start)
    ]
    require(
        "display: none;" in choice_selected_marker_style,
        "choice slider selected marker should not draw an extra rectangle stroke",
    )

    action_menu_source = node_graph_source[
        node_graph_source.index("function openNodeModuleActionMenu(event)"):
        node_graph_source.index("function openNodeSceneContextMenu(event)")
    ]
    require(
        "setNodeGraphNodeSelection" not in action_menu_source,
        "module action button should not change module selection",
    )

    require(
        "Math.max(68" not in app_source,
        "node graph wire path should not enforce the old 68px minimum span",
    )

    require(
        "feedback cycle unsupported at" not in app_source,
        "node graph scheduler should allow feedback cycles as state reads",
    )

    require(
        "if (!menu.hidden && !menu.contains(event.target))" not in app_source,
        "node scene context menu should close by explicit Close button, not outside click",
    )
    require(
        'event.key === "Escape" && !document.getElementById("nodeSceneContextMenu").hidden' not in app_source,
        "node scene context menu should not close from Escape",
    )
    require(
        'closeNodeSceneContextMenu();' not in script_sources["./public/node-graph-scene-menu-event-bindings.js"],
        "node scene window launchers should not hide the right click menu",
    )
    require(
        "nodeSavedPatchesRefreshButton" not in index_source
        and "nodeSavedPatchesRefreshButton" not in script_sources["./public/node-graph-header-event-bindings.js"],
        "patch explorer controls should use Bank and Fit space, not a refresh button",
    )
    metadata_editor_source = script_sources["./public/node-graph-metadata-editor.js"]
    for forbidden_preview_toggle in (
        "data-preview-toggle",
        "metadataScriptPreviewExpanded",
        "toggleNodeMetadataScriptPreviewExpanded",
        "resetNodeMetadataScriptPreviewExpanded",
        "Show all metadata script preview rows",
        "show compact",
    ):
        require(
            forbidden_preview_toggle not in metadata_editor_source,
            f"metadata script preview should not restore show more/show less row: {forbidden_preview_toggle}",
        )
    require(
        ".metadata-script-preview li.more" not in style_source,
        "metadata script preview should not style a fake more/less row",
    )
    require(
        "adjustNodeGraphModuleHeightFromContext" not in script_sources["./public/node-graph-module-actions.js"]
        and "adjustNodeGraphModuleHeightFromContext" not in script_sources["./public/node-graph-scene-menu-event-bindings.js"]
        and "heightOffsetGu" not in script_sources["./public/node-graph-module-sizing.js"]
        and "heightOffsetGu" not in script_sources["./public/node-graph-patch-core.js"]
        and "heightOffsetGu" not in script_sources["./public/node-graph-keyboard-shortcuts.js"]
        and "text box height invalid" not in script_sources["./public/node-graph-patch-core.js"],
        "manual module height resizing should be removed; module height should come from visible content widgets",
    )
    sizing_source = script_sources["./public/node-graph-module-sizing.js"]
    patch_core_source = script_sources["./public/node-graph-patch-core.js"]
    module_actions_source = script_sources["./public/node-graph-module-actions.js"]
    keyboard_shortcuts_source = script_sources["./public/node-graph-keyboard-shortcuts.js"]
    context_menu_source = script_sources["./public/node-graph-context-menu.js"]

    text_box_height_contracts = {
        "capability helper defines Text Box as the only top-level module-height owner": (
            sizing_source,
            (
                "function nodeGraphModuleSizingCapabilities(type)",
                "moduleHeight = nodeGraphNodeTypeHasTextBoxLayout(normalizedType)",
                '? "textBox"',
                ': normalizedType === "canvas"',
                '? "canvasScript"',
                "displayHeight = nodeGraphModuleTypeHasHideableOscilloscope(normalizedType)",
                "keyboardHeight: Boolean(moduleHeight || displayHeight)",
            ),
        ),
        "patch normalization preserves heightGu only for height-capable Text Box nodes": (
            patch_core_source,
            (
                "const sizingCapabilities = nodeGraphModuleSizingCapabilities(type);",
                'const hasCustomWidth = sizingCapabilities.width && Object.hasOwn(node, "widthGu");',
                'const hasCustomModuleHeight = sizingCapabilities.moduleHeight === "textBox" && Object.hasOwn(node, "heightGu");',
                "const heightGu = hasCustomModuleHeight ? normalizeNodeGraphTextBoxHeightUnits(node.heightGu) : null;",
                "normalizeNodeGraphTextBoxHeightUnits(node.heightGu)",
                '...(hasCustomModuleHeight ? { heightGu } : {}),',
            ),
        ),
        "render sizing reads Text Box heightGu before falling back to content height": (
            sizing_source,
            (
                "function nodeGraphPatchNodeGridHeightUnits(node)",
                "if (nodeGraphNodeTypeHasTextBoxLayout(node?.type) && Number.isFinite(Number(node.heightGu))) {",
                "return normalizeNodeGraphTextBoxHeightUnits(node.heightGu);",
                "const autoHeightGu = nodeGraphModuleGridHeightUnitsForUi(node?.type, node?.ui);",
            ),
        ),
        "Module Settings Text Box height buttons use the same capability gate as keyboard resizing": (
            module_actions_source + "\n" + context_menu_source,
            (
                "function adjustNodeGraphTextBoxHeightFromContext(delta)",
                'nodeGraphModuleSizingCapabilities(sourceNode.type).moduleHeight !== "textBox"',
                'nodeGraphModuleSizingCapabilities(targetNode.type).moduleHeight !== "textBox"',
                "controls: textBoxHeightControls,",
                "hidden: !(moduleMode && !multiModuleMode && targetSupportsTextBoxHeight),",
            ),
        ),
        "Shift+Up/Down routes through capability-based height resizing": (
            keyboard_shortcuts_source,
            (
                "function resizeNodeGraphHeightAdjustableModuleOnGrid(patchNode, delta)",
                "const capabilities = nodeGraphModuleSizingCapabilities(patchNode?.type);",
                'if (capabilities.moduleHeight === "textBox") {',
                "return resizeNodeGraphTextBoxModuleHeightOnGrid(patchNode, delta);",
                "if (capabilities.displayHeight) {",
                "return resizeNodeGraphDisplayModuleHeightOnGrid(patchNode, delta);",
                'ArrowDown: ["height", 1]',
                'ArrowUp: ["height", -1]',
            ),
        ),
    }
    for label, (source, snippets) in text_box_height_contracts.items():
        require(
            all(snippet in source for snippet in snippets),
            f"Text Box height sizing contract failed: {label}",
        )
    require(
        "normalizeNodeGraphModuleHeightUnits(type, node.heightGu)" not in patch_core_source
        and "module height invalid" not in patch_core_source
        and "Text Box heightGu invalid" in patch_core_source,
        "patch normalization should not keep obsolete generic module height branches",
    )
    require(
        all(snippet in sizing_source for snippet in text_box_height_contracts["capability helper defines Text Box as the only top-level module-height owner"][1]),
        "module sizing capabilities should declare width, module height, display height, and keyboard height support",
    )
    require(
        "nodeSceneTextBoxHeightControls" in index_source
        and "nodeSceneTextBoxHeightLabel" in index_source
        and "nodeSceneTextBoxHeightDecrease" in index_source
        and "nodeSceneTextBoxHeightIncrease" in index_source
        and "function adjustNodeGraphTextBoxHeightFromContext(delta)" in module_actions_source
        and 'bindNodeGraphSceneElementEvent("nodeSceneTextBoxHeightDecrease", "click", () =>' in script_sources["./public/node-graph-scene-menu-event-bindings.js"]
        and 'bindNodeGraphSceneElementEvent("nodeSceneTextBoxHeightIncrease", "click", () =>' in script_sources["./public/node-graph-scene-menu-event-bindings.js"]
        and "adjustNodeGraphTextBoxHeightFromContext(-1));" in script_sources["./public/node-graph-scene-menu-event-bindings.js"]
        and "adjustNodeGraphTextBoxHeightFromContext(1));" in script_sources["./public/node-graph-scene-menu-event-bindings.js"]
        and 'const targetSupportsTextBoxHeight = targetSizingCapabilities.moduleHeight === "textBox";' in context_menu_source
        and "hidden: !(moduleMode && !multiModuleMode && targetSupportsTextBoxHeight)," in context_menu_source
        and all(snippet in patch_core_source for snippet in text_box_height_contracts["patch normalization preserves heightGu only for height-capable Text Box nodes"][1])
        and all(snippet in sizing_source for snippet in text_box_height_contracts["render sizing reads Text Box heightGu before falling back to content height"][1]),
        "Text Box should keep a dedicated GU height control and preserve heightGu through patch normalization",
    )
    require(
        "function normalizeNodeGraphTextBoxHeightUnits(heightGu)" in sizing_source
        and "nodeGraphTextBoxHeightLimits.minGu" in sizing_source
        and "nodeGraphTextBoxHeightLimits.maxGu" in sizing_source
        and 'return normalizeNodeGraphModuleHeightUnits("textBox", heightGu);' not in sizing_source,
        "Text Box explicit height should use Text Box limits instead of being clamped to automatic content height",
    )
    require(
        index_source.index('id="nodeSceneAliasControl"') < index_source.index('id="nodeSceneAddToGroup"')
        and "nodeSceneWidthLabel" in index_source
        and "nodeSceneTextBoxHeightLabel" in index_source
        and "function configureNodeGraphModuleSettingsSizeRow({" in context_menu_source
        and "function resetNodeGraphModuleSettingsSizeRow(controls, decreaseButton, increaseButton, valueElement)" in context_menu_source
        and "controls: widthControls," in context_menu_source
        and "controls: textBoxTextSizeControls," in context_menu_source
        and "controls: textBoxHeightControls," in context_menu_source
        and "controls: displayHeightControls," in context_menu_source
        and ".scene-context-width-controls .scene-context-gu-label" in style_source,
        "module settings should show Alias before Add to group and configure GU adjustment rows through the shared size-row helper",
    )
    require(
        'target.closest("#nodeGraphWorkspace, #nodeSceneContextMenu, #nodeModuleActionsWindow, #nodeScopeContextMenu, #nodeGlobalScopeMenu, #nodeParameterMetadataPopover")'
        in script_sources["./public/node-graph-selection.js"],
        "clicking inside Module Settings should not clear the current module selection",
    )
    require(
        "function resizeNodeGraphTextBoxModuleHeightOnGrid(patchNode, delta)" in keyboard_shortcuts_source
        and "function resizeNodeGraphDisplayModuleHeightOnGrid(patchNode, delta)" in keyboard_shortcuts_source
        and "function resizeNodeGraphWidthAdjustableModuleOnGrid(patchNode, delta)" in keyboard_shortcuts_source
        and all(snippet in keyboard_shortcuts_source for snippet in text_box_height_contracts["Shift+Up/Down routes through capability-based height resizing"][1])
        and "if (!capabilities.width) {" in keyboard_shortcuts_source,
        "Shift+Arrow resizing should route through module sizing capabilities",
    )
    require(
        "nodeSceneDisplayHeightControls" in index_source
        and "function adjustNodeGraphModuleDisplayHeightFromContext(delta)" in script_sources["./public/node-graph-module-actions.js"]
        and "delta * nodeGraphModuleDisplayHeightLimits.stepGu" in script_sources["./public/node-graph-module-actions.js"]
        and "ui.displayHeightOffsetGu = nextOffsetGu;" in script_sources["./public/node-graph-module-actions.js"]
        and 'bindNodeGraphSceneElementEvent("nodeSceneDisplayHeightDecrease", "click", () => adjustNodeGraphModuleDisplayHeightFromContext(-1));' in script_sources["./public/node-graph-scene-menu-event-bindings.js"]
        and 'bindNodeGraphSceneElementEvent("nodeSceneDisplayHeightIncrease", "click", () => adjustNodeGraphModuleDisplayHeightFromContext(1));' in script_sources["./public/node-graph-scene-menu-event-bindings.js"]
        and "const targetSupportsDisplayHeight = targetSizingCapabilities.displayHeight;" in script_sources["./public/node-graph-context-menu.js"]
        and "hidden: !(moduleMode && !multiModuleMode && targetSupportsDisplayHeight)," in script_sources["./public/node-graph-context-menu.js"]
        and "displayHeightGu <= nodeGraphModuleDisplayHeightLimits.minGu" in script_sources["./public/node-graph-context-menu.js"]
        and "displayHeightGu >= nodeGraphModuleDisplayHeightLimits.maxGu" in script_sources["./public/node-graph-context-menu.js"]
        and "value: `${displayHeightGu} gu`," in script_sources["./public/node-graph-context-menu.js"]
        and "nodeSceneDisplayHeightLabel" in index_source,
        "module actions should adjust display height without restoring arbitrary module height controls",
    )
    ui_view_source = script_sources["./public/node-graph-ui-view.js"]
    patch_normalizers_source = script_sources["./public/node-graph-patch-normalizers.js"]
    require(
        "Math.max(180, Math.min(720" not in ui_view_source
        and "Math.max(120, Math.min(420" not in ui_view_source
        and "clampNodeGraphUiItemSize({" in ui_view_source,
        "UI item live resize should use named limits instead of stricter hardcoded drag clamps",
    )
    require(
        "const nodeGraphPatchUiItemSizeLimits = Object.freeze" in patch_normalizers_source
        and "const nodeGraphUiItemSizeLimits = Object.freeze" not in ui_view_source
        and "nodeGraphPatchUiItemSizeLimits" in ui_view_source,
        "UI item resize limits should live in patch normalizers and be reused by live dragging",
    )
    workspace_view_source = script_sources["./public/node-graph-workspace-view.js"]
    require(
        "drag.startWidthGu + Math.round((event.clientX - drag.startClientX) / resizeGridWidth) * 2" not in workspace_view_source
        and "function nodeGraphWorkspaceResizeDeltaGu(pixelDelta, gridSize, stepGu = 1)" in workspace_view_source,
        "workspace resize step policy should be named instead of buried in pointer math",
    )
    floating_window_helper_source = script_sources["./public/node-graph-floating-windows.js"]
    for snippet in (
        "function normalizeNodeGraphFloatingWindowSize(size = {}, defaults = {})",
        "configuredMaxWidth",
        "configuredMaxHeight",
        "function applyNodeGraphFloatingWindowSizeVars(element, cssPrefix, defaults = {}, normalized = {})",
        "function beginNodeGraphFloatingWindowDrag(event, element, stateKey)",
        "function dragNodeGraphFloatingWindow(event, stateKey, element, onMove = null)",
        "function endNodeGraphFloatingWindowDrag(event, stateKey, onEnd = null)",
        "function nodeGraphFloatingWindowElementPosition(element)",
        "function moveNodeGraphFloatingWindowElement(element, left, top)",
        "function nodeGraphFloatingWindowLocked(element)",
        "function toggleNodeGraphFloatingWindowLock(event)",
        'handle.addEventListener("dblclick", toggleNodeGraphFloatingWindowLock)',
        "function applyNodeGraphFloatingWindowLockedState(element, locked)",
        "startClientX: event.clientX",
        "lastClientX: event.clientX",
        "startLeft: current.left",
        "drag.startLeft + event.clientX - drag.startClientX",
        "if (nodeGraphFloatingWindowLocked(element))",
        "if (nodeGraphFloatingWindowLocked(target.element))",
        "function rebaseNodeGraphFloatingWindowDrag(target, next)",
        "function beginNodeGraphFloatingWindowResize(event, element, stateKey)",
        "function dragNodeGraphFloatingWindowResize(event, stateKey, applySize, axes = {})",
        "function endNodeGraphFloatingWindowResize(event, stateKey, onEnd = null)",
        "function nodeGraphFloatingWindowKeyboardTargets()",
        'resizingKey: "sceneContextResizing"',
        'resizingKey: "moduleActionResizing"',
        'resizingKey: "moduleShopResizing"',
        'resizingKey: "savedPatchesWindowResizing"',
        'resizingKey: "visibilityMenuResizing"',
        'resizingKey: "metadataResizing"',
        'resizingKey: "traceDisplaySettingsResizing"',
        "return { ...config, drag: resizeDrag, element, keyboardMode: \"resize\" }",
        "const nodeGraphFloatingWindowHeldArrowKeys = new Set()",
        "const nodeGraphFloatingWindowKeyboardStepMs = 135",
        "const nodeGraphFloatingWindowKeyboardState = {",
        "lastStepMs: 0",
        "function nodeGraphFloatingWindowHeldArrowDelta()",
        "function stepNodeGraphFloatingWindowKeyboardLoop(nowMs = 0)",
        "nowMs - nodeGraphFloatingWindowKeyboardState.lastStepMs >= nodeGraphFloatingWindowKeyboardStepMs",
        "window.requestAnimationFrame(",
        "function nodeGraphFloatingWindowKeyboardEventIsEditable(event)",
        "active?.closest?.(\"input, textarea, select, [contenteditable='true']\")",
        "function handleNodeGraphFloatingWindowKeyboardNudge(event)",
        "if (nodeGraphFloatingWindowKeyboardEventIsEditable(event))",
        "nodeGraphFloatingWindowHeldArrowKeys.add(event.key)",
        "nodeGraphFloatingWindowKeyboardState.shiftKey = Boolean(event.shiftKey)",
        "function handleNodeGraphFloatingWindowKeyboardRelease(event)",
        'draggingKey: "sceneContextDragging"',
        "sizeAxes: { width: true, height: false }",
        "target.keyboardMode === \"resize\" || nodeGraphFloatingWindowKeyboardState.shiftKey",
        "resizeNodeGraphFloatingWindowByKeyboard(target, delta.dw, delta.dh)",
        "nudgeNodeGraphFloatingWindowByKeyboard(target, delta.dx, delta.dy)",
        "{ status: false }",
    ):
        require(snippet in floating_window_helper_source, f"shared floating window helper missing {snippet}")
    require(
        "applyNodeGraphFloatingWindowLockedState(element, locked);" in script_sources["./public/node-graph-ui-settings-persistence.js"]
        and "locked: Boolean(patch.locked)" in script_sources["./public/node-graph-ui-settings-persistence.js"],
        "floating window locked state should persist through workspace ui settings",
    )
    require(
        'document.addEventListener("keyup", handleNodeGraphFloatingWindowKeyboardRelease, true)' in script_sources["./public/node-graph-event-bindings.js"],
        "floating window keyboard nudge should release held arrow keys on keyup",
    )
    require(
        index_source.index("./public/node-graph-floating-windows.js") <
        index_source.index("./public/node-graph-file-actions.js") <
        index_source.index("./public/node-graph-module-store.js"),
        "shared floating window helper should load before floating window consumers",
    )
    for path, state_key in (
        ("./public/node-graph-context-menu.js", "sceneContextDragging"),
        ("./public/node-graph-context-menu.js", "moduleActionDragging"),
        ("./public/node-graph-context-menu.js", "globalScopeDragging"),
        ("./public/node-graph-file-actions.js", "savedPatchesWindowDragging"),
        ("./public/node-graph-metadata-editor.js", "metadataDragging"),
        ("./public/node-graph-module-store.js", "moduleShopDragging"),
        ("./public/node-graph-view-controls.js", "visibilityMenuDragging"),
    ):
        require(
            f'beginNodeGraphFloatingWindowDrag(event,' in script_sources[path]
            and f'"{state_key}"' in script_sources[path],
            f"{state_key} should use shared stable floating-window drag helper",
        )
    for path in (
        "./public/node-graph-floating-windows.js",
        "./public/node-graph-context-menu.js",
        "./public/node-graph-file-actions.js",
        "./public/node-graph-metadata-editor.js",
        "./public/node-graph-ui-settings-panels.js",
        "./public/node-graph-view-controls.js",
        "./public/node-graph-canvas-script.js",
        "./public/node-graph-shader-script.js",
    ):
        floating_window_source = script_sources[path]
        for forbidden_margin in ("const margin = 8;", "const margin = 10;", "const margin = 12;"):
            require(
                forbidden_margin not in floating_window_source,
                f"floating window edge clamp should not restore arbitrary padding in {path}",
            )
        for forbidden_clamp in (
            "window.innerWidth - rect.width",
            "window.innerHeight - rect.height",
            "window.innerWidth - panelRect.width",
            "window.innerHeight - panelRect.height",
        ):
            require(
                forbidden_clamp not in floating_window_source,
                f"floating window drag should not clamp the whole window inside the viewport in {path}",
            )

    require(
        "scopeElement.classList.add(\"view-dragging\");\n  closeNodeScopeContextMenu();" not in node_graph_source,
        "oscilloscope context menu should not close when clicking or dragging outside it",
    )

    scope_number_drag_source = node_graph_source[
        node_graph_source.find("function beginNodeGraphScopeNumberDrag(event)"):
        node_graph_source.find("function beginNodeGraphScopeNumberEdit(event)")
    ]
    require(
        "function beginNodeGraphScopeNumberDrag(event)" in scope_number_drag_source
        and "document.body.classList.add(\"node-slider-dragging\")" not in scope_number_drag_source
        and "updateNodeSliderDotCursor(event)" not in scope_number_drag_source
        and "clearNodeSliderDotCursor()" not in scope_number_drag_source,
        "oscilloscope number dragging should not hide or replace the mouse cursor",
    )

    require(
        ".scene-context-scope-fields input {\n  box-sizing: border-box;" in style_source
        and ".scene-context-scope-fields input.value-dragging {\n  border-color:" in style_source
        and "cursor: ew-resize" not in style_source[
            style_source.find(".scene-context-scope-fields input {"):
            style_source.find(".scene-context-text-box-text-control,")
        ],
        "oscilloscope controls should not set a custom resize cursor",
    )

    require(
        ".node-slider-readout {" in style_source
        and ".node-graph-workspace .node-slider-readout" not in style_source
        and "cursor: ew-resize" not in style_source[
            style_source.find(".node-slider-readout {"):
            style_source.find(".node-slider-readout:hover,")
        ],
        "modular sliders should not set a custom resize cursor on hover",
    )

    require(
        "body.node-hide-mouse-while-dragging,\nbody.node-hide-mouse-while-dragging * {\n  cursor: none !important;\n}" in style_source
        and "body.node-slider-dragging.node-hide-mouse-while-dragging::after" in style_source
        and style_source.count("cursor: none !important;") == 1
        and style_source.count("cursor: ew-resize;") == 1
        and "style.cursor" not in shader_script_source
        and "cursor:" not in color_widget_source,
        "sandbox cursor policy should only hide the cursor through the drag setting and explicit resize grips",
    )

    require(
        "--node-dot-cursor:" in style_source
        and "line-height: 1;\n  cursor: var(--node-dot-cursor);\n  user-select: none;" in style_source
        and "text-indent: -999px;\n  cursor: var(--node-dot-cursor);\n  border-color:" in style_source
        and "padding: 0;\n  cursor: var(--node-dot-cursor);\n  border: 0;" in style_source
        and ".node-io-row:hover,\n.node-io-row.patch-point-hover {\n  cursor: var(--node-dot-cursor);" in style_source
        and ".node-header-timing-field[data-header-number-drag=\"true\"] {\n  cursor: var(--node-dot-cursor);" in style_source
        and ".node-header-timing-input[data-timing-field][readonly] {\n  cursor: var(--node-dot-cursor);" in style_source
        and "input[data-global-scope-number-drag=\"true\"][readonly]" in style_source
        and ".node-trace-display-settings-popover input[data-trace-display-field][readonly]" in style_source,
        "ports and draggable number controls should use the shared dot cursor on hover",
    )

    require(
        "--node-move-cursor: move;" in style_source
        and ".node-drag-handle {\n  font-size: clamp(1rem, calc(var(--node-header-height) * var(--node-move-symbol-size-ratio, 0.6) * 0.47), 2rem);\n  cursor: var(--node-move-cursor);" in style_source
        and "font-weight: 700;\n  line-height: 1;\n  cursor: var(--node-move-cursor);" in style_source
        and "font-size: calc(var(--node-move-symbol-size-ratio, 0.6) * 1.44rem);\n  line-height: 1;\n  cursor: var(--node-move-cursor);" in style_source
        and ".node-user-ui-settings-drag-handle" in style_source
        and ".metadata-popover-corner-drag" in style_source
        and "touch-action: none;\n  cursor: var(--node-move-cursor);\n  user-select: none;" in style_source,
        "window and module move handles should use the shared move cursor",
    )

    require(
        ".node-graph-workspace:not(.module-scopes-enabled):not(.module-oscilloscopes-hidden) .node-module-scope-window-surface" not in style_source,
        "paused oscilloscopes should not switch to a special powered-off screen style",
    )

    scope_draw_source = node_graph_source[
        node_graph_source.index("function drawNodeGraphModuleScopes()"):
        node_graph_source.index("function scheduleNodeGraphModuleScopeDraw()")
    ]
    require(
        'setNodeGraphModuleScopeDebugPhase("clear-current-frame")' in scope_draw_source
        and "gl.bindFramebuffer(gl.FRAMEBUFFER, null)" in scope_draw_source
        and "gl.clearColor(0, 0, 0, 0)" in scope_draw_source
        and "gl.clear(gl.COLOR_BUFFER_BIT)" in scope_draw_source,
        "module scope draw should clear the visible canvas before drawing the current frame",
    )
    require(
        "drawNodeGraphModuleScopePhosphorFade(" not in scope_draw_source
        and "compositeNodeGraphModuleScopePhosphor(" not in scope_draw_source
        and "phosphorTargets[renderer.phosphorReadIndex]" not in scope_draw_source,
        "module scope draw should not preserve or composite phosphor history",
    )
    require(
        "if (!scopePaused && nodeGraphModuleScopeTraceDisplayFrameUnchanged(visibleItems))" in scope_draw_source,
        "paused trace displays should redraw frozen frames so they stay clipped to their current module screen",
    )

    clear_scope_source = node_graph_source[
        node_graph_source.index("function clearNodeGraphModuleScopeBuffers("):
        node_graph_source.index("function clearNodeGraphRenderedModuleScopeBuffers()")
    ]
    require(
        "window.cancelAnimationFrame(nodeGraphModuleScopeState.drawFrame);" in clear_scope_source
        and "nodeGraphModuleScopeState.drawFrame = 0;" in clear_scope_source,
        "clearing module scope buffers should cancel any pending scope draw frame",
    )
    require(
        "window.clearTimeout(nodeGraphModuleScopeState.drawFrameWatchdog);" in clear_scope_source
        and "window.clearInterval(nodeGraphModuleScopeState.drawFrameHeartbeat);" in clear_scope_source,
        "clearing module scope buffers should clear scope draw watchdog and heartbeat timers",
    )
    require(
        "const preserveDisplay = options?.preserveDisplay === true;" in clear_scope_source
        and "const preserveBuffers = options?.preserveBuffers === true;" in clear_scope_source
        and "if (!preserveBuffers) {" in clear_scope_source
        and "if (!preserveDisplay) {" in clear_scope_source,
        "live audio stop should be able to pause scopes without erasing display or sampled scope buffers",
    )

    require(
        "nodeGraphMvp.moduleOscilloscopesVisible === false) {\n    setNodeGraphModuleScopesEnabled(false)" not in node_graph_source
        and "typeof clearNodeGraphModuleScopeCanvas === \"function\") {\n      clearNodeGraphModuleScopeCanvas();" not in node_graph_source,
        "hiding oscilloscopes should pause drawing rather than clearing or changing the screen",
    )
    require(
        "function nodeGraphModuleScopeSlotDisplayVisible(slot)" in node_graph_source
        and "if (nodeGraphMvp?.moduleOscilloscopesVisible === false) {\n    return false;\n  }" in node_graph_source
        and "function nodeGraphVisibleModuleScopeSlots()" in node_graph_source
        and ".filter(nodeGraphModuleScopeSlotIsDrawable)" in node_graph_source
        and "if (!nodeGraphModuleScopeHasDrawableSlots())" in node_graph_source,
        "display testbed scopes should share the global/local display visibility gate",
    )

    require(
        "route: plan.order" not in app_source,
        "node graph validation should expose schedule order, not stale route aliases",
    )

    for snippet in [
        "nodeHoverTooltip",
        "node-hover-tooltip",
        "nodeHoverTooltipText",
        "nodeHoverTooltipMouseHint",
        "handleNodeHoverTooltip",
        "attachNodeHoverTooltipTarget",
        'addEventListener("mouseout"',
    ]:
        require(snippet not in app_source, f"node graph obsolete interaction code should be absent: {snippet}")

    for snippet in [
        "element.title = text",
        "dataset.tooltipTitle",
        "tooltipTitle",
        "title !== false",
    ]:
        require(snippet not in tooltip_utils_source, f"native hover tooltip path should be absent: {snippet}")

    for snippet in [
        "nodeGraphFindWirePickup",
        "dropPickedWire",
        "function findPickup(",
        "function pickupFromCandidate(",
        "function removeWireFromPatch(",
        "pickup?.anchorEndpoint",
        "nodeGraphMvp.dragging?.pickup",
        "wire reconnected",
        "modulation reconnected",
        "Alt+drag moves this patch point",
        "Plain drag reroutes wires",
    ]:
        require(snippet not in app_source, f"wire pickup/reroute code should be absent: {snippet}")
        require(snippet not in node_graph_source, f"wire pickup/reroute helper should be absent: {snippet}")
        require(snippet not in tooltip_source, f"wire pickup/reroute tooltip should be absent: {snippet}")

    require(
        'node.addEventListener("pointerdown", beginNodeGraphNodeDrag)' not in app_source,
        "module body should not start node drag",
    )
    for snippet in [
        'item.addEventListener("click", () => setNodeGraphSelection({ type: "node", id: nodeId }))',
        'setNodeGraphSelection({ type: "node", id })',
    ]:
        require(snippet not in app_source, f"module selection should be limited to move handles or marquee, not {snippet}")

    require(
        ".node-slider-readout {\n  border-color: transparent;" in style_source,
        "parameter readout border should disappear when not hovered",
    )
    require(
        ".knob-widget-layout .node-knob-widget-control" in style_source
        and ".node-knob-widget-body" in style_source
        and ".node-knob-widget-face::after" in style_source
        and ".knob-widget-layout .dsp-node-header" in style_source
        and ".knob-widget-layout .node-header-actions" in style_source
        and ".knob-widget-layout .node-knob-widget-output" in style_source,
        "compact external knob widget style contract should be present",
    )
    require(
        "node-knob-widget-move" not in node_graph_source
        and "node-knob-widget-move" not in style_source,
        "compact knob should use its title strip as the move handle, not a plus button",
    )
    require(
        ".node-slider-readout:hover,\n.node-slider-readout:focus,\n.node-slider-readout:focus-visible,\n.node-slider-readout:active {\n  border-color: transparent;\n  box-shadow: none;\n  outline: none;" in style_source,
        "parameter readout button states should not inherit global button hover strokes",
    )
    require(
        ".node-slider-readout.value-hovering::before {\n  border-color: transparent;\n  box-shadow: none;\n  outline: none;" in style_source
        and ".node-slider-readout.value-dragging::before {\n  border-color: transparent;\n  box-shadow: none;\n  outline: none;" in style_source,
        "slider hover/drag fill should not change stroke highlight",
    )
    require(
        ".node-slider-readout.value-hovering::before {\n  border-color: transparent;\n  box-shadow: none;\n  outline: none;\n  background: rgb(var(--node-slider-fill-rgb) / var(--node-slider-fill-alpha));\n}" in style_source
        and ".node-slider-readout.value-dragging::before {\n  border-color: transparent;\n  box-shadow: none;\n  outline: none;\n  background: rgb(var(--node-slider-fill-rgb) / var(--node-slider-fill-alpha));\n}" in style_source,
        "slider hover/drag fill should keep the resting fill color",
    )
    require(
        ".node-slider-readout::before {\n  left: var(--value-start, calc(0% - 4px));\n  right: calc(100% - var(--value-end, calc(0% + 4px)));\n  border: 1px solid transparent;" in style_source,
        "slider fill slide element should not draw a stroke highlight",
    )
    require(
        ".node-slider-readout.value-hovering,\n.node-slider-readout.value-dragging {\n  border-color: transparent;\n  box-shadow: none;\n  outline: none;" in style_source,
        "slider hovering/dragging should not change readout stroke highlight",
    )
    require(
        ".node-slider-readout.choices-divided.value-hovering .node-choice-debug-cell-fill,\n.node-slider-readout.choices-divided.value-dragging .node-choice-debug-cell-fill {\n  fill: rgb(var(--node-slider-fill-rgb) / var(--node-slider-fill-alpha));\n}" in style_source,
        "choice slider hover/drag fill should keep the resting fill color",
    )
    require(
        "#nodeSnapGridViewButton.active {\n  border-color: transparent;" in style_source
        and "box-shadow: none;\n}" in style_source[
            style_source.index("#nodeSnapGridViewButton.active {"):
            style_source.index(".node-under-construction-view-button {")
        ],
        "active snap-to-grid button should not draw a stroke highlight",
    )
    require(
        ".node-graph-workspace.module-buttons-hidden .dsp-node,\n.node-graph-workspace.module-sliders-hidden .dsp-node:not(.text-box-layout)" not in style_source,
        "hiding module buttons globally should not switch modules to auto height",
    )
    require(
        ".dsp-node.filter-curve-layout.oscilloscope-hidden .node-filter-curve-display" in style_source
        and ".node-graph-workspace.module-oscilloscopes-hidden .dsp-node.filter-curve-layout,\n.dsp-node.filter-curve-layout.oscilloscope-hidden" in style_source
        and "grid-template-rows:\n    var(--node-header-height)\n    minmax(var(--node-io-section-min-height), auto)\n    auto;" in style_source
        and ".node-graph-workspace.module-oscilloscopes-hidden\n  .dsp-node:not(.canvas-node-layout):not(.visual-scope-layout):not(.trace-display-layout) {\n  --node-module-scope-height: 0px;" in style_source
        and ".node-graph-workspace.module-oscilloscopes-hidden .dsp-node:not(.text-box-layout):not(.image-node-layout):not(.canvas-node-layout):not(.visual-scope-layout):not(.trace-display-layout):not(.graph-node-layout):not(.filter-curve-layout):not(.slider-widget-layout):not(.knob-widget-layout):not(.sample-module-layout):not(.screen-space-shader-layout)" in style_source
        and "grid-template-rows:\n    var(--node-header-height)\n    minmax(var(--node-io-section-min-height), auto)\n    auto;" in style_source,
        "hiding displays globally should collapse only hideable display rows and keep normal modules on a no-display IO/body grid",
    )
    hideable_scope_source = script_sources["./public/node-graph-module-sizing.js"][
        script_sources["./public/node-graph-module-sizing.js"].index("function nodeGraphModuleTypeHasHideableOscilloscope"):
        script_sources["./public/node-graph-module-sizing.js"].index("function nodeGraphPatchNodeHasHideableOscilloscope")
    ]
    require(
        '"filterCurve"' not in hideable_scope_source,
        "filter curve modules should expose the show/hide display action",
    )
    require(
        "const structuralUiSignature = patchNodeUi.oscilloscopeHidden ? \"scope-hidden\" : \"scope-visible\";" in script_sources["./public/node-graph-patch-core.js"]
        and "element.dataset.structuralUiSignature !== structuralUiSignature" in script_sources["./public/node-graph-patch-core.js"]
        and "element.dataset.structuralUiSignature = structuralUiSignature;" in script_sources["./public/node-graph-patch-core.js"],
        "show/hide display should rebuild module body when its visual face was previously omitted",
    )
    state_read_style = style_source[
        style_source.index(".node-wire-path.state-read {"):
        style_source.index(".node-wire-path.state-read.selected {")
    ]
    require(
        "stroke-dasharray" not in state_read_style,
        "state-read feedback wires should be solid; only inactive wires should be dashed",
    )
    require(
        "function nodeGraphModuleDisplayVisibleForUi(type, ui = {})" in script_sources["./public/node-graph-module-sizing.js"]
        and 'nodeGraphMvp?.moduleOscilloscopesVisible === false' in script_sources["./public/node-graph-module-sizing.js"]
        and "return !nodeGraphEffectivePatchNodeUi(ui).oscilloscopeHidden;" in script_sources["./public/node-graph-module-sizing.js"]
        and '{ id: "curve", heightGu: nodeGraphModuleDisplayHeightUnits(type, ui) * 1.5, visible: displayVisible }' in script_sources["./public/node-graph-module-sizing.js"]
        and '{ id: "scope", heightGu: nodeGraphModuleDisplayHeightUnits(type, ui), visible: displayVisible }' in script_sources["./public/node-graph-module-sizing.js"],
        "module height should reserve display rows only when final display visibility is true",
    )
    require(
        "function nodeGraphModuleVisibleSliderRowCountForUi(type, ui = {})" in script_sources["./public/node-graph-module-sizing.js"]
        and "effectiveUi.slidersHidden" in script_sources["./public/node-graph-module-sizing.js"]
        and "4 + nodeGraphModuleVisibleSliderRowCountForUi(type, ui) * 1.25" not in script_sources["./public/node-graph-module-sizing.js"]
        and "const requiredGridUnits = nodeGraphModuleRequiredHeightUnitsForUi(type, ui);" not in script_sources["./public/node-graph-module-sizing.js"]
        and "return Math.ceil(nodeGraphModuleRequiredHeightUnitsForUi(type, ui));" in script_sources["./public/node-graph-module-sizing.js"],
        "module height should come from visible widget totals rather than a rough fallback",
    )
    require(
        "moduleInterfaceControlsVisible: true" in script_sources["./public/node-graph-state.js"]
        and "interfaceControlsHidden: Boolean(source.interfaceControlsHidden)" in script_sources["./public/node-graph-patch-clone.js"]
        and "function nodeGraphModuleInterfaceControlsVisibleForUi(type, ui = {})" in script_sources["./public/node-graph-module-sizing.js"]
        and "nodeGraphEffectivePatchNodeUi(ui).interfaceControlsHidden" in script_sources["./public/node-graph-module-sizing.js"]
        and 'id="nodeModuleInterfaceControlsToggleButton"' in index_source
        and 'id="nodeSceneToggleInterfaceControls"' in index_source
        and "function toggleNodeGraphModuleInterfaceControlsVisibility()" in script_sources["./public/node-graph-view-controls.js"]
        and "function toggleNodeGraphModuleInterfaceControlsFromContext()" in script_sources["./public/node-graph-module-actions.js"]
        and ".module-interface-controls-hidden .sample-module-layout .node-sample-module-body" in style_source
        and "moduleInterfaceControlsVisible" in script_sources["./public/node-graph-ui-settings-persistence.js"],
        "control surface visibility should exist globally and per module with height-aware hiding",
    )
    require(
        'nodeGraphRetiredNodeTypes = new Set(["formulaVisual", "moduleHome", "moduleShop"])' in script_sources["./public/node-graph-patch-core.js"]
        and "formulaVisual" not in script_sources["./public/node-graph-module-definitions.js"]
        and "formulaVisual" not in script_sources["./public/node-graph-module-store.js"]
        and "formulaVisual" not in script_sources["./public/node-graph-module-factories.js"]
        and "formulaVisual" not in script_sources["./public/node-graph-live-frame-evaluator.js"]
        and "formulaVisual" not in worklet_source,
        "formula visual should be retired while stale saved nodes are scrubbed",
    )
    require(
        "const modulations = Array.isArray(patch.modulations) ? patch.modulations.map((modulation) => {" not in script_sources["./public/node-graph-patch-core.js"]
        and "const modulations = (Array.isArray(patch.modulations) ? patch.modulations : [])\n    .flatMap((modulation) => {" in script_sources["./public/node-graph-patch-core.js"],
        "patch validation should keep duplicate-safe modulation flatMap without formula migration",
    )
    require(
        "nodeMetadataScriptAliases" not in script_sources["./public/node-graph-metadata-editor.js"],
        "metadata script editor should not expose leftover default-to-def aliases",
    )
    metadata_editor_source = script_sources["./public/node-graph-metadata-editor.js"]
    metadata_editor_tail = metadata_editor_source[metadata_editor_source.rfind("function handleNodeMetadataEditorInput"):]
    require(
        "bindNodeGraphMetadataPopoverEvents();" not in metadata_editor_tail
        and "bindNodeMetadataScriptBeforeUnload();" not in metadata_editor_tail
        and "scheduleNodeMetadataScriptParserSelfTestStatus();" not in metadata_editor_tail
        and "bindNodeMetadataScriptBeforeUnload();" in script_sources["./public/node-graph-bootstrap.js"]
        and "scheduleNodeMetadataScriptParserSelfTestStatus();" in script_sources["./public/node-graph-bootstrap.js"],
        "metadata editor should bind during node graph bootstrap after nodeGraphMvp exists",
    )
    require(
        "ensureNodeGraphStartupModulesVisible();\n  if (typeof applyNodeGraphWorkspaceWindowStates === \"function\")" in script_sources["./public/node-graph-bootstrap.js"],
        "node graph bootstrap should reapply saved window state after startup module rendering",
    )
    require(
        "function enforceNodeGraphWorkspaceClosedWindowStates" in script_sources["./public/node-graph-ui-settings-persistence.js"]
        and "enforceNodeGraphWorkspaceClosedWindowStates(nodeGraphMvp.workspaceWindowStates);" in script_sources["./public/node-graph-ui-settings-persistence.js"],
        "workspace window state restore should explicitly re-close windows whose saved/default state is closed",
    )
    require(
        'menu?.id === "nodeModuleActionsWindow" && remember' in script_sources["./public/node-graph-context-menu.js"]
        and 'menu?.id === "nodeGlobalScopeMenu" && remember' in script_sources["./public/node-graph-context-menu.js"],
        "position-only floating window helpers should not persist hidden windows as open",
    )
    require(
        'document.body.classList.remove("node-boot-loading")' in boot_loading_source
        and 'document.body.classList.add("node-boot-fading")' in boot_loading_source
        and 'document.body.classList.remove("node-boot-fading")' in boot_loading_source
        and 'document.body.classList.add("node-boot-ready")' in boot_loading_source
        and "}, 333);" in boot_loading_source
        and "function setNodeBootLoadingProgress(value, label = \"\")" in boot_loading_source
        and 'document.body.dataset.nodeBootFinished = "watchdog";' in boot_loading_source
        and "}, 10000);" in boot_loading_source
        and 'window.addEventListener("nodeSandboxStartupProgress"' in boot_loading_source
        and 'window.addEventListener("nodeSandboxInterfaceReady", finishNodeBootLoading, { once: true });' in boot_loading_source
        and 'document.body.dataset.nodeBootFinished = "interface-ready";' in boot_loading_source,
        "boot loading veil should fade after the interface ready event or watchdog timeout",
    )
    require(
        "--node-module-primary-text-color: rgba(243, 241, 236, 0.76);" in style_source
        and ".node-text-box-input" in style_source
        and ".node-header-title" in style_source
        and "color: var(--node-module-primary-text-color);" in style_source[
            style_source.index(".node-text-box-input {"):
            style_source.index(".node-text-box-input::-webkit-scrollbar")
        ]
        and "color: var(--node-module-primary-text-color);" in style_source[
            style_source.index(".node-header-title {"):
            style_source.index(".dsp-node-io-section")
        ],
        "text box text and module title should share the halfway brightness token",
    )
    require(
        "color-mix(in srgb, var(--node-slider-unit-color, #7fc7d9) 58%" in style_source
        and ".node-slider-readout:hover .node-slider-readout-unit" in style_source
        and ".node-slider-readout.value-dragging .node-slider-readout-unit" in style_source,
        "slider unit readout should stay dim on hover and drag",
    )
    square_scope_style = style_source[
        style_source.index(".visual-scope-layout .node-module-square-scope-window {"):
        style_source.index(".node-filter-curve-display {")
    ]
    require(
        "border-top" not in square_scope_style and "border-bottom" not in square_scope_style,
        "canvas and oscilloscope square screens should not draw stray top/bottom strokes",
    )

    for snippet in [
        'if (event.key === "Escape" && nodeGraphMvp.metadataEditorTarget)',
        "closeNodeMetadataPopover();\n  nodeGraphMvp.sceneContextPoint",
        "!popover.contains(event.target)",
    ]:
        require(snippet not in app_source, f"metadata popover should not close implicitly via {snippet}")

    for snippet in [
        ".node-graph-workspace",
        "scrollbar-gutter: stable both-edges",
        "overflow-y: auto",
        "body.node-boot-loading",
        "body.node-boot-fading",
        "body.node-boot-loading .shell",
        ".node-boot-loading-screen",
        ".node-boot-loading-panel",
        ".node-boot-loading-bar",
        ".node-boot-loading-bar span",
        "transition: opacity 333ms ease",
        "body.node-boot-loading .node-boot-loading-screen",
        "body.node-boot-fading .node-boot-loading-screen",
        "body.node-boot-ready .node-boot-loading-screen",
        "body.node-ear-protection-tripped",
        ".node-ear-protection-fault",
        "body.node-ear-protection-tripped .node-ear-protection-fault",
        ".node-ear-protection-fault-close",
        "body.node-module-diagnostics-tripped",
        ".node-module-diagnostics-fault",
        "body.node-module-diagnostics-tripped .node-module-diagnostics-fault",
        ".node-module-diagnostics-fault-close",
        ".node-module-diagnostics-fault-list",
        ".node-module-diagnostics-fault-entry",
        ".node-module-diagnostics-fault-entry-ok",
        "pointer-events: auto",
        "user-select: text",
        ".node-speaker-protection-body",
        ".node-speaker-protection-body.tripped strong",
        "@keyframes nodeEarProtectionVeil",
        "@keyframes nodeEarProtectionPanel",
        "--node-toolbar-button-bg-alpha: 0.62",
        "--node-min-grid-brightness-alpha: 0.045",
        "background-color: rgba(32, 37, 42, var(--node-toolbar-button-bg-alpha))",
        "background: rgba(127, 199, 217, calc(var(--node-toolbar-button-bg-alpha) * 0.13))",
        "--node-graph-zoom: 1",
        "--node-graph-pan-x: 0px",
        "--node-graph-pan-y: 0px",
        "--node-visual-shake-x: 0px",
        "--node-visual-shake-y: 0px",
        "--node-visual-wash-alpha: 0",
        "--node-visual-wash-rgb: 0 0 0",
        ".node-graph-workspace::after",
        "background: rgb(var(--node-visual-wash-rgb) / var(--node-visual-wash-alpha))",
        "--node-grid-color-rgb: 255 255 255",
        "--node-header-height: calc(var(--node-grid-size) * 2.7142857)",
        "--node-body-row-height: calc(var(--node-grid-size) * 1.0714286)",
        "--node-grid-height: 28px",
        "--node-grid-width: 28px",
        "--node-port-size-ratio: 0.57",
        "--node-port-area-size: var(--node-grid-height)",
        "--node-port-diameter: calc(var(--node-port-area-size) * var(--node-port-size-ratio))",
        "--node-port-radius: calc(var(--node-port-diameter) * 0.5)",
        "--node-port-area-radius: calc(var(--node-port-area-size) * 0.5)",
        "--node-port-column-width: var(--node-port-area-radius)",
        "--node-wire-patch-point-size: 36%",
        "--node-signal-port-height: var(--node-port-diameter)",
        "--node-signal-port-width: var(--node-port-radius)",
        "width: calc(100% - 6px)",
        "height: max(560px, calc(100vh - 230px))",
        "min-width: calc(var(--node-grid-width) * 4)",
        "min-height: var(--node-grid-height)",
        ".node-graph-workspace {\n    min-height: var(--node-grid-height);\n  }",
        "margin: 3px auto 0",
        ".node-graph-workspace.panning",
        ".node-zoom-label",
        ".node-zoom-buttons",
        ".node-graph-zoom-surface",
        "left: calc(var(--node-graph-pan-x) / var(--node-graph-zoom))",
        "top: calc(var(--node-graph-pan-y) / var(--node-graph-zoom))",
        "background: transparent",
        ".node-graph-origin-marker",
        "display: none",
        ".node-graph-workspace.origin-marker-visible .node-graph-origin-marker",
        ".node-grid-heatmap",
        "--node-grid-heatmap",
        "--node-grid-heatmap-mask",
        ".node-graph-workspace.grid-visible",
        ".node-module-scope-canvas",
        ".node-graph-workspace.module-scopes-enabled .node-module-scope-canvas",
        ".node-graph-workspace.module-oscilloscopes-hidden",
        ".node-graph-workspace.module-oscilloscopes-hidden\n  .dsp-node:not(.canvas-node-layout):not(.visual-scope-layout):not(.trace-display-layout) {\n  --node-module-scope-height: 0px;",
        ".node-graph-workspace.module-oscilloscopes-hidden\n  .dsp-node:not(.canvas-node-layout):not(.visual-scope-layout):not(.trace-display-layout)\n  .node-module-scope-window",
        ".node-canvas-layers",
        ".node-canvas-layer",
        "--node-canvas-layer-x",
        ".node-canvas-status {\n  display: none;\n}",
        "padding: 0;",
        "width: 100%;\n  height: 100%;",
        "min-height: 0;",
        ".node-canvas-preview {\n  position: relative;",
        "background: #000;",
        ".node-canvas-preview[data-canvas-face-background=\"checkerboard\"]",
        ".node-canvas-frame[data-canvas-screen-fit=\"stretch\"]",
        "background: var(--node-canvas-face-background, #000000)",
        "background: var(--node-canvas-screen-background, #000000)",
        ".node-canvas-script-preview-layers",
        ".node-canvas-script-preview-layer",
        ".node-scope-master-brightness-control",
        ".node-scope-master-brightness-control input",
        ".node-graph-workspace.module-sliders-hidden .dsp-node",
        "height: auto",
        ".node-modular-shader-canvas",
        ".node-graph-workspace.shader-enabled .node-modular-shader-canvas",
        "--node-module-scope-height: calc(var(--node-grid-height) * var(--node-module-display-height-units, 2))",
        "--node-scope-port-band-overlap: 0px",
        ".dsp-node.visual-scope-layout",
        ".visual-scope-layout .node-module-square-scope-window",
        "height: 100%",
        "align-self: stretch",
        ".node-module-scope-window",
        "height: 100%",
        ".node-module-scope-window-surface",
        "--node-scope-background",
        "background: var(--node-scope-background, #000)",
        "var(--node-visual-shake-x)",
        "var(--node-visual-shake-y)",
        ".node-module-scope-analyzer",
        ".node-module-scope-analyzer[hidden]",
        ".node-module-scope-analyzer span",
        "z-index: 2",
        "background-image:",
        "var(--node-min-grid-brightness-alpha)",
        "rgb(var(--node-grid-color-rgb) / var(--node-min-grid-brightness-alpha))",
        "rgb(var(--node-mouse-light-color-rgb) / 0.2)",
        "background-position: var(--node-graph-pan-x) var(--node-graph-pan-y)",
        "calc(var(--node-grid-width) * var(--node-graph-zoom))",
        "calc(var(--node-grid-height) * var(--node-graph-zoom))",
        ".node-help-stack",
        "display: flex",
        "width: var(--node-workspace-view-width, calc(100% - 6px))",
        "max-width: none",
        "margin: 3px auto 0",
        ".node-view-toolbar",
        "user-select: none",
        ".node-view-toolbar input:not([readonly])",
        "user-select: text",
        ".node-constraint-color-guide",
        ".node-constraint-stack",
        "flex-direction: column",
        ".node-constraint-chip",
        ".node-constraint-chip:has(input:checked)",
        ".node-constraint-metrics",
        ".node-scope-cpu-metrics",
        ".node-scope-ram-metrics",
        ".node-scope-gpu-metrics",
        ".node-constraint-cpu-active .node-scope-cpu-metrics",
        ".node-constraint-ram-active .node-scope-ram-metrics",
        ".node-constraint-gpu-active .node-scope-gpu-metrics",
        ".node-scope-resource-debug",
        "pointer-events: auto",
        "#nodeDownloadFiftyButton",
        "#nodeDownloadFiftyButton[hidden]",
        "display: none !important",
        ".node-toolbar-subline",
        ".node-parameter-row[data-node-constraint]",
        ".node-constraint-cpu-active .node-parameter-row[data-node-constraint=\"cpu\"]",
        ".node-constraint-ram-active .node-parameter-row[data-node-constraint=\"ram\"]",
        ".node-constraint-gpu-active .node-parameter-row[data-node-constraint=\"gpu\"]",
        "--node-constraint-cpu: #f0b35f",
        "--node-constraint-ram: #5fc7ee",
        "--node-constraint-gpu: #c083ff",
        ".node-help-stack.tips-hidden .node-interaction-help",
        ".node-interaction-help",
        ".node-interaction-help:empty",
        "--node-tooltip-text-size",
        "font-size: var(--node-tooltip-text-size)",
        "justify-content: center",
        "min-height: 72px",
        "height: 72px",
        "white-space: pre-line",
        "--node-module-grid-inset: calc(var(--node-grid-size) * 0.2142857)",
        "--node-grid-width-units",
        "--node-grid-height-units",
        ".node-settings-view",
        ".node-module-shop-view",
        "var(--node-module-shop-min-width, 96px)",
        "var(--node-module-shop-width, 520px)",
        "var(--node-module-shop-max-width, 980px)",
        "var(--node-module-shop-min-height, 120px)",
        "var(--node-module-shop-height, 620px)",
        "var(--node-module-shop-max-height, 760px)",
        ".node-module-shop-view[hidden]",
        ".node-module-shop-heading",
        ".node-module-shop-drag-handle",
        ".node-module-shop-column",
        ".node-module-department-search-placeholder",
        ".node-module-shop-view.department-selected .node-module-shop-controls",
        "grid-template-columns: minmax(54px, 0.32fr) minmax(0, 1fr)",
        ".node-module-shop-view:not(.department-selected) .node-module-department-search-placeholder",
        "grid-column: 1 / -1",
        "display: none",
        ".node-module-department-search-placeholder input:disabled",
        ".node-module-department-back-button",
        "font: 1.05rem/1 var(--mono)",
        ".node-module-department-title",
        "color: rgba(127, 199, 217, 0.9)",
        "font-size: 0.78rem",
        "font-weight: 650",
        "text-transform: none",
        ".node-scene-context-menu.node-module-collections-menu",
        ".node-module-collection-card",
        ".node-module-shop-section",
        ".node-module-shop-section-title",
        ".node-module-shop-section-title small",
        ".node-module-shop-heading .panel-close-button",
        ".node-module-store-list",
        ".node-module-store-list .scene-context-store-card",
        ".node-module-store-list .scene-context-store-card strong",
        "grid-template-columns: minmax(0, 1fr)",
        "grid-auto-rows: var(--node-floating-window-button-height)",
        "height: var(--node-floating-window-button-height)",
        "max-height: var(--node-floating-window-button-height)",
        "border: 1px solid var(--line)",
        "background: rgb(3, 5, 7)",
        "border-color: rgba(127, 199, 217, 0.36)",
        "background: rgb(6, 9, 11)",
        "user-select: none",
        "-webkit-user-select: none",
        ".node-module-store-list .scene-context-store-card[data-context-module] strong",
        "color: var(--node-module-primary-text-color) !important",
        "--node-header-title-font-family",
        "font-weight: 400",
        ".scene-context-store-department-count",
        ".node-module-shop-resize-handle",
        "width: 100%",
        "place-items: center",
        "white-space: normal",
        "overflow-wrap: anywhere",
        ".node-video-view-panel",
        ".node-video-view-panel[hidden]",
        ".node-video-view-heading",
        ".node-camera-resolution-controls",
        ".node-video-view-frame",
        "--camera-view-aspect",
        ".node-video-view-reticle",
        ".node-camera-preview-viewport",
        ".node-camera-preview-surface",
        ".node-camera-preview-world",
        ".node-camera-overlay-layer",
        ".node-camera-frame",
        ".node-camera-frame-handle",
        ".node-settings-actions",
        "--node-front-button-hover-border",
        "--node-front-button-hover-bg",
        "--node-front-construction-hover-bg",
        ".node-view-toolbar button:not(:disabled):not(.active):hover",
        ".node-patch-community-control",
        ".node-graph-controls button:not(.node-debug-hidden-control)",
        ".node-settings-actions button:not(.node-settings-disabled-action)",
        ".node-under-construction-view-button[aria-disabled=\"true\"]:hover",
        ".node-settings-feature-action:hover",
        "background: var(--node-front-button-hover-bg)",
        "background: var(--node-front-construction-hover-bg)",
        "minmax(0, 4fr)",
        ".node-settings-script-action-group",
        "grid-template-columns: repeat(3, minmax(0, 1fr))",
        ".node-settings-feedback-action-group",
        "overflow: visible",
        ".node-settings-script-action-group button + button",
        ".node-settings-script-action-group button:hover",
        ".node-settings-dev-action-group .node-settings-disabled-action:hover",
        "z-index: 2",
        ".node-settings-feedback-action-group .node-settings-link-action + .node-settings-link-action",
        ".node-ui-dev-actions",
        ".node-ui-dev-actions button",
        ".node-ui-dev-actions .pill",
        ".node-user-ui-settings-panel",
        ".node-user-ui-settings-heading",
        ".node-user-ui-settings-drag-handle",
        ".node-user-ui-settings-controls",
        ".node-user-ui-setting-control",
        ".node-ui-dev-control.has-expose",
        ".node-ui-dev-color-control.has-expose",
        ".node-ui-dev-expose",
        ".node-settings-grid",
        "grid-template-columns: minmax(0, 1fr)",
        ".node-settings-sample-rate-row",
        ".node-settings-grid-unit-row",
        ".node-script-heading",
        ".node-script-actions",
        ".node-preset-controls",
        "grid-template-columns: minmax(12rem, 1.1fr) minmax(12rem, 1fr) repeat(3, auto)",
        ".node-preset-controls input",
        ".node-patch-clipboard-controls",
        ".node-patch-clipboard-controls button",
        "container-type: inline-size",
        "grid-auto-rows: auto",
        "aspect-ratio: auto",
        "overflow-y: auto",
        "overscroll-behavior: contain",
        "#nodeVisibilityMenu",
        ".node-visibility-menu-list",
        ".node-demo-patch-list",
        ".node-demo-patch-row",
        ".node-demo-patch-bank",
        "grid-template-columns: minmax(7ch, 0.34fr) minmax(0, 1fr)",
        "align-self: center",
        ".node-demo-patch-status",
        ".node-script-grid-settings",
        ".node-mapping-view",
        ".node-mapping-grid",
        ".node-mapping-cell",
        ".node-mapping-cell.active",
        "grid-template-columns: repeat(4, minmax(0, 1fr))",
        "zoom: var(--node-graph-zoom)",
        ".node-graph-workspace.resizing",
        ".node-graph-resize-handle",
        "position: absolute",
        "right: 10px",
        "bottom: 10px",
        "flex-wrap: wrap",
        ".node-graph-empty-module-button",
        ".node-graph-workspace:not(.empty-patch) .node-graph-empty-module-button",
        ".node-wiring-panel .audio-panel",
        ".node-current-saved-patch-button",
        ".node-current-saved-patch-button.unsaved",
        ".node-patch-explorer-toolbar",
        ".node-patch-explorer-action-button",
        ".node-patch-header-fields",
        ".node-patch-community-control",
        ".node-patch-header-field",
        ".node-patch-header-field.bank",
        ".node-patch-header-field.name",
        ".node-patch-header-field.tags",
        ".node-demo-patch-row.active",
        ".node-wire-svg",
        ".node-wire-path",
        ".node-wire-gradient-stop",
        ".node-modulation-wire-gradient-stop",
        ".node-modulation-wire-path",
        ".node-wire-path.state-read",
        ".node-wire-path.state-read.selected",
        ".node-wire-path.trace-wire.selected",
        ".node-wire-path.state-read.trace-wire.selected",
        ".node-wire-path.inactive-wire",
        ".node-wire-path.inactive-wire.selected",
        ".node-wire-path.inactive-wire.trace-wire.selected",
        ".node-wire-path.selected",
        ".node-wire-hit-path",
        ".node-wire-path.temp",
        ".node-wire-path.destroyed",
        "@keyframes node-wire-destroyed",
        ".node-selection-marquee",
        ".dsp-node",
        ".dsp-node-header",
        "box-sizing: border-box;",
        "min-width: 0;",
        "grid-template-rows: var(--node-header-title-row-height) minmax(0, 1fr)",
        "border-radius: 5px",
        "grid-template-rows:\n    var(--node-header-height)\n    var(--node-module-scope-height)\n    minmax(var(--node-io-section-min-height), auto)\n    auto;",
        ".dsp-node.filter-curve-layout",
        "grid-template-rows:\n    var(--node-header-height)\n    calc(var(--node-module-scope-height) * 1.5)\n    minmax(var(--node-io-section-min-height), auto)\n    auto;",
        ".node-graph-workspace.module-oscilloscopes-hidden .dsp-node.filter-curve-layout,\n.dsp-node.filter-curve-layout.oscilloscope-hidden",
        "grid-template-rows:\n    var(--node-header-height)\n    minmax(var(--node-io-section-min-height), auto)\n    auto;",
        ".dsp-node-body",
        "align-content: start;",
        "grid-auto-rows: var(--node-body-row-height)",
        ".node-graph-workspace.module-buttons-hidden .dsp-node:not(.text-box-layout):not(.image-node-layout):not(.canvas-node-layout):not(.visual-scope-layout):not(.trace-display-layout):not(.graph-node-layout):not(.slider-widget-layout):not(.knob-widget-layout):not(.sample-module-layout):not(.screen-space-shader-layout)",
        "grid-template-rows:\n    var(--node-header-height)\n    var(--node-module-scope-height)\n    minmax(var(--node-io-section-min-height), auto)\n    auto\n    auto;",
        ".dsp-node.sample-module-layout.oscilloscope-hidden",
        "--node-module-scope-height: 0px",
        ".dsp-node.sample-module-layout,\n.dsp-node.sample-module-layout.oscilloscope-hidden",
        "grid-template-rows:\n    var(--node-header-height)\n    var(--node-module-scope-height)\n    var(--node-module-interface-controls-height)\n    minmax(var(--node-io-section-min-height), auto)\n    auto;",
        "align-content: start;",
        ".node-graph-workspace.module-buttons-hidden .dsp-node:not(.text-box-layout):not(.image-node-layout):not(.canvas-node-layout):not(.visual-scope-layout):not(.trace-display-layout):not(.graph-node-layout):not(.slider-widget-layout):not(.knob-widget-layout):not(.sample-module-layout):not(.screen-space-shader-layout)::after",
        "grid-auto-rows: var(--node-body-row-height)",
        "gap: var(--node-body-row-gap)",
        ".dsp-node-io-section",
        ".dsp-node.io-hidden .dsp-node-io-section",
        ".dsp-node.io-hidden .node-io-proxy",
        "minmax(0, min(50%, calc(var(--node-grid-width) * 2)))",
        ".node-io-column",
        ".node-io-column.input",
        "grid-column: 1",
        ".node-io-column.output",
        "grid-column: 3",
        ".node-io-row.input",
        ".node-io-row.output",
        ".node-io-label",
        ".node-io-row:hover",
        ".node-io-row.patch-point-hover",
        ".node-header-actions",
        "align-self: stretch",
        "align-items: stretch",
        "grid-template-columns: repeat(15, minmax(0, 1fr))",
        ".node-under-construction-view-button",
        "repeating-linear-gradient(",
        "width: 100%",
        "height: 100%",
        "margin: 0",
        "overflow: hidden",
        ".node-header-title-row",
        "justify-content: center",
        "linear-gradient(180deg, rgba(2, 4, 7, 0.98), rgba(8, 10, 13, 0.92))",
        ".node-canvas-script-heading",
        "user-select: none",
        ".node-header-title",
        ".scene-context-alias-control",
        ".scene-context-alias-control input",
        ".dsp-node.buttons-hidden",
        ".dsp-node.oscilloscope-hidden",
        ".dsp-node.oscilloscope-hidden:not(.canvas-node-layout):not(.visual-scope-layout):not(.trace-display-layout) .node-module-scope-window",
        ".node-graph-workspace.module-buttons-hidden .dsp-node .node-header-actions",
        ".node-graph-workspace.module-sliders-hidden .node-parameter-row",
        ".dsp-node.sliders-hidden .dsp-node-body",
        ".dsp-node.title-hidden",
        ".node-graph-workspace.module-buttons-hidden .dsp-node:not(.title-hidden)",
        ".dsp-node.buttons-hidden.title-hidden",
        ".dsp-node.placing",
        ".node-graph-workspace.module-buttons-hidden .dsp-node.title-hidden",
        "visibility: hidden",
        "text-align: center",
        "text-transform: none",
        "--node-module-fill",
        "--node-module-stroke",
        "--node-module-selected-stroke",
        "--node-port-hover-fill",
        "--node-port-hover-stroke",
        "--node-hover-glow-spread",
        "--node-input-fill",
        "--node-output-fill",
        "--node-mod-input-fill",
        "--node-param-output-fill",
        "--node-bypass-icon-size-ratio: 0.36",
        "flex-wrap: wrap",
        "overflow: visible",
        ".node-header-tap-tempo-button",
        "background: rgba(127, 199, 217, 0.08)",
        ".node-header-tap-tempo-button:focus-visible",
        ".node-ui-dev-color-section",
        ".node-ui-dev-bypass-icon-control .node-ui-dev-control-row",
        ".node-ui-dev-bypass-icon-preview",
        'font-size: calc(var(--node-ui-dev-bypass-preview-size, 0.36) * 28px)',
        "font-size: calc(var(--panel-close-glyph-size-ratio, 0.5) * 100cqh)",
        ".node-ui-dev-color-control",
        "color-mix(in srgb, var(--node-module-stroke)",
        "color-mix(in srgb, var(--node-port-hover-fill)",
        ".node-wiring-panel.settings-header-layout-debug .node-parameter-metadata-popover",
        ".node-wiring-panel.settings-header-layout-debug .node-scene-context-menu",
        ".node-wiring-panel.settings-header-layout-debug .metadata-popover-heading",
        ".node-wiring-panel.settings-header-layout-debug .scene-context-heading",
        ".node-wiring-panel.settings-header-layout-debug .metadata-popover-grid",
        ".node-wiring-panel.settings-header-layout-debug .scene-context-selected-module",
        ".node-wiring-panel.settings-header-layout-debug .scene-context-alias-control",
        ".node-parameter-row",
        "grid-template-columns: var(--node-port-column-width) minmax(0, 1fr) var(--node-port-column-width)",
        "grid-template-rows: var(--node-slider-readout-height)",
        "column-gap: 0",
        "height: max(",
        "calc(var(--node-slider-readout-height) + (var(--node-slider-row-padding-block) * 2))",
        "height: var(--node-slider-readout-height)",
        "--node-slider-readout-center-offset: 2px",
        "transform: translateY(var(--node-slider-readout-center-offset))",
        "align-self: stretch",
        "align-items: center",
        "padding: var(--node-slider-row-padding-block) 0",
        ".node-slider-readout-label",
        "font-family: \"Cascadia Mono\", \"Cascadia Code\", Consolas, \"Courier New\", monospace",
        ".node-parameter-control",
        ".dsp-node.dragging",
        ".dsp-node.selected",
        ".dsp-node.bypassed",
        ".dsp-node.removed",
        ".node-drag-handle",
        ".node-drag-handle.dragging",
        ".node-drag-handle:hover",
        ".node-action-button",
        ".node-action-button:hover",
        ".node-metaparameter-button",
        "color: color-mix(in srgb, var(--accent) 58%",
        ".node-bypass-button",
        "container-type: size",
        'content: "\\1F5F2"',
        "font-size: calc(var(--node-bypass-icon-size-ratio) * 100cqh)",
        ".node-bypass-button:hover",
        "border-color: transparent",
        ".node-display-settings-button[aria-pressed=\"false\"]",
        ".node-metaparameter-button[aria-pressed=\"false\"]",
        ".dsp-node.oscilloscope-hidden .node-display-settings-button",
        ".node-graph-workspace.module-oscilloscopes-hidden .dsp-node .node-display-settings-button",
        ".node-bypass-button[aria-pressed=\"true\"]",
        ".node-bypass-button[aria-pressed=\"true\"]:hover",
        "rgba(122, 28, 28, 0.72)",
        ".node-execution-order-badge",
        ".node-execution-order-badge:hover",
        "color: color-mix(in srgb, var(--good) 62%",
        "width: 100%",
        "height: 100%",
        "min-height: 0",
        ".node-execution-order-badge[data-execution-state=\"bypassed\"]",
        ".node-execution-order-badge[data-execution-state=\"inactive\"]",
        ".node-live-input-state-badge",
        "--node-live-input-peak",
        "#nodeLiveInputTestStatus",
        ".node-live-input-state-badge[data-mic-state=\"connected\"]",
        ".node-runtime-sketch-heading",
        ".node-runtime-sketch",
        "max-height: 260px",
        "pointer-events: auto;",
        ".node-port.output",
        "--node-patch-point-x: 100%",
        ".node-port.input",
        "--node-patch-point-x: 0%",
        ".node-port.output.connected-port",
        ".node-port.input.connected-port",
        ".node-port.connected-port::after",
        ".node-param-port.connected-port::after",
        ".node-port:not(.node-param-port).connected-port::before",
        ".node-param-port.connected-port::before",
        "display: none",
        "--node-patch-point-color",
        "width: var(--node-wire-patch-point-size)",
        "0 0 var(--node-hover-glow-size) var(--node-hover-glow-spread)",
        ".node-port.connected-port.patch-point-hover::after",
        ".node-param-port",
        "grid-column: 1",
        "grid-row: 1",
        "align-self: center",
        "width: var(--node-port-area-radius)",
        "min-width: var(--node-port-area-radius)",
        "height: var(--node-port-area-size)",
        ".node-param-port.modulation-input",
        "border-radius: 0 999px 999px 0",
        ".node-param-port.modulation-input.connected-port",
        ".node-param-port.parameter-output",
        "border-radius: 999px 0 0 999px",
        ".node-param-port.parameter-output.connected-port",
        ".node-param-port.parameter-output.connected-port::before",
        "width: var(--node-port-area-size)",
        "border-radius: 6px 0 0 6px",
        "linear-gradient(",
        "color-mix(in srgb, var(--node-param-output-fill) 34%, transparent)",
        "color-mix(in srgb, var(--node-param-output-fill) 30%, transparent) inset",
        "transform: translateY(-50%)",
        "grid-column: 3",
        ".node-zap-particle",
        "@keyframes node-zap-burst",
        "border-left-width: 0",
        "rgba(177, 132, 255",
        ".node-modular-only-back-button",
        ".node-wiring-panel.modular-only-view .node-modular-only-back-button",
        ".node-wiring-panel.modular-only-view",
        ":not(.node-view-toolbar)",
        ":not(.node-saved-patches-window)",
        ":not(.node-module-shop-view)",
        ".node-wiring-panel.modular-only-view > .node-view-toolbar",
        "display: contents",
        ".node-wiring-panel.modular-only-view > .node-view-toolbar > :not(.node-saved-patches-window)",
        "place-items: center",
        "min-height: 100dvh",
        "max-height: calc(100dvh - (var(--node-modular-only-inset) * 2))",
        "margin: auto",
        ".node-palette",
        ".node-live-toggle-palette",
        "grid-template-columns: repeat(2, minmax(0, 1fr))",
        ".node-live-toggle-palette .node-live-toggle + .node-live-toggle",
        "margin-left: -1px",
        ".node-live-toggle-palette .node-live-toggle span",
        ".node-live-toggle.active",
        "box-shadow: inset 0 0 0 1px rgba(242, 93, 93, 0.76)",
        ".node-live-toggle.active:hover",
        ".node-render-duration-control",
        ".node-render-duration-control input",
        ".node-output-summary",
        ".node-live-controls",
        ".node-visual-output",
        ".node-visual-output-heading",
        ".node-visual-output-meta",
        ".node-execution-plan-summary",
        ".node-execution-policy",
        ".node-bad-value-monitor-evidence",
        ".node-bad-value-monitor-evidence li",
        ".node-bad-value-monitor-evidence li[data-bad-value-reason]",
        ".node-execution-order",
        ".node-execution-wire-modes",
        ".node-execution-order li.selected",
        ".node-execution-wire-modes li.selected",
        ".node-execution-wire-modes li.state-read",
        ".node-execution-wire-modes li.bypassed",
        ".node-execution-plan-debug",
        "body.debug-collapsed",
        "body.debug-collapsed .status-strip",
        ".node-slider-readout",
        ".node-slider-readout.choices-divided",
        ".node-slider-amount-fill",
        ".node-graph-workspace.show-slider-amount .node-slider-amount-fill",
        ".node-graph-workspace.hide-slider-position .node-slider-readout::before",
        '[data-slider-layout="label-value-slider"] .node-slider-readout-label',
        '[data-slider-layout="label-value-slider"] .node-slider-readout-value',
        '[data-slider-layout="label-value-slider"] .node-slider-readout-unit',
        '[data-slider-layout="value-unit-left"] .node-slider-readout-value',
        '[data-slider-layout="value-unit-left"] .node-slider-readout-unit',
        '[data-slider-layout="value-unit-right"] .node-slider-readout-value',
        '[data-slider-layout="value-unit-right"] .node-slider-readout-unit',
        '[data-slider-layout="label-outside-no-unit"] .node-slider-readout-label',
        '[data-slider-layout="label-outside-no-unit"] .node-slider-readout-value',
        '[data-slider-layout="label-outside-no-unit"] .node-slider-readout-unit',
        '[data-slider-layout="value-outside"] .node-slider-readout-label',
        '[data-slider-layout="value-outside"] .node-slider-readout-value',
        '[data-slider-layout="value-outside"] .node-slider-readout-unit',
        '[data-slider-layout="value-focus"] .node-slider-readout-label',
        '[data-slider-layout="value-focus"] .node-slider-readout-value',
        '[data-slider-layout="value-focus"] .node-slider-readout-unit',
        ".node-choice-debug-layer",
        ".node-choice-debug-square",
        ".node-choice-debug-cell-debug",
        ".node-choice-debug-wall",
        ".node-choice-debug-slider-wall",
        ".node-wiring-panel.choice-slider-debug .node-choice-debug-cell-debug",
        ".node-wiring-panel.choice-slider-debug .node-choice-debug-wall",
        ".node-wiring-panel.choice-slider-debug .node-choice-debug-slider-wall",
        "height: 100%",
        "padding: var(--node-slider-padding-block) var(--node-slider-padding-inline)",
        "var(--value-start",
        "var(--value-end",
        "var(--choice-divider-background",
        "var(--ghost-start",
        "var(--portal-left-width",
        "var(--portal-right-width",
        ".node-slider-readout::after",
        ".node-slider-readout.has-ghost-slider::after",
        ".node-slider-readout-portal",
        ".node-slider-readout-portal-left",
        ".node-slider-readout-portal-right",
        "grid-template-columns: minmax(0, 1fr) auto",
        "grid-template-rows: minmax(0, 1fr) minmax(0, 1fr)",
        "row-gap: 0",
        ".node-slider-readout.value-dragging",
        ".node-slider-readout-label",
        ".node-slider-readout-value",
        "white-space: pre;",
        ".node-slider-readout-unit",
        ".node-slider-readout-unit.is-empty",
        ".node-slider-readout-input",
        "scrollbar-width: none",
        ".node-text-box-input::-webkit-scrollbar",
        "--node-text-box-font-fit-scale",
        "overflow: hidden",
        ".scene-context-text-box-text-control",
        ".scene-context-range-control",
        ".scene-context-text-box-text-control textarea",
        ".scene-context-range-control input[type=\"range\"]",
        ".node-parameter-metadata-popover",
        "box-sizing: border-box;",
        "max-width: min(var(--metadata-popover-max-width, 900px), calc(100vw - 12px))",
        "max-height: min(var(--metadata-popover-max-height, 820px), calc(100vh - 12px))",
        ".metadata-popover-heading",
        "--node-floating-window-header-height: 30px",
        "grid-template-columns:\n    var(--node-floating-window-header-height)\n    minmax(0, 1fr)\n    var(--node-floating-window-header-height)",
        "min-height: var(--node-floating-window-header-height)",
        ".metadata-popover-title-group",
        ".metadata-popover-heading #metadataPopoverSubtitle",
        ".metadata-popover-drag-handle",
        ".metadata-popover-drag-handle.dragging",
        ".metadata-popover-corner-drag",
        ".metadata-popover-corner-drag.dragging",
        ".metadata-close-prompt",
        ".metadata-close-prompt[hidden]",
        ".metadata-popover-heading.dragging",
        ".metadata-choices-label",
        ".metadata-checkbox-label",
        ".metadata-field-actions",
        ".metadata-field-actions button.dirty",
        ".metadata-field-section",
        ".metadata-toggle-section",
        ".metadata-section-title",
        ".metadata-advanced-toggle",
        ".metadata-stepper-control",
        "grid-template-columns: minmax(0, 1fr) 15px 15px",
        ".metadata-popover-grid",
        ".metadata-popover-grid {\n  display: grid;",
        ".metadata-popover-grid button.armed",
        ".metadata-script-panel",
        ".metadata-script-panel {\n  display: none;",
        ".node-parameter-metadata-popover.metadata-script-open .metadata-script-panel",
        ".metadata-script-editor",
        ".metadata-script-highlight",
        ".metadata-script-preview",
        ".metadata-script-extra-info",
        ".metadata-script-preview li.changed",
        ".metadata-script-preview li.same",
        ".metadata-script-preview li.ignored",
        ".metadata-script-preview li[data-line]:hover",
        ".metadata-script-preview em",
        ".metadata-script-effective",
        ".metadata-script-effective dd",
        ".metadata-script-line-ignored",
        ".metadata-script-heading",
        ".metadata-script-reference",
        ".metadata-script-reference code",
        ".metadata-script-reference code:hover",
        ".metadata-token-link",
        "@keyframes nodeTextCaretBlink",
        'input[type="text"]',
        '):not(.node-text-box-input)',
        "animation: nodeTextCaretBlink 2s steps(1, end) infinite;",
        ".metadata-script-actions",
        ".metadata-script-panel textarea",
        "resize: none;",
        "overflow: hidden;",
        "min-height: 286px;",
        ".metadata-token-property",
        ".metadata-token-assignment",
        ".metadata-token-comment",
        "button.confirming-default",
        "button.saved-default",
        ".node-script-actions button.saved-default",
        ".node-ui-dev-actions button.saved-default",
        "@keyframes node-default-saved-pulse",
        ".node-scene-context-menu",
        ".node-visibility-menu",
        "position: fixed",
        "width: min(196px, calc(100vw - 28px))",
        "min-width: var(--node-module-actions-min-width, 24px)",
        "grid-template-columns:\n    var(--node-floating-window-header-height)\n    minmax(0, 1fr)\n    var(--node-floating-window-header-height)",
        "min-height: var(--node-floating-window-header-height)",
        ".node-visibility-menu .scene-context-heading",
        ".node-visibility-menu .scene-context-title",
        ".node-visibility-menu-list",
        ".node-visibility-menu-resize-handle",
        "cursor: ew-resize",
        "min-height: var(--node-floating-window-button-height)",
        "padding: 0",
        "width: min(430px, calc(100vw - 28px))",
        "max-height: min(760px, calc(100vh - 28px))",
        "#nodeSceneContextMenu",
        "width: min(var(--node-scene-context-width, 215px), calc(100vw - 28px))",
        "min-width: var(--node-scene-context-min-width, var(--node-module-actions-min-width, 24px))",
        "padding: 0",
        ".node-module-actions-window",
        "width: clamp(",
        "var(--node-module-actions-min-width, 24px)",
        "var(--node-module-actions-width, 140px)",
        "var(--node-module-actions-max-width, 360px)",
        "height: var(--node-module-actions-height, auto)",
        "min-width: var(--node-module-actions-min-width, 24px)",
        "max-width: min(var(--node-module-actions-max-width, 360px), calc(100vw - 28px))",
        "display: flex",
        "flex-direction: column",
        ".node-module-actions-window *,",
        ".node-module-actions-window-body",
        "flex: 1 1 auto",
        "flex-direction: column",
        ".node-module-actions-window-body > *",
        "flex: 0 0 auto",
        "grid-template-columns:\n    var(--node-floating-window-header-height)\n    minmax(0, 1fr)\n    var(--node-floating-window-header-height)",
        "max-inline-size: var(--node-floating-window-header-height)",
        "overflow: hidden auto",
        ".node-module-actions-window .scene-context-resize-handle",
        "position: absolute",
        "#nodeSceneContextMenu .scene-context-heading",
        "margin: 0",
        "background: rgb(3, 5, 7)",
        "#nodeSceneContextMenu :is(",
        ".scene-context-text-box-controls:not(#nodeSceneWindowControls)",
        "background: rgb(7, 10, 13)",
        "button:not(.scene-context-drag-handle):not(.panel-close-button):not(.scene-context-resize-handle)",
        "background: rgb(16, 22, 26)",
        "background: rgb(22, 32, 38)",
        ".node-scene-context-menu[hidden]",
        ".scene-context-heading",
        ".scene-context-heading > .panel-close-button",
        ".scene-context-heading.dragging",
        ".scene-context-drag-handle",
        ".scene-context-drag-handle.dragging",
        ".scene-context-resize-handle",
        ".scene-context-resize-handle.dragging",
        ".scene-context-title",
        "grid-template-columns:\n    var(--node-floating-window-header-height)\n    minmax(0, 1fr)\n    var(--node-floating-window-header-height)",
        "min-height: 28px",
        ".scene-context-title > span",
        ".scene-context-title > small",
        "justify-items: center",
        "text-align: center",
        "--node-floating-window-button-height: 30px",
        ".scene-context-store-ledger",
        ".scene-context-store-department-list",
        ".scene-context-store-department-card",
        ".scene-context-store-department-symbol",
        ".scene-context-store-department-title",
        "--node-module-category-stroke: rgba(127, 199, 217, 0.22)",
        "border: 0",
        "inset 1px 0 0 var(--node-module-category-stroke)",
        "inset -1px 0 0 var(--node-module-category-stroke)",
        "inset 0 1px 0 var(--node-module-category-stroke)",
        "inset 0 -1px 0 var(--node-module-category-stroke)",
        ".scene-context-store-list",
        ".scene-context-store-row",
        ".scene-context-store-department-heading",
        ".scene-context-store-department-heading:first-child",
        ".scene-context-store-card",
        ".scene-context-store-empty",
        ".scene-context-store-card::before",
        "grid-template-columns: minmax(0, 1fr)",
        "gap: 0",
        "min-height: 30px",
        ".node-saved-patches-window",
        ".node-saved-patches-window[hidden]",
        "--node-saved-patches-width",
        "--node-saved-patches-height",
        "--node-saved-patches-min-width",
        "--node-saved-patches-max-width",
        "--node-saved-patches-min-height",
        "--node-saved-patches-max-height",
        ".node-saved-patches-heading",
        "grid-template-columns:\n    var(--node-floating-window-header-height)\n    minmax(0, 1fr)\n    var(--node-floating-window-header-height)",
        ".node-saved-patches-clipboard-row",
        ".node-saved-patches-drag-handle",
        ".node-saved-patches-resize-handle",
        "touch-action: none",
        ".node-saved-patch-window-list",
        ".scene-context-width-controls",
        ".scene-context-width-controls[hidden]",
        "#nodeSceneWindowControls",
        ".scene-context-global-smoothing-control",
        ".scene-context-global-smoothing-input",
        "--scene-context-timing-row-height: calc(var(--node-floating-window-button-height) * 1.28)",
        "height: var(--scene-context-timing-row-height)",
        "padding-block: 0",
        ".scene-context-history-controls",
        "grid-template-columns: repeat(2, minmax(0, 1fr))",
        ".node-floating-window-attention",
        "@keyframes node-floating-window-attention-pulse",
        "border: 0",
        "border-radius: 0",
        "#nodeSceneWindowControls .scene-context-window-button",
        "background: rgba(16, 22, 26, 0.94)",
        "background: rgba(22, 32, 38, 0.96)",
        "#nodeSceneWindowControls .scene-context-window-button:first-child",
        "#nodeSceneWindowControls .scene-context-window-button:last-child",
        ".scene-context-scope-fields",
        ".node-scope-settings-section",
        ".node-scope-settings-section-title",
        ".node-individual-scope-controls[hidden]",
        "var(--metadata-popover-min-width, 140px)",
        "var(--metadata-popover-max-width, 900px)",
        "var(--metadata-popover-min-height, 120px)",
        "var(--metadata-popover-max-height, 820px)",
        ".scene-context-text-box-controls > div.four",
        ".scene-context-text-box-controls > div.five",
        ".scene-context-scope-fields input",
        ".scene-context-scope-fields input.value-dragging",
        ".node-header-timing-row",
        ".node-header-transport-row",
        ".node-header-scope-row",
        "grid-template-columns: minmax(0, 0.74fr) repeat(7, minmax(0, 1fr))",
        "grid-template-rows: 40% 60%",
        "font-size: clamp(0.72rem, calc(var(--node-toolbar-row-height) * 0.26), 1rem)",
        "font-size: clamp(1.1rem, calc(var(--node-toolbar-row-height) * 0.5), 1.72rem)",
        "flex: 1 1 46%",
        ".node-header-timing-field[data-header-number-drag=\"true\"]",
        ".node-header-timing-field.value-dragging",
        ".node-scope-settings-help",
        ".node-master-scope-dot-preview-shell",
        ".node-master-scope-dot-preview",
        ".node-master-scope-dot-core-title[aria-pressed=\"true\"]",
        ".node-master-scope-dot-core-title[aria-pressed=\"false\"]",
        ".node-master-scope-dot-core-row.dot-core-disabled",
        ".node-master-scope-dot-core-title",
        "background: #000",
        ".node-shader-script-dialog",
        ".node-shader-script-panel",
        ".node-shader-script-dialog textarea",
        ".node-shader-script-video-input-bar",
        ".node-shader-script-video-input-choices button[aria-pressed=\"true\"]",
        ".node-shader-script-video-input-index",
        ".node-shader-script-video-input-label",
        ".node-shader-script-quick-actions",
        ".node-shader-script-live-toggle-group",
        "#nodeShaderScriptApply[aria-pressed=\"true\"]",
        "#nodeShaderScriptEnable[aria-pressed=\"true\"]",
        ".node-shader-script-actions",
        ".node-shader-script-actions #nodeShaderScriptStatus",
        "user-select: text",
        ".panel-close-button",
        "aspect-ratio: 1 / 1",
        "max-inline-size: 2em",
        "max-block-size: 2em",
        "container-type: size",
        ".scene-context-danger",
        ".node-scene-context-menu button kbd",
        "justify-content: center",
        "text-align: center",
        ".node-module-actions-window .scene-context-alias-control input",
        "text-align: left",
        "display: none;",
        ".disconnect-wire-button",
        ".node-connection-list li.selected",
        ".node-connection-list li.state-read",
        ".node-connection-list li.inactive-wire",
        ".node-connection-list li.inactive-wire.selected",
        ".node-graph-output",
        ".node-waveform",
        ".node-signal-plot",
    ]:
        require(snippet in style_source, f"node graph style missing {snippet}")
    bad_value_evidence_style = style_source[
        style_source.index(".node-bad-value-monitor-evidence {"):
        style_source.index(".node-bad-value-monitor-evidence li {")
    ]
    bad_value_evidence_item_style = style_source[
        style_source.index(".node-bad-value-monitor-evidence li {"):
        style_source.index(".node-bad-value-monitor-evidence li[data-bad-value-reason]")
    ]
    require(
        "user-select: text;" in bad_value_evidence_style
        and "-webkit-user-select: text;" in bad_value_evidence_style
        and "user-select: text;" in bad_value_evidence_item_style
        and "-webkit-user-select: text;" in bad_value_evidence_item_style,
        "BADVAL/evidence text should remain selectable for copying scheduler errors",
    )
    require(
        "scale(var(--node-graph-zoom))" not in style_source,
        "node graph UI zoom should not bitmap-scale text",
    )
    require(
        "height: graphElement?.offsetHeight || graphElement?.getBoundingClientRect?.().height || 0" in script_sources["./public/node-graph-workspace-geometry.js"]
        and "width: graphElement?.offsetWidth || graphElement?.getBoundingClientRect?.().width || 0" in script_sources["./public/node-graph-workspace-geometry.js"],
        "node graph world bounds should use layout size with CSS zoom",
    )
    require(
        "function nodeGraphZoomSurfaceClientScale(surface = nodeGraphZoomSurface())" in script_sources["./public/node-graph-workspace-geometry.js"]
        and "rect.width / width" in script_sources["./public/node-graph-workspace-geometry.js"]
        and "function nodeGraphClientToZoomSurfacePoint(clientX, clientY, surface = nodeGraphZoomSurface())" in script_sources["./public/node-graph-workspace-geometry.js"]
        and "return nodeGraphClientToZoomSurfacePoint(anchor.x, anchor.y);" in script_sources["./public/node-graph-port-geometry.js"]
        and "const topLeft = nodeGraphClientToZoomSurfacePoint(nodeRect.left, nodeRect.top, surface);" in script_sources["./public/node-graph-wire-rendering.js"],
        "wire and port geometry should use measured zoom-surface scale",
    )
    require(
        "function nodeGraphRenderedPanValue(value, origin = 0)" in script_sources["./public/node-graph-workspace-geometry.js"]
        and "Math.round(originNumber + number) - originNumber" in script_sources["./public/node-graph-workspace-geometry.js"]
        and "function nodeGraphWorkspaceCenterOffset(container = document.getElementById(\"nodeGraphWorkspace\"))" in script_sources["./public/node-graph-workspace-geometry.js"]
        and "function nodeGraphRenderedOriginOffset(" in script_sources["./public/node-graph-workspace-geometry.js"]
        and "const originOffset = nodeGraphRenderedOriginOffset(pan, workspace);" in script_sources["./public/node-graph-workspace-view.js"]
        and 'workspace.style.setProperty("--node-graph-pan-x", `${originOffset.x}px`);' in script_sources["./public/node-graph-workspace-view.js"]
        and 'workspace.style.setProperty("--node-graph-pan-y", `${originOffset.y}px`);' in script_sources["./public/node-graph-workspace-view.js"]
        and 'heatmap.style.setProperty("--node-grid-heatmap-grid-position", `${origin.x}px ${origin.y}px`);' in script_sources["./public/node-graph-workspace-geometry.js"],
        "node graph rendered pan should snap to whole pixels around a center origin",
    )
    require(
        "const oldOrigin = workspace ? nodeGraphRenderedOriginOffset(oldPan, workspace) : oldPan;" in script_sources["./public/node-graph-workspace-zoom.js"]
        and "const nextCenter = workspace ? nodeGraphWorkspaceCenterOffset(workspace) : { x: 0, y: 0 };" in script_sources["./public/node-graph-workspace-zoom.js"]
        and "x: anchorPoint.x - workspaceRect.left - nextCenter.x - anchoredContentPoint.x * zoom" in script_sources["./public/node-graph-workspace-zoom.js"]
        and "function withNodeGraphWorkspaceContentAnchored(workspace, update) {\n  update();\n  applyNodeGraphPan();\n}" in script_sources["./public/node-graph-grid-utils.js"],
        "node graph zoom and resize should preserve the center-origin pan contract",
    )
    require(
        ".node-wiring-panel.modular-only-view .node-graph-resize-handle {\n  display: none;" not in style_source,
        "modular-only view should keep the modular workspace resize handle visible",
    )
    require(
        ".node-module-shop-view {\n  display: grid;\n  grid-template-rows: auto minmax(0, 1fr);" in style_source
        and "  gap: 0;" in style_source[
            style_source.index(".node-module-shop-view {"):
            style_source.index(".node-module-shop-view *", style_source.index(".node-module-shop-view {"))
        ]
        and "  overflow: hidden;\n  padding: 0;" in style_source
        and "  position: relative;\n  z-index: 82;" in style_source
        and ".node-module-shop-heading {\n  position: relative;\n  grid-template-columns:\n    var(--node-floating-window-header-height)\n    minmax(0, 1fr)\n    var(--node-floating-window-header-height);" in style_source
        and ".node-module-shop-heading .node-module-shop-drag-handle {\n  position: static;" in style_source
        and ".node-module-shop-heading > div:first-of-type {\n  grid-column: 2;" in style_source
        and ".node-module-shop-column {\n  display: grid;" in style_source
        and "  grid-template-rows: auto auto minmax(0, 1fr);" in style_source
        and "  min-height: 0;\n  overflow: hidden;\n  padding: 0;" in style_source
        and ".node-module-shop-controls {\n  display: grid;" in style_source
        and "  min-height: var(--node-floating-window-button-height);\n  max-height: var(--node-floating-window-button-height);" in style_source
        and ".node-module-shop-section {\n  display: grid;" in style_source
        and "  min-height: 0;\n  overflow: auto;" in style_source
        and ".node-module-shop-resize-handle {\n  position: absolute;\n  right: 0;\n  bottom: 0;" in style_source,
        "module browser resize grip should be glued to the panel corner while content scrolls separately",
    )
    module_department_title_style = style_source[
        style_source.index(".node-module-department-title {"):
        style_source.index(".node-module-department-title[hidden]")
    ]
    module_category_row_title_style = style_source[
        style_source.index(".scene-context-store-department-title {"):
        style_source.index(".scene-context-store-department-count")
    ]
    module_group_title_style = style_source[
        style_source.index(".scene-context-store-visual-group {"):
        style_source.index(".scene-context-store-visual-group:first-child")
    ]
    require(
        "color: rgba(226, 168, 109, 0.9)" in module_group_title_style
        and "color: rgba(127, 199, 217, 0.9)" in module_department_title_style
        and "font-size: 0.78rem" in module_department_title_style
        and "font-weight: 650" in module_department_title_style
        and "color: rgba(127, 199, 217, 0.9)" in module_category_row_title_style
        and "font-size: 0.78rem" in module_category_row_title_style
        and "font-weight: 650" in module_category_row_title_style,
        "module browser group headers should be orange while clickable category rows stay blue",
    )

    for snippet in [
        "class NodeLiveAudioProcessor extends AudioWorkletProcessor",
        'registerProcessor("node-live-audio-processor", NodeLiveAudioProcessor)',
        'message.type === "setPlan"',
        'message.type === "setParams"',
        'message.type === "stop"',
        "setParams(nodes, message = {})",
        "const patchFingerprint = message.patchFingerprint || plan?.patchFingerprint || \"\"",
        "const patchFingerprint = message.patchFingerprint || \"\"",
        "this.planSerial = message.planSerial || 0",
        "this.sessionId = message.sessionId || 0",
        "this.autoSmoothingSeconds = this.clampAutoSmoothingSeconds(message.autoSmoothingSeconds)",
        "this.syncNestedAutoSmoothingSeconds(this.autoSmoothingSeconds)",
        "smoothingFrequencyFromSeconds(seconds)",
        "return normalized <= 0 ? 0 : 1 / normalized;",
        "if (smoothingSeconds <= 0)",
        "let parameterCount = 0",
        "parameterCount += Object.keys(current.params || {}).length",
        "planSerial: this.planSerial",
        "sessionId: this.sessionId",
        "stateReadCount:",
        "feedbackModulations: (Array.isArray(plan?.feedbackModulations)",
        "feedbackSignals: (Array.isArray(plan?.feedbackConnections)",
        "parameterCount,",
        "patchFingerprint,",
        'type: "planApplied"',
        'type: "paramsApplied"',
        'type: "meter"',
        'type: "scope"',
        "this.meterClipCount = 0",
        "this.meterProtectionMuteCount = 0",
        "this.engineSampleRate = sampleRate",
        "this.hostSampleRate = sampleRate",
        "this.oversamplingRatio = 1",
        "this.badNumberCount = 0",
        "this.lastBadValueReason = \"\"",
        "this.lastBadValueNodeId = \"\"",
        "this.lastBadValueSource = \"\"",
        "this.earProtector = this.createEarProtector(sampleRate)",
        "createEarProtector(rate = sampleRate)",
        "const b0 = 0.5 * (1 + a1)",
        "const b1 = -b0",
        "outputSampleClipped(value)",
        "outputSampleTripsEarProtection(value)",
        "badValueReason(value)",
        "scopeScalarValue(value)",
        "captureModuleScopeFrame(frameValues = null, frame = 0, frames = 1)",
        "this.visualSinks = []",
        "this.visualSinks = (Array.isArray(plan?.visualSinks) ? plan.visualSinks : []).map",
        "for (const sink of this.visualSinks || [])",
        "connectionSum + this.readRuntimePortOutput(",
        "const inputPort = String(input.port || \"\").trim()",
        "const portId = `${nodeId}:${inputPort}`",
        "this.writeVisualInputBufferSample(nodeId, inputPort, inputValue, sink.bufferSampleLimit)",
        "if (captureDebugScope && inputPort && !input?.buffered)",
        "writeVisualInputBufferSample(nodeId, port, value, capacity = 262144)",
        "buffer.buffer[buffer.writeIndex] = this.scopeScalarValue(value)",
        "values.push([key, ordered, {",
        "startFrame: absoluteFrame - count",
        "postModuleScopeSnapshot()",
        "this.scopeBuffers = new Map()",
        "captureModuleScopeOutput(nodeId, output)",
        "this.captureModuleScopeOutput(nodeId, this.nodeOutputs.get(nodeId))",
        "for (const [port, value] of Object.entries(output))",
        "const portId = `${id}:${port}`",
        "this.appendScopeBufferSample(portId, value)",
        "values.push([nodeId, samples, {",
        "sampleRate: decimatedScopeSampleRate",
        "sampleRate: engineSampleRate",
        "const requestedRatio = Number(message.oversamplingRatio)",
        "this.oversamplingRatio = Math.max(1, Math.min(4, Math.round(requestedRatio) || 1))",
        "Math.abs(number) > 999999999",
        "Math.abs(number) < 1.1754943508222875e-38",
        "clipCount: this.meterClipCount",
        "badNumberCount: this.badNumberCount",
        "lastBadValueReason: this.lastBadValueReason",
        "lastBadValueNodeId: this.lastBadValueNodeId",
        "lastBadValueSource: this.lastBadValueSource",
        "protectionMuteCount: this.meterProtectionMuteCount",
        "protectionPeak: Number(this.speakerProtectionPeak) || 0",
        "this.speakerProtectionNodeId = \"output\"",
        "buildConnectionMap(items, ids, keyForItem)",
        "buildModulationConnectionMap(modulations, ids)",
        "const nodeLiveAdditiveHardMaxHarmonics = 1024",
        "ellipsoidSample(phase, offset = 0, shape = 0, scale = 1)",
        "ellipsoidVectorSample(",
        "nativeEllipsoidVectorSample(",
        'message.type === "setNativeModuleWasm"',
        "async setNativeModuleWasm(message)",
        "soemdsp_ellipsoid_vector_sample",
        "target,",
        "levelValue = 1",
        "output.Out = x",
        "output.Mono = x",
        "output.Wave = x",
        "output[\"Wave Out\"] = x",
        "this.ellipsoidSample(phase - Math.PI * 0.5",
        "additiveWaveformHarmonic(waveform, harmonic, modA = 0.5)",
        "additiveDampingCurveValue(value = 0)",
        "additiveDampingAlgorithmValue(value = 0)",
        "additiveFilterFrequencyValue(value = 20000, rate = this.engineSampleRate || sampleRate || 44100)",
        "rationalCurveValue(value = 0, skew = 0)",
        "const safeSkew = this.clampValue(Number(skew) || 0, -0.999999, 0.999999)",
        "((1 + safeSkew) * t) / (1 - safeSkew + 2 * safeSkew * t)",
        "additiveHarmonicDamping(harmonic, frequency, rate, curveValue = 0, algorithm = 0, filterFrequency = 20000)",
        "const safeFilterFrequency = this.additiveFilterFrequencyValue(filterFrequency, safeRate)",
        "const ratio = this.clampValue((Math.max(1, Number(harmonic) || 1) * safeFrequency) / safeFilterFrequency, 0, 1)",
        "additiveDampingAmplitude({",
        "if (mode === 1)",
        "if (mode === 2)",
        "if (mode === 3)",
        "if (mode === 4)",
        "if (mode === 5)",
        "return this.clampValue(1 - this.rationalCurveValue(t, curve), 0, 1)",
        "additiveHarmonicCurveAmount({",
        "additiveOscillatorSample(phase, params = {}, rate = this.engineSampleRate || sampleRate)",
        "Math.min(nodeLiveAdditiveHardMaxHarmonics, Math.round(Number(params.harmonics) || 32))",
        "const dampingGraphValueAt = typeof params.dampingGraphValueAt === \"function\"",
        "const phaseGraphValueAt = typeof params.phaseGraphValueAt === \"function\"",
        "const dampingX = this.clampValue((frequency * harmonic) / dampingFilterFrequency, 0, 1)",
        "this.clampValue(Number(dampingGraphValueAt(dampingX)) || 0, 0, 1)",
        "const harmonicPhaseAdd = this.clampValue(Number(params.harmonicPhaseAdd) || 0, 0, 1)",
        "const harmonicPhaseMultiply = this.clampValue(Number(params.harmonicPhaseMultiply) || 0, 0, 4)",
        "const phaseCurve = this.clampValue(Number(phaseGraphValueAt(harmonicRatio)) || 0, 0, 1)",
        "const phaseMultiplier = 1 + phaseCurve * harmonicPhaseMultiply",
        "const phaseOffset = (Number(partial.phase) || 0) + phaseCurve * harmonicPhaseAdd",
        "Math.sin((phase * harmonic * phaseMultiplier) + phaseOffset * Math.PI * 2)",
        "additiveOsc: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput, inputFrame, graphInputValue) =>",
        "const additiveSample = queuedAdditiveSample !== null",
        ": this.additiveOscillatorSample(",
        'dampingFilterFrequency: this.readEffectiveParameter(node, "dampingFilterFrequency", 20000, frame, frames, frameValues)',
        'dampingGraphValueAt: (x) => graphInputValue(nodeId, "Damping Graph", x, 1)',
        'harmonicPhaseAdd: this.readEffectiveParameter(node, "harmonicPhaseAdd", 0, frame, frames, frameValues)',
        'harmonicPhaseMultiply: this.readEffectiveParameter(node, "harmonicPhaseMultiply", 0, frame, frames, frameValues)',
        'phaseGraphValueAt: (x) => graphInputValue(nodeId, "Phase Graph", x, 0)',
        "value = { Out: additiveSample }",
        "this.ellipsoidWorkletEvaluate(node, nodeId, frame, frames, frameValues, mixInput, safeRate)",
        "const value = this.nativeEllipsoidVectorSample(",
        "ellipsoidFrame,",
        "phase + phaseOffset",
        'this.readEffectiveParameter(node, "offsetX", 0, frame, frames, frameValues)',
        'this.readEffectiveParameter(node, "shapeY", 0, frame, frames, frameValues)',
        "Out: selected",
        '"Wave Out": selected',
        "Noise: selected",
        "normalizeParameterModulationInput(value, metadata = {})",
        "applyParameterModulation(base, modulationSignal, metadata = {})",
        "createSmoother(initialValue, metadata = {})",
        "smoother.smoothingSeconds = this.smoothingSecondsFromMetadata(metadata)",
        "readSmoothedParameter(node, key, fallback, frame, frames)",
        "resolveSmoothingSecondsForMode(",
        "this.onePoleLowpassSample(",
        "metadata?.kind === \"frequency\" && metadata.nonlinearSlider",
        "const octaves = (Number(modulationSignal) || 0) / 0.1",
        "this.normalizeParameterModulationInput(this.readRuntimePortOutput(",
        "this.applyParameterModulation(base, modulationSignal, metadata)",
        "this.nodeOutputs = new Map()",
        "this.noiseSeedKeys = new Map()",
        "this.passiveFilterStates = new Map()",
        "this.cookbookFilterStates = new Map()",
        "this.ladderFilterStates = new Map()",
        "this.clockDividerStates = new Map()",
        "this.clockStates = new Map()",
        "this.delayedTriggerStates = new Map()",
        "this.patchCommandStates = new Map()",
        "this.expAdsrStates = new Map()",
        "this.fractalBrownianNoiseStates = new Map()",
        "this.flowerChildEnvelopeFollowerStates = new Map()",
        "this.linearEnvelopeStates = new Map()",
        "this.noiseGeneratorStates = new Map()",
        "this.oscResetStates = new Map()",
        "this.graphLfoStates = new Map()",
        "this.oscillatorLastPhaseIncrements = new Map()",
        "this.oscillatorStoppedSamples = new Map()",
        "this.randomClockStates = new Map()",
        "this.randomWalkStates = new Map()",
        "this.sampleHoldStates = new Map()",
        "this.slewLimiterStates = new Map()",
        "this.stepSequencerStates = new Map()",
        "this.triggerCounterStates = new Map()",
        "this.triggerDividerStates = new Map()",
        "this.vactrolEnvelopeStates = new Map()",
        "createVisualControlState()",
        "resetVisualControls()",
        "this.resetVisualControls()",
        "this.pluckEnvelopeStates = new Map()",
        "this.spiralStates = new Map()",
        "this.lorenzAttractorStates = new Map()",
        "createLorenzAttractorState()",
        "lorenzAttractorSample(options = {})",
        "const dt = (0.75 * speed) / sampleRateValue;",
        "const steps = Math.max(1, Math.ceil(dt / 0.0007));",
        "this.triangleStates = new Map()",
        "function nodeLiveIsPolyBlepOscillatorType(type)",
        'return type === "osc" || type === "polyBlep" || type === "sineWavetable"',
        "nodeLiveSineCosWavetableSample",
        "this.sineWavetableWorkletEvaluate(node, nodeId, frame, frames, frameValues, mixInput, safeRate)",
        "polyBlep(phaseCycle, phaseIncrement)",
        "polyBlepSquare(phaseCycle, phaseIncrement)",
        "currentNoiseSample(nodeId)",
        "oscillatorSample(nodeId, phase, phaseIncrement, waveform)",
        "const phaseStopped = Math.abs(phaseDelta) <= 1e-12",
        "if (phaseStopped && this.oscillatorStoppedSamples.has(nodeId))",
        "const renderPhaseIncrement = phaseStopped",
        "this.oscillatorStoppedSamples.set(nodeId, sample)",
        "this.oscillatorLastPhaseIncrements.set(nodeId, phaseDelta)",
        'mixInput(nodeId, "0.1V/Oct")',
        "const pitchedFrequency = Math.max(0, frequency * (2 ** (pitchInput / 0.1)))",
        "const phaseIncrement = (pitchedFrequency / safeRate) + incrementInput",
        '"Wave Out": selected',
        "Noise: selected",
        "sample = 1 - phaseCycle * 2 + this.polyBlep(phaseCycle, renderPhaseIncrement)",
        "this.oscResetStates",
        "this.triangleStates.set(nodeId, 0)",
        "noiseSeedKey(nodeId, seedValue, channel = \"\")",
        "createHighpassState()",
        "createLowpassState()",
        "createPassiveFilterState()",
        "createCookbookFilterState()",
        "createLadderFilterState()",
        "cookbookFilterCoefficients(mode, frequency, q, gainDb",
        "cookbookFilterSample(state, input, mode, frequency, q, gainDb, stages",
        "ladderFilterCoefficients(frequency, resonance, mode, stages",
        "ladderFilterSample(state, input, params, rate = sampleRate)",
        "y[0] = coeff.g * safeInput - coeff.k * y[4]",
        'node?.type === "cookbookFilter"',
        'node?.type === "ladderFilter"',
        "createOscResetState()",
        "createGraphLfoState()",
        "createSlewLimiterState()",
        "createClockState()",
        "createRandomClockState()",
        "createDelayedTriggerState()",
        "createPatchCommandState()",
        "createSampleHoldState()",
        "createStepSequencerState()",
        "createTriggerCounterState()",
        "createTriggerDividerState()",
        "createExpAdsrState()",
        "createLinearEnvelopeState()",
        "createPluckEnvelopeState()",
        "createVactrolEnvelopeState()",
        "createFlowerChildEnvelopeFollowerState()",
        "createNoiseGeneratorState()",
        "createRandomWalkState()",
        "createFractalBrownianNoiseState()",
        "onePoleHighpassSample(state, input, frequency, rate = sampleRate)",
        "onePoleLowpassSample(state, input, frequency, rate = sampleRate)",
        "slewLimiterSample(state, input, upTime, downTime, rate = sampleRate)",
        "Math.max(-maxFall, Math.min(maxRise, delta))",
        "clockSample(state, reset, phaseOffset, rate, duty, level, rateHz = sampleRate)",
        "const safePhaseOffset = this.wrapValue(this.safeFilterNumber(phaseOffset, null), 0, 1)",
        "clockAnalogWhipSample(phase, level)",
        "const analog = this.clockAnalogWhipSample(phase, safeLevel)",
        "const pulse = safeRate > 0 && !resetActive && (!state.hasStarted || nextRawPhase < rawPhase) ? safeLevel : 0",
        '"Analog Out": analog',
        '"Digital Out": digital',
        "Pulse: pulse",
        "Out: digital",
        "randomClockSample(state, reset, params, rateHz = sampleRate, nodeId = \"\")",
        "const incomingClockRate = (nodeId) =>",
        "this.inputConnections.get(this.inputKey(nodeId, \"Clock\"))",
        "delayedTriggerSample(state, trigger, reset, params, rateHz = sampleRate)",
        "patchCommandTriggerSample(state, trigger, threshold, command, nodeId)",
        'this.port.postMessage({',
        'type: "patchCommand"',
        "command,",
        "sampleHoldSample(state, input, trigger, threshold, sampleFrequency, sampleRate, hasInConnected, nodeId)",
        "stepSequencerSample(state, trigger, reset, params)",
        "triggerCounterSample(state, trigger, reset, params, rate = sampleRate)",
        "triggerDividerSample(state, trigger, reset, params, rate = sampleRate)",
        "pluckEnvelopeSample(state, trigger, release, params, rate = sampleRate)",
        "linearEnvelopeSample(state, gate, params, rate = sampleRate)",
        "vactrolEnvelopeCoefficient(seconds, rate = sampleRate)",
        "vactrolEnvelopeSample(state, light, params, rate = sampleRate)",
        "flowerChildSecondsToSamples(seconds, rate = sampleRate)",
        "flowerChildEnvelopeFollowerSample(state, input, params, rate = sampleRate)",
        "exponentialCurve(value, skew)",
        "noiseGeneratorSample(state, params, nodeId)",
        "randomWalkSample(state, params, rate = sampleRate, nodeId = \"\")",
        "fractalBrownianNoiseAxisState(state, axis)",
        "fractalBrownianNoiseSample(state, params, rate = sampleRate, nodeId = \"\", axis = \"x\", options = {})",
        "fractalBrownianNoiseVector(state, params, rate = sampleRate, nodeId = \"\", reset = 0)",
        "const rawX = this.fractalBrownianNoiseSample(state, params, safeRate, nodeId, \"x\", { raw: true })",
        "const rawY = this.fractalBrownianNoiseSample(state, params, safeRate, nodeId, \"y\", { raw: true })",
        "const rawZ = this.fractalBrownianNoiseSample(state, params, safeRate, nodeId, \"z\", { raw: true })",
        "rationalCurve(value, skew)",
        "smoothNoise1d(x, seed)",
        "expAdsrCalcCoef(rate, targetRatio)",
        "expAdsrSample(state, gate, params, rate = sampleRate)",
        "Math.exp(-Math.log((1 + safeRatio) / safeRatio) / safeRate)",
        "monitorBadValueSample(value, nodeId)",
        "visualControlIntensity(value, nodeId, source = \"visual control\")",
        "visualControlSigned(value, nodeId, source = \"visual control\")",
        "smoothVisualControl(key, target, rate = sampleRate, seconds = 0.045, min = 0, max = 1)",
        "postVisualControls()",
        "blue: this.clampValue(this.visualControls.blue, 0, 1)",
        "chromaAlpha: this.clampValue(this.visualControls.chromaAlpha, 0, 1)",
        "chromaHue: this.clampValue(this.visualControls.chromaHue, 0, 1)",
        "chromaSaturation: this.clampValue(this.visualControls.chromaSaturation, 0, 1)",
        "visualBloom: this.clampValue(this.visualControls.visualBloom, 0, 1)",
        "visualBrightness: this.clampValue(this.visualControls.visualBrightness, 0, 1)",
        "visualGlow: this.clampValue(this.visualControls.visualGlow, 0, 1)",
        "scopePaused: this.clampValue(this.visualControls.scopePaused, 0, 1)",
        "scopeTracesOff: this.clampValue(this.visualControls.scopeTracesOff, 0, 1)",
        "screenDim: this.clampValue(this.visualControls.screenDim, 0, 1)",
        "x: this.clampValue(this.visualControls.x, -1, 1)",
        "valueSlider: (node, nodeId, frame, frames, frameValues) => {",
        "return { Bias: offset, Out: offset, offset };",
        "macroKnob: (node, nodeId, frame, frames, frameValues) => {",
        "this.liveModuleEvaluators.bipolarKnob = this.liveModuleEvaluators.macroKnob;",
        "return { Out: knobValue, value: knobValue };",
        'type: "visualControls"',
        "visualSinkCount: Array.isArray(plan?.visualSinks) ? plan.visualSinks.length : 0",
        "speakerOutputActive: Boolean(plan?.speakerOutputActive)",
        "visualSinks: Array.isArray(plan?.visualSinks) ? plan.visualSinks : []",
        "b0 * safeInput + b1 * state.inputBuffer + a1 * state.outputBuffer",
        "b0 * safeInput + a1 * state.outputBuffer",
        "evaluateFrame(frame, frames, inputs = [], rate = this.engineSampleRate || sampleRate, inputFrame = frame)",
        "const engineFrames = frames * oversamplingRatio",
        "const subframeOutput = this.evaluateFrame(engineFrame, engineFrames, inputs, engineSampleRate, frame)",
        "left: useRaptEllipticDecimator ? decimatedLeft : leftSum / oversamplingRatio",
        "right: useRaptEllipticDecimator ? decimatedRight : rightSum / oversamplingRatio",
        "readRuntimeOutput(frameValues, nodeId, port = \"Out\")",
        "output[port] ?? output.Out",
        "readRuntimePortOutput(frameValues, nodeId, port = \"Out\"",
        "normalizeParameterOutputValue(value, metadata = {})",
        "parameterValueToNormalizedSignal(value, metadata = {})",
        "normalizedSignalToParameterValue(signal, metadata = {})",
        "jerobeamSpiralSample(options)",
        "spiralRender(inX, inY, inZ, zDepth)",
        "spiralShape(lophas, phasor, dense, div, morph)",
        "spiralRotate(inX, inY, inZ, rotX, rotY)",
        "spiralNextPhasor(state, key, frequency, offset, sampleRate, bipolar = false)",
        'node?.type === "audioInput"',
        'this.readEffectiveParameter(node, "level", 1',
        'node?.type === "spiral"',
        'node?.type === "lorenzAttractor"',
        'node?.type === "passiveFilter"',
        'node?.type === "slewLimiter"',
        'node?.type === "randomClock"',
        'node?.type === "clockDivider"',
        'node?.type === "delayedTrigger"',
        'node?.type === "sampleHold"',
        "midiOut: (node, nodeId, frame, frames, frameValues, mixInput) => {",
        "midiNotePitch: (node, nodeId, frame, frames, frameValues, mixInput) => {",
        "keyboardController: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {",
        'hasInput(nodeId, "MIDI Note")',
        'hasInput(nodeId, "Velocity")',
        "const automatedPitch = resetActive || hasInput(nodeId, \"MIDI Note\") || hasInput(nodeId, \"Octave\");",
        "? this.clampValue(Math.round(rawMidi) - 48, 0, 24)",
        "macroControls: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {",
        'hasInput(nodeId, port)',
        "pitchModWheel: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {",
        'hasInput(nodeId, "Pitch")',
        "screenSpaceShader: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => this.screenSpaceShaderSample(",
        "screenSpaceShaderSample(node, readInput, rate = sampleRate, nodeId = \"\")",
        'if (input.mode === "raw")',
        'node?.type === "stepSequencer"',
        'node?.type === "triggerCounter"',
        'node?.type === "triggerDivider"',
        'node?.type === "expAdsr"',
        'node?.type === "linearEnvelope"',
        'node?.type === "pluckEnvelope"',
        'node?.type === "vactrolEnvelopeSeries"',
        'node?.type === "flowerChildEnvelopeFollower"',
        "this.flowerChildEnvelopeFollowerSample(",
        "sandboxVisuals: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {",
        "bloomGlow: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {",
        "rgbaHsla: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {",
        "chromaColor: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {",
        "this.visualControlIntensity(mixInput(nodeId, \"Shake\"), nodeId, \"screen visuals shake\")",
        "this.visualControlSigned(mixInput(nodeId, \"X\"), nodeId, \"sandbox visuals x\")",
        "this.visualControlIntensity(mixInput(nodeId, \"Dim\"), nodeId, \"screen visuals dim\")",
        "this.visualControlIntensity(mixInput(nodeId, \"Scope Off\"), nodeId, \"screen visuals scope off\")",
        "this.visualControlIntensity(mixInput(nodeId, \"Pause\"), nodeId, \"screen visuals pause\")",
        'read("screenDim", 0)',
        'read("visualBrightness", 0.55)',
        'read("visualBloom", 0.45)',
        'read("visualGlow", 0.6)',
        "this.visualControlIntensity(mixInput(nodeId, \"HSL Mix\"), nodeId, \"rgba hsla hsl mix\")",
        "this.visualControlIntensity(mixInput(nodeId, \"Alpha\"), nodeId, \"rgba hsla alpha\")",
        'read("chromaHue", 0.58)',
        'read("visualBrightness", 0.55)',
        '"Full Value": outputMidiNumber',
        "Normalized: outputMidiNumber / 127",
        "440 * (2 ** ((pitch - 69) / 12))",
        '"Pitch 0-1": pitch / 127',
        '"Pitch 0-127": pitch',
        "const outputFrequency = Math.max(0, frequency);",
        "const increment = Math.max(0, outputFrequency / safeRate)",
        "Increment: increment",
        "Pause: scopePaused",
        "ScopeOff: scopeTracesOff",
        'node?.type === "noiseGenerator"',
        'node?.type === "randomWalk"',
        'node?.type === "fractalBrownianNoise"',
        "groupInput: (node, nodeId) => ({",
        'node?.type === "moduleGroup"',
        "groupOutput: (node, nodeId, frame, frames, frameValues, mixInput) => ({",
        "createNestedRuntime(plan)",
        "evaluateModuleGroup(node, mixInput, frame, frames, rate, inputFrame)",
        "moduleGroupPlan",
        "badvalMonitor: (node, nodeId, frame, frames, frameValues, mixInput) => this.monitorBadValueSample(",
        "this.monitorBadValueSample(mixInput(nodeId), nodeId)",
        "speakerProtectionSample(value, nodeId)",
        "this.meterProtectionMuteCount += 1",
        "speakerProtection: (node, nodeId, frame, frames, frameValues, mixInput) => {",
        "this.speakerProtectionSample(speakerProtectionMono, nodeId)",
        "normalizeGraph(value = {})",
        "graphEndpointYLockEnabledForNode(node)",
        "graphWithLockedEndpointY(graphValue)",
        "graphForNode(node)",
        'shape === "smooth"',
        'shape === "hold"',
        "graphRationalCurve(position, contour = 0)",
        "graphExponentialCurve(position, contour = 0)",
        "graphSmoothCurve(position)",
        "graphBezierPointAt(nodes, position = 0)",
        "graphBezierValueAt(graph, xValue)",
        "graphInterpolationWindowStart(nodes, x, degree)",
        "graphLagrangeValueAt(graph, xValue, degree = 3)",
        "return p * p * (3 - 2 * p)",
        'right.shape === "hold"',
        "? (p >= 1 ? 1 : 0)",
        'right.shape === "smooth"',
        "this.graphSmoothCurve(p)",
        "graphValueAt(graphValue, xValue, smoothingMode = \"legacy\")",
        'normalizedMode === "meander"',
        'normalizedMode === "quadratic"',
        'normalizedMode === "cubic"',
        'node?.type === "graph" || node?.type === "graph2"',
        "const graphSampleX = (node, nodeId) => {",
        'this.readEffectiveParameter(node, "mode", 0',
        'this.readEffectiveParameter(node, "rate", 1',
        'this.readEffectiveParameter(node, "phase", 0',
        "this.graphLfoStates.get(nodeId)",
        "const resetValue = 0",
        "state.resetFrame = currentFrame",
        "this.wrapValue(((currentFrame - resetFrame) / safeRate) * rateValue + phaseValue, 0, 1)",
        "const graphOutputValue = (node, nodeId) => {",
        "this.graphValueAt(this.graphForNode(node)",
        "this.graphSmoothingModeForNode(node)",
        'this.readEffectiveParameter(node, "outputMin", 0',
        'this.readEffectiveParameter(node, "outputMax", 1',
        "return outputMin + normalizedValue * (outputMax - outputMin)",
        "graphOutputValue(node, nodeId),",
        'this.readEffectiveParameter(node, "frequency", 1000',
        "readEffectiveParameter(node, key, fallback, frame, frames, frameValues)",
        "evaluateFrame(frame, frames, inputs = [], rate = this.engineSampleRate || sampleRate, inputFrame = frame)",
        "process(inputs, outputs)",
        "const input = inputs[0] || []",
        "inputPeak: this.inputMeterPeak",
        "inputRms: Math.sqrt(this.inputMeterSquareSum / Math.max(1, this.inputMeterSamples))",
        "const outputVolume = outputNode",
        'const outputMono = mixInput(this.outputNode || "output", "Mono")',
        'left: (outputMono + mixInput(this.outputNode || "output", "Left")) * outputVolume',
        'right: (outputMono + mixInput(this.outputNode || "output", "Right")) * outputVolume',
        "modulation.sourcePort",
        "const protectedFrame = this.earProtector.protect(frameOutput.left, frameOutput.right)",
        "this.clampValue(protectedFrame.left, -0.95, 0.95)",
        "for (const channel of output)",
    ]:
        require(snippet in worklet_source, f"live audio worklet source missing {snippet}")


def require_readme_scheduler_contract() -> None:
    readme_source = (ROOT / "README.md").read_text(encoding="utf-8")
    readme_text = " ".join(readme_source.split())
    for snippet in [
        "git clone https://github.com/soundemote/soemdsp-sandbox.git",
        "cd soemdsp-sandbox",
        "python server.py",
        "http://127.0.0.1:8765",
        "python scripts\\smoke_test.py",
        "No package install is required for the sandbox server.",
        "The server only writes through explicit save/settings/audio helper routes.",
        "Open Path is restricted to Downloads.",
        "The browser patch graph is demo-scoped state.",
        "The browser compiler is not the production soemdsp scheduler.",
        "The WebUI does not instantiate real C++ DSP objects yet.",
        "Patch files can save current module instances and settings.",
        "Patch files cannot define new module types by themselves.",
        "python tools\\webui-clap-host\\webui_clap_host.py",
        "tools\\webui-clap-host\\start_webui_clap_host.cmd",
        "tools\\webui-clap-host\\start_webui_clap_host.ps1",
        "Windows launcher, metadata inspection on by default:",
        "Localhost companion prototype for CLAP catalog and instance probes.",
        "Render Sample has a bounded CLAP bridge.",
        "Feedback touching CLAP nodes and Live Audio CLAP plans are blocked for now.",
        "python tools\\webui-clap-host\\webui_clap_host.py --port 48000",
        "tools\\webui-clap-host\\start_webui_clap_host.cmd -Port 48000",
        "tools\\webui-clap-host\\start_webui_clap_host.ps1 -Port 48000",
        "python tools\\webui-clap-host\\webui_clap_host.py --inspect-metadata",
        "python tools\\webui-clap-host\\webui_clap_host.py --test-instantiate",
        "python tools\\webui-clap-host\\webui_clap_host.py --doctor --inspect-metadata",
        "Edit the Host field if the companion is not using http://127.0.0.1:47991.",
        "Click Copy Host Command if you need the Windows .cmd launcher command.",
        "Click Diagnostics to read setup counts from the running host.",
        "Click Refresh Plugins to read the host catalog.",
        "Add a CLAP Plugin module to store a selected catalog entry.",
        "GET /health reports host capabilities.",
        "GET /health also reports hostConfig: bind host, port, Python executable, scan dirs, explicit plugins, and probe flags.",
        "GET /diagnostics reports hostConfig, catalog counts, metadata errors, instantiation errors, and missing explicit plugin paths.",
        "--doctor reports hostConfig, catalog counts, metadata errors, instantiation errors, and missing explicit plugin paths as JSON.",
        "Capabilities include maxProcessFrames, processBatch, and offlineRenderSessions.",
        "Current maxProcessFrames default is 48000.",
        "POST /instances",
        "GET /instances/<id>/params",
        "GET /instances/<id>/latency",
        "GET /instances/<id>/tail",
        "GET /instances/<id>/state",
        "POST /instances/<id>/state",
        "POST /instances/<id>/editor/close",
        "POST /instances/<id>/param",
        "POST /instances/<id>/params",
        "POST /instances/<id>/render/begin",
        "POST /instances/<id>/process",
        "POST /instances/<id>/render/end",
        "POST /process-batch",
        "/process can accept and return bounded planar-f32-base64 audio.",
        "/process can apply a parameters array before processing the chunk.",
        "CLAP_PROCESS_ERROR fails the process call instead of returning audio.",
        "Direct /param and /params writes are blocked while a render session is active.",
        "Abandoned render sessions are released by an idle timeout.",
        "A second render/begin is rejected while a non-idle render session is active.",
        "Render Sample opens one render session per CLAP instance, processes chunks, then closes the session.",
        "Render Sample requires audioProcessing: true from the host.",
        "Render Sample requires offlineRenderSessions: true from the host.",
        "Render Sample uses maxProcessFrames for CLAP process chunk size.",
        "WebUI CLAP audio lanes flatten every CLAP audio port in host port order.",
        "CLAP editor status can be detected; supported Win32 clap.gui editors can open when the plugin accepts the GUI sequence.",
        "CLAP latency is compensated when Render Sample injects returned CLAP output.",
        "Finite CLAP tails can extend Render Sample up to the bounded tail limit; infinite tails remain metadata-only.",
        "CLAP state can be saved into patch JSON and restored into a new host instance when the plugin exposes clap.state.",
        "Independent CLAP nodes in the same chunk can share one batch request.",
        "POST /instances/<id>/safety/reset",
        "DELETE /instances/<id>",
        "Moog Ladder",
        "Diode Ladder",
        "Sallen-Key",
        "State-Variable Filter",
        "Twin-T Notch",
        "Discrete Multimode Filter",
        "Simultaneous LP/HP Filter",
        "Switchable Third-Order Filter",
        "Diode-Controlled LP/HP Pair",
        "Zero-delay feedback",
        "Self-oscillating resonance",
        "flower_child_filter",
        "rsmet_filter",
        "yellowjacket_filter",
        "superlove_filter",
        "chaotic_phase_locking_filter",
        "resonator_filter",
        "human_filter",
        "Characterizing behavior empirically",
        "morphs a sine into a square",
        "SuperLove's HP6 mode in particular",
        "Polivoks-style filter",
        "Resonator Filter deserves more than",
        "sinusoidal fractal quality",
        "docs/assets/resonator-waveforms.png",
        "docs/assets/yellowjacket-response.png",
        "supersaw",
        "RobinSchmidt/RS-MET",
        "Pitch Dithering",
        "rsPitchDitherOsc",
        "SupersawUnit",
        "SupersawMaster",
        "RAPT::rsRatioGenerator",
        "Synthwave Orchestra",
        "docs/images/synthwave-orchestra-interface.png",
        "docs/reference/Supersaw.hpp",
        "Jerobeam Modules",
        "Blubb",
        "Boing",
        "Kepler-Bouwkamp",
        "Mushroom",
        "Nyquist-Shannon",
        "Torus",
        "WirdoSpiral",
        "docs/media/radar-prettyscope-render.png",
        "docs/media/radar-anim.gif",
        "BEAMING_RADAR_SIGNAL_TO_JEROBEAM.md",
        "POWER_ENGINE_SYNTHESIS.md",
        "Metallic Ratio",
        "metallic mean",
    ]:
        require(snippet in readme_text, f"README scheduler contract missing {snippet}")
    for snippet in [
        "Feedback routing remains blocked",
        "acyclic browser patches",
        "CLAP latency can be reported, but Render Sample does not compensate plugin latency yet.",
        "CLAP tail is recorded as render metadata, but Render Sample does not extend render length for plugin tails yet.",
        "CLAP editor status can be detected, but native editor opening is not implemented yet.",
    ]:
        require(snippet not in readme_text, f"README scheduler contract still has stale text: {snippet}")


def fetch_valid_manifest_payload(base_url: str) -> dict[str, object]:
    manifest_response = request(f"{base_url}/api/manifest")
    require(manifest_response.status == 200, "manifest endpoint did not return 200")
    require_json_response_metadata(manifest_response, "manifest endpoint")
    payload = json.loads(manifest_response.body.decode("utf-8"))
    require(isinstance(payload, dict), "manifest response payload was not object")
    require(payload.get("ok") is True, "manifest payload was not ok")
    manifest_path = payload.get("manifestPath")
    artifact_root = payload.get("artifactRoot")
    require(isinstance(manifest_path, str) and manifest_path, "manifest path missing")
    require(isinstance(artifact_root, str) and artifact_root, "artifact root missing")
    manifest_file = Path(manifest_path).resolve()
    require(manifest_file.is_file(), "manifest path does not point to a file")
    require(Path(artifact_root).resolve() == manifest_file.parent, "artifact root mismatch")
    require_manifest_file_info(payload, manifest_file, "manifest endpoint")
    return payload


def require_node_metadata_kinds_transport(base_url: str) -> None:
    response = request(f"{base_url}/api/node-metadata-kinds")
    require(response.status == 200, "node metadata kinds endpoint did not return 200")
    require_json_response_metadata(response, "node metadata kinds endpoint")
    payload = json.loads(response.body.decode("utf-8"))
    require(isinstance(payload, dict), "node metadata kinds payload was not object")
    require(payload.get("ok") is True, "node metadata kinds payload was not ok")
    templates = payload.get("templates")
    require(isinstance(templates, dict), "node metadata kind templates missing")
    meta_kinds = read_soemdsp_meta_kinds()
    require(meta_kinds == EXPECTED_META_KINDS, "soemdsp meta kind fixture drifted")
    template_kinds = set(templates)
    missing = meta_kinds - template_kinds
    require(not missing, f"node metadata kind templates missing meta.hpp kinds: {sorted(missing)}")
    amplitude = templates.get("amplitude")
    decibels = templates.get("decibels")
    decimal = templates.get("decimal")
    decimal_bipolar = templates.get("decimal_bipolar")
    frequency = templates.get("frequency")
    phase = templates.get("phase")
    descrete = templates.get("descrete")
    integer_bipolar = templates.get("integer_bipolar")
    waveform = templates.get("waveform")
    bypass = templates.get("bypass")
    plusminus = templates.get("plusminus")
    onoff = templates.get("onoff")
    momentary = templates.get("momentary")
    require(isinstance(amplitude, dict), "amplitude metadata kind missing")
    require(isinstance(decibels, dict), "decibels metadata kind missing")
    require(isinstance(decimal, dict), "decimal metadata kind missing")
    require(isinstance(decimal_bipolar, dict), "decimal_bipolar metadata kind missing")
    require(isinstance(frequency, dict), "frequency metadata kind missing")
    require(isinstance(phase, dict), "phase metadata kind missing")
    require(isinstance(descrete, dict), "descrete metadata kind missing")
    require(isinstance(integer_bipolar, dict), "integer_bipolar metadata kind missing")
    require(isinstance(waveform, dict), "waveform metadata kind missing")
    require(isinstance(bypass, dict), "bypass metadata kind missing")
    require(isinstance(plusminus, dict), "plusminus metadata kind missing")
    require(isinstance(onoff, dict), "onoff metadata kind missing")
    require(isinstance(momentary, dict), "momentary metadata kind missing")
    require(amplitude.get("label") == "Amplitude", "amplitude metadata label mismatch")
    require(amplitude.get("unit") == "amp", "amplitude metadata unit mismatch")
    require(amplitude.get("linearSmoothing") is True, "amplitude linearSmoothing mismatch")
    require(amplitude.get("maxDigits") == 3, "amplitude maxDigits mismatch")
    require(decibels.get("label") == "Decibels", "decibels metadata label mismatch")
    require(decibels.get("unit") == "dB", "decibels metadata unit mismatch")
    require(decimal.get("step") == 0.0001, "decimal metadata step mismatch")
    require(decimal.get("maxDigits") == 4, "decimal maxDigits mismatch")
    require(decimal_bipolar.get("unit") == "", "decimal_bipolar metadata unit mismatch")
    require(decimal_bipolar.get("showPlusMinus") is True, "decimal_bipolar showPlusMinus mismatch")
    require("showPlusMinus" not in decibels, "decibels should not default showPlusMinus")
    require(frequency.get("unit") == "Hz", "frequency metadata unit mismatch")
    require(frequency.get("linearSmoothing") is True, "frequency linearSmoothing mismatch")
    require(frequency.get("step") == 0, "frequency metadata step should default to zero")
    require(frequency.get("maxDigits") == 5, "frequency maxDigits mismatch")
    require(phase.get("unit") == "cycle", "phase metadata unit mismatch")
    require(phase.get("wraparound") is True, "phase wraparound mismatch")
    require(phase.get("linearSmoothing") is True, "phase linearSmoothing mismatch")
    require("showPlusMinus" not in templates.get("pitch", {}), "pitch should not default showPlusMinus")
    require(descrete.get("unit") == "idx", "descrete metadata unit mismatch")
    require(descrete.get("linearSmoothing") is False, "descrete linearSmoothing mismatch")
    require(integer_bipolar.get("label") == "Integer Bipolar", "integer_bipolar metadata label mismatch")
    require(integer_bipolar.get("unit") == "idx", "integer_bipolar metadata unit mismatch")
    require(integer_bipolar.get("min") == -9, "integer_bipolar metadata min mismatch")
    require(integer_bipolar.get("max") == 9, "integer_bipolar metadata max mismatch")
    require(integer_bipolar.get("showPlusMinus") is True, "integer_bipolar showPlusMinus mismatch")
    require(integer_bipolar.get("linearSmoothing") is False, "integer_bipolar linearSmoothing mismatch")
    require(
        waveform.get("choices") == ["Saw", "Ramp", "Square", "Triangle", "Sine", "Noise"],
        "waveform choices mismatch",
    )
    require(waveform.get("displayChoices") is True, "waveform displayChoices mismatch")
    require(waveform.get("divideChoicesVisibly") is True, "waveform divideChoicesVisibly mismatch")
    require(waveform.get("linearSmoothing") is False, "waveform linearSmoothing mismatch")
    require(waveform.get("min") == 0, "waveform metadata min mismatch")
    require(waveform.get("max") == 5, "waveform metadata max mismatch")
    require(waveform.get("mid") == 2, "waveform metadata mid mismatch")
    require(bypass.get("choices") == ["active", "BYPASSED"], "bypass choices mismatch")
    require(bypass.get("displayChoices") is True, "bypass displayChoices mismatch")
    require(bypass.get("divideChoicesVisibly") is True, "bypass divideChoicesVisibly mismatch")
    require(bypass.get("linearSmoothing") is False, "bypass linearSmoothing mismatch")
    require(plusminus.get("choices") == ["-", "+"], "plusminus choices mismatch")
    require(plusminus.get("displayChoices") is True, "plusminus displayChoices mismatch")
    require(plusminus.get("divideChoicesVisibly") is True, "plusminus divideChoicesVisibly mismatch")
    require(plusminus.get("showPlusMinus") is True, "plusminus showPlusMinus mismatch")
    require(onoff.get("choices") == ["off", "on"], "onoff choices mismatch")
    require(onoff.get("displayChoices") is True, "onoff displayChoices mismatch")
    require(onoff.get("divideChoicesVisibly") is True, "onoff divideChoicesVisibly mismatch")
    require(momentary.get("choices") == ["idle", "on"], "momentary choices mismatch")
    require(momentary.get("displayChoices") is True, "momentary displayChoices mismatch")
    require(momentary.get("divideChoicesVisibly") is True, "momentary divideChoicesVisibly mismatch")


def require_manifest_contracts(payload: dict[str, object]) -> None:
    require_producer_proof(payload)
    require_handoff_contract(payload)
    require_artifact_contract(payload)
    require_phase_contract(payload)
    require_parameter_resync_contract(payload)
    require_caller_processing_order_contract(payload)


def require_artifact_report_and_audio_contracts(
  base_url: str,
  payload: dict[str, object],
) -> None:
    require_artifact_reachability(base_url, payload)
    require_report_documents(base_url, payload)
    require_parameter_summary(base_url, payload)
    require_primary_audio_wav(base_url, payload)

    manifest = payload.get("manifest")
    require(isinstance(manifest, dict), "manifest object missing")
    handoff = manifest.get("sandboxHandoff", {})
    require(isinstance(handoff, dict), "sandbox handoff missing")
    audio_path = handoff.get("primaryAudioArtifact")
    require(audio_path, "primary audio artifact missing from handoff")
    audio_response = request(
        f"{base_url}/artifact?path={urllib.parse.quote(str(audio_path))}",
        method="HEAD",
    )
    require(audio_response.status == 200, "primary audio artifact did not return 200")
    require_no_store(audio_response, "primary audio artifact")


def require_server_error_contracts(base_url: str) -> None:
    missing_path = request(f"{base_url}/artifact", method="HEAD")
    require(missing_path.status == 400, "missing artifact path did not return 400")
    require_no_store(missing_path, "missing artifact path")

    missing_route = request(f"{base_url}/missing", method="HEAD")
    require(missing_route.status == 404, "missing route did not return 404")
    require_no_store(missing_route, "missing route")

    missing_public = request(f"{base_url}/public/missing.js", method="HEAD")
    require(missing_public.status == 404, "missing public file did not return 404")
    require_no_store(missing_public, "missing public file")

    missing_artifact = request(
        f"{base_url}/artifact?path=missing.wav",
        method="HEAD",
    )
    require(missing_artifact.status == 404, "missing artifact did not return 404")
    require_no_store(missing_artifact, "missing artifact")

    forbidden_artifact = request(
        f"{base_url}/artifact?path=../server.py",
        method="HEAD",
    )
    require(forbidden_artifact.status == 403, "artifact traversal did not return 403")
    require_no_store(forbidden_artifact, "artifact traversal")

    forbidden_encoded_artifact = request(
        f"{base_url}/artifact?path=%2e%2e/server.py",
        method="HEAD",
    )
    require(
        forbidden_encoded_artifact.status == 403,
        "encoded artifact traversal did not return 403",
    )
    require_no_store(forbidden_encoded_artifact, "encoded artifact traversal")

    forbidden_public = request(
        f"{base_url}/public/%2e%2e/server.py",
        method="HEAD",
    )
    require(forbidden_public.status == 403, "public traversal did not return 403")
    require_no_store(forbidden_public, "public traversal")

    manifest_head = request(f"{base_url}/api/manifest", method="HEAD")
    require(manifest_head.status == 405, "manifest HEAD did not return 405")
    require_no_store(manifest_head, "manifest HEAD")

    metadata_head = request(f"{base_url}/api/node-metadata-kinds", method="HEAD")
    require(metadata_head.status == 405, "node metadata kinds HEAD did not return 405")
    require_no_store(metadata_head, "node metadata kinds HEAD")

    require_read_only_method_rejections(base_url)


def require_native_module_contract(base_url: str) -> None:
    index_html = (PUBLIC / "index.html").read_text(encoding="utf-8")
    server_source = (ROOT / "server.py").read_text(encoding="utf-8")
    definitions_source = (PUBLIC / "node-graph-module-definitions.js").read_text(encoding="utf-8")
    module_store_source = (PUBLIC / "node-graph-module-store.js").read_text(encoding="utf-8")
    module_actions_source = (PUBLIC / "node-graph-module-actions.js").read_text(encoding="utf-8")
    context_menu_source = (PUBLIC / "node-graph-context-menu.js").read_text(encoding="utf-8")
    event_bindings_source = (PUBLIC / "node-graph-scene-menu-event-bindings.js").read_text(encoding="utf-8")
    live_runtime_source = (PUBLIC / "node-graph-live-runtime.js").read_text(encoding="utf-8")
    worklet_source = read_assembled_worklet_source()
    native_build_source = (ROOT / "scripts" / "build_native_modules.ps1").read_text(encoding="utf-8")
    native_sources = sorted((ROOT / "native_modules").glob("*/*.cpp"))
    require(native_sources, "native modules folder should contain C++ sources")

    require(
        '"wasmUrl": relative_wasm,' in server_source
        and '"wasmUrl": f"/{relative_wasm}"' not in server_source,
        "native module wasmUrl must be a relative path so it resolves correctly when the sandbox is mounted under a subdirectory (e.g. embedded as a static export)",
    )
    require(
        "async function fetchNodeGraphLiveNativeModuleCatalogFallback()" in live_runtime_source
        and 'fetch("native-modules-catalog.json"' in live_runtime_source
        and "fetchNodeGraphLiveNativeModuleCatalogFallback()" in live_runtime_source[
            live_runtime_source.index("async function fetchNodeGraphLiveNativeModuleCatalog()"):
        ],
        "native module catalog fetch should fall back to a static bundled catalog when /api/native-modules is unavailable (static hosting has no server behind it)",
    )
    static_catalog_path = PUBLIC / "native-modules-catalog.json"
    require(static_catalog_path.exists(), "public/native-modules-catalog.json should exist for static-hosting fallback")
    static_catalog = json.loads(static_catalog_path.read_text(encoding="utf-8"))
    require(
        isinstance(static_catalog.get("modules"), list) and len(static_catalog["modules"]) == len(native_sources),
        "static native module catalog should list every native module (run scripts/generate_native_modules_catalog.py after adding one)",
    )
    require(
        all(not str(entry.get("wasmUrl", "")).startswith("/") for entry in static_catalog["modules"]),
        "static native module catalog wasmUrl entries must be relative paths",
    )
    external_ui_events_source = (PUBLIC / "node-graph-external-ui-events.js").read_text(encoding="utf-8")
    require(
        'message.type === "soundemote:sandbox-project-data"' in external_ui_events_source
        and 'message.type === "soundemote:sandbox-load-resource"' in external_ui_events_source
        and 'envelope?.kind === "sandbox_resource"' in external_ui_events_source
        and 'message.type === "soundemote:set-view"' in external_ui_events_source
        and "function nodeGraphExternalApplyView" in external_ui_events_source
        and "nodeGraphExternalViewOptionsFromSearch" in external_ui_events_source
        and 'message.type === "soundemote:request-current-patch"' in external_ui_events_source
        and 'type: "soundemote:current-patch"' in external_ui_events_source,
        "external UI events should support the soundemote-site postMessage bridge for resources, view framing, and patch loading/requesting",
    )
    styles_source = (PUBLIC / "styles.css").read_text(encoding="utf-8")
    require(
        ".soemdsp-hide-ui .node-wiring-panel.modular-only-view" in styles_source
        and "--node-modular-only-inset: 0px" in styles_source
        and "width: 100dvw" in styles_source
        and "box-shadow: none !important" in styles_source,
        "hideui modular embeds should remove sandbox chrome and fill the iframe",
    )

    expected_native_exports = {
        "transport": ["soemdsp_transport_create", "soemdsp_transport_destroy", "soemdsp_transport_sample", "soemdsp_transport_unipolar"],
        "slew_limiter": ["soemdsp_slew_limiter_create", "soemdsp_slew_limiter_destroy", "soemdsp_slew_limiter_sample"],
        "sample_hold": ["soemdsp_sample_hold_create", "soemdsp_sample_hold_destroy", "soemdsp_sample_hold_sample"],
        "chord_memory": ["soemdsp_chord_memory_create", "soemdsp_chord_memory_destroy", "soemdsp_chord_memory_sample"],
        "turing_machine": ["soemdsp_turing_machine_create", "soemdsp_turing_machine_destroy", "soemdsp_turing_machine_sample"],
        "flower_child_envelope_follower": ["soemdsp_flower_child_envelope_follower_create", "soemdsp_flower_child_envelope_follower_destroy", "soemdsp_flower_child_envelope_follower_sample"],
        "trigger_divider": ["soemdsp_trigger_divider_create", "soemdsp_trigger_divider_destroy", "soemdsp_trigger_divider_sample"],
        "step_sequencer": ["soemdsp_step_sequencer_create", "soemdsp_step_sequencer_destroy", "soemdsp_step_sequencer_sample"],
        "trigger_counter": ["soemdsp_trigger_counter_create", "soemdsp_trigger_counter_destroy", "soemdsp_trigger_counter_sample"],
        "delayed_trigger": ["soemdsp_delayed_trigger_create", "soemdsp_delayed_trigger_destroy", "soemdsp_delayed_trigger_sample"],
        "clock": ["soemdsp_clock_create", "soemdsp_clock_destroy", "soemdsp_clock_sample"],
        "random_clock": ["soemdsp_random_clock_create", "soemdsp_random_clock_destroy", "soemdsp_random_clock_sample"],
        "ping_pong_delay": ["soemdsp_ping_pong_delay_create", "soemdsp_ping_pong_delay_destroy", "soemdsp_ping_pong_delay_sample"],
        "papoulis_filter": ["soemdsp_papoulis_filter_create", "soemdsp_papoulis_filter_destroy", "soemdsp_papoulis_filter_sample"],
        "phosphillator": ["soemdsp_phosphillator_create", "soemdsp_phosphillator_destroy", "soemdsp_phosphillator_set_path", "soemdsp_phosphillator_sample"],
        "chord_sequencer": ["soemdsp_chord_sequencer_create", "soemdsp_chord_sequencer_destroy", "soemdsp_chord_sequencer_sample"],
        "lut_cell": ["soemdsp_lut_cell_create", "soemdsp_lut_cell_destroy", "soemdsp_lut_cell_sample", "soemdsp_lut_cell_q"],
        "metallic_ratio": ["soemdsp_metallic_ratio_sample"],
        "chua_attractor": ["soemdsp_chua_attractor_create", "soemdsp_chua_attractor_destroy", "soemdsp_chua_attractor_sample"],
        "ellipsoid": ["soemdsp_ellipsoid_sample", "soemdsp_ellipsoid_vector_sample"],
        "fractal_brownian_noise": ["soemdsp_fbm_create", "soemdsp_fbm_destroy", "soemdsp_fbm_sample"],
        "henon_map": ["soemdsp_henon_map_create", "soemdsp_henon_map_destroy", "soemdsp_henon_map_sample"],
        "jerobeam_wirdo_spiral": ["soemdsp_jbwirdo_create", "soemdsp_jbwirdo_destroy", "soemdsp_jbwirdo_sample", "soemdsp_jbwirdo_x", "soemdsp_jbwirdo_y"],
        "jerobeam_blubb": ["soemdsp_jbblubb_create", "soemdsp_jbblubb_destroy", "soemdsp_jbblubb_sample", "soemdsp_jbblubb_x", "soemdsp_jbblubb_y"],
        "jerobeam_mushroom": ["soemdsp_jbmushroom_create", "soemdsp_jbmushroom_destroy", "soemdsp_jbmushroom_sample", "soemdsp_jbmushroom_x", "soemdsp_jbmushroom_y"],
        "jerobeam_boing": ["soemdsp_jbboing_create", "soemdsp_jbboing_destroy", "soemdsp_jbboing_sample", "soemdsp_jbboing_x", "soemdsp_jbboing_y"],
        "jerobeam_torus": ["soemdsp_jbtorus_create", "soemdsp_jbtorus_destroy", "soemdsp_jbtorus_sample", "soemdsp_jbtorus_x", "soemdsp_jbtorus_y"],
        "jerobeam_kepler_bouwkamp": ["soemdsp_jbkepler_create", "soemdsp_jbkepler_destroy", "soemdsp_jbkepler_sample", "soemdsp_jbkepler_x", "soemdsp_jbkepler_y"],
        "jerobeam_nyquist_shannon": ["soemdsp_jbnyquist_create", "soemdsp_jbnyquist_destroy", "soemdsp_jbnyquist_sample", "soemdsp_jbnyquist_x", "soemdsp_jbnyquist_y"],
        "jerobeam_radar": ["soemdsp_jbradar_create", "soemdsp_jbradar_destroy", "soemdsp_jbradar_sample", "soemdsp_jbradar_x", "soemdsp_jbradar_y"],
        "archimedes": ["soemdsp_archimedes_create", "soemdsp_archimedes_destroy", "soemdsp_archimedes_step", "soemdsp_archimedes_sine", "soemdsp_archimedes_cosine"],
        "blit": ["soemdsp_blit_create", "soemdsp_blit_destroy", "soemdsp_blit_sample"],
        "linear_envelope": ["soemdsp_linear_envelope_create", "soemdsp_linear_envelope_destroy", "soemdsp_linear_envelope_sample"],
        "pluck_envelope": ["soemdsp_pluck_envelope_create", "soemdsp_pluck_envelope_destroy", "soemdsp_pluck_envelope_sample"],
        "exp_adsr": ["soemdsp_exp_adsr_create", "soemdsp_exp_adsr_destroy", "soemdsp_exp_adsr_sample"],
        "random_walk": ["soemdsp_random_walk_create", "soemdsp_random_walk_destroy", "soemdsp_random_walk_reset_seed", "soemdsp_random_walk_sample"],
        "pi_spigot_noise": ["soemdsp_pi_spigot_noise_create", "soemdsp_pi_spigot_noise_destroy", "soemdsp_pi_spigot_noise_reset_seed", "soemdsp_pi_spigot_noise_sample"],
        "lorenz_attractor": ["soemdsp_lorenz_attractor_create", "soemdsp_lorenz_attractor_destroy", "soemdsp_lorenz_attractor_sample", "soemdsp_lorenz_attractor_x", "soemdsp_lorenz_attractor_y", "soemdsp_lorenz_attractor_z"],
        "bradley_2a": ["soemdsp_bradley_2a_create", "soemdsp_bradley_2a_destroy", "soemdsp_bradley_2a_sample"],
        "antisaw": ["soemdsp_antisaw_create", "soemdsp_antisaw_destroy", "soemdsp_antisaw_sample"],
        "sine_wavetable": ["soemdsp_sine_wavetable_create", "soemdsp_sine_wavetable_destroy", "soemdsp_sine_wavetable_sample", "soemdsp_sine_wavetable_sin", "soemdsp_sine_wavetable_cos"],
        "log_spiral": ["soemdsp_log_spiral_create", "soemdsp_log_spiral_destroy", "soemdsp_log_spiral_sample", "soemdsp_log_spiral_x", "soemdsp_log_spiral_y", "soemdsp_log_spiral_z"],
        "fractal_spiral": ["soemdsp_fractal_spiral_create", "soemdsp_fractal_spiral_destroy", "soemdsp_fractal_spiral_sample", "soemdsp_fractal_spiral_x", "soemdsp_fractal_spiral_y", "soemdsp_fractal_spiral_z"],
        "jerobeam_spiral": ["soemdsp_jerobeam_spiral_create", "soemdsp_jerobeam_spiral_destroy", "soemdsp_jerobeam_spiral_sample", "soemdsp_jerobeam_spiral_x", "soemdsp_jerobeam_spiral_y", "soemdsp_jerobeam_spiral_z", "soemdsp_jerobeam_spiral_left", "soemdsp_jerobeam_spiral_right"],
        "additive_osc": ["soemdsp_additive_osc_sample"],
        "delay_effect": ["soemdsp_delay_effect_create", "soemdsp_delay_effect_destroy", "soemdsp_delay_effect_sample", "soemdsp_delay_effect_out", "soemdsp_delay_effect_wet"],
        "basic_oscillator": ["soemdsp_basic_oscillator_create", "soemdsp_basic_oscillator_destroy", "soemdsp_basic_oscillator_sample"],
        "helmholtz": [
            "soemdsp_helmholtz_create",
            "soemdsp_helmholtz_destroy",
            "soemdsp_helmholtz_set_params",
            "soemdsp_helmholtz_process",
            "soemdsp_helmholtz_frequency",
            "soemdsp_helmholtz_fidelity",
        ],
        "flower_child_filter": ["soemdsp_flower_child_filter_create", "soemdsp_flower_child_filter_destroy", "soemdsp_flower_child_filter_sample"],
        "rsmet_filter": ["soemdsp_rsmet_filter_create", "soemdsp_rsmet_filter_destroy", "soemdsp_rsmet_filter_sample"],
        "yellowjacket_filter": ["soemdsp_yellowjacket_filter_create", "soemdsp_yellowjacket_filter_destroy", "soemdsp_yellowjacket_filter_sample"],
        "superlove_filter": ["soemdsp_superlove_filter_create", "soemdsp_superlove_filter_destroy", "soemdsp_superlove_filter_sample"],
        "chaotic_phase_locking_filter": ["soemdsp_chaotic_phase_locking_filter_create", "soemdsp_chaotic_phase_locking_filter_destroy", "soemdsp_chaotic_phase_locking_filter_sample"],
        "resonator_filter": ["soemdsp_resonator_filter_create", "soemdsp_resonator_filter_destroy", "soemdsp_resonator_filter_sample"],
        "human_filter": ["soemdsp_human_filter_create", "soemdsp_human_filter_destroy", "soemdsp_human_filter_sample"],
        "pulse_explosion": ["soemdsp_pulse_explosion_create", "soemdsp_pulse_explosion_destroy", "soemdsp_pulse_explosion_sample"],
        "comparator": ["soemdsp_comparator_create", "soemdsp_comparator_destroy", "soemdsp_comparator_sample", "soemdsp_comparator_last_high", "soemdsp_comparator_last_low"],
        "min_max": ["soemdsp_min_max_create", "soemdsp_min_max_destroy", "soemdsp_min_max_sample", "soemdsp_min_max_min"],
        "alias_sine": ["soemdsp_alias_sine_create", "soemdsp_alias_sine_destroy", "soemdsp_alias_sine_sample"],
        "ladder_filter": ["soemdsp_ladder_filter_create", "soemdsp_ladder_filter_destroy", "soemdsp_ladder_filter_sample"],
        "logistic_map": ["soemdsp_logistic_map_create", "soemdsp_logistic_map_destroy", "soemdsp_logistic_map_sample"],
        "noise_generator": ["soemdsp_noise_generator_create", "soemdsp_noise_generator_destroy", "soemdsp_noise_generator_sample"],
        "passive_filter": [
            "soemdsp_passive_filter_create",
            "soemdsp_passive_filter_destroy",
            "soemdsp_passive_filter_sample",
            "soemdsp_passive_filter_metadata_json",
        ],
        "pitch_quantizer": ["soemdsp_pitch_quantizer_create", "soemdsp_pitch_quantizer_destroy", "soemdsp_pitch_quantizer_sample"],
        "surge_oscillator": [
            "soemdsp_surge_oscillator_create",
            "soemdsp_surge_oscillator_destroy",
            "soemdsp_surge_oscillator_sample",
        ],
        "dsf_oscillator": [
            "soemdsp_dsf_oscillator_create",
            "soemdsp_dsf_oscillator_destroy",
            "soemdsp_dsf_oscillator_sample",
        ],
        "robin_supersaw": [
            "soemdsp_robin_supersaw_create",
            "soemdsp_robin_supersaw_destroy",
            "soemdsp_robin_supersaw_sample",
        ],
        "hypersaw": ["soemdsp_hypersaw_create", "soemdsp_hypersaw_destroy", "soemdsp_hypersaw_sample", "soemdsp_hypersaw_left", "soemdsp_hypersaw_right"],
        "videoscope": ["soemdsp_videoscope_create", "soemdsp_videoscope_destroy", "soemdsp_videoscope_push", "soemdsp_videoscope_window_size", "soemdsp_videoscope_column_min", "soemdsp_videoscope_column_max", "soemdsp_videoscope_xy_a", "soemdsp_videoscope_xy_b", "soemdsp_videoscope_version"],
        "pll": ["soemdsp_pll_create", "soemdsp_pll_destroy", "soemdsp_pll_process"],
        "polyblep": [
            "soemdsp_polyblep_create",
            "soemdsp_polyblep_destroy",
            "soemdsp_polyblep_reset",
            "soemdsp_polyblep_sample",
            "soemdsp_polyblep_out",
            "soemdsp_polyblep_saw",
            "soemdsp_polyblep_ramp",
            "soemdsp_polyblep_square",
            "soemdsp_polyblep_tri",
            "soemdsp_polyblep_sine",
        ],
        "sabrina_reverb": ["soemdsp_sabrina_reverb_create", "soemdsp_sabrina_reverb_destroy", "soemdsp_sabrina_reverb_process"],
        "shooting_star_explosion": ["soemdsp_shooting_star_explosion_power", "soemdsp_shooting_star_explosion_metadata_json"],
        "soft_clipper": ["soemdsp_soft_clipper_sample"],
        "tb303_filter": [
            "soemdsp_tb303_filter_create",
            "soemdsp_tb303_filter_destroy",
            "soemdsp_tb303_filter_sample",
            "soemdsp_tb303_filter_metadata_json",
        ],
        "vactrol_envelope": [
            "soemdsp_vactrol_envelope_create",
            "soemdsp_vactrol_envelope_destroy",
            "soemdsp_vactrol_envelope_sample",
            "soemdsp_vactrol_envelope_metadata_json",
        ],
        "video_synth_raster": [
            "soemdsp_video_synth_raster_create",
            "soemdsp_video_synth_raster_destroy",
            "soemdsp_video_synth_raster_process_block",
            "soemdsp_video_synth_raster_output_ptr",
        ],
    }
    for source_path in native_sources:
        source_text = source_path.read_text(encoding="utf-8")
        module_name = source_path.parent.name
        wasm_path = source_path.with_suffix(".wasm")
        require(f"// soemdsp-native-module: {module_name}" in source_text, f"native {module_name} source metadata missing module header")
        require("// soemdsp-native-label:" in source_text, f"native {module_name} source metadata missing label header")
        require("// soemdsp-native-target:" in source_text, f"native {module_name} source metadata missing target header")
        require("// soemdsp-native-kind:" in source_text, f"native {module_name} source metadata missing kind header")
        require("soemdsp-native-tooltip" not in source_text, f"native {module_name} should not use comment tooltip metadata")
        require(module_name in expected_native_exports, f"native {module_name} should declare expected exports in smoke test")
        for export_name in expected_native_exports[module_name]:
            require(f'extern "C"' in source_text and export_name in source_text, f"native {module_name} export missing: {export_name}")
            require(f'"{export_name}"' in native_build_source, f"native {module_name} build export missing: {export_name}")
        require(f'Name = "{module_name}"' in native_build_source, f"native {module_name} build output missing")
        require(wasm_path.exists(), f"native {module_name} wasm should exist")
        require(wasm_path.read_bytes().startswith(b"\0asm"), f"native {module_name} wasm magic bytes missing")
        if module_name == "helmholtz":
            require(
                "constexpr int kMaxWindow = 1024;" in source_text
                and "constexpr int kMinWindow = 128;" in source_text
                and "constexpr int kDefaultWindow = 512;" in source_text
                and "constexpr double kAnalysisRateHz = 20.0;" in source_text
                and "analysisIntervalSamples" in source_text
                and "s->hopCounter >= s->analysisIntervalSamples" in source_text
                and "const int hop = s->windowSize / 2;" not in source_text,
                "native Helmholtz should keep MPM analysis bounded by a safe temporary window cap and control-rate cadence",
            )

    ellipsoid_source_path = ROOT / "native_modules" / "ellipsoid" / "ellipsoid.cpp"
    ellipsoid_wasm_path = ROOT / "native_modules" / "ellipsoid" / "ellipsoid.wasm"
    sabrina_source_path = ROOT / "native_modules" / "sabrina_reverb" / "sabrina_reverb.cpp"
    sabrina_wasm_path = ROOT / "native_modules" / "sabrina_reverb" / "sabrina_reverb.wasm"
    soft_clipper_source_path = ROOT / "native_modules" / "soft_clipper" / "soft_clipper.cpp"
    soft_clipper_wasm_path = ROOT / "native_modules" / "soft_clipper" / "soft_clipper.wasm"
    require(ellipsoid_source_path.exists(), "native ellipsoid source should exist")
    ellipsoid_source = ellipsoid_source_path.read_text(encoding="utf-8")
    require("// soemdsp-native-module: ellipsoid" in ellipsoid_source, "native ellipsoid source metadata missing")
    require("extern \"C\" double soemdsp_ellipsoid_sample" in ellipsoid_source, "native ellipsoid sample export missing")
    require("extern \"C\" void soemdsp_ellipsoid_vector_sample" in ellipsoid_source, "native ellipsoid vector export missing")
    require(ellipsoid_wasm_path.exists(), "native ellipsoid wasm should exist")
    require(ellipsoid_wasm_path.read_bytes().startswith(b"\0asm"), "native ellipsoid wasm magic bytes missing")
    require(sabrina_source_path.exists(), "native Sabrina Reverb source should exist")
    sabrina_source = sabrina_source_path.read_text(encoding="utf-8")
    require("// soemdsp-native-module: sabrina_reverb" in sabrina_source, "native Sabrina source metadata missing")
    require("soemdsp-native-tooltip" not in sabrina_source, "native C++ source should not carry comment tooltips")
    require("soemdsp-native-param-tooltip" not in sabrina_source, "native parameter tooltips should live in metaparameter spec")
    require("extern \"C\" int soemdsp_sabrina_reverb_create" in sabrina_source, "native Sabrina create export missing")
    require("extern \"C\" void soemdsp_sabrina_reverb_process" in sabrina_source, "native Sabrina process export missing")
    require("extern \"C\" double soemdsp_sabrina_reverb_left" in sabrina_source, "native Sabrina output export missing")
    require(sabrina_wasm_path.exists(), "native Sabrina wasm should exist")
    require(sabrina_wasm_path.read_bytes().startswith(b"\0asm"), "native Sabrina wasm magic bytes missing")
    require(soft_clipper_source_path.exists(), "native Soft Clipper source should exist")
    soft_clipper_source = soft_clipper_source_path.read_text(encoding="utf-8")
    soft_clipper_metadata_text = soft_clipper_source.replace('\\"', '"')
    require("// soemdsp-native-module: soft_clipper" in soft_clipper_source, "native Soft Clipper source metadata missing")
    require("// soemdsp-native-target: softClipper" in soft_clipper_source, "native Soft Clipper target metadata missing")
    require("extern \"C\" double soemdsp_soft_clipper_sample" in soft_clipper_source, "native Soft Clipper sample export missing")
    require("extern \"C\" const char* soemdsp_soft_clipper_metadata_json()" in soft_clipper_source, "native Soft Clipper metadata export missing")
    require('"inputs":["Mono","Left","Right"]' in soft_clipper_metadata_text, "native Soft Clipper metadata should declare stereo inputs")
    require('"outputs":["Mono","Left","Right"]' in soft_clipper_metadata_text, "native Soft Clipper metadata should declare stereo outputs")
    require('"key":"center"' in soft_clipper_metadata_text and '"tooltip":"Moves the soft clipping curve' in soft_clipper_metadata_text, "native Soft Clipper center tooltip metadata missing")
    require('"key":"width"' in soft_clipper_metadata_text and '"tooltip":"Sets the width' in soft_clipper_metadata_text, "native Soft Clipper width tooltip metadata missing")
    ladder_source_path = ROOT / "native_modules" / "ladder_filter" / "ladder_filter.cpp"
    ladder_source = ladder_source_path.read_text(encoding="utf-8")
    ladder_metadata_text = ladder_source.replace('\\"', '"')
    require("extern \"C\" const char* soemdsp_ladder_filter_metadata_json()" in ladder_source, "native Ladder Filter metadata export missing")
    require('"inputs":["In"]' in ladder_metadata_text, "native Ladder Filter metadata should declare In input")
    require('"outputs":["Out"]' in ladder_metadata_text, "native Ladder Filter metadata should declare Out output")
    require('"key":"frequency"' in ladder_metadata_text and '"tooltip":"Sets the ladder cutoff frequency.' in ladder_metadata_text, "native Ladder Filter frequency tooltip metadata missing")
    require(soft_clipper_wasm_path.exists(), "native Soft Clipper wasm should exist")
    require(soft_clipper_wasm_path.read_bytes().startswith(b"\0asm"), "native Soft Clipper wasm magic bytes missing")
    require("NATIVE_MODULES = ROOT / \"native_modules\"" in server_source, "native modules folder constant missing")
    require("\"/api/native-modules\"" in server_source, "native modules API route missing")
    require("\".wasm\": \"application/wasm\"" in server_source, "wasm MIME mapping missing")
    require('"tooltips": tooltips' not in server_source, "native modules API should not expose comment-parsed tooltip metadata")
    require('"param-tooltip": "params"' not in server_source, "native modules API should not parse parameter tooltip comments")
    require("header_pairs: list[tuple[str, str]]" not in server_source, "native tooltip comment parser should be absent")
    require('tooltip_key, tooltip = value.split(":", 1)' not in server_source, "native tooltip comment splitting should be absent")
    require('tooltip: "Wet/dry balance for the reverb output."' in definitions_source, "Sabrina parameter tooltip should live in metaparameter spec")
    require("nodeGraphNativeModuleEntriesByTarget" in module_store_source, "native module store target index missing")
    require("loadNodeGraphNativeModuleCatalog" in module_store_source, "native module catalog loader missing")
    require("\"Native C++\"" in module_store_source, "native module browser badge missing")
    require("id=\"nodeSceneOpenNativeCode\"" in index_html, "native module code action markup missing")
    require("id=\"nodeSceneOpenNativeLib\"" in index_html, "native module lib action markup missing")
    require("id=\"nodeSceneCodeGroup\"" in index_html, "native module SRC/LIB button group markup missing")
    require("nodeSceneOpenNativeCode" in context_menu_source, "native module code action menu state missing")
    require("nodeSceneOpenNativeLib" in context_menu_source, "native module lib action menu state missing")
    require("nodeGraphCodeEntryForType(targetNode.type)" in context_menu_source, "native code action should use scanned module catalog")
    require("nodeGraphLibEntryForType(targetNode.type)" in context_menu_source, "native lib action should use scanned module catalog")
    require("\"nodeSceneCodeGroup\"" in context_menu_source, "module actions window should move the SRC/LIB group as one unit, not just the SRC button")
    require("function openNodeGraphNativeModuleCodeFromContext()" in module_actions_source, "native module code opener missing")
    require("function openNodeGraphNativeModuleLibFromContext()" in module_actions_source, "native module lib opener missing")
    require("function nodeGraphLibEntryForType(type)" in module_store_source, "native module lib entry lookup missing")
    require(
        "a.href = url" in module_actions_source
        and "window.open(" not in module_actions_source,
        "native module code/lib openers should use a single reliable anchor click, not window.open (whose noopener return value can't be trusted for success detection)",
    )
    require(
        'bindNodeGraphSceneElementEvent("nodeSceneOpenNativeCode", "click", openNodeGraphNativeModuleCodeFromContext)'
        in event_bindings_source,
        "native module code action binding missing",
    )
    require(
        'bindNodeGraphSceneElementEvent("nodeSceneOpenNativeLib", "click", openNodeGraphNativeModuleLibFromContext)'
        in event_bindings_source,
        "native module lib action binding missing",
    )
    require("sendNodeGraphLiveNativeModules" in live_runtime_source, "native worklet sender missing")
    require("\"setNativeModuleWasm\"" in live_runtime_source, "native worklet post message missing")
    require("node-live-audio-worklet-core.js?v=" in live_runtime_source, "native worklet module load should carry a cache bust key")
    require("async setNativeModuleWasm(message)" in worklet_source, "native worklet loader missing")
    require("nativeEllipsoidVectorSample(" in worklet_source, "native ellipsoid worklet path missing")
    require(
        'name === "soft_clipper" || targetType === "softClipper"' in worklet_source
        and "this.nativeSoftClipper?.soemdsp_soft_clipper_sample" in worklet_source
        and "Out: this.nativeSoftClipperSample(softClipperMono, softClipperCenter, softClipperWidth)" in worklet_source
        and "softClipperSample(input, center = 0, width = 2)" not in worklet_source,
        "native Soft Clipper should be worklet-backed with old JS worklet DSP removed",
    )
    require(
        '"soemdsp_soft_clipper_sample"' in native_build_source
        and 'Name = "soft_clipper"' in native_build_source,
        "native Soft Clipper build exports should be registered",
    )
    require(
        'name === "ladder_filter" || targetType === "ladderFilter"' in worklet_source
        and "this.nativeLadderFilter?.soemdsp_ladder_filter_create" in worklet_source
        and "this.nativeLadderFilter?.soemdsp_ladder_filter_sample" in worklet_source
        and "native Ladder Filter failed" in worklet_source
        and "this.safeFilterNumber(\n            this.nativeLadderFilter.soemdsp_ladder_filter_sample(" in worklet_source,
        "native Ladder Filter should be worklet-backed and guarded against native failures",
    )

    response = request(f"{base_url}/api/native-modules")
    require(response.status == 200, "native modules API should return 200")
    require_json_response_metadata(response, "native modules API")
    payload = json.loads(response.body.decode("utf-8"))
    modules = payload.get("modules")
    require(isinstance(modules, list), "native modules API should return modules list")
    ellipsoid = next((item for item in modules if item.get("targetType") == "ellipsoid"), None)
    require(ellipsoid is not None, "native modules API should include ellipsoid")
    require(ellipsoid.get("wasmAvailable") is True, "native ellipsoid wasm should be available")
    sabrina = next((item for item in modules if item.get("targetType") == "reverbEffect"), None)
    require(sabrina is not None, "native modules API should include Sabrina Reverb")
    require(sabrina.get("wasmAvailable") is True, "native Sabrina wasm should be available")
    require("tooltips" not in sabrina, "native modules API should not expose comment-parsed tooltips")
    soft_clipper = next((item for item in modules if item.get("targetType") == "softClipper"), None)
    require(soft_clipper is not None, "native modules API should include Soft Clipper")
    require(soft_clipper.get("name") == "soft_clipper", "native Soft Clipper API name should be stable")
    require(soft_clipper.get("wasmAvailable") is True, "native Soft Clipper wasm should be available")
    require("tooltips" not in soft_clipper, "native Soft Clipper API should not expose comment-parsed tooltips")
    for source_path in native_sources:
        source_text = source_path.read_text(encoding="utf-8")
        module_name = source_path.parent.name
        target_line = next((line for line in source_text.splitlines() if line.startswith("// soemdsp-native-target:")), "")
        target_type = target_line.split(":", 1)[1].strip() if ":" in target_line else module_name
        entry = next((item for item in modules if item.get("targetType") == target_type), None)
        require(entry is not None, f"native modules API should include {module_name}")
        require(entry.get("name") == module_name, f"native modules API name should match {module_name}")
        require(entry.get("wasmAvailable") is True, f"native modules API should mark {module_name} wasm available")
        require("tooltips" not in entry, f"native modules API should not expose comment-parsed tooltips for {module_name}")

    wasm_response = request(f"{base_url}/native_modules/ellipsoid/ellipsoid.wasm")
    require(wasm_response.status == 200, "native ellipsoid wasm should be served")
    require_content_type(wasm_response, "application/wasm", "native ellipsoid wasm")
    require(wasm_response.body.startswith(b"\0asm"), "served native ellipsoid wasm magic bytes missing")
    sabrina_wasm_response = request(f"{base_url}/native_modules/sabrina_reverb/sabrina_reverb.wasm")
    require(sabrina_wasm_response.status == 200, "native Sabrina wasm should be served")
    require_content_type(sabrina_wasm_response, "application/wasm", "native Sabrina wasm")
    require(sabrina_wasm_response.body.startswith(b"\0asm"), "served native Sabrina wasm magic bytes missing")
    soft_clipper_wasm_response = request(f"{base_url}/native_modules/soft_clipper/soft_clipper.wasm")
    require(soft_clipper_wasm_response.status == 200, "native Soft Clipper wasm should be served")
    require_content_type(soft_clipper_wasm_response, "application/wasm", "native Soft Clipper wasm")
    require(soft_clipper_wasm_response.body.startswith(b"\0asm"), "served native Soft Clipper wasm magic bytes missing")
    for source_path in native_sources:
        wasm_path = source_path.with_suffix(".wasm")
        wasm_url = f"/{wasm_path.relative_to(ROOT).as_posix()}"
        wasm_response = request(f"{base_url}{wasm_url}")
        require(wasm_response.status == 200, f"native {source_path.parent.name} wasm should be served")
        require_content_type(wasm_response, "application/wasm", f"native {source_path.parent.name} wasm")
        require(wasm_response.body.startswith(b"\0asm"), f"served native {source_path.parent.name} wasm magic bytes missing")


def wait_for_server(base_url: str, process: subprocess.Popen[bytes]) -> None:
    deadline = time.monotonic() + 5
    last_status = ""
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(
                f"sandbox server exited before becoming ready: {process.returncode}",
            )
        response = request(f"{base_url}/public/index.html", method="HEAD")
        last_status = f"{response.status} {response.reason}"
        if response.status == 200:
            if process.poll() is not None:
                raise RuntimeError(
                    f"sandbox server exited during readiness check: {process.returncode}",
                )
            require_no_store(response, "public index")
            return
        time.sleep(0.1)
    raise RuntimeError(f"sandbox server did not become ready: {last_status}")


def start_server(port: int, manifest: Path) -> subprocess.Popen[bytes]:
    require_port_available(port)
    process = subprocess.Popen(
        [
            sys.executable,
            str(ROOT / "server.py"),
            "--port",
            str(port),
            "--manifest",
            str(manifest),
        ],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(0.05)
    if process.poll() is not None:
        raise RuntimeError(f"sandbox server exited immediately: {process.returncode}")
    return process


def stop_server(process: subprocess.Popen[bytes]) -> None:
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def run_valid_manifest_smoke(port: int, manifest: Path) -> None:
    base_url = f"http://127.0.0.1:{port}"
    process = start_server(port, manifest)

    try:
        wait_for_server(base_url, process)

        run_step("root shell contract", lambda: require_root_shell(base_url))
        run_step("static assets", lambda: require_static_assets(base_url))
        run_step("waveform seek source contract", require_waveform_seek_source_contract)
        run_step("manifest error surface contract", require_manifest_error_surface_contract)
        run_step("follow/free seek contract", require_follow_free_seek_contract)
        run_step("node graph MVP contract", require_node_graph_mvp_contract)
        run_step("README scheduler contract", require_readme_scheduler_contract)
        run_step("soemdsp WireMeta traits", require_soemdsp_wire_meta_traits)
        run_step(
            "node metadata kinds transport",
            lambda: require_node_metadata_kinds_transport(base_url),
        )
        run_step("native module contract", lambda: require_native_module_contract(base_url))
        run_step(
            "user UI settings update contract",
            lambda: require_user_ui_settings_update_contract(base_url),
        )

        payload: dict[str, object] = {}

        def fetch_payload() -> None:
            nonlocal payload
            payload = fetch_valid_manifest_payload(base_url)

        run_step("manifest transport", fetch_payload)
        run_step("manifest contracts", lambda: require_manifest_contracts(payload))
        run_step(
            "artifact contract negative cases",
            require_artifact_contract_negative_cases,
        )
        run_step(
            "phase audio contract negative cases",
            require_phase_audio_contract_negative_cases,
        )
        run_step(
            "parameter resync contract negative cases",
            require_parameter_resync_contract_negative_cases,
        )
        run_step(
            "caller processing order negative cases",
            require_caller_processing_order_contract_negative_cases,
        )
        run_step(
            "artifact reports and audio",
            lambda: require_artifact_report_and_audio_contracts(base_url, payload),
        )
        run_step("server error responses", lambda: require_server_error_contracts(base_url))
    finally:
        stop_server(process)


def run_manifest_error_smoke(port: int) -> None:
    with tempfile.TemporaryDirectory() as directory:
        fixture_root = Path(directory)
        missing_manifest = fixture_root / "missing_manifest.json"
        invalid_manifest = fixture_root / "invalid_manifest.json"
        invalid_manifest.write_text('{ "ok": true, ', encoding="utf-8")

        cases = [
            (missing_manifest, 404, "manifest not found", ""),
            (
                invalid_manifest,
                500,
                "manifest JSON parse failed",
                "Expecting property name",
            ),
        ]

        for index, (path, status, error, detail) in enumerate(cases):
            case_port = find_free_port() if port == 0 else port + index
            base_url = f"http://127.0.0.1:{case_port}"
            process = start_server(case_port, path)
            try:
                wait_for_server(base_url, process)
                response = request(f"{base_url}/api/manifest")
                require(response.status == status, f"{error} status mismatch")
                require_json_response_metadata(response, error)
                payload = json.loads(response.body.decode("utf-8"))
                require(payload.get("ok") is False, f"{error} payload was not false")
                require(payload.get("error") == error, f"{error} payload mismatch")
                require(payload.get("path") == str(path.resolve()), f"{error} path missing")
                require(
                    payload.get("artifactRoot") == str(fixture_root.resolve()),
                    f"{error} artifact root mismatch",
                )
                if detail:
                    require(detail in payload.get("message", ""), f"{error} detail missing")
            finally:
                stop_server(process)


def run_readable_malformed_manifest_smoke(port: int) -> None:
    with tempfile.TemporaryDirectory() as directory:
        fixture_root = Path(directory)
        malformed_manifest = fixture_root / "malformed_manifest.json"
        malformed_manifest.write_text(json.dumps({"allOk": True}), encoding="utf-8")

        case_port = find_free_port() if port == 0 else port
        base_url = f"http://127.0.0.1:{case_port}"
        process = start_server(case_port, malformed_manifest)
        try:
            wait_for_server(base_url, process)
            response = request(f"{base_url}/api/manifest")
            require(response.status == 200, "readable malformed manifest status mismatch")
            require_json_response_metadata(response, "readable malformed manifest")
            payload = json.loads(response.body.decode("utf-8"))
            require(payload.get("ok") is True, "readable malformed manifest was not ok")
            require(
                payload.get("manifestPath") == str(malformed_manifest.resolve()),
                "readable malformed manifest path missing",
            )
            require(
                payload.get("artifactRoot") == str(fixture_root.resolve()),
                "readable malformed manifest artifact root mismatch",
            )
            require_manifest_file_info(payload, malformed_manifest, "readable malformed manifest")
            require(
                payload.get("manifest") == {"allOk": True},
                "readable malformed manifest payload mismatch",
            )
            require("error" not in payload, "readable malformed manifest had error field")
        finally:
            stop_server(process)


def run_smoke(port: int, manifest: Path) -> None:
    valid_manifest_port = find_free_port() if port == 0 else port
    error_manifest_port = 0 if port == 0 else port + 1
    malformed_manifest_port = 0 if port == 0 else port + 3
    run_step(
        "valid manifest packet",
        lambda: run_valid_manifest_smoke(valid_manifest_port, manifest),
    )
    run_step(
        "manifest error responses",
        lambda: run_manifest_error_smoke(error_manifest_port),
    )
    run_step(
        "readable malformed manifest source",
        lambda: run_readable_malformed_manifest_smoke(malformed_manifest_port),
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--port",
        default=0,
        type=int,
        help="Port for the first smoke server. Defaults to 0 for automatic ports.",
    )
    parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    args = parser.parse_args()

    run_smoke(args.port, Path(args.manifest).resolve())
    print("soemdsp-sandbox smoke test passed")


if __name__ == "__main__":
    main()
