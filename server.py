from __future__ import annotations

import argparse
import base64
import binascii
import json
import mimetypes
import os
import re
import subprocess
import tempfile
from datetime import datetime, timezone
from email.utils import formatdate
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse


ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
BUILD_NUMBER = "20260727burn1"
VERSION_FILE = ROOT / "VERSION"
SANDBOX_VERSION = VERSION_FILE.read_text(encoding="utf-8").strip() if VERSION_FILE.exists() else "0.0.0"

# "debug" (default) vs "release". Purely a labeling/UI signal -- it does not
# gate any behavior server-side -- consumed client-side to color the debug
# console's bug button (red for a debug build, neutral for a release build;
# see node-graph-debug-console.js). Override with the SOEMDSP_BUILD_MODE env
# var or --release on the command line. Anything other than exactly
# "release" is treated as "debug" so an unrecognized/misconfigured value
# fails toward the more-alarming, more-honest label rather than silently
# looking like a vetted release build.
BUILD_MODE = "release" if os.environ.get("SOEMDSP_BUILD_MODE", "").strip().lower() == "release" else "debug"
DEFAULT_PRESET = PUBLIC / "presets" / "default.json"
DEFAULT_UI_SETTINGS = PUBLIC / "presets" / "useruisettings.json"
DEFAULT_UI_SETTINGS_SCRIPT = PUBLIC / "presets" / "useruisettings.js"
NATIVE_MODULES = ROOT / "native_modules"
SAVED_PATCHES = ROOT / "saved-patches"
MAX_PRESET_BYTES = 512 * 1024
MAX_AUDIO_FILE_BYTES = 128 * 1024 * 1024
MAX_AUDIO_UPLOAD_JSON_BYTES = 192 * 1024 * 1024
MAX_AUDIO_TRANSCODE_BYTES = 256 * 1024 * 1024
MAX_AUDIO_SEARCH_VISITS = 120000
SUPPORTED_AUDIO_FILE_SUFFIXES = {
    ".aac",
    ".flac",
    ".m4a",
    ".mp3",
    ".oga",
    ".ogg",
    ".opus",
    ".wav",
    ".wave",
}
DEFAULT_SOEMDSP_ROOT = ROOT.parent / "soemdsp"
DEFAULT_MANIFEST = (
    DEFAULT_SOEMDSP_ROOT / "runtime_dsp_object_bound_wav_resync_demo.manifest.json"
)
STATIC_MIME_TYPES = {
    ".css": "text/css",
    ".js": "application/javascript",
    ".wasm": "application/wasm",
}
NATIVE_MODULE_HEADER_RE = re.compile(
    r"^\s*//\s*soemdsp-native-([a-zA-Z0-9_-]+)\s*:\s*(.*?)\s*$"
)
# Mirrors soemdsp::meta::MetaType defaults from ../soemdsp/include/soemdsp/meta.hpp.
NODE_METADATA_KIND_TEMPLATES = {
    "decimal": {
        "def": 0,
        "label": "Decimal",
        "linearSmoothing": True,
        "max": 1,
        "maxDigits": 4,
        "mid": 0.5,
        "min": 0,
        "step": 0.0001,
        "unit": "",
    },
    "decimal_bipolar": {
        "def": 0,
        "label": "Decimal Bipolar",
        "linearSmoothing": True,
        "max": 1,
        "mid": 0,
        "min": -1,
        "showPlusMinus": True,
        "step": 0.01,
        "unit": "",
    },
    "amplitude": {
        "def": 1,
        "label": "Amplitude",
        "linearSmoothing": True,
        "max": 3,
        "mid": 1,
        "min": 0,
        "step": 0.01,
        "unit": "amp",
    },
    "decibels": {
        "def": 0,
        "label": "Decibels",
        "linearSmoothing": True,
        "max": 12,
        "mid": 0,
        "min": -60,
        "step": 0.1,
        "unit": "dB",
    },
    "frequency": {
        "def": 440,
        "label": "Frequency",
        "linearSmoothing": True,
        "max": 20000,
        "mid": 440,
        "min": 0,
        "step": 0,
        "unit": "Hz",
    },
    "phase": {
        "def": 0,
        "label": "Phase",
        "linearSmoothing": True,
        "max": 1,
        "mid": 0.5,
        "min": 0,
        "step": 0.01,
        "unit": "cycle",
        "wraparound": True,
    },
    "pitch": {
        "def": 0,
        "label": "Pitch",
        "linearSmoothing": True,
        "max": 12,
        "mid": 0,
        "min": -12,
        "step": 0.1,
        "unit": "st",
    },
    "seconds": {
        "def": 0,
        "label": "Seconds",
        "linearSmoothing": True,
        "max": 5,
        "mid": 2.5,
        "min": 0,
        "step": 0.01,
        "unit": "s",
    },
    "sustain": {
        "def": 1,
        "label": "Sustain",
        "linearSmoothing": True,
        "max": 1,
        "mid": 0.7,
        "min": 0,
        "step": 0.01,
        "unit": "amp",
    },
    "descrete": {
        "def": 0,
        "label": "Descrete",
        "linearSmoothing": False,
        "max": 9,
        "mid": 4,
        "min": 0,
        "step": 1,
        "unit": "idx",
    },
    "integer_bipolar": {
        "def": 0,
        "label": "Integer Bipolar",
        "linearSmoothing": False,
        "max": 9,
        "mid": 0,
        "min": -9,
        "showPlusMinus": True,
        "step": 1,
        "unit": "idx",
    },
    "waveform": {
        "choices": ["Saw", "Ramp", "Square", "Triangle", "Sine", "Noise"],
        "def": 0,
        "displayChoices": True,
        "divideChoicesVisibly": True,
        "label": "Waveform",
        "linearSmoothing": False,
        "max": 5,
        "mid": 2,
        "min": 0,
        "step": 1,
        "unit": "",
    },
    "bypass": {
        "choices": ["active", "BYPASSED"],
        "def": 0,
        "displayChoices": True,
        "divideChoicesVisibly": True,
        "label": "Bypass",
        "linearSmoothing": False,
        "max": 1,
        "mid": 0.5,
        "min": 0,
        "step": 1,
        "unit": "bypass",
    },
    "plusminus": {
        "choices": ["-", "+"],
        "def": -1,
        "displayChoices": True,
        "divideChoicesVisibly": True,
        "label": "Plus Minus",
        "linearSmoothing": False,
        "max": 1,
        "mid": 0,
        "min": -1,
        "showPlusMinus": True,
        "step": 1,
        "unit": "plusminus",
    },
    "onoff": {
        "choices": ["off", "on"],
        "def": 1,
        "displayChoices": True,
        "divideChoicesVisibly": True,
        "label": "On Off",
        "linearSmoothing": False,
        "max": 1,
        "mid": 0.5,
        "min": 0,
        "step": 1,
        "unit": "onoff",
    },
    "momentary": {
        "choices": ["idle", "on"],
        "def": 0,
        "displayChoices": True,
        "divideChoicesVisibly": True,
        "label": "Momentary",
        "linearSmoothing": False,
        "max": 1,
        "mid": 0.5,
        "min": 0,
        "step": 1,
        "unit": "momentary",
    },
}

for kind, template in NODE_METADATA_KIND_TEMPLATES.items():
    template.setdefault("maxDigits", 5 if kind == "frequency" else 3)
    template.setdefault("sliderCurve", "skew" if template.get("nonlinearSlider") else "linear")
    template.setdefault("curveAmount", 0)


def sanitize_default_ui_settings_view(payload: dict) -> None:
    """Strip live-authoring state before it can land in the shipped default.

    A dev browser tab open against this server can POST here at any time
    (Save UI Settings / Update Default), and whatever patch/window state
    happens to be open in that tab rides along in the payload. Enforcing the
    "clean default" invariant here -- once, at the single write path -- means
    it can't recur no matter what a live session sends, instead of relying on
    remembering to `git checkout --` these files after the fact.
    """
    view = payload.get("view")
    if not isinstance(view, dict):
        return
    view["workingPatch"] = None
    view["patchDirtyState"] = "untouched"
    view["sharedInspectorActive"] = ""
    view["sharedInspectorWindowState"] = {}
    workspace_window_states = view.get("workspaceWindowStates")
    if isinstance(workspace_window_states, dict):
        for state in workspace_window_states.values():
            if isinstance(state, dict):
                state["open"] = False


def ui_settings_script_text(payload: dict) -> str:
    payload_text = json.dumps(payload, indent=2, sort_keys=False)
    return (
        "(function (settings) {\n"
        "  window.nodeUiDevBundledDefaultSettings = settings;\n"
        "  document.documentElement.dataset.nodeUiDevBundledDefaultSettings = JSON.stringify(settings);\n"
        f"}})({payload_text});\n"
    )


class SandboxServer(BaseHTTPRequestHandler):
    manifest_path: Path = DEFAULT_MANIFEST
    artifact_root: Path = DEFAULT_SOEMDSP_ROOT
    sending_error: bool = False

    def log_message(self, format: str, *args: object) -> None:
        return

    def send_error(
        self,
        code: int,
        message: str | None = None,
        explain: str | None = None,
    ) -> None:
        self.sending_error = True
        try:
            super().send_error(code, message, explain)
        finally:
            self.sending_error = False

    def end_headers(self) -> None:
        if self.sending_error:
            self.send_no_store_headers()
        super().end_headers()

    def do_GET(self) -> None:
        self.serve_request(send_body=True)

    def do_HEAD(self) -> None:
        self.serve_request(send_body=False)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/presets/default":
            self.save_default_preset()
            return
        if parsed.path == "/api/patches/save":
            self.save_demo_patch()
            return
        if parsed.path == "/api/presets/useruisettings":
            self.save_default_ui_settings()
            return
        if parsed.path == "/api/shader-script/to-desktop":
            self.save_shader_script_to_desktop()
            return
        if parsed.path == "/api/metadata-script/to-desktop":
            self.save_metadata_script_to_desktop()
            return
        if parsed.path == "/api/open-path":
            self.open_local_path()
            return
        if parsed.path == "/api/audio-file/data-url":
            self.audio_file_data_url()
            return
        if parsed.path == "/api/audio-file/find":
            self.audio_file_find()
            return
        if parsed.path == "/api/audio-file/transcode-data-url":
            self.audio_file_transcode_data_url()
            return
        self.reject_mutation_method()

    def do_PUT(self) -> None:
        self.reject_mutation_method()

    def do_PATCH(self) -> None:
        self.reject_mutation_method()

    def do_DELETE(self) -> None:
        self.reject_mutation_method()

    def do_OPTIONS(self) -> None:
        self.reject_mutation_method()

    def reject_mutation_method(self) -> None:
        self.send_error(405, "Method not allowed")

    def serve_request(self, send_body: bool) -> None:
        parsed = urlparse(self.path)
        if parsed.path in ("/", "/index.html"):
            self.serve_index(send_body=send_body)
            return

        if parsed.path.startswith("/public/"):
            relative = parsed.path.removeprefix("/public/")
            self.serve_public(relative, send_body=send_body)
            return

        if parsed.path.startswith("/native_modules/"):
            relative = parsed.path.removeprefix("/native_modules/")
            self.serve_native_module_file(relative, send_body=send_body)
            return

        if parsed.path == "/api/manifest":
            if not send_body:
                self.send_error(405, "Method not allowed")
                return
            self.serve_manifest()
            return

        if parsed.path == "/api/native-modules":
            if not send_body:
                self.send_error(405, "Method not allowed")
                return
            self.serve_native_modules()
            return

        if parsed.path == "/api/node-metadata-kinds":
            if not send_body:
                self.send_error(405, "Method not allowed")
                return
            self.serve_node_metadata_kinds()
            return

        if parsed.path == "/api/patches":
            if not send_body:
                self.send_error(405, "Method not allowed")
                return
            self.serve_demo_patches()
            return

        if parsed.path == "/api/patches/file":
            if not send_body:
                self.send_error(405, "Method not allowed")
                return
            self.serve_demo_patch_file(parsed.query)
            return

        if parsed.path == "/artifact":
            self.serve_artifact(parsed.query, send_body=send_body)
            return

        self.send_error(404, "Not found")

    def serve_public(self, relative: str, send_body: bool) -> None:
        path = (PUBLIC / unquote(relative)).resolve()
        if not path.is_relative_to(PUBLIC):
            self.send_error(403, "Forbidden")
            return
        self.serve_file(path, send_body=send_body)

    def serve_native_module_file(self, relative: str, send_body: bool) -> None:
        path = (NATIVE_MODULES / unquote(relative)).resolve()
        if not path.is_relative_to(NATIVE_MODULES):
            self.send_error(403, "Forbidden")
            return
        self.serve_file(path, send_body=send_body)

    def native_module_entry_from_source(self, source_path: Path) -> dict[str, object] | None:
        headers: dict[str, str] = {}
        try:
            for line in source_path.read_text(encoding="utf-8").splitlines()[:48]:
                match = NATIVE_MODULE_HEADER_RE.match(line)
                if match:
                    key = match.group(1).lower()
                    value = match.group(2).strip()
                    headers[key] = value
        except OSError:
            return None
        name = headers.get("module") or headers.get("name") or source_path.parent.name
        target_type = headers.get("target") or name
        label = headers.get("label") or name
        wasm_path = source_path.with_suffix(".wasm")
        relative_source = source_path.relative_to(ROOT).as_posix()
        relative_wasm = wasm_path.relative_to(ROOT).as_posix()
        return {
            "name": name,
            "label": label,
            "targetType": target_type,
            "kind": headers.get("kind") or "",
            "source": relative_source,
            "sourceUrl": f"https://github.com/soundemote/soemdsp-sandbox/blob/master/{relative_source}",
            "libUrl": headers.get("lib") or "",
            "wasm": relative_wasm,
            "wasmUrl": relative_wasm,
            "wasmAvailable": wasm_path.exists(),
        }

    def serve_native_modules(self) -> None:
        modules = []
        if NATIVE_MODULES.exists():
            for source_path in sorted(NATIVE_MODULES.glob("*/*.cpp")):
                if source_path.parent.name == "combined":
                    continue
                entry = self.native_module_entry_from_source(source_path)
                if entry:
                    modules.append(entry)
        self.send_json({
            "ok": True,
            "root": str(NATIVE_MODULES.resolve()),
            "modules": modules,
        })

    def serve_manifest(self) -> None:
        manifest_path = self.manifest_path.resolve()
        if not manifest_path.exists():
            self.send_json(
                {
                    "ok": False,
                    "error": "manifest not found",
                    "artifactRoot": str(self.artifact_root.resolve()),
                    "path": str(manifest_path),
                },
                status=404,
            )
            return

        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            self.send_json(
                {
                    "ok": False,
                    "error": "manifest JSON parse failed",
                    "artifactRoot": str(self.artifact_root.resolve()),
                    "message": str(exc),
                    "path": str(manifest_path),
                },
                status=500,
            )
            return

        manifest_stat = manifest_path.stat()
        self.send_json(
            {
                "ok": True,
                "manifestPath": str(manifest_path),
                "artifactRoot": str(self.artifact_root.resolve()),
                "manifestInfo": {
                    "bytes": manifest_stat.st_size,
                    "modifiedUtc": datetime.fromtimestamp(
                        manifest_stat.st_mtime,
                        timezone.utc,
                    )
                    .replace(microsecond=0)
                    .isoformat()
                    .replace("+00:00", "Z"),
                },
                "manifest": manifest,
            }
        )

    def serve_node_metadata_kinds(self) -> None:
        self.send_json(
            {
                "ok": True,
                "templates": NODE_METADATA_KIND_TEMPLATES,
            },
        )

    def save_default_preset(self) -> None:
        payload = self.read_json_preset_payload("preset")
        if payload is None:
            return

        if not self.validate_node_patch_payload(payload, "preset"):
            return

        DEFAULT_PRESET.parent.mkdir(parents=True, exist_ok=True)
        DEFAULT_PRESET.write_text(
            f"{json.dumps(payload, indent=2, sort_keys=False)}\n",
            encoding="utf-8",
        )
        self.send_json(
            {
                "ok": True,
                "path": str(DEFAULT_PRESET),
                "bytes": DEFAULT_PRESET.stat().st_size,
            },
        )

    def serve_demo_patches(self) -> None:
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        bank_filter_enabled = "bank" in params
        requested_bank = self.normalized_patch_bank(params.get("bank", ["0"])[0])
        patches = []
        legacy_program = 0
        if SAVED_PATCHES.exists():
            for path in sorted(
                SAVED_PATCHES.glob("*.json"),
                key=lambda candidate: candidate.stat().st_mtime,
                reverse=True,
            ):
                try:
                    payload = json.loads(path.read_text(encoding="utf-8"))
                    info = payload.get("info") if isinstance(payload, dict) else {}
                    stat = path.stat()
                except (OSError, json.JSONDecodeError):
                    continue
                bank = self.patch_bank_for_file(path, info)
                if bank_filter_enabled and bank != requested_bank:
                    continue
                program = self.patch_program_for_file(path, info, legacy_program)
                legacy_program += 1
                if program < 0 or program > 127:
                    continue
                patches.append(
                    {
                        "filename": path.name,
                        "bank": bank,
                        "bankName": str(info.get("bankName") or ""),
                        "name": str(info.get("name") or path.stem),
                        "program": program,
                        "tags": str(info.get("tags") or ""),
                        "bytes": stat.st_size,
                        "modifiedUtc": datetime.fromtimestamp(
                            stat.st_mtime,
                            timezone.utc,
                        )
                        .replace(microsecond=0)
                        .isoformat()
                        .replace("+00:00", "Z"),
                    }
                )
        patches.sort(key=lambda patch: (int(patch["bank"]), int(patch["program"]), str(patch["name"]).lower()))
        self.send_json({"ok": True, "bank": requested_bank, "patches": patches, "path": str(SAVED_PATCHES)})

    def serve_demo_patch_file(self, query: str) -> None:
        params = parse_qs(query)
        filename = params.get("name", [""])[0]
        if not filename or filename != Path(filename).name or not filename.endswith(".json"):
            self.send_json({"ok": False, "error": "invalid patch filename"}, status=400)
            return
        path = (SAVED_PATCHES / filename).resolve()
        if not path.is_relative_to(SAVED_PATCHES.resolve()):
            self.send_json({"ok": False, "error": "invalid patch path"}, status=400)
            return
        if not path.exists():
            self.send_json({"ok": False, "error": "patch not found"}, status=404)
            return
        self.serve_file(path)

    def save_demo_patch(self) -> None:
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        payload = self.read_json_preset_payload("patch")
        if payload is None:
            return
        if not self.validate_node_patch_payload(payload, "patch"):
            return

        info = payload.get("info") if isinstance(payload.get("info"), dict) else {}
        bank = self.normalized_patch_bank(params.get("bank", [info.get("bank", 0)])[0])
        program = self.normalized_patch_program(params.get("program", [info.get("program", 0)])[0])
        info["bank"] = bank
        info["program"] = program
        payload["info"] = info
        title = str(info.get("name") or "soemdsp-patch")
        tag = str(info.get("tags") or "").strip()
        safe_title = self.safe_filename_part("-".join(part for part in (title, tag) if part))
        filename = f"bank{bank:03d}-program{program:03d}-{safe_title or 'soemdsp-patch'}.json"
        try:
            SAVED_PATCHES.mkdir(parents=True, exist_ok=True)
            for existing in SAVED_PATCHES.glob(f"bank{bank:03d}-program{program:03d}-*.json"):
                existing.unlink(missing_ok=True)
            path = SAVED_PATCHES / filename
            path.write_text(
                f"{json.dumps(payload, indent=2, sort_keys=False)}\n",
                encoding="utf-8",
            )
        except OSError as exc:
            self.send_json({"ok": False, "error": f"patch save failed: {exc}"}, status=500)
            return

        self.send_json(
            {
                "ok": True,
                "bank": bank,
                "filename": filename,
                "path": str(path),
                "program": program,
                "bytes": path.stat().st_size,
            },
        )

    def normalized_patch_bank(self, value: object) -> int:
        try:
            number = round(float(value))
        except (TypeError, ValueError):
            return 0
        return max(0, min(127, number))

    def normalized_patch_program(self, value: object) -> int:
        try:
            number = round(float(value))
        except (TypeError, ValueError):
            return 0
        return max(0, min(127, number))

    def patch_bank_for_file(self, path: Path, info: dict) -> int:
        if "bank" in info:
            return self.normalized_patch_bank(info.get("bank"))
        match = re.match(r"bank(\d{3})-program\d{3}-", path.name)
        return self.normalized_patch_bank(match.group(1)) if match else 0

    def patch_program_for_file(self, path: Path, info: dict, fallback: int) -> int:
        if "program" in info:
            return self.normalized_patch_program(info.get("program"))
        match = re.match(r"bank\d{3}-program(\d{3})-", path.name)
        return self.normalized_patch_program(match.group(1)) if match else self.normalized_patch_program(fallback)

    def validate_node_patch_payload(self, payload: dict, label: str) -> bool:
        patch_format = payload.get("format")
        if not isinstance(patch_format, dict):
            self.send_json(
                {"ok": False, "error": f"{label} missing format object"},
                status=400,
            )
            return False
        if patch_format.get("kind") != "soemdsp-sandbox-node-patch":
            self.send_json(
                {"ok": False, "error": f"{label} format kind mismatch"},
                status=400,
            )
            return False
        if patch_format.get("version") != 1:
            self.send_json(
                {"ok": False, "error": f"{label} format version mismatch"},
                status=400,
            )
            return False
        if not isinstance(payload.get("nodes"), list):
            self.send_json(
                {"ok": False, "error": f"{label} missing nodes array"},
                status=400,
            )
            return False
        return True

    def safe_filename_part(self, value: str) -> str:
        return "".join(
            character.lower() if character.isalnum() else "-"
            for character in value.strip()
        ).strip("-")[:80]

    def save_default_ui_settings(self) -> None:
        payload = self.read_json_preset_payload("ui settings")
        if payload is None:
            return

        settings_format = payload.get("format")
        if not isinstance(settings_format, dict):
            self.send_json(
                {"ok": False, "error": "ui settings missing format object"},
                status=400,
            )
            return
        if settings_format.get("kind") != "soemdsp-sandbox-user-ui-settings":
            self.send_json(
                {"ok": False, "error": "ui settings format kind mismatch"},
                status=400,
            )
            return
        if settings_format.get("version") not in (1, 2, 3):
            self.send_json(
                {"ok": False, "error": "ui settings format version mismatch"},
                status=400,
            )
            return
        if not isinstance(payload.get("controls"), dict):
            self.send_json(
                {"ok": False, "error": "ui settings missing controls object"},
                status=400,
            )
            return
        if not isinstance(payload.get("nodeColors"), dict):
            self.send_json(
                {"ok": False, "error": "ui settings missing nodeColors object"},
                status=400,
            )
            return
        if "view" in payload and not isinstance(payload.get("view"), dict):
            self.send_json(
                {"ok": False, "error": "ui settings view must be an object"},
                status=400,
            )
            return

        sanitize_default_ui_settings_view(payload)

        DEFAULT_UI_SETTINGS.parent.mkdir(parents=True, exist_ok=True)
        DEFAULT_UI_SETTINGS.write_text(
            f"{json.dumps(payload, indent=2, sort_keys=False)}\n",
            encoding="utf-8",
        )
        DEFAULT_UI_SETTINGS_SCRIPT.write_text(
            ui_settings_script_text(payload),
            encoding="utf-8",
        )
        self.send_json(
            {
                "ok": True,
                "path": str(DEFAULT_UI_SETTINGS),
                "bytes": DEFAULT_UI_SETTINGS.stat().st_size,
            },
        )

    def save_shader_script_to_desktop(self) -> None:
        payload = self.read_json_preset_payload("shader script")
        if payload is None:
            return

        source = payload.get("source")
        if not isinstance(source, str):
            self.send_json(
                {"ok": False, "error": "shader script source must be a string"},
                status=400,
            )
            return
        title = str(payload.get("title") or "scope-shader")
        safe_title = "".join(
            character if character.isalnum() or character in ("-", "_", ".") else "-"
            for character in title.strip()
        ).strip(".-") or "scope-shader"
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        filename = f"{safe_title}-{timestamp}.scope-shader.txt"
        desktop = Path.home() / "Desktop"
        try:
            desktop.mkdir(parents=True, exist_ok=True)
            path = desktop / filename
            path.write_text(source, encoding="utf-8")
        except OSError as exc:
            self.send_json(
                {"ok": False, "error": f"desktop export failed: {exc}"},
                status=500,
            )
            return
        self.send_json(
            {
                "ok": True,
                "filename": filename,
                "path": str(path),
                "bytes": path.stat().st_size,
            },
        )

    def save_metadata_script_to_desktop(self) -> None:
        payload = self.read_json_preset_payload("metadata script")
        if payload is None:
            return

        source = payload.get("source")
        if not isinstance(source, str):
            self.send_json(
                {"ok": False, "error": "metadata script source must be a string"},
                status=400,
            )
            return
        title = str(payload.get("title") or "metadata-script")
        safe_title = "".join(
            character if character.isalnum() or character in ("-", "_", ".") else "-"
            for character in title.strip()
        ).strip(".-") or "metadata-script"
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        filename = f"{safe_title}-{timestamp}.metadata-script.txt"
        desktop = Path.home() / "Desktop"
        try:
            desktop.mkdir(parents=True, exist_ok=True)
            path = desktop / filename
            path.write_text(source, encoding="utf-8")
        except OSError as exc:
            self.send_json(
                {"ok": False, "error": f"desktop export failed: {exc}"},
                status=500,
            )
            return
        self.send_json(
            {
                "ok": True,
                "filename": filename,
                "path": str(path),
                "bytes": path.stat().st_size,
            },
        )

    def open_local_path(self) -> None:
        payload = self.read_json_preset_payload("open path")
        if payload is None:
            return

        requested = payload.get("path")
        if not isinstance(requested, str) or not requested.strip():
            self.send_json({"ok": False, "error": "path must be a string"}, status=400)
            return

        downloads = (Path.home() / "Downloads").resolve()
        path = Path(requested.strip()).expanduser()
        if not path.is_absolute():
            path = downloads / path
        try:
            target = path.resolve()
        except OSError as exc:
            self.send_json({"ok": False, "error": f"path resolve failed: {exc}"}, status=400)
            return

        if target != downloads and not target.is_relative_to(downloads):
            self.send_json({"ok": False, "error": "path must be inside Downloads"}, status=403)
            return
        if not target.exists():
            self.send_json({"ok": False, "error": "path does not exist", "path": str(target)}, status=404)
            return
        if not hasattr(os, "startfile"):
            self.send_json({"ok": False, "error": "open path is only supported on Windows"}, status=501)
            return

        try:
            os.startfile(str(target))  # type: ignore[attr-defined]
        except OSError as exc:
            self.send_json({"ok": False, "error": f"open path failed: {exc}", "path": str(target)}, status=500)
            return

        self.send_json({"ok": True, "path": str(target)})

    def audio_file_data_url(self) -> None:
        payload = self.read_json_payload(
            "audio file",
            max_bytes=16 * 1024,
        )
        if payload is None:
            return

        source_path = payload.get("path")
        if not isinstance(source_path, str) or not source_path.strip():
            self.send_json({"ok": False, "error": "path is required"}, status=400)
            return

        try:
            target = Path(source_path).expanduser().resolve()
        except OSError as exc:
            self.send_json({"ok": False, "error": f"path resolve failed: {exc}"}, status=400)
            return

        home = Path.home().resolve()
        if not target.is_relative_to(home):
            self.send_json({"ok": False, "error": "audio path must stay inside the user home folder"}, status=403)
            return
        if not target.exists() or not target.is_file():
            self.send_json({"ok": False, "error": "audio file does not exist", "path": str(target)}, status=404)
            return
        if target.suffix.lower() not in SUPPORTED_AUDIO_FILE_SUFFIXES:
            self.send_json({"ok": False, "error": "unsupported audio file extension"}, status=400)
            return
        try:
            size = target.stat().st_size
        except OSError as exc:
            self.send_json({"ok": False, "error": f"audio file stat failed: {exc}"}, status=500)
            return
        if size <= 0:
            self.send_json({"ok": False, "error": "audio file is empty"}, status=400)
            return
        if size > MAX_AUDIO_FILE_BYTES:
            self.send_json({"ok": False, "error": "audio file is too large"}, status=413)
            return

        transcoded = self.transcode_audio_file_to_wav(target)
        if transcoded is not None:
            self.send_json(
                {
                    "ok": True,
                    "dataUrl": f"data:audio/wav;base64,{base64.b64encode(transcoded).decode('ascii')}",
                    "name": f"{target.stem}.wav",
                    "originalName": target.name,
                    "path": str(target),
                    "size": len(transcoded),
                    "sourceSize": size,
                    "transcoded": True,
                },
            )
            return

        try:
            content = target.read_bytes()
        except OSError as exc:
            self.send_json({"ok": False, "error": f"audio file read failed: {exc}"}, status=500)
            return

        mime_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self.send_json(
            {
                "ok": True,
                "dataUrl": f"data:{mime_type};base64,{base64.b64encode(content).decode('ascii')}",
                "name": target.name,
                "path": str(target),
                "size": size,
            },
        )

    def audio_file_find(self) -> None:
        payload = self.read_json_payload(
            "audio file search",
            max_bytes=24 * 1024,
        )
        if payload is None:
            return

        root_text = payload.get("root")
        if not isinstance(root_text, str) or not root_text.strip():
            self.send_json({"ok": False, "error": "search path is required"}, status=400)
            return

        names = payload.get("names")
        if not isinstance(names, list):
            names = [payload.get("name")]
        target_names = {
            str(name).strip().lower()
            for name in names
            if isinstance(name, str) and str(name).strip()
        }
        if not target_names:
            self.send_json({"ok": False, "error": "audio file name is required"}, status=400)
            return

        try:
            root = Path(root_text).expanduser().resolve()
        except OSError as exc:
            self.send_json({"ok": False, "error": f"search path resolve failed: {exc}"}, status=400)
            return

        home = Path.home().resolve()
        if not root.is_relative_to(home):
            self.send_json({"ok": False, "error": "search path must stay inside the user home folder"}, status=403)
            return
        if not root.exists():
            self.send_json({"ok": False, "error": "search path does not exist", "path": str(root)}, status=404)
            return

        roots = [root] if root.is_dir() else [root.parent]
        if root.is_file() and self.audio_search_candidate_matches(root, target_names):
            self.send_json({"ok": True, "path": str(root), "name": root.name, "visited": 1})
            return

        visited = 0
        first_suffix_match: Path | None = None
        for search_root in roots:
            try:
                iterator = search_root.rglob("*")
                for candidate in iterator:
                    visited += 1
                    if visited > MAX_AUDIO_SEARCH_VISITS:
                        self.send_json(
                            {
                                "ok": False,
                                "error": f"audio search stopped after {MAX_AUDIO_SEARCH_VISITS} files; choose a narrower folder",
                                "path": str(root),
                            },
                            status=413,
                        )
                        return
                    if not candidate.is_file() or candidate.suffix.lower() not in SUPPORTED_AUDIO_FILE_SUFFIXES:
                        continue
                    if self.audio_search_candidate_matches(candidate, target_names):
                        self.send_json({"ok": True, "path": str(candidate), "name": candidate.name, "visited": visited})
                        return
                    if first_suffix_match is None and candidate.name.lower() in target_names:
                        first_suffix_match = candidate
            except OSError as exc:
                self.send_json({"ok": False, "error": f"audio search failed: {exc}", "path": str(search_root)}, status=500)
                return

        if first_suffix_match:
            self.send_json({"ok": True, "path": str(first_suffix_match), "name": first_suffix_match.name, "visited": visited})
            return
        self.send_json(
            {
                "ok": False,
                "error": "audio file not found under search path",
                "path": str(root),
                "names": sorted(target_names),
                "visited": visited,
            },
            status=404,
        )

    def audio_search_candidate_matches(self, candidate: Path, target_names: set[str]) -> bool:
        name = candidate.name.lower()
        stem = candidate.stem.lower()
        if name in target_names or stem in target_names:
            return True
        for target in target_names:
            if not target:
                continue
            target_path_name = Path(target).name.lower()
            target_stem = Path(target_path_name).stem.lower()
            if name == target_path_name or stem == target_stem:
                return True
            if name.endswith(target_path_name) or stem.endswith(target_stem):
                return True
        return False

    def audio_file_transcode_data_url(self) -> None:
        payload = self.read_json_payload(
            "audio upload",
            max_bytes=MAX_AUDIO_UPLOAD_JSON_BYTES,
        )
        if payload is None:
            return

        name = str(payload.get("name") or "audio").strip()[:128]
        data_url = payload.get("dataUrl")
        if not isinstance(data_url, str) or "," not in data_url:
            self.send_json({"ok": False, "error": "audio data URL is required"}, status=400)
            return
        suffix = Path(name).suffix.lower() or ".audio"
        if suffix not in SUPPORTED_AUDIO_FILE_SUFFIXES:
            self.send_json({"ok": False, "error": "unsupported audio file extension"}, status=400)
            return
        try:
            content = base64.b64decode(data_url.split(",", 1)[1], validate=True)
        except (binascii.Error, ValueError):
            self.send_json({"ok": False, "error": "audio data URL base64 decode failed"}, status=400)
            return
        if not content:
            self.send_json({"ok": False, "error": "audio file is empty"}, status=400)
            return
        if len(content) > MAX_AUDIO_FILE_BYTES:
            self.send_json({"ok": False, "error": "audio file is too large"}, status=413)
            return

        with tempfile.TemporaryDirectory(prefix="soemdsp-audio-upload-") as directory:
            source = Path(directory) / f"source{suffix}"
            try:
                source.write_bytes(content)
            except OSError as exc:
                self.send_json({"ok": False, "error": f"audio upload write failed: {exc}"}, status=500)
                return
            transcoded = self.transcode_audio_file_to_wav(source)

        if transcoded is None:
            self.send_json({"ok": False, "error": "audio transcode failed"}, status=422)
            return
        self.send_json(
            {
                "ok": True,
                "dataUrl": f"data:audio/wav;base64,{base64.b64encode(transcoded).decode('ascii')}",
                "name": f"{Path(name).stem or 'audio'}.wav",
                "originalName": name,
                "size": len(transcoded),
                "sourceSize": len(content),
                "transcoded": True,
            },
        )

    def transcode_audio_file_to_wav(self, target: Path) -> bytes | None:
        with tempfile.TemporaryDirectory(prefix="soemdsp-audio-") as directory:
            output = Path(directory) / "audio.wav"
            command = [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(target),
                "-vn",
                "-acodec",
                "pcm_s16le",
                str(output),
            ]
            try:
                completed = subprocess.run(
                    command,
                    check=False,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE,
                    timeout=90,
                )
            except (OSError, subprocess.TimeoutExpired):
                return None
            if completed.returncode != 0 or not output.exists():
                return None
            try:
                if output.stat().st_size > MAX_AUDIO_TRANSCODE_BYTES:
                    return None
                return output.read_bytes()
            except OSError:
                return None

    def read_json_preset_payload(self, label: str) -> dict | None:
        return self.read_json_payload(label, max_bytes=MAX_PRESET_BYTES)

    def read_json_payload(self, label: str, max_bytes: int) -> dict | None:
        length_text = self.headers.get("Content-Length", "0")
        try:
            length = int(length_text)
        except ValueError:
            self.send_json(
                {"ok": False, "error": "invalid Content-Length"},
                status=400,
            )
            return
        if length <= 0:
            self.send_json({"ok": False, "error": f"empty {label} body"}, status=400)
            return None
        if length > max_bytes:
            self.send_json(
                {"ok": False, "error": f"{label} body too large"},
                status=413,
            )
            return None

        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            self.send_json(
                {"ok": False, "error": f"{label} JSON parse failed: {exc}"},
                status=400,
            )
            return None

        if not isinstance(payload, dict):
            self.send_json(
                {"ok": False, "error": f"{label} must be a JSON object"},
                status=400,
            )
            return None
        return payload

    def serve_artifact(self, query: str, send_body: bool) -> None:
        params = parse_qs(query)
        requested = params.get("path", [""])[0]
        if not requested:
            self.send_error(400, "Missing artifact path")
            return

        root = self.artifact_root.resolve()
        path = (root / requested).resolve()
        if not path.is_relative_to(root):
            self.send_error(403, "Forbidden")
            return

        self.serve_file(path, send_body=send_body)

    def serve_index(self, send_body: bool = True) -> None:
        path = PUBLIC / "index.html"
        if not path.exists():
            self.send_error(404, "Not found")
            return
        body = (
            path.read_text(encoding="utf-8")
            .replace("{{BUILD_NUMBER}}", BUILD_NUMBER)
            .replace("{{SANDBOX_VERSION}}", (VERSION_FILE.read_text(encoding="utf-8").strip() if VERSION_FILE.exists() else SANDBOX_VERSION))
            .replace("{{BUILD_MODE}}", BUILD_MODE)
            .encode("utf-8")
        )
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_no_store_headers()
        self.end_headers()
        if send_body:
            self.wfile.write(body)

    def serve_file(self, path: Path, send_body: bool = True) -> None:
        if path.resolve() == (PUBLIC / "index.html").resolve():
            self.serve_index(send_body=send_body)
            return
        if not path.exists() or not path.is_file():
            self.send_error(404, "Not found")
            return

        mime_type = STATIC_MIME_TYPES.get(path.suffix.lower())
        if mime_type is None:
            mime_type, _ = mimetypes.guess_type(path)
        stat = path.stat()
        try:
            byte_range = self.parse_byte_range(
                self.headers.get("Range"),
                stat.st_size,
            )
        except ValueError:
            self.send_range_error(stat.st_size)
            return

        start = 0
        end = stat.st_size - 1
        if byte_range is not None:
            start, end = byte_range
        content_length = end - start + 1

        self.send_response(206 if byte_range is not None else 200)
        self.send_header("Content-Type", mime_type or "application/octet-stream")
        self.send_header("Content-Length", str(content_length))
        self.send_header("Last-Modified", formatdate(stat.st_mtime, usegmt=True))
        self.send_header("Accept-Ranges", "bytes")
        if byte_range is not None:
            self.send_header("Content-Range", f"bytes {start}-{end}/{stat.st_size}")
        self.send_no_store_headers()
        self.end_headers()
        if send_body:
            with path.open("rb") as handle:
                handle.seek(start)
                self.wfile.write(handle.read(content_length))

    def parse_byte_range(
        self,
        header: str | None,
        file_size: int,
    ) -> tuple[int, int] | None:
        if not header:
            return None

        if not header.startswith("bytes="):
            raise ValueError("unsupported range unit")

        spec = header.removeprefix("bytes=").strip()
        if "," in spec or "-" not in spec:
            raise ValueError("unsupported byte range")

        start_text, end_text = spec.split("-", 1)
        try:
            if start_text == "":
                suffix_length = int(end_text)
                if suffix_length <= 0:
                    raise ValueError("invalid suffix range")
                start = max(0, file_size - suffix_length)
                end = file_size - 1
            else:
                start = int(start_text)
                end = int(end_text) if end_text else file_size - 1
        except ValueError as error:
            raise ValueError("invalid byte range") from error

        if start < 0 or end < start or start >= file_size:
            raise ValueError("unsatisfiable byte range")

        return start, min(end, file_size - 1)

    def send_range_error(self, file_size: int) -> None:
        self.send_response(416)
        self.send_header("Content-Range", f"bytes */{file_size}")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", "0")
        self.send_no_store_headers()
        self.end_headers()

    def send_no_store_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")

    def send_json(self, payload: object, status: int = 200) -> None:
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_no_store_headers()
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    global BUILD_MODE

    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=int(os.environ.get("PORT", 8765)), type=int)
    parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    parser.add_argument(
        "--release",
        action="store_true",
        help="Serve as a release build (SOEMDSP_BUILD_MODE=release): the debug "
        "console's bug button renders neutral instead of red. Debug tools "
        "themselves are unaffected -- this is a label only.",
    )
    args = parser.parse_args()

    if args.release:
        BUILD_MODE = "release"

    SandboxServer.manifest_path = Path(args.manifest).resolve()
    SandboxServer.artifact_root = SandboxServer.manifest_path.parent.resolve()

    print(f"build mode: {BUILD_MODE}")

    server = ThreadingHTTPServer((args.host, args.port), SandboxServer)
    print(f"soemdsp-sandbox serving http://{args.host}:{args.port}")
    print(f"manifest: {SandboxServer.manifest_path}")
    server.serve_forever()


if __name__ == "__main__":
    main()
