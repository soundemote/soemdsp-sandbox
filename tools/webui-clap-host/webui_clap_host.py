#!/usr/bin/env python3
"""Localhost companion prototype for the WebUI CLAP host plan.

This prototype proves the browser-to-localhost boundary, CLAP catalog discovery,
opt-in descriptor inspection, and opt-in instance initialization probes. It does
not process CLAP plugins.
"""

from __future__ import annotations

import argparse
import base64
import collections
import ctypes
import hashlib
import itertools
import json
import math
import os
import queue
import re
import signal
import struct
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from ctypes import wintypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit

if sys.platform == "win32" and not hasattr(wintypes, "LRESULT"):
    wintypes.LRESULT = ctypes.c_ssize_t  # type: ignore[attr-defined]
if sys.platform == "win32" and not hasattr(wintypes, "HMODULE"):
    wintypes.HMODULE = wintypes.HANDLE  # type: ignore[attr-defined]
for _win32_handle_type in ["HBRUSH", "HCURSOR", "HICON", "HMENU"]:
    if sys.platform == "win32" and not hasattr(wintypes, _win32_handle_type):
        setattr(wintypes, _win32_handle_type, wintypes.HANDLE)


HOST_NAME = "Soundemote WebUI CLAP Host"
HOST_VERSION = "0.1.0"
DEFAULT_BIND_ADDRESS = "127.0.0.1"
DEFAULT_PORT = 47991
CLAP_PLUGIN_FACTORY_ID = "clap.plugin-factory"
CLAP_EXT_PARAMS = "clap.params"
CLAP_EXT_AUDIO_PORTS = "clap.audio-ports"
CLAP_EXT_GUI = "clap.gui"
CLAP_EXT_LATENCY = "clap.latency"
CLAP_EXT_TAIL = "clap.tail"
CLAP_EXT_STATE = "clap.state"
CLAP_WINDOW_API_WIN32 = "win32"
CLAP_WINDOW_API_COCOA = "cocoa"
CLAP_WINDOW_API_X11 = "x11"
CLAP_WINDOW_API_WAYLAND = "wayland"
METADATA_PROBE_TIMEOUT_SECONDS = 5
CLAP_NAME_SIZE = 256
CLAP_PATH_SIZE = 1024
CLAP_CORE_EVENT_SPACE_ID = 0
CLAP_EVENT_NOTE_ON = 0
CLAP_EVENT_NOTE_OFF = 1
CLAP_EVENT_PARAM_VALUE = 5
CLAP_PROCESS_ERROR = 0
CLAP_LIVE_MIN_BLOCK_FRAMES = 32
CLAP_LIVE_MAX_BLOCK_FRAMES = 4096
CLAP_LIVE_DEFAULT_BLOCK_FRAMES = 256
CLAP_MAX_PROCESS_FRAMES = 48000
CLAP_MAX_PROCESS_BATCH_ITEMS = 64
CLAP_RENDER_SESSION_IDLE_TIMEOUT_SECONDS = 120.0
CLAP_TAIL_INFINITE_SAMPLES = 2_147_483_647
CLAP_MAX_STATE_BYTES = 4 * 1024 * 1024
PLANAR_F32_JSON = "planar-f32-json"
PLANAR_F32_BASE64 = "planar-f32-base64"
CLAP_SAFETY_PEAK_LIMIT = 4.0
CLAP_EDITOR_DEFAULT_WIDTH = 900
CLAP_EDITOR_DEFAULT_HEIGHT = 600
CLAP_EDITOR_MIN_WIDTH = 240
CLAP_EDITOR_MIN_HEIGHT = 160
CLAP_EDITOR_MAX_WIDTH = 4096
CLAP_EDITOR_MAX_HEIGHT = 4096


# Live audio (Architecture A, see docs/WEBUI_CLAP_HOST_PLAN.md "Design
# Direction (2026-07-17) -- Live Audio"): the host owns its own real-time
# audio device callback; the browser only ever sends control messages
# (parameters, notes). This is the one new dependency this host takes on --
# everything else here is deliberately stdlib + ctypes only. Kept optional
# and feature-detected (like the native CLAP libraries themselves) so the
# rest of the host (discovery, offline render, presets) works with zero
# pip installs; only /instances/:id/live/* routes need it.
try:
    import sounddevice as _sounddevice
    HAVE_SOUNDDEVICE = True
except ImportError:
    _sounddevice = None
    HAVE_SOUNDDEVICE = False


INSTANCE_ID_COUNTER = itertools.count(1)
RENDER_SESSION_ID_COUNTER = itertools.count(1)


def decode_planar_f32_base64_channels(audio: Any, frames: int) -> list[list[float]]:
    if not isinstance(audio, list):
        raise RuntimeError("inputAudio must be an array of base64 channel strings")
    channels: list[list[float]] = []
    for source_channel in audio:
        if not isinstance(source_channel, str):
            raise RuntimeError("inputAudio base64 channels must be strings")
        raw = base64.b64decode(source_channel.encode("ascii"), validate=True)
        channel_frames = min(frames, len(raw) // 4)
        channel: list[float] = []
        for frame in range(channel_frames):
            channel.append(struct.unpack_from("<f", raw, frame * 4)[0])
        if channel_frames < frames:
            channel.extend([0.0] * (frames - channel_frames))
        channels.append(channel)
    return channels


def encode_planar_f32_base64_channel(values: list[float]) -> str:
    buffer = bytearray(len(values) * 4)
    for index, value in enumerate(values):
        struct.pack_into("<f", buffer, index * 4, float(value))
    return base64.b64encode(buffer).decode("ascii")


class ClapVersion(ctypes.Structure):
    _fields_ = [
        ("major", ctypes.c_uint32),
        ("minor", ctypes.c_uint32),
        ("revision", ctypes.c_uint32),
    ]


class ClapPluginDescriptor(ctypes.Structure):
    _fields_ = [
        ("clap_version", ClapVersion),
        ("id", ctypes.c_char_p),
        ("name", ctypes.c_char_p),
        ("vendor", ctypes.c_char_p),
        ("url", ctypes.c_char_p),
        ("manual_url", ctypes.c_char_p),
        ("support_url", ctypes.c_char_p),
        ("version", ctypes.c_char_p),
        ("description", ctypes.c_char_p),
        ("features", ctypes.POINTER(ctypes.c_char_p)),
    ]


class ClapParamInfo(ctypes.Structure):
    _fields_ = [
        ("id", ctypes.c_uint32),
        ("flags", ctypes.c_uint32),
        ("cookie", ctypes.c_void_p),
        ("name", ctypes.c_char * CLAP_NAME_SIZE),
        ("module", ctypes.c_char * CLAP_PATH_SIZE),
        ("min_value", ctypes.c_double),
        ("max_value", ctypes.c_double),
        ("default_value", ctypes.c_double),
    ]


class ClapEventHeader(ctypes.Structure):
    _fields_ = [
        ("size", ctypes.c_uint32),
        ("time", ctypes.c_uint32),
        ("space_id", ctypes.c_uint16),
        ("type", ctypes.c_uint16),
        ("flags", ctypes.c_uint32),
    ]


class ClapEventParamValue(ctypes.Structure):
    _fields_ = [
        ("header", ClapEventHeader),
        ("param_id", ctypes.c_uint32),
        ("cookie", ctypes.c_void_p),
        ("note_id", ctypes.c_int32),
        ("port_index", ctypes.c_int16),
        ("channel", ctypes.c_int16),
        ("key", ctypes.c_int16),
        ("value", ctypes.c_double),
    ]


class ClapEventNote(ctypes.Structure):
    _fields_ = [
        ("header", ClapEventHeader),
        ("note_id", ctypes.c_int32),
        ("port_index", ctypes.c_int16),
        ("channel", ctypes.c_int16),
        ("key", ctypes.c_int16),
        ("velocity", ctypes.c_double),
    ]


class ClapAudioBuffer(ctypes.Structure):
    _fields_ = [
        ("data32", ctypes.POINTER(ctypes.POINTER(ctypes.c_float))),
        ("data64", ctypes.POINTER(ctypes.POINTER(ctypes.c_double))),
        ("channel_count", ctypes.c_uint32),
        ("latency", ctypes.c_uint32),
        ("constant_mask", ctypes.c_uint64),
    ]


class ClapProcess(ctypes.Structure):
    _fields_ = [
        ("steady_time", ctypes.c_int64),
        ("frames_count", ctypes.c_uint32),
        ("transport", ctypes.c_void_p),
        ("audio_inputs", ctypes.POINTER(ClapAudioBuffer)),
        ("audio_outputs", ctypes.POINTER(ClapAudioBuffer)),
        ("audio_inputs_count", ctypes.c_uint32),
        ("audio_outputs_count", ctypes.c_uint32),
        ("in_events", ctypes.c_void_p),
        ("out_events", ctypes.c_void_p),
    ]


class ClapAudioPortInfo(ctypes.Structure):
    _fields_ = [
        ("id", ctypes.c_uint32),
        ("name", ctypes.c_char * CLAP_NAME_SIZE),
        ("flags", ctypes.c_uint32),
        ("channel_count", ctypes.c_uint32),
        ("port_type", ctypes.c_char_p),
        ("in_place_pair", ctypes.c_uint32),
    ]


plugin_callback = ctypes.CFUNCTYPE(ctypes.c_bool, ctypes.c_void_p)
plugin_destroy_callback = ctypes.CFUNCTYPE(None, ctypes.c_void_p)
plugin_activate_callback = ctypes.CFUNCTYPE(
    ctypes.c_bool,
    ctypes.c_void_p,
    ctypes.c_double,
    ctypes.c_uint32,
    ctypes.c_uint32,
)
plugin_deactivate_callback = ctypes.CFUNCTYPE(None, ctypes.c_void_p)
plugin_process_callback = ctypes.CFUNCTYPE(ctypes.c_int32, ctypes.c_void_p, ctypes.c_void_p)
plugin_get_extension_callback = ctypes.CFUNCTYPE(
    ctypes.c_void_p,
    ctypes.c_void_p,
    ctypes.c_char_p,
)
plugin_on_main_thread_callback = ctypes.CFUNCTYPE(None, ctypes.c_void_p)


class ClapPlugin(ctypes.Structure):
    _fields_ = [
        ("desc", ctypes.POINTER(ClapPluginDescriptor)),
        ("plugin_data", ctypes.c_void_p),
        ("init", plugin_callback),
        ("destroy", plugin_destroy_callback),
        ("activate", plugin_activate_callback),
        ("deactivate", plugin_deactivate_callback),
        ("start_processing", plugin_callback),
        ("stop_processing", plugin_deactivate_callback),
        ("reset", plugin_deactivate_callback),
        ("process", plugin_process_callback),
        ("get_extension", plugin_get_extension_callback),
        ("on_main_thread", plugin_on_main_thread_callback),
    ]


host_get_extension_callback = ctypes.CFUNCTYPE(ctypes.c_void_p, ctypes.c_void_p, ctypes.c_char_p)
host_void_callback = ctypes.CFUNCTYPE(None, ctypes.c_void_p)


class ClapHost(ctypes.Structure):
    _fields_ = [
        ("clap_version", ClapVersion),
        ("host_data", ctypes.c_void_p),
        ("name", ctypes.c_char_p),
        ("vendor", ctypes.c_char_p),
        ("url", ctypes.c_char_p),
        ("version", ctypes.c_char_p),
        ("get_extension", host_get_extension_callback),
        ("request_restart", host_void_callback),
        ("request_process", host_void_callback),
        ("request_callback", host_void_callback),
    ]


init_callback = ctypes.CFUNCTYPE(ctypes.c_bool, ctypes.c_char_p)
deinit_callback = ctypes.CFUNCTYPE(None)
get_factory_callback = ctypes.CFUNCTYPE(ctypes.c_void_p, ctypes.c_char_p)


class ClapPluginEntry(ctypes.Structure):
    _fields_ = [
        ("clap_version", ClapVersion),
        ("init", init_callback),
        ("deinit", deinit_callback),
        ("get_factory", get_factory_callback),
    ]


get_count_callback = ctypes.CFUNCTYPE(ctypes.c_uint32, ctypes.c_void_p)
get_descriptor_callback = ctypes.CFUNCTYPE(
    ctypes.POINTER(ClapPluginDescriptor),
    ctypes.c_void_p,
    ctypes.c_uint32,
)
create_plugin_callback = ctypes.CFUNCTYPE(
    ctypes.POINTER(ClapPlugin),
    ctypes.c_void_p,
    ctypes.c_void_p,
    ctypes.c_char_p,
)


class ClapPluginFactory(ctypes.Structure):
    _fields_ = [
        ("get_plugin_count", get_count_callback),
        ("get_plugin_descriptor", get_descriptor_callback),
        ("create_plugin", create_plugin_callback),
    ]


params_count_callback = ctypes.CFUNCTYPE(ctypes.c_uint32, ctypes.POINTER(ClapPlugin))
params_get_info_callback = ctypes.CFUNCTYPE(
    ctypes.c_bool,
    ctypes.POINTER(ClapPlugin),
    ctypes.c_uint32,
    ctypes.POINTER(ClapParamInfo),
)
params_get_value_callback = ctypes.CFUNCTYPE(
    ctypes.c_bool,
    ctypes.POINTER(ClapPlugin),
    ctypes.c_uint32,
    ctypes.POINTER(ctypes.c_double),
)
params_value_to_text_callback = ctypes.CFUNCTYPE(
    ctypes.c_bool,
    ctypes.POINTER(ClapPlugin),
    ctypes.c_uint32,
    ctypes.c_double,
    ctypes.c_char_p,
    ctypes.c_uint32,
)
params_text_to_value_callback = ctypes.CFUNCTYPE(
    ctypes.c_bool,
    ctypes.POINTER(ClapPlugin),
    ctypes.c_uint32,
    ctypes.c_char_p,
    ctypes.POINTER(ctypes.c_double),
)
params_flush_callback = ctypes.CFUNCTYPE(
    None,
    ctypes.POINTER(ClapPlugin),
    ctypes.c_void_p,
    ctypes.c_void_p,
)

input_events_size_callback = ctypes.CFUNCTYPE(ctypes.c_uint32, ctypes.c_void_p)
input_events_get_callback = ctypes.CFUNCTYPE(ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint32)
output_events_try_push_callback = ctypes.CFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.POINTER(ClapEventHeader))


class ClapInputEvents(ctypes.Structure):
    _fields_ = [
        ("ctx", ctypes.c_void_p),
        ("size", input_events_size_callback),
        ("get", input_events_get_callback),
    ]


class ClapOutputEvents(ctypes.Structure):
    _fields_ = [
        ("ctx", ctypes.c_void_p),
        ("try_push", output_events_try_push_callback),
    ]


class ClapPluginParams(ctypes.Structure):
    _fields_ = [
        ("count", params_count_callback),
        ("get_info", params_get_info_callback),
        ("get_value", params_get_value_callback),
        ("value_to_text", params_value_to_text_callback),
        ("text_to_value", params_text_to_value_callback),
        ("flush", params_flush_callback),
    ]


audio_ports_count_callback = ctypes.CFUNCTYPE(
    ctypes.c_uint32,
    ctypes.POINTER(ClapPlugin),
    ctypes.c_bool,
)
audio_ports_get_callback = ctypes.CFUNCTYPE(
    ctypes.c_bool,
    ctypes.POINTER(ClapPlugin),
    ctypes.c_uint32,
    ctypes.c_bool,
    ctypes.POINTER(ClapAudioPortInfo),
)


class ClapPluginAudioPorts(ctypes.Structure):
    _fields_ = [
        ("count", audio_ports_count_callback),
        ("get", audio_ports_get_callback),
    ]


latency_get_callback = ctypes.CFUNCTYPE(ctypes.c_uint32, ctypes.POINTER(ClapPlugin))


class ClapPluginLatency(ctypes.Structure):
    _fields_ = [
        ("get", latency_get_callback),
    ]


tail_get_callback = ctypes.CFUNCTYPE(ctypes.c_uint32, ctypes.POINTER(ClapPlugin))


class ClapPluginTail(ctypes.Structure):
    _fields_ = [
        ("get", tail_get_callback),
    ]


state_stream_read_callback = ctypes.CFUNCTYPE(
    ctypes.c_int64,
    ctypes.c_void_p,
    ctypes.c_void_p,
    ctypes.c_uint64,
)
state_stream_write_callback = ctypes.CFUNCTYPE(
    ctypes.c_int64,
    ctypes.c_void_p,
    ctypes.c_void_p,
    ctypes.c_uint64,
)


class ClapInputStream(ctypes.Structure):
    _fields_ = [
        ("ctx", ctypes.c_void_p),
        ("read", state_stream_read_callback),
    ]


class ClapOutputStream(ctypes.Structure):
    _fields_ = [
        ("ctx", ctypes.c_void_p),
        ("write", state_stream_write_callback),
    ]


state_save_callback = ctypes.CFUNCTYPE(
    ctypes.c_bool,
    ctypes.POINTER(ClapPlugin),
    ctypes.POINTER(ClapOutputStream),
)
state_load_callback = ctypes.CFUNCTYPE(
    ctypes.c_bool,
    ctypes.POINTER(ClapPlugin),
    ctypes.POINTER(ClapInputStream),
)


class ClapPluginState(ctypes.Structure):
    _fields_ = [
        ("save", state_save_callback),
        ("load", state_load_callback),
    ]


class ClapWindow(ctypes.Structure):
    _fields_ = [
        ("api", ctypes.c_char_p),
        ("win32", ctypes.c_void_p),
    ]


gui_is_api_supported_callback = ctypes.CFUNCTYPE(
    ctypes.c_bool,
    ctypes.POINTER(ClapPlugin),
    ctypes.c_char_p,
    ctypes.c_bool,
)
gui_get_preferred_api_callback = ctypes.CFUNCTYPE(
    ctypes.c_bool,
    ctypes.POINTER(ClapPlugin),
    ctypes.POINTER(ctypes.c_char_p),
    ctypes.POINTER(ctypes.c_bool),
)
gui_create_callback = ctypes.CFUNCTYPE(
    ctypes.c_bool,
    ctypes.POINTER(ClapPlugin),
    ctypes.c_char_p,
    ctypes.c_bool,
)
gui_destroy_callback = ctypes.CFUNCTYPE(None, ctypes.POINTER(ClapPlugin))
gui_set_scale_callback = ctypes.CFUNCTYPE(
    ctypes.c_bool,
    ctypes.POINTER(ClapPlugin),
    ctypes.c_double,
)
gui_get_size_callback = ctypes.CFUNCTYPE(
    ctypes.c_bool,
    ctypes.POINTER(ClapPlugin),
    ctypes.POINTER(ctypes.c_uint32),
    ctypes.POINTER(ctypes.c_uint32),
)
gui_can_resize_callback = ctypes.CFUNCTYPE(ctypes.c_bool, ctypes.POINTER(ClapPlugin))
gui_get_resize_hints_callback = ctypes.CFUNCTYPE(
    ctypes.c_bool,
    ctypes.POINTER(ClapPlugin),
    ctypes.c_void_p,
)
gui_adjust_size_callback = ctypes.CFUNCTYPE(
    ctypes.c_bool,
    ctypes.POINTER(ClapPlugin),
    ctypes.POINTER(ctypes.c_uint32),
    ctypes.POINTER(ctypes.c_uint32),
)
gui_set_size_callback = ctypes.CFUNCTYPE(
    ctypes.c_bool,
    ctypes.POINTER(ClapPlugin),
    ctypes.c_uint32,
    ctypes.c_uint32,
)
gui_set_window_callback = ctypes.CFUNCTYPE(
    ctypes.c_bool,
    ctypes.POINTER(ClapPlugin),
    ctypes.c_void_p,
)
gui_suggest_title_callback = ctypes.CFUNCTYPE(
    None,
    ctypes.POINTER(ClapPlugin),
    ctypes.c_char_p,
)
gui_show_hide_callback = ctypes.CFUNCTYPE(ctypes.c_bool, ctypes.POINTER(ClapPlugin))


class ClapPluginGui(ctypes.Structure):
    _fields_ = [
        ("is_api_supported", gui_is_api_supported_callback),
        ("get_preferred_api", gui_get_preferred_api_callback),
        ("create", gui_create_callback),
        ("destroy", gui_destroy_callback),
        ("set_scale", gui_set_scale_callback),
        ("get_size", gui_get_size_callback),
        ("can_resize", gui_can_resize_callback),
        ("get_resize_hints", gui_get_resize_hints_callback),
        ("adjust_size", gui_adjust_size_callback),
        ("set_size", gui_set_size_callback),
        ("set_parent", gui_set_window_callback),
        ("set_transient", gui_set_window_callback),
        ("suggest_title", gui_suggest_title_callback),
        ("show", gui_show_hide_callback),
        ("hide", gui_show_hide_callback),
    ]


@host_get_extension_callback
def host_get_extension(_host: int, _extension_id: bytes) -> int:
    return 0


@host_void_callback
def host_noop(_host: int) -> None:
    return None


def create_minimal_host() -> tuple[ClapHost, ctypes.c_void_p]:
    host = ClapHost(
        ClapVersion(1, 2, 8),
        None,
        HOST_NAME.encode("utf-8"),
        b"Soundemote",
        b"https://soundemote.io",
        HOST_VERSION.encode("utf-8"),
        host_get_extension,
        host_noop,
        host_noop,
        host_noop,
    )
    return host, ctypes.cast(ctypes.pointer(host), ctypes.c_void_p)


if sys.platform == "win32":
    WIN32_EDITOR_CLASS_NAME = "SoundemoteWebUIClapEditorHostWindow"
    WM_CLOSE = 0x0010
    WM_DESTROY = 0x0002
    WM_APP_DESTROY_EDITOR = 0x8001
    WM_APP_RUN_EDITOR_TASK = 0x8002
    WS_OVERLAPPEDWINDOW = 0x00CF0000
    WS_VISIBLE = 0x10000000
    CW_USEDEFAULT = -2147483648
    SW_HIDE = 0
    SW_SHOWNORMAL = 1
    ERROR_CLASS_ALREADY_EXISTS = 1410

    win32_user32 = ctypes.WinDLL("user32", use_last_error=True)
    win32_kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    win32_WNDPROC = ctypes.WINFUNCTYPE(
        wintypes.LRESULT,
        wintypes.HWND,
        wintypes.UINT,
        wintypes.WPARAM,
        wintypes.LPARAM,
    )

    class Win32WndClass(ctypes.Structure):
        _fields_ = [
            ("style", wintypes.UINT),
            ("lpfnWndProc", win32_WNDPROC),
            ("cbClsExtra", ctypes.c_int),
            ("cbWndExtra", ctypes.c_int),
            ("hInstance", wintypes.HINSTANCE),
            ("hIcon", wintypes.HICON),
            ("hCursor", wintypes.HCURSOR),
            ("hbrBackground", wintypes.HBRUSH),
            ("lpszMenuName", wintypes.LPCWSTR),
            ("lpszClassName", wintypes.LPCWSTR),
        ]

    win32_user32.RegisterClassW.argtypes = [ctypes.POINTER(Win32WndClass)]
    win32_user32.RegisterClassW.restype = wintypes.ATOM
    win32_user32.CreateWindowExW.argtypes = [
        wintypes.DWORD,
        wintypes.LPCWSTR,
        wintypes.LPCWSTR,
        wintypes.DWORD,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        wintypes.HWND,
        wintypes.HMENU,
        wintypes.HINSTANCE,
        wintypes.LPVOID,
    ]
    win32_user32.CreateWindowExW.restype = wintypes.HWND
    win32_user32.DefWindowProcW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
    win32_user32.DefWindowProcW.restype = wintypes.LRESULT
    win32_user32.DestroyWindow.argtypes = [wintypes.HWND]
    win32_user32.DestroyWindow.restype = wintypes.BOOL
    win32_user32.DispatchMessageW.argtypes = [ctypes.POINTER(wintypes.MSG)]
    win32_user32.DispatchMessageW.restype = wintypes.LRESULT
    win32_user32.GetMessageW.argtypes = [ctypes.POINTER(wintypes.MSG), wintypes.HWND, wintypes.UINT, wintypes.UINT]
    win32_user32.GetMessageW.restype = wintypes.BOOL
    win32_user32.PostMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
    win32_user32.PostMessageW.restype = wintypes.BOOL
    win32_user32.PostQuitMessage.argtypes = [ctypes.c_int]
    win32_user32.PostQuitMessage.restype = None
    win32_user32.SetForegroundWindow.argtypes = [wintypes.HWND]
    win32_user32.SetForegroundWindow.restype = wintypes.BOOL
    win32_user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
    win32_user32.ShowWindow.restype = wintypes.BOOL
    win32_user32.TranslateMessage.argtypes = [ctypes.POINTER(wintypes.MSG)]
    win32_user32.TranslateMessage.restype = wintypes.BOOL
    win32_user32.UpdateWindow.argtypes = [wintypes.HWND]
    win32_user32.UpdateWindow.restype = wintypes.BOOL
    win32_kernel32.GetModuleHandleW.argtypes = [wintypes.LPCWSTR]
    win32_kernel32.GetModuleHandleW.restype = wintypes.HMODULE

    WIN32_EDITOR_WINDOWS: dict[int, "Win32EditorHostWindow"] = {}
    WIN32_EDITOR_WINDOWS_LOCK = threading.RLock()
    WIN32_EDITOR_CLASS_REGISTERED = False

    @win32_WNDPROC
    def win32_editor_window_proc(hwnd: int, message: int, wparam: int, lparam: int) -> int:
        hwnd_int = int(hwnd)
        if message == WM_CLOSE:
            win32_user32.ShowWindow(hwnd, SW_HIDE)
            return 0
        if message == WM_APP_DESTROY_EDITOR:
            win32_user32.DestroyWindow(hwnd)
            return 0
        if message == WM_APP_RUN_EDITOR_TASK:
            with WIN32_EDITOR_WINDOWS_LOCK:
                session = WIN32_EDITOR_WINDOWS.get(hwnd_int)
            if session is not None:
                session.run_pending_tasks()
            return 0
        if message == WM_DESTROY:
            with WIN32_EDITOR_WINDOWS_LOCK:
                session = WIN32_EDITOR_WINDOWS.pop(hwnd_int, None)
                if session is not None:
                    session.closed.set()
            win32_user32.PostQuitMessage(0)
            return 0
        return int(win32_user32.DefWindowProcW(hwnd, message, wparam, lparam))

    def ensure_win32_editor_window_class() -> None:
        global WIN32_EDITOR_CLASS_REGISTERED
        if WIN32_EDITOR_CLASS_REGISTERED:
            return
        wndclass = Win32WndClass(
            0,
            win32_editor_window_proc,
            0,
            0,
            win32_kernel32.GetModuleHandleW(None),
            None,
            None,
            None,
            None,
            WIN32_EDITOR_CLASS_NAME,
        )
        atom = win32_user32.RegisterClassW(ctypes.byref(wndclass))
        if not atom:
            error = ctypes.get_last_error()
            if error != ERROR_CLASS_ALREADY_EXISTS:
                raise RuntimeError(f"RegisterClassW failed: {error}")
        WIN32_EDITOR_CLASS_REGISTERED = True

    class Win32EditorHostWindow:
        def __init__(self, title: str, width: int, height: int):
            self.title = title
            self.width = int(width)
            self.height = int(height)
            self.ready = threading.Event()
            self.closed = threading.Event()
            self.tasks: queue.Queue[tuple[object, threading.Event, dict[str, Any]]] = queue.Queue()
            self.error = ""
            self.hwnd = 0
            self.thread = threading.Thread(
                target=self._run,
                name=f"CLAP editor window: {title}",
                daemon=True,
            )
            self.thread.start()
            if not self.ready.wait(5.0):
                raise RuntimeError("timed out creating editor host window")
            if self.error:
                raise RuntimeError(self.error)
            if not self.hwnd:
                raise RuntimeError("editor host window was not created")

        def _run(self) -> None:
            try:
                ensure_win32_editor_window_class()
                hwnd = win32_user32.CreateWindowExW(
                    0,
                    WIN32_EDITOR_CLASS_NAME,
                    self.title,
                    WS_OVERLAPPEDWINDOW | WS_VISIBLE,
                    CW_USEDEFAULT,
                    CW_USEDEFAULT,
                    self.width,
                    self.height,
                    None,
                    None,
                    win32_kernel32.GetModuleHandleW(None),
                    None,
                )
                if not hwnd:
                    self.error = f"CreateWindowExW failed: {ctypes.get_last_error()}"
                    self.ready.set()
                    return
                self.hwnd = int(hwnd)
                with WIN32_EDITOR_WINDOWS_LOCK:
                    WIN32_EDITOR_WINDOWS[self.hwnd] = self
                win32_user32.UpdateWindow(hwnd)
                self.ready.set()
                message = wintypes.MSG()
                while win32_user32.GetMessageW(ctypes.byref(message), None, 0, 0):
                    win32_user32.TranslateMessage(ctypes.byref(message))
                    win32_user32.DispatchMessageW(ctypes.byref(message))
            except Exception as error:
                self.error = str(error)
                self.ready.set()
            finally:
                self.closed.set()

        def show(self) -> None:
            if self.hwnd and not self.closed.is_set():
                win32_user32.ShowWindow(self.hwnd, SW_SHOWNORMAL)
                win32_user32.SetForegroundWindow(self.hwnd)

        def run_pending_tasks(self) -> None:
            while True:
                try:
                    callback, done, result = self.tasks.get_nowait()
                except queue.Empty:
                    return
                try:
                    result["value"] = callback()
                except Exception as error:
                    result["error"] = error
                finally:
                    done.set()

        def invoke(self, callback: object, timeout: float = 10.0) -> object:
            if not self.hwnd or self.closed.is_set():
                raise RuntimeError("editor host window is closed")
            done = threading.Event()
            result: dict[str, Any] = {}
            self.tasks.put((callback, done, result))
            win32_user32.PostMessageW(self.hwnd, WM_APP_RUN_EDITOR_TASK, 0, 0)
            if not done.wait(timeout):
                raise RuntimeError("timed out running editor window task")
            if "error" in result:
                raise result["error"]
            return result.get("value")

        def close(self) -> None:
            if self.hwnd and not self.closed.is_set():
                win32_user32.PostMessageW(self.hwnd, WM_APP_DESTROY_EDITOR, 0, 0)
                self.closed.wait(2.0)

else:
    Win32EditorHostWindow = None  # type: ignore[assignment]


def host_capabilities(
    metadata_inspection: bool = False,
    instance_probing: bool = False,
) -> dict[str, Any]:
    return {
        "pluginLoading": True,
        "pluginScanning": True,
        "metadataInspection": metadata_inspection,
        "instanceProbing": instance_probing,
        "persistentInstances": True,
        "audioProcessing": True,
        "maxProcessFrames": CLAP_MAX_PROCESS_FRAMES,
        "offlineRenderSessions": True,
        "renderSessionIdleTimeoutSeconds": CLAP_RENDER_SESSION_IDLE_TIMEOUT_SECONDS,
        "processBatch": True,
        "maxProcessBatchItems": CLAP_MAX_PROCESS_BATCH_ITEMS,
        "pluginEditorInfo": True,
        "pluginEditorOpening": sys.platform == "win32",
        "pluginLatencyInfo": True,
        "pluginTailInfo": True,
        "pluginStatePersistence": True,
        # Architecture A (see docs/WEBUI_CLAP_HOST_PLAN.md): the host owns
        # its own real-time audio device callback; requires the optional
        # sounddevice dependency, absent from a bare stdlib install.
        "liveAudio": HAVE_SOUNDDEVICE,
        "liveAudioMinBlockFrames": CLAP_LIVE_MIN_BLOCK_FRAMES,
        "liveAudioMaxBlockFrames": CLAP_LIVE_MAX_BLOCK_FRAMES,
        "liveAudioDefaultBlockFrames": CLAP_LIVE_DEFAULT_BLOCK_FRAMES,
    }


def host_status_payload(
    metadata_inspection: bool = False,
    instance_probing: bool = False,
    host_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = {
        "ok": True,
        "name": HOST_NAME,
        "version": HOST_VERSION,
        "capabilities": host_capabilities(metadata_inspection, instance_probing),
    }
    if host_config is not None:
        payload["hostConfig"] = host_config
    return payload


def host_config_payload(server: ThreadingHTTPServer) -> dict[str, Any]:
    bind_host, bind_port = server.server_address[:2]
    return build_host_config_payload(
        bind_host=str(bind_host),
        bind_port=int(bind_port),
        scan_dirs=getattr(server, "clap_scan_dirs", []),
        explicit_plugins=getattr(server, "clap_explicit_plugins", []),
        inspect_metadata=bool(getattr(server, "clap_inspect_metadata", False)),
        test_instantiate=bool(getattr(server, "clap_test_instantiate", False)),
    )


def build_host_config_payload(
    bind_host: str,
    bind_port: int,
    scan_dirs: list[Path],
    explicit_plugins: list[Path],
    inspect_metadata: bool,
    test_instantiate: bool,
) -> dict[str, Any]:
    return {
        "bindHost": bind_host,
        "port": int(bind_port),
        "pythonExecutable": sys.executable,
        "scriptPath": str(Path(__file__).resolve()),
        "workingDirectory": str(Path.cwd()),
        "scanDirs": [str(path) for path in scan_dirs],
        "explicitPlugins": [str(path) for path in explicit_plugins],
        "inspectMetadata": bool(inspect_metadata),
        "testInstantiate": bool(test_instantiate),
        "defaultPort": DEFAULT_PORT,
    }


def default_clap_scan_dirs() -> list[Path]:
    dirs: list[Path] = []
    program_files = os.environ.get("ProgramFiles")
    local_app_data = os.environ.get("LOCALAPPDATA")
    home = Path.home()
    if program_files:
        dirs.append(Path(program_files) / "Common Files" / "CLAP")
    if local_app_data:
        dirs.append(Path(local_app_data) / "Programs" / "Common" / "CLAP")
    clap_path = os.environ.get("CLAP_PATH")
    if clap_path:
        dirs.extend(Path(path) for path in clap_path.split(os.pathsep) if path)
    dirs.extend(
        [
            Path("/Library/Audio/Plug-Ins/CLAP"),
            home / "Library" / "Audio" / "Plug-Ins" / "CLAP",
            Path("/usr/lib/clap"),
            Path("/usr/local/lib/clap"),
            home / ".clap",
        ]
    )
    return dedupe_paths(dirs)


def dedupe_paths(paths: list[Path]) -> list[Path]:
    deduped: list[Path] = []
    seen: set[str] = set()
    for path in paths:
        key = str(path.expanduser()).lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(path.expanduser())
    return deduped


def plugin_id_for_path(path: Path) -> str:
    return hashlib.sha256(str(path.resolve()).encode("utf-8")).hexdigest()[:16]


def catalog_id_for_descriptor(path: Path, plugin_id: str, index: int) -> str:
    key = f"{path.resolve()}\0{plugin_id or index}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]


def plugin_record(path: Path, source: str) -> dict[str, Any]:
    resolved = path.resolve()
    return {
        "id": plugin_id_for_path(resolved),
        "clapId": "",
        "name": resolved.stem,
        "vendor": "",
        "version": "",
        "description": "",
        "features": [],
        "path": str(resolved),
        "source": source,
        "format": "CLAP",
        "loadable": False,
        "metadataInspected": False,
        "metadataError": "",
        "instantiationTested": False,
        "instantiable": False,
        "instantiationError": "",
    }


def clap_load_path(path: Path) -> Path | None:
    if path.is_file():
        return path
    if not path.is_dir():
        return None
    same_name_binary = path / path.name
    if same_name_binary.is_file():
        return same_name_binary
    direct_children = sorted(child for child in path.glob("*.clap") if child.is_file())
    if direct_children:
        return direct_children[0]
    return None


def iter_clap_candidates(scan_dir: Path):
    for root, dirs, files in os.walk(scan_dir):
        root_path = Path(root)
        for directory in list(dirs):
            directory_path = root_path / directory
            if directory_path.suffix.lower() == ".clap":
                yield directory_path
                dirs.remove(directory)
        for file_name in files:
            file_path = root_path / file_name
            if file_path.suffix.lower() == ".clap":
                yield file_path


def inspect_clap_metadata(path: Path, test_instantiate: bool) -> dict[str, Any]:
    command = [
        sys.executable,
        str(Path(__file__).resolve()),
        "--probe-metadata-json",
        str(path),
    ]
    if test_instantiate:
        command.append("--probe-instantiate")
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            check=False,
            text=True,
            timeout=METADATA_PROBE_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "metadata probe timed out"}
    if completed.returncode != 0:
        error = completed.stderr.strip() or completed.stdout.strip() or "metadata probe failed"
        return {"ok": False, "error": error}
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError:
        return {"ok": False, "error": "metadata probe returned invalid JSON"}
    if not isinstance(payload, dict):
        return {"ok": False, "error": "metadata probe returned non-object JSON"}
    return payload


def plugin_records_for_path(
    path: Path,
    source: str,
    inspect_metadata: bool,
    test_instantiate: bool,
) -> list[dict[str, Any]]:
    base_record = plugin_record(path, source)
    if not inspect_metadata:
        return [base_record]

    metadata = inspect_clap_metadata(path, test_instantiate)
    if metadata.get("ok") is not True:
        base_record["metadataInspected"] = True
        base_record["metadataError"] = str(metadata.get("error") or "metadata inspection failed")
        return [base_record]

    descriptors = metadata.get("plugins")
    if not isinstance(descriptors, list) or not descriptors:
        base_record["metadataInspected"] = True
        base_record["metadataError"] = "metadata inspection found no plugin descriptors"
        return [base_record]

    records: list[dict[str, Any]] = []
    for index, descriptor in enumerate(descriptors):
        if not isinstance(descriptor, dict):
            continue
        record = plugin_record(path, source)
        clap_id = str(descriptor.get("clapId") or "")
        record.update(
            {
                "id": catalog_id_for_descriptor(path, clap_id, index),
                "clapId": clap_id,
                "name": str(descriptor.get("name") or record["name"]),
                "vendor": str(descriptor.get("vendor") or ""),
                "version": str(descriptor.get("version") or ""),
                "description": str(descriptor.get("description") or ""),
                "features": descriptor.get("features") if isinstance(descriptor.get("features"), list) else [],
                "loadable": True,
                "metadataInspected": True,
                "metadataError": "",
                "instantiationTested": bool(descriptor.get("instantiationTested")),
                "instantiable": bool(descriptor.get("instantiable")),
                "instantiationError": str(descriptor.get("instantiationError") or ""),
                "pluginIndex": index,
            }
        )
        records.append(record)
    return records or [base_record]


def discover_clap_plugins(
    scan_dirs: list[Path],
    explicit_plugins: list[Path],
    inspect_metadata: bool,
    test_instantiate: bool,
) -> dict[str, Any]:
    plugin_records: list[dict[str, Any]] = []
    missing_explicit: list[str] = []
    scan_path_records = [
        {"path": str(path), "exists": path.exists(), "source": "scan"} for path in scan_dirs
    ]
    seen: set[str] = set()

    def add_candidate(path: Path, source: str) -> None:
        if not path.exists():
            if source == "explicit":
                missing_explicit.append(str(path))
            return
        if path.suffix.lower() != ".clap":
            return
        resolved = str(path.resolve())
        key = resolved.lower()
        if key in seen:
            return
        seen.add(key)
        plugin_records.extend(
            plugin_records_for_path(path, source, inspect_metadata, test_instantiate)
        )

    for explicit_plugin in explicit_plugins:
        add_candidate(explicit_plugin.expanduser(), "explicit")

    for scan_dir in scan_dirs:
        expanded_dir = scan_dir.expanduser()
        if not expanded_dir.is_dir():
            continue
        try:
            for candidate in iter_clap_candidates(expanded_dir):
                add_candidate(candidate, "scan")
        except OSError:
            continue

    return {
        "ok": True,
        "plugins": plugin_records,
        "count": len(plugin_records),
        "scanPaths": scan_path_records,
        "explicitPlugins": [str(path) for path in explicit_plugins],
        "missingExplicitPlugins": missing_explicit,
        "capabilities": host_capabilities(inspect_metadata, test_instantiate),
    }


def cached_discover_clap_plugins(server: Any, force_refresh: bool) -> dict[str, Any]:
    with server.clap_catalog_cache_lock:
        if not force_refresh and server.clap_catalog_cache is not None:
            return server.clap_catalog_cache
        catalog = discover_clap_plugins(
            server.clap_scan_dirs,
            server.clap_explicit_plugins,
            server.clap_inspect_metadata,
            server.clap_test_instantiate,
        )
        server.clap_catalog_cache = catalog
        return catalog


# CLAP presets: a saved node configuration (plugin identity, params, saved
# clap.state) written as a small JSON file in the host's preset folder.
# Presets always create a fresh instance on load -- instanceId is never
# stored, since it's scoped to one running host process's lifetime, not
# portable across sessions. See docs/WEBUI_CLAP_HOST_PLAN.md "Design
# Direction" for why presets are files here rather than a per-plugin
# Module Browser catalog entry.
def sanitize_clap_preset_id(name: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9_-]+", "-", str(name or "").strip()).strip("-")
    return slug[:80] or "preset"


def unique_clap_preset_id(presets_dir: Path, base_id: str) -> str:
    candidate = base_id
    suffix = 1
    while (presets_dir / f"{candidate}.json").exists():
        suffix += 1
        candidate = f"{base_id}-{suffix}"
    return candidate


def list_clap_presets(presets_dir: Path) -> dict[str, Any]:
    presets_dir.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, Any]] = []
    for path in sorted(presets_dir.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        clap = data.get("clap") if isinstance(data.get("clap"), dict) else {}
        records.append({
            "id": path.stem,
            "name": str(data.get("name") or path.stem),
            "clapId": str(clap.get("clapId") or ""),
            "pluginName": str(clap.get("name") or ""),
            "vendor": str(clap.get("vendor") or ""),
            "savedAt": str(data.get("savedAt") or ""),
        })
    return {"ok": True, "presets": records, "count": len(records)}


def read_clap_preset(presets_dir: Path, preset_id: str) -> dict[str, Any] | None:
    path = presets_dir / f"{sanitize_clap_preset_id(preset_id)}.json"
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def write_clap_preset(presets_dir: Path, payload: dict[str, Any]) -> dict[str, Any]:
    presets_dir.mkdir(parents=True, exist_ok=True)
    name = str(payload.get("name") or "").strip() or "Untitled Preset"
    clap = payload.get("clap") if isinstance(payload.get("clap"), dict) else {}
    if not clap.get("clapId") or not clap.get("path"):
        raise ValueError("preset requires clap.clapId and clap.path")
    # Host-instance-specific fields don't belong in a portable preset --
    # loading a preset always creates a fresh instance (see module comment).
    clean_clap = {
        key: value for key, value in clap.items()
        if key not in ("instanceId", "audioInputs", "audioOutputs")
    }
    record = {
        "name": name,
        "clap": clean_clap,
        "params": payload.get("params") if isinstance(payload.get("params"), dict) else {},
        "paramMeta": payload.get("paramMeta") if isinstance(payload.get("paramMeta"), dict) else {},
        "savedAt": datetime.now(timezone.utc).isoformat(),
    }
    preset_id = unique_clap_preset_id(presets_dir, sanitize_clap_preset_id(name))
    (presets_dir / f"{preset_id}.json").write_text(json.dumps(record, indent=2), encoding="utf-8")
    return {"ok": True, "id": preset_id, **record}


def delete_clap_preset(presets_dir: Path, preset_id: str) -> bool:
    path = presets_dir / f"{sanitize_clap_preset_id(preset_id)}.json"
    if not path.is_file():
        return False
    path.unlink()
    return True


def host_diagnostics_payload(
    *,
    mode: str,
    bind_host: str,
    bind_port: int,
    scan_dirs: list[Path],
    explicit_plugins: list[Path],
    inspect_metadata: bool,
    test_instantiate: bool,
) -> dict[str, Any]:
    catalog = discover_clap_plugins(
        scan_dirs,
        explicit_plugins,
        inspect_metadata,
        test_instantiate,
    )
    plugins = catalog.get("plugins") if isinstance(catalog.get("plugins"), list) else []
    metadata_error_count = sum(
        1 for plugin in plugins
        if isinstance(plugin, dict) and bool(plugin.get("metadataError"))
    )
    instantiation_error_count = sum(
        1 for plugin in plugins
        if isinstance(plugin, dict) and bool(plugin.get("instantiationError"))
    )
    explicit_missing_count = len(catalog.get("missingExplicitPlugins") or [])
    issue_count = metadata_error_count + instantiation_error_count + explicit_missing_count
    return {
        "ok": True,
        "mode": mode,
        "status": "pass" if issue_count == 0 else "issues",
        "name": HOST_NAME,
        "version": HOST_VERSION,
        "pythonVersion": sys.version.split()[0],
        "platform": sys.platform,
        "hostConfig": build_host_config_payload(
            bind_host=bind_host,
            bind_port=bind_port,
            scan_dirs=scan_dirs,
            explicit_plugins=explicit_plugins,
            inspect_metadata=inspect_metadata,
            test_instantiate=test_instantiate,
        ),
        "summary": {
            "scanPathCount": len(catalog.get("scanPaths") or []),
            "existingScanPathCount": sum(
                1 for path in catalog.get("scanPaths") or []
                if isinstance(path, dict) and bool(path.get("exists"))
            ),
            "explicitPluginCount": len(explicit_plugins),
            "missingExplicitPluginCount": explicit_missing_count,
            "pluginCount": len(plugins),
            "loadableCount": sum(
                1 for plugin in plugins
                if isinstance(plugin, dict) and bool(plugin.get("loadable"))
            ),
            "metadataInspectedCount": sum(
                1 for plugin in plugins
                if isinstance(plugin, dict) and bool(plugin.get("metadataInspected"))
            ),
            "metadataErrorCount": metadata_error_count,
            "instantiationTestedCount": sum(
                1 for plugin in plugins
                if isinstance(plugin, dict) and bool(plugin.get("instantiationTested"))
            ),
            "instantiableCount": sum(
                1 for plugin in plugins
                if isinstance(plugin, dict) and bool(plugin.get("instantiable"))
            ),
            "instantiationErrorCount": instantiation_error_count,
        },
        "catalog": catalog,
    }


def host_doctor_payload(args: argparse.Namespace) -> dict[str, Any]:
    scan_dirs = dedupe_paths(default_clap_scan_dirs() + [Path(path) for path in args.scan_dir])
    explicit_plugins = dedupe_paths([Path(path) for path in args.plugin])
    inspect_metadata = bool(args.inspect_metadata or args.test_instantiate)
    test_instantiate = bool(args.test_instantiate)
    return host_diagnostics_payload(
        mode="doctor",
        bind_host=str(args.host),
        bind_port=int(args.port),
        scan_dirs=scan_dirs,
        explicit_plugins=explicit_plugins,
        inspect_metadata=inspect_metadata,
        test_instantiate=test_instantiate,
    )


def safe_cstr(value: object) -> str:
    if not value:
        return ""
    try:
        if isinstance(value, bytes):
            return value.split(b"\0", 1)[0].decode("utf-8", errors="replace")
        return value.value.split(b"\0", 1)[0].decode("utf-8", errors="replace")
    except Exception:
        return ""


def read_null_terminated_features(features_pointer: object, limit: int = 64) -> list[str]:
    if not features_pointer:
        return []
    features: list[str] = []
    for index in range(limit):
        value = features_pointer[index]
        if not value:
            break
        features.append(safe_cstr(value))
    return features


def clap_param_flags(flags: int) -> list[str]:
    known_flags = [
        (1 << 0, "stepped"),
        (1 << 1, "periodic"),
        (1 << 2, "hidden"),
        (1 << 3, "readonly"),
        (1 << 4, "bypass"),
        (1 << 5, "automatable"),
        (1 << 10, "modulatable"),
        (1 << 15, "requiresProcess"),
        (1 << 16, "enum"),
    ]
    return [name for bit, name in known_flags if flags & bit]


class SingleParamInputEvents:
    def __init__(self, param_id: int, value: float, cookie: object = None):
        self.event = ClapEventParamValue(
            ClapEventHeader(
                ctypes.sizeof(ClapEventParamValue),
                0,
                CLAP_CORE_EVENT_SPACE_ID,
                CLAP_EVENT_PARAM_VALUE,
                0,
            ),
            int(param_id),
            cookie,
            -1,
            -1,
            -1,
            -1,
            float(value),
        )
        self.event_pointer = ctypes.pointer(self.event)
        self.header_pointer = ctypes.cast(self.event_pointer, ctypes.POINTER(ClapEventHeader))

        @input_events_size_callback
        def size(_events_pointer: int) -> int:
            return 1

        @input_events_get_callback
        def get(_events_pointer: int, index: int):
            if index == 0:
                return ctypes.cast(self.header_pointer, ctypes.c_void_p).value
            return None

        self._size = size
        self._get = get
        self.events = ClapInputEvents(None, self._size, self._get)


class MultiParamInputEvents:
    def __init__(self, parameter_events: list[dict[str, Any]]):
        self.event_storage = [
            ClapEventParamValue(
                ClapEventHeader(
                    ctypes.sizeof(ClapEventParamValue),
                    0,
                    CLAP_CORE_EVENT_SPACE_ID,
                    CLAP_EVENT_PARAM_VALUE,
                    0,
                ),
                int(event["paramId"]),
                event.get("cookie"),
                -1,
                -1,
                -1,
                -1,
                float(event["value"]),
            )
            for event in parameter_events
        ]
        self.event_pointers = [ctypes.pointer(event) for event in self.event_storage]
        self.header_pointers = [
            ctypes.cast(pointer, ctypes.POINTER(ClapEventHeader))
            for pointer in self.event_pointers
        ]

        @input_events_size_callback
        def size(_events_pointer: int) -> int:
            return len(self.header_pointers)

        @input_events_get_callback
        def get(_events_pointer: int, index: int):
            if 0 <= index < len(self.header_pointers):
                return ctypes.cast(self.header_pointers[index], ctypes.c_void_p).value
            return None

        self._size = size
        self._get = get
        self.events = ClapInputEvents(None, self._size, self._get)


def make_live_note_event(is_note_on: bool, key: int, velocity: float, channel: int = 0) -> ClapEventNote:
    return ClapEventNote(
        ClapEventHeader(
            ctypes.sizeof(ClapEventNote),
            0,
            CLAP_CORE_EVENT_SPACE_ID,
            CLAP_EVENT_NOTE_ON if is_note_on else CLAP_EVENT_NOTE_OFF,
            0,
        ),
        -1,
        -1,
        int(channel),
        int(key),
        float(velocity),
    )


def make_live_param_event(param_id: int, value: float) -> ClapEventParamValue:
    return ClapEventParamValue(
        ClapEventHeader(
            ctypes.sizeof(ClapEventParamValue),
            0,
            CLAP_CORE_EVENT_SPACE_ID,
            CLAP_EVENT_PARAM_VALUE,
            0,
        ),
        int(param_id),
        None,
        -1,
        -1,
        -1,
        -1,
        float(value),
    )


# Unlike MultiParamInputEvents (param-only, built from JSON dicts), this
# takes already-constructed event structs of any type -- the live audio
# callback queues a mix of ClapEventNote/ClapEventParamValue instances
# between process() calls and hands the whole batch to the plugin at the
# start of the next callback. Building event structs happens on the HTTP
# thread when a note/param request arrives (rare, not real-time-critical);
# the callback itself only ever drains a plain list, no allocation beyond
# this thin wrapper.
class MixedInputEvents:
    def __init__(self, events: list[ctypes.Structure]):
        self.event_pointers = [ctypes.pointer(event) for event in events]
        self.header_pointers = [
            ctypes.cast(pointer, ctypes.POINTER(ClapEventHeader))
            for pointer in self.event_pointers
        ]

        @input_events_size_callback
        def size(_events_pointer: int) -> int:
            return len(self.header_pointers)

        @input_events_get_callback
        def get(_events_pointer: int, index: int):
            if 0 <= index < len(self.header_pointers):
                return ctypes.cast(self.header_pointers[index], ctypes.c_void_p).value
            return None

        self._size = size
        self._get = get
        self.events = ClapInputEvents(None, self._size, self._get)


class EmptyInputEvents:
    def __init__(self):
        @input_events_size_callback
        def size(_events_pointer: int) -> int:
            return 0

        @input_events_get_callback
        def get(_events_pointer: int, _index: int):
            return None

        self._size = size
        self._get = get
        self.events = ClapInputEvents(None, self._size, self._get)


class IgnoredOutputEvents:
    def __init__(self):
        @output_events_try_push_callback
        def try_push(_events_pointer: int, _event_pointer: object) -> bool:
            return True

        self._try_push = try_push
        self.events = ClapOutputEvents(None, self._try_push)


def locked_clap_instance_method(method):
    def wrapper(self, *args: object, **kwargs: object):
        with self.lock:
            return method(self, *args, **kwargs)

    return wrapper


class PersistentClapInstance:
    def __init__(self, instance_id: str, plugin_path: Path, clap_id: str):
        self.lock = threading.RLock()
        self.instance_id = instance_id
        self.plugin_path = plugin_path
        self.clap_id = clap_id
        self.load_path = clap_load_path(plugin_path)
        if self.load_path is None:
            raise RuntimeError("no loadable .clap binary found")
        self.library = ctypes.CDLL(str(self.load_path))
        self.entry = ClapPluginEntry.in_dll(self.library, "clap_entry")
        if self.entry.clap_version.major < 1:
            raise RuntimeError("incompatible CLAP ABI version")
        self.entry_initialized = bool(self.entry.init(str(plugin_path).encode("utf-8")))
        if not self.entry_initialized:
            raise RuntimeError("clap_entry.init returned false")
        self.host, self.host_pointer = create_minimal_host()
        self.factory_pointer = self.entry.get_factory(CLAP_PLUGIN_FACTORY_ID.encode("utf-8"))
        if not self.factory_pointer:
            self.close()
            raise RuntimeError("plugin factory not provided")
        self.factory = ctypes.cast(self.factory_pointer, ctypes.POINTER(ClapPluginFactory)).contents
        self.plugin_pointer = self.factory.create_plugin(
            self.factory_pointer,
            self.host_pointer,
            clap_id.encode("utf-8"),
        )
        if not self.plugin_pointer:
            self.close()
            raise RuntimeError("factory.create_plugin returned null")
        self.plugin_initialized = bool(self.plugin_pointer.contents.init(self.plugin_pointer))
        if not self.plugin_initialized:
            self.close()
            raise RuntimeError("plugin.init returned false")
        self.safety_latched = False
        self.safety_reason = ""
        self.safety_raw_peak = 0.0
        self.offline_render_session_id = ""
        self.offline_render_sample_rate = 0.0
        self.offline_render_max_frames = 0
        self.offline_render_active = False
        self.offline_render_processing = False
        self.offline_render_last_touch = 0.0
        self.editor_window: Any = None
        self.editor_gui_created = False
        self.editor_api = ""
        self.editor_width = 0
        self.editor_height = 0
        self._editor_window_api_bytes = b""
        self._editor_clap_window: ClapWindow | None = None
        # Live audio (Architecture A): a real-time sounddevice OutputStream
        # calling this instance's process() continuously. None when not
        # live. Buffers are pre-allocated once in start_live_audio and
        # reused every callback -- the callback itself never allocates
        # (real-time-safety requirement for the audio thread).
        self.live_stream: Any = None
        self.live_sample_rate = 0.0
        self.live_block_size = 0
        self.live_input_arrays: list[Any] = []
        self.live_output_arrays: list[Any] = []
        self.live_input_buffer_array: Any = None
        self.live_output_buffer_array: Any = None
        self.live_input_port_count = 0
        self.live_output_port_count = 0
        self.live_total_output_channels = 0
        self.live_empty_inputs: Any = None
        self.live_ignored_outputs: Any = None
        self.live_pending_events: collections.deque = collections.deque()
        self.live_peak = 0.0
        self.live_frame_count = 0
        self.live_xrun_count = 0
        self.live_dropped_callback_count = 0
        self.live_error = ""

    @locked_clap_instance_method
    def summary(self) -> dict[str, Any]:
        self.expire_offline_render_if_idle()
        return {
            "instanceId": self.instance_id,
            "path": str(self.plugin_path.resolve()),
            "loadPath": str(self.load_path.resolve()) if self.load_path else "",
            "clapId": self.clap_id,
            "audioInputs": self.audio_ports(True),
            "audioOutputs": self.audio_ports(False),
            "active": bool(self.offline_render_active),
            "processing": bool(self.offline_render_processing),
            "renderSessionId": str(self.offline_render_session_id),
            "renderSessionIdleTimeoutSeconds": CLAP_RENDER_SESSION_IDLE_TIMEOUT_SECONDS,
            "editor": self.editor_status(),
            "latency": self.latency_state(),
            "tail": self.tail_state(),
            "state": self.state_status(),
            "safety": self.safety_state(),
        }

    def safety_state(self) -> dict[str, Any]:
        return {
            "latched": bool(getattr(self, "safety_latched", False)),
            "reason": str(getattr(self, "safety_reason", "")),
            "rawPeak": float(getattr(self, "safety_raw_peak", 0.0) or 0.0),
            "peakLimit": CLAP_SAFETY_PEAK_LIMIT,
        }

    def gui_extension(self) -> ClapPluginGui | None:
        pointer = self.plugin_pointer.contents.get_extension(
            self.plugin_pointer,
            CLAP_EXT_GUI.encode("utf-8"),
        )
        if not pointer:
            return None
        return ctypes.cast(pointer, ctypes.POINTER(ClapPluginGui)).contents

    def latency_extension(self) -> ClapPluginLatency | None:
        pointer = self.plugin_pointer.contents.get_extension(
            self.plugin_pointer,
            CLAP_EXT_LATENCY.encode("utf-8"),
        )
        if not pointer:
            return None
        return ctypes.cast(pointer, ctypes.POINTER(ClapPluginLatency)).contents

    @locked_clap_instance_method
    def latency_state(self) -> dict[str, Any]:
        latency = self.latency_extension()
        if latency is None:
            return {
                "supported": False,
                "samples": 0,
            }
        try:
            samples = int(latency.get(self.plugin_pointer))
        except Exception as error:
            return {
                "supported": True,
                "samples": 0,
                "error": str(error),
            }
        return {
            "supported": True,
            "samples": max(0, samples),
        }

    def tail_extension(self) -> ClapPluginTail | None:
        pointer = self.plugin_pointer.contents.get_extension(
            self.plugin_pointer,
            CLAP_EXT_TAIL.encode("utf-8"),
        )
        if not pointer:
            return None
        return ctypes.cast(pointer, ctypes.POINTER(ClapPluginTail)).contents

    @locked_clap_instance_method
    def tail_state(self) -> dict[str, Any]:
        tail = self.tail_extension()
        if tail is None:
            return {
                "supported": False,
                "samples": 0,
                "infinite": False,
            }
        try:
            samples = int(tail.get(self.plugin_pointer))
        except Exception as error:
            return {
                "supported": True,
                "samples": 0,
                "infinite": False,
                "error": str(error),
            }
        clamped = max(0, samples)
        return {
            "supported": True,
            "samples": clamped,
            "infinite": clamped >= CLAP_TAIL_INFINITE_SAMPLES,
        }

    def state_extension(self) -> ClapPluginState | None:
        pointer = self.plugin_pointer.contents.get_extension(
            self.plugin_pointer,
            CLAP_EXT_STATE.encode("utf-8"),
        )
        if not pointer:
            return None
        return ctypes.cast(pointer, ctypes.POINTER(ClapPluginState)).contents

    def assert_state_operation_allowed(self) -> None:
        self.expire_offline_render_if_idle()
        if self.offline_render_session_id:
            raise RuntimeError("plugin state operations are blocked during an active render session")

    def state_status(self) -> dict[str, Any]:
        return {
            "supported": self.state_extension() is not None,
            "maxStateBytes": CLAP_MAX_STATE_BYTES,
        }

    def assert_editor_operation_allowed(self) -> None:
        self.expire_offline_render_if_idle()
        if self.offline_render_session_id:
            raise RuntimeError("plugin editor operations are blocked during an active render session")

    def _editor_size(self, gui: ClapPluginGui) -> tuple[int, int]:
        width = ctypes.c_uint32(CLAP_EDITOR_DEFAULT_WIDTH)
        height = ctypes.c_uint32(CLAP_EDITOR_DEFAULT_HEIGHT)
        try:
            if not gui.get_size(self.plugin_pointer, ctypes.byref(width), ctypes.byref(height)):
                width.value = CLAP_EDITOR_DEFAULT_WIDTH
                height.value = CLAP_EDITOR_DEFAULT_HEIGHT
        except Exception:
            width.value = CLAP_EDITOR_DEFAULT_WIDTH
            height.value = CLAP_EDITOR_DEFAULT_HEIGHT
        return (
            max(CLAP_EDITOR_MIN_WIDTH, min(CLAP_EDITOR_MAX_WIDTH, int(width.value))),
            max(CLAP_EDITOR_MIN_HEIGHT, min(CLAP_EDITOR_MAX_HEIGHT, int(height.value))),
        )

    def _close_editor_locked(self) -> None:
        gui = self.gui_extension() if getattr(self, "plugin_pointer", None) else None
        if self.editor_gui_created and gui is not None:
            def close_gui() -> None:
                try:
                    gui.hide(self.plugin_pointer)
                except Exception:
                    pass
                try:
                    gui.destroy(self.plugin_pointer)
                except Exception:
                    pass

            try:
                if self.editor_window is not None:
                    self.editor_window.invoke(close_gui, timeout=5.0)
                else:
                    close_gui()
            except Exception:
                close_gui()
        self.editor_gui_created = False
        self.editor_api = ""
        self.editor_width = 0
        self.editor_height = 0
        self._editor_window_api_bytes = b""
        self._editor_clap_window = None
        if self.editor_window is not None:
            try:
                self.editor_window.close()
            except Exception:
                pass
        self.editor_window = None

    @locked_clap_instance_method
    def save_state(self) -> dict[str, Any]:
        self.assert_state_operation_allowed()
        state = self.state_extension()
        if state is None:
            return {
                "ok": True,
                "instanceId": self.instance_id,
                "supported": False,
                "stateBase64": "",
                "byteCount": 0,
                "state": self.state_status(),
            }
        output = bytearray()
        write_failed = False

        def write(_stream: int, buffer: int, size: int) -> int:
            nonlocal write_failed
            byte_count = int(size)
            if byte_count < 0:
                write_failed = True
                return -1
            if len(output) + byte_count > CLAP_MAX_STATE_BYTES:
                write_failed = True
                return -1
            output.extend(ctypes.string_at(buffer, byte_count))
            return byte_count

        write_callback = state_stream_write_callback(write)
        stream = ClapOutputStream(None, write_callback)
        saved = bool(state.save(self.plugin_pointer, ctypes.byref(stream)))
        if write_failed:
            raise RuntimeError(f"plugin state exceeds {CLAP_MAX_STATE_BYTES} bytes")
        if not saved:
            raise RuntimeError("plugin state save returned false")
        state_base64 = base64.b64encode(bytes(output)).decode("ascii")
        return {
            "ok": True,
            "instanceId": self.instance_id,
            "supported": True,
            "stateBase64": state_base64,
            "byteCount": len(output),
            "state": self.state_status(),
        }

    @locked_clap_instance_method
    def load_state(self, state_base64: str) -> dict[str, Any]:
        self.assert_state_operation_allowed()
        state = self.state_extension()
        if state is None:
            raise RuntimeError("plugin does not expose clap.state")
        try:
            state_bytes = base64.b64decode(str(state_base64 or "").encode("ascii"), validate=True)
        except Exception as error:
            raise RuntimeError(f"invalid base64 plugin state: {error}") from error
        if len(state_bytes) > CLAP_MAX_STATE_BYTES:
            raise RuntimeError(f"plugin state exceeds {CLAP_MAX_STATE_BYTES} bytes")
        offset = 0

        def read(_stream: int, buffer: int, size: int) -> int:
            nonlocal offset
            byte_count = max(0, int(size))
            remaining = len(state_bytes) - offset
            read_size = min(byte_count, remaining)
            if read_size <= 0:
                return 0
            chunk = state_bytes[offset:offset + read_size]
            ctypes.memmove(buffer, chunk, read_size)
            offset += read_size
            return read_size

        read_callback = state_stream_read_callback(read)
        stream = ClapInputStream(None, read_callback)
        loaded = bool(state.load(self.plugin_pointer, ctypes.byref(stream)))
        if not loaded:
            raise RuntimeError("plugin state load returned false")
        return {
            "ok": True,
            "instanceId": self.instance_id,
            "supported": True,
            "byteCount": len(state_bytes),
            "state": self.state_status(),
        }

    @locked_clap_instance_method
    def editor_status(self) -> dict[str, Any]:
        gui = self.gui_extension()
        if gui is None:
            return {
                "supported": False,
                "canOpen": False,
                "reason": "plugin does not expose clap.gui",
                "open": False,
                "supportedApis": [],
            }
        supported_apis: list[dict[str, Any]] = []
        for api in [CLAP_WINDOW_API_WIN32, CLAP_WINDOW_API_COCOA, CLAP_WINDOW_API_X11, CLAP_WINDOW_API_WAYLAND]:
            api_bytes = api.encode("utf-8")
            for floating in [False, True]:
                try:
                    supported = bool(gui.is_api_supported(self.plugin_pointer, api_bytes, floating))
                except Exception:
                    supported = False
                if supported:
                    supported_apis.append({"api": api, "floating": floating})
        preferred_api = ""
        preferred_floating = False
        try:
            preferred_api_ptr = ctypes.c_char_p()
            preferred_floating_value = ctypes.c_bool(False)
            if gui.get_preferred_api(
                self.plugin_pointer,
                ctypes.byref(preferred_api_ptr),
                ctypes.byref(preferred_floating_value),
            ):
                preferred_api = safe_cstr(preferred_api_ptr.value)
                preferred_floating = bool(preferred_floating_value.value)
        except Exception:
            preferred_api = ""
            preferred_floating = False
        win32_parent_supported = any(
            entry.get("api") == CLAP_WINDOW_API_WIN32 and entry.get("floating") is False
            for entry in supported_apis
        )
        can_open = bool(sys.platform == "win32" and win32_parent_supported and Win32EditorHostWindow is not None)
        reason = ""
        if not can_open:
            if sys.platform != "win32":
                reason = "native editor opening is only implemented for Win32 in this prototype"
            elif not win32_parent_supported:
                reason = "plugin does not report non-floating win32 clap.gui support"
            else:
                reason = "Win32 editor host window support is unavailable"
        return {
            "supported": True,
            "canOpen": can_open,
            "reason": reason,
            "open": bool(self.editor_gui_created),
            "api": self.editor_api,
            "width": int(self.editor_width),
            "height": int(self.editor_height),
            "preferredApi": preferred_api,
            "preferredFloating": preferred_floating,
            "supportedApis": supported_apis,
        }

    @locked_clap_instance_method
    def open_editor(self) -> dict[str, Any]:
        self.assert_editor_operation_allowed()
        status = self.editor_status()
        if status.get("canOpen") is not True:
            return {
                "ok": False,
                "instanceId": self.instance_id,
                "error": status.get("reason") or "plugin editor opening is unavailable",
                "editor": status,
            }
        if self.editor_gui_created and self.editor_window is not None:
            self.editor_window.show()
            return {
                "ok": True,
                "instanceId": self.instance_id,
                "alreadyOpen": True,
                "editor": self.editor_status(),
            }
        gui = self.gui_extension()
        if gui is None:
            return {
                "ok": False,
                "instanceId": self.instance_id,
                "error": "plugin does not expose clap.gui",
                "editor": self.editor_status(),
            }
        window = None
        try:
            width, height = self._editor_size(gui)
            window = Win32EditorHostWindow(  # type: ignore[operator]
                f"{HOST_NAME} - {self.clap_id}",
                width,
                height,
            )
            api_bytes = CLAP_WINDOW_API_WIN32.encode("utf-8")
            clap_window = ClapWindow(api_bytes, ctypes.c_void_p(window.hwnd))
            clap_window_pointer = ctypes.cast(ctypes.byref(clap_window), ctypes.c_void_p)

            def create_gui() -> None:
                created = bool(gui.create(self.plugin_pointer, api_bytes, False))
                if not created:
                    raise RuntimeError("plugin gui.create returned false")
                try:
                    if not gui.set_parent(self.plugin_pointer, clap_window_pointer):
                        raise RuntimeError("plugin gui.set_parent returned false")
                    try:
                        gui.set_size(self.plugin_pointer, width, height)
                    except Exception:
                        pass
                    if not gui.show(self.plugin_pointer):
                        raise RuntimeError("plugin gui.show returned false")
                except Exception:
                    try:
                        gui.hide(self.plugin_pointer)
                    except Exception:
                        pass
                    try:
                        gui.destroy(self.plugin_pointer)
                    except Exception:
                        pass
                    raise

            window.invoke(create_gui, timeout=10.0)
            window.show()
            self.editor_window = window
            self.editor_gui_created = True
            self.editor_api = CLAP_WINDOW_API_WIN32
            self.editor_width = width
            self.editor_height = height
            self._editor_window_api_bytes = api_bytes
            self._editor_clap_window = clap_window
            return {
                "ok": True,
                "instanceId": self.instance_id,
                "editor": self.editor_status(),
            }
        except Exception:
            if window is not None:
                try:
                    window.close()
                except Exception:
                    pass
            raise

    @locked_clap_instance_method
    def close_editor(self) -> dict[str, Any]:
        self.assert_editor_operation_allowed()
        already_open = bool(self.editor_gui_created)
        self._close_editor_locked()
        return {
            "ok": True,
            "instanceId": self.instance_id,
            "alreadyOpen": already_open,
            "editor": self.editor_status(),
        }

    def trip_safety_latch(self, reason: str, raw_peak: float) -> None:
        self.safety_latched = True
        self.safety_reason = reason
        self.safety_raw_peak = float(raw_peak) if math.isfinite(raw_peak) else 0.0

    @locked_clap_instance_method
    def reset_safety_latch(self) -> dict[str, Any]:
        self.safety_latched = False
        self.safety_reason = ""
        self.safety_raw_peak = 0.0
        return {
            "ok": True,
            "instanceId": self.instance_id,
            "safety": self.safety_state(),
        }

    def _stop_offline_render_locked(self) -> None:
        if getattr(self, "offline_render_processing", False):
            try:
                self.plugin_pointer.contents.stop_processing(self.plugin_pointer)
            finally:
                self.offline_render_processing = False
        if getattr(self, "offline_render_active", False):
            try:
                self.plugin_pointer.contents.deactivate(self.plugin_pointer)
            finally:
                self.offline_render_active = False
        self.offline_render_session_id = ""
        self.offline_render_sample_rate = 0.0
        self.offline_render_max_frames = 0
        self.offline_render_last_touch = 0.0

    def touch_offline_render_session(self) -> None:
        if self.offline_render_session_id:
            self.offline_render_last_touch = time.monotonic()

    def expire_offline_render_if_idle(self) -> bool:
        if not self.offline_render_session_id:
            return False
        last_touch = float(getattr(self, "offline_render_last_touch", 0.0) or 0.0)
        if last_touch <= 0.0:
            self.touch_offline_render_session()
            return False
        idle_seconds = time.monotonic() - last_touch
        if idle_seconds <= CLAP_RENDER_SESSION_IDLE_TIMEOUT_SECONDS:
            return False
        self._stop_offline_render_locked()
        return True

    @staticmethod
    def _build_planar_audio_buffers(
        arrays: list[Any],
        channel_counts: list[int],
    ) -> Any:
        # Same buffer-building shape as the offline process() path (see the
        # nested build_audio_buffers closure there), duplicated rather than
        # shared since that one is a local closure built fresh per request;
        # this one is built once at live-start and reused every callback.
        buffers: list[ClapAudioBuffer] = []
        channel_offset = 0
        for channel_count in channel_counts:
            if channel_count > 0:
                port_arrays = arrays[channel_offset:channel_offset + channel_count]
                channel_pointers = (ctypes.POINTER(ctypes.c_float) * channel_count)(
                    *[ctypes.cast(array, ctypes.POINTER(ctypes.c_float)) for array in port_arrays]
                )
                channel_offset += channel_count
                data32 = channel_pointers
            else:
                data32 = None
            buffers.append(ClapAudioBuffer(data32, None, int(channel_count), 0, 0))
        if not buffers:
            return None
        return (ClapAudioBuffer * len(buffers))(*buffers)

    @locked_clap_instance_method
    def start_live_audio(self, sample_rate: float, block_size: int) -> dict[str, Any]:
        if not HAVE_SOUNDDEVICE:
            raise RuntimeError("sounddevice is not installed on this host -- live audio is unavailable")
        if self.live_stream is not None:
            raise RuntimeError("live audio is already active for this instance")
        if self.offline_render_session_id:
            raise RuntimeError("instance has an active offline render session")
        if self.safety_latched:
            raise RuntimeError("instance safety latch is active")
        if not math.isfinite(sample_rate) or sample_rate <= 0:
            raise RuntimeError("sampleRate must be positive and finite")
        if block_size < CLAP_LIVE_MIN_BLOCK_FRAMES or block_size > CLAP_LIVE_MAX_BLOCK_FRAMES:
            raise RuntimeError(
                f"blockSize must be in {CLAP_LIVE_MIN_BLOCK_FRAMES}..{CLAP_LIVE_MAX_BLOCK_FRAMES}"
            )

        input_ports = self.audio_ports(True)
        output_ports = self.audio_ports(False)
        input_channel_counts = [max(0, int(port.get("channelCount", 0) or 0)) for port in input_ports]
        output_channel_counts = [max(0, int(port.get("channelCount", 0) or 0)) for port in output_ports]
        total_input_channels = sum(input_channel_counts)
        total_output_channels = sum(output_channel_counts)
        if total_output_channels <= 0:
            raise RuntimeError("plugin has no audio output channels")

        activated = False
        started = False
        try:
            activated = bool(
                self.plugin_pointer.contents.activate(
                    self.plugin_pointer, float(sample_rate), 1, int(block_size),
                )
            )
            if not activated:
                raise RuntimeError("plugin.activate returned false")
            started = bool(self.plugin_pointer.contents.start_processing(self.plugin_pointer))
            if not started:
                raise RuntimeError("plugin.start_processing returned false")

            # Pre-allocated once here, never again -- the audio callback
            # only ever writes into these same buffers.
            self.live_input_arrays = [(ctypes.c_float * block_size)() for _ in range(total_input_channels)]
            self.live_output_arrays = [(ctypes.c_float * block_size)() for _ in range(total_output_channels)]
            self.live_input_buffer_array = self._build_planar_audio_buffers(
                self.live_input_arrays, input_channel_counts,
            )
            self.live_output_buffer_array = self._build_planar_audio_buffers(
                self.live_output_arrays, output_channel_counts,
            )
            self.live_input_port_count = len(input_channel_counts)
            self.live_output_port_count = len(output_channel_counts)
            self.live_total_output_channels = total_output_channels
            self.live_empty_inputs = EmptyInputEvents()
            self.live_ignored_outputs = IgnoredOutputEvents()
            self.live_sample_rate = float(sample_rate)
            self.live_block_size = int(block_size)
            self.live_pending_events = collections.deque()
            self.live_peak = 0.0
            self.live_frame_count = 0
            self.live_xrun_count = 0
            self.live_dropped_callback_count = 0
            self.live_error = ""

            stream = _sounddevice.RawOutputStream(
                samplerate=sample_rate,
                blocksize=block_size,
                channels=total_output_channels,
                dtype="float32",
                callback=self._live_audio_callback,
            )
            stream.start()
            self.live_stream = stream
        except Exception:
            if started:
                try:
                    self.plugin_pointer.contents.stop_processing(self.plugin_pointer)
                except Exception:
                    pass
            if activated:
                try:
                    self.plugin_pointer.contents.deactivate(self.plugin_pointer)
                except Exception:
                    pass
            self.live_stream = None
            raise
        return self.live_status_locked()

    def _live_audio_callback(self, outdata: Any, frames: int, _time_info: Any, status: Any) -> None:
        # Runs on PortAudio's own real-time thread, not the HTTP server's.
        # Must never block for long or allocate -- lock.acquire is
        # non-blocking so a contended lock (e.g. a concurrent stop/close)
        # just drops one callback's audio to silence instead of stalling
        # the audio thread.
        if status:
            self.live_xrun_count += 1
        acquired = self.lock.acquire(blocking=False)
        if not acquired:
            self.live_dropped_callback_count += 1
            outdata[:] = b"\x00" * len(outdata)
            return
        try:
            if self.live_stream is None:
                outdata[:] = b"\x00" * len(outdata)
                return
            pending = []
            while self.live_pending_events:
                pending.append(self.live_pending_events.popleft())
            input_events = MixedInputEvents(pending) if pending else self.live_empty_inputs

            # No live graph feed yet (Architecture A) -- the plugin always
            # sees silence on its audio inputs; note/param events are how
            # the browser controls it.
            for array in self.live_input_arrays:
                ctypes.memset(array, 0, ctypes.sizeof(array))

            process = ClapProcess(
                0,
                int(frames),
                None,
                self.live_input_buffer_array,
                self.live_output_buffer_array,
                int(self.live_input_port_count),
                int(self.live_output_port_count),
                ctypes.cast(ctypes.byref(input_events.events), ctypes.c_void_p),
                ctypes.cast(ctypes.byref(self.live_ignored_outputs.events), ctypes.c_void_p),
            )
            status_code = int(self.plugin_pointer.contents.process(self.plugin_pointer, ctypes.byref(process)))
            if status_code == CLAP_PROCESS_ERROR:
                self.live_error = "plugin.process returned CLAP_PROCESS_ERROR"
                outdata[:] = b"\x00" * len(outdata)
                return

            channels = self.live_total_output_channels
            peak = 0.0
            finite = True
            for array in self.live_output_arrays:
                for index in range(frames):
                    value = array[index]
                    if value != value or value in (float("inf"), float("-inf")):
                        finite = False
                        break
                    magnitude = value if value >= 0 else -value
                    if magnitude > peak:
                        peak = magnitude
                if not finite:
                    break
            if not finite or peak > CLAP_SAFETY_PEAK_LIMIT:
                self.safety_latched = True
                self.safety_reason = "non-finite or excessive live output"
                self.live_error = self.safety_reason
                outdata[:] = b"\x00" * len(outdata)
                return

            self.live_peak = peak
            self.live_frame_count += frames
            # Planar (per-channel) source -> interleaved destination buffer.
            # A pure-Python interleave loop, not vectorized -- acceptable
            # for this first live-audio proof; worth revisiting with
            # numpy/memoryview tricks if CPU usage becomes a problem at
            # smaller block sizes.
            out_view = (ctypes.c_float * (frames * channels)).from_buffer(outdata)
            for channel_index, array in enumerate(self.live_output_arrays):
                for frame_index in range(frames):
                    out_view[frame_index * channels + channel_index] = array[frame_index]
        except Exception as error:  # noqa: BLE001 -- audio thread must never raise
            self.live_error = str(error)
            try:
                outdata[:] = b"\x00" * len(outdata)
            except Exception:
                pass
        finally:
            self.lock.release()

    def _stop_live_audio_locked(self) -> None:
        stream = self.live_stream
        self.live_stream = None
        if stream is not None:
            try:
                stream.stop()
                stream.close()
            except Exception:
                pass
        if getattr(self, "live_block_size", 0):
            try:
                self.plugin_pointer.contents.stop_processing(self.plugin_pointer)
            except Exception:
                pass
            try:
                self.plugin_pointer.contents.deactivate(self.plugin_pointer)
            except Exception:
                pass
        self.live_block_size = 0
        self.live_sample_rate = 0.0

    @locked_clap_instance_method
    def stop_live_audio(self) -> dict[str, Any]:
        was_live = self.live_stream is not None
        self._stop_live_audio_locked()
        return {"ok": True, "instanceId": self.instance_id, "stopped": was_live}

    @locked_clap_instance_method
    def queue_live_note(self, is_note_on: bool, key: int, velocity: float, channel: int = 0) -> dict[str, Any]:
        if self.live_stream is None:
            raise RuntimeError("live audio is not active for this instance")
        self.live_pending_events.append(make_live_note_event(is_note_on, key, velocity, channel))
        return {"ok": True, "instanceId": self.instance_id, "queued": True}

    def live_status_locked(self) -> dict[str, Any]:
        return {
            "ok": True,
            "instanceId": self.instance_id,
            "active": self.live_stream is not None,
            "sampleRate": self.live_sample_rate,
            "blockSize": self.live_block_size,
            "outputChannels": self.live_total_output_channels,
            "peak": self.live_peak,
            "frameCount": self.live_frame_count,
            "xrunCount": self.live_xrun_count,
            "droppedCallbackCount": self.live_dropped_callback_count,
            "safetyLatched": bool(self.safety_latched),
            "error": self.live_error,
        }

    @locked_clap_instance_method
    def live_status(self) -> dict[str, Any]:
        return self.live_status_locked()

    @locked_clap_instance_method
    def begin_offline_render(self, sample_rate: float, max_block_frames: int) -> dict[str, Any]:
        self.expire_offline_render_if_idle()
        if not math.isfinite(sample_rate) or sample_rate <= 0:
            raise RuntimeError("sampleRate must be positive and finite")
        if max_block_frames <= 0 or max_block_frames > CLAP_MAX_PROCESS_FRAMES:
            raise RuntimeError(f"maxBlockFrames must be in 1..{CLAP_MAX_PROCESS_FRAMES}")
        if self.safety_latched:
            raise RuntimeError("instance safety latch is active")
        if self.offline_render_session_id:
            raise RuntimeError("instance already has an active render session")
        session_id = f"{self.instance_id}-render-{next(RENDER_SESSION_ID_COUNTER)}"
        activated = False
        started = False
        try:
            activated = bool(
                self.plugin_pointer.contents.activate(
                    self.plugin_pointer,
                    float(sample_rate),
                    1,
                    int(max_block_frames),
                )
            )
            if not activated:
                raise RuntimeError("plugin.activate returned false")
            self.offline_render_active = True
            started = bool(self.plugin_pointer.contents.start_processing(self.plugin_pointer))
            if not started:
                raise RuntimeError("plugin.start_processing returned false")
            self.offline_render_processing = True
            self.offline_render_session_id = session_id
            self.offline_render_sample_rate = float(sample_rate)
            self.offline_render_max_frames = int(max_block_frames)
            self.touch_offline_render_session()
            return {
                "ok": True,
                "instanceId": self.instance_id,
                "renderSessionId": session_id,
                "sampleRate": float(sample_rate),
                "maxBlockFrames": int(max_block_frames),
            }
        except Exception:
            if started or self.offline_render_processing:
                try:
                    self.plugin_pointer.contents.stop_processing(self.plugin_pointer)
                except Exception:
                    pass
            if activated or self.offline_render_active:
                try:
                    self.plugin_pointer.contents.deactivate(self.plugin_pointer)
                except Exception:
                    pass
            self.offline_render_processing = False
            self.offline_render_active = False
            self.offline_render_session_id = ""
            self.offline_render_sample_rate = 0.0
            self.offline_render_max_frames = 0
            raise

    @locked_clap_instance_method
    def end_offline_render(self, session_id: str = "") -> dict[str, Any]:
        self.expire_offline_render_if_idle()
        active_session = str(getattr(self, "offline_render_session_id", ""))
        if not active_session:
            return {
                "ok": True,
                "instanceId": self.instance_id,
                "renderSessionId": "",
                "ended": False,
            }
        if session_id and session_id != active_session:
            raise RuntimeError("renderSessionId does not match active render session")
        self._stop_offline_render_locked()
        return {
            "ok": True,
            "instanceId": self.instance_id,
            "renderSessionId": active_session,
            "ended": True,
        }

    def params_extension(self) -> ClapPluginParams | None:
        pointer = self.plugin_pointer.contents.get_extension(
            self.plugin_pointer,
            CLAP_EXT_PARAMS.encode("utf-8"),
        )
        if not pointer:
            return None
        return ctypes.cast(pointer, ctypes.POINTER(ClapPluginParams)).contents

    def audio_ports_extension(self) -> ClapPluginAudioPorts | None:
        pointer = self.plugin_pointer.contents.get_extension(
            self.plugin_pointer,
            CLAP_EXT_AUDIO_PORTS.encode("utf-8"),
        )
        if not pointer:
            return None
        return ctypes.cast(pointer, ctypes.POINTER(ClapPluginAudioPorts)).contents

    @locked_clap_instance_method
    def audio_ports(self, is_input: bool) -> list[dict[str, Any]]:
        audio_ports = self.audio_ports_extension()
        if audio_ports is None:
            return []
        count = int(audio_ports.count(self.plugin_pointer, bool(is_input)))
        ports: list[dict[str, Any]] = []
        for index in range(count):
            info = ClapAudioPortInfo()
            if not audio_ports.get(self.plugin_pointer, index, bool(is_input), ctypes.byref(info)):
                continue
            ports.append(
                {
                    "id": int(info.id),
                    "index": index,
                    "name": safe_cstr(info.name),
                    "flags": int(info.flags),
                    "channelCount": int(info.channel_count),
                    "portType": safe_cstr(info.port_type),
                    "inPlacePair": int(info.in_place_pair),
                }
            )
        return ports

    @locked_clap_instance_method
    def parameters(self) -> dict[str, Any]:
        params = self.params_extension()
        if params is None:
            return {
                "ok": True,
                "instanceId": self.instance_id,
                "parameters": [],
                "count": 0,
                "supported": False,
            }
        count = int(params.count(self.plugin_pointer))
        parameters: list[dict[str, Any]] = []
        for index in range(count):
            info = ClapParamInfo()
            if not params.get_info(self.plugin_pointer, index, ctypes.byref(info)):
                continue
            current_value = ctypes.c_double(float("nan"))
            has_value = bool(params.get_value(self.plugin_pointer, info.id, ctypes.byref(current_value)))
            display_value = ""
            text_buffer = ctypes.create_string_buffer(256)
            value_for_text = current_value.value if has_value else info.default_value
            if params.value_to_text(
                self.plugin_pointer,
                info.id,
                value_for_text,
                text_buffer,
                ctypes.sizeof(text_buffer),
            ):
                display_value = safe_cstr(text_buffer)
            parameters.append(
                {
                    "id": int(info.id),
                    "index": index,
                    "name": safe_cstr(info.name),
                    "module": safe_cstr(info.module),
                    "min": float(info.min_value),
                    "max": float(info.max_value),
                    "default": float(info.default_value),
                    "current": float(current_value.value) if has_value else None,
                    "display": display_value,
                    "flags": int(info.flags),
                    "flagNames": clap_param_flags(int(info.flags)),
                }
            )
        return {
            "ok": True,
            "instanceId": self.instance_id,
            "parameters": parameters,
            "count": len(parameters),
            "supported": True,
        }

    def parameter_info_by_id(self, param_id: int) -> tuple[ClapPluginParams, ClapParamInfo]:
        params = self.params_extension()
        if params is None:
            raise RuntimeError("plugin does not support clap.params")
        count = int(params.count(self.plugin_pointer))
        for index in range(count):
            info = ClapParamInfo()
            if not params.get_info(self.plugin_pointer, index, ctypes.byref(info)):
                continue
            if int(info.id) == int(param_id):
                return params, info
        raise RuntimeError(f"unknown parameter id {param_id}")

    def prepare_parameter_event(self, param_id: int, value: float) -> tuple[ClapPluginParams, ClapParamInfo, dict[str, Any]]:
        if not math.isfinite(value):
            raise RuntimeError("parameter value must be finite")
        params, info = self.parameter_info_by_id(param_id)
        if value < info.min_value or value > info.max_value:
            raise RuntimeError(
                f"parameter value {value} outside range {info.min_value}..{info.max_value}"
            )
        return params, info, {
            "cookie": info.cookie,
            "paramId": int(param_id),
            "value": float(value),
        }

    def assert_direct_parameter_write_allowed(self, allow_during_render: bool = False) -> None:
        self.expire_offline_render_if_idle()
        if allow_during_render:
            return
        if self.offline_render_session_id:
            raise RuntimeError("direct parameter writes are blocked during an active render session")

    def flush_parameter_events(self, params: ClapPluginParams, parameter_events: list[dict[str, Any]]) -> None:
        if not parameter_events:
            return
        input_events = (
            SingleParamInputEvents(
                parameter_events[0]["paramId"],
                parameter_events[0]["value"],
                parameter_events[0].get("cookie"),
            )
            if len(parameter_events) == 1
            else MultiParamInputEvents(parameter_events)
        )
        output_events = IgnoredOutputEvents()
        params.flush(
            self.plugin_pointer,
            ctypes.byref(input_events.events),
            ctypes.byref(output_events.events),
        )

    def parameter_result(self, param_id: int, requested_value: float, info: ClapParamInfo, params: ClapPluginParams) -> dict[str, Any]:
        current_value = ctypes.c_double(float("nan"))
        has_value = bool(params.get_value(self.plugin_pointer, info.id, ctypes.byref(current_value)))
        return {
            "ok": True,
            "instanceId": self.instance_id,
            "paramId": int(param_id),
            "requestedValue": float(requested_value),
            "current": float(current_value.value) if has_value else None,
        }

    @locked_clap_instance_method
    def set_parameter(self, param_id: int, value: float) -> dict[str, Any]:
        self.assert_direct_parameter_write_allowed()
        params, info, event = self.prepare_parameter_event(param_id, value)
        self.flush_parameter_events(params, [event])
        return self.parameter_result(param_id, value, info, params)

    @locked_clap_instance_method
    def set_parameters(self, parameters: Any, allow_during_render: bool = False) -> dict[str, Any]:
        if not isinstance(parameters, list):
            raise RuntimeError("parameters must be an array")
        self.assert_direct_parameter_write_allowed(allow_during_render)
        prepared: list[tuple[ClapPluginParams, ClapParamInfo, dict[str, Any]]] = []
        for entry in parameters:
            if not isinstance(entry, dict):
                raise RuntimeError("parameter entries must be objects")
            prepared.append(
                self.prepare_parameter_event(
                    int(entry.get("paramId")),
                    float(entry.get("value")),
                ),
            )
        if prepared:
            params = prepared[0][0]
            self.flush_parameter_events(params, [event for _params, _info, event in prepared])
            results = [
                self.parameter_result(event["paramId"], event["value"], info, params)
                for _params, info, event in prepared
            ]
        else:
            results = []
        return {
            "ok": True,
            "instanceId": self.instance_id,
            "count": len(results),
            "parameters": results,
        }

    @locked_clap_instance_method
    def process_offline_probe(
        self,
        sample_rate: float = 48000.0,
        frames: int = 256,
        amplitude: float = 0.125,
        input_audio: Any = None,
        input_audio_format: str = PLANAR_F32_JSON,
        parameter_updates: Any = None,
        return_audio: bool = False,
        return_audio_format: str = PLANAR_F32_JSON,
        render_session_id: str = "",
    ) -> dict[str, Any]:
        if frames <= 0 or frames > CLAP_MAX_PROCESS_FRAMES:
            raise RuntimeError(f"frames must be in 1..{CLAP_MAX_PROCESS_FRAMES}")
        if not math.isfinite(sample_rate) or sample_rate <= 0:
            raise RuntimeError("sampleRate must be positive and finite")
        if not math.isfinite(amplitude) or amplitude < 0 or amplitude > 1:
            raise RuntimeError("amplitude must be in 0..1")
        if input_audio_format not in {PLANAR_F32_JSON, PLANAR_F32_BASE64}:
            raise RuntimeError(f"unsupported inputAudioFormat {input_audio_format}")
        if return_audio_format not in {PLANAR_F32_JSON, PLANAR_F32_BASE64}:
            raise RuntimeError(f"unsupported returnAudioFormat {return_audio_format}")
        self.expire_offline_render_if_idle()
        active_session_id = str(getattr(self, "offline_render_session_id", ""))
        use_render_session = bool(render_session_id)
        if use_render_session:
            if render_session_id != active_session_id:
                raise RuntimeError("renderSessionId does not match active render session")
            if not self.offline_render_active or not self.offline_render_processing:
                raise RuntimeError("render session is not processing")
            if abs(float(sample_rate) - float(self.offline_render_sample_rate)) > 0.001:
                raise RuntimeError("sampleRate does not match active render session")
            if frames > int(self.offline_render_max_frames):
                raise RuntimeError("frames exceed active render session maxBlockFrames")
        elif active_session_id:
            raise RuntimeError("instance already has an active render session")

        parameter_result = None
        if parameter_updates is not None:
            parameter_result = self.set_parameters(parameter_updates, allow_during_render=use_render_session)
        latency_state = self.latency_state()
        tail_state = self.tail_state()

        input_ports = self.audio_ports(True)
        output_ports = self.audio_ports(False)
        input_port_channel_counts = [
            max(0, int(port.get("channelCount", 0) or 0))
            for port in input_ports
        ]
        output_port_channel_counts = [
            max(0, int(port.get("channelCount", 0) or 0))
            for port in output_ports
        ]
        total_input_channels = sum(input_port_channel_counts)
        total_output_channels = sum(output_port_channel_counts)
        audio_input_port_count = len(input_port_channel_counts)
        audio_output_port_count = len(output_port_channel_counts)
        if total_output_channels <= 0:
            raise RuntimeError("plugin has no audio output channels")

        input_arrays = [
            (ctypes.c_float * frames)() for _channel in range(total_input_channels)
        ]
        output_arrays = [
            (ctypes.c_float * frames)() for _channel in range(total_output_channels)
        ]
        sample_count = total_output_channels * frames
        if self.safety_latched:
            return self.process_muted_result(
                sample_rate,
                frames,
                total_input_channels,
                total_output_channels,
                audio_input_port_count,
                audio_output_port_count,
                return_audio,
                return_audio_format,
                CLAP_PROCESS_ERROR,
                parameter_result,
                render_session_id,
                latency_state,
                tail_state,
            )
        if input_audio is not None:
            if input_audio_format == PLANAR_F32_BASE64:
                input_audio = decode_planar_f32_base64_channels(input_audio, frames)
            elif not isinstance(input_audio, list):
                raise RuntimeError("inputAudio must be an array of channel arrays")
            for channel in range(min(total_input_channels, len(input_audio))):
                source_channel = input_audio[channel]
                if not isinstance(source_channel, list):
                    raise RuntimeError("inputAudio channels must be arrays")
                for frame in range(min(frames, len(source_channel))):
                    value = float(source_channel[frame])
                    input_arrays[channel][frame] = value if math.isfinite(value) else 0.0
        else:
            for frame in range(frames):
                sample = float(amplitude) if frame == 0 else 0.0
                for channel in range(total_input_channels):
                    input_arrays[channel][frame] = sample

        def build_audio_buffers(
            arrays: list[Any],
            channel_counts: list[int],
        ) -> tuple[Any, list[ClapAudioBuffer], list[Any]]:
            buffers: list[ClapAudioBuffer] = []
            pointer_arrays: list[Any] = []
            channel_offset = 0
            for channel_count in channel_counts:
                if channel_count > 0:
                    port_arrays = arrays[channel_offset:channel_offset + channel_count]
                    channel_pointers = (ctypes.POINTER(ctypes.c_float) * channel_count)(
                        *[
                            ctypes.cast(array, ctypes.POINTER(ctypes.c_float))
                            for array in port_arrays
                        ]
                    )
                    channel_offset += channel_count
                    pointer_arrays.append(channel_pointers)
                    data32 = channel_pointers
                else:
                    data32 = None
                buffers.append(ClapAudioBuffer(data32, None, int(channel_count), 0, 0))
            if not buffers:
                return None, buffers, pointer_arrays
            return (ClapAudioBuffer * len(buffers))(*buffers), buffers, pointer_arrays

        input_buffer_array, _input_buffers, _input_pointer_arrays = build_audio_buffers(
            input_arrays,
            input_port_channel_counts,
        )
        output_buffer_array, _output_buffers, _output_pointer_arrays = build_audio_buffers(
            output_arrays,
            output_port_channel_counts,
        )
        empty_inputs = EmptyInputEvents()
        ignored_outputs = IgnoredOutputEvents()
        process = ClapProcess(
            0,
            int(frames),
            None,
            input_buffer_array,
            output_buffer_array,
            int(audio_input_port_count),
            int(audio_output_port_count),
            ctypes.cast(ctypes.byref(empty_inputs.events), ctypes.c_void_p),
            ctypes.cast(ctypes.byref(ignored_outputs.events), ctypes.c_void_p),
        )

        activated = False
        started = False
        status = CLAP_PROCESS_ERROR
        if use_render_session:
            self.touch_offline_render_session()
            status = int(self.plugin_pointer.contents.process(self.plugin_pointer, ctypes.byref(process)))
            self.touch_offline_render_session()
        else:
            try:
                activated = bool(
                    self.plugin_pointer.contents.activate(
                        self.plugin_pointer,
                        float(sample_rate),
                        int(frames),
                        int(frames),
                    )
                )
                if not activated:
                    raise RuntimeError("plugin.activate returned false")
                started = bool(self.plugin_pointer.contents.start_processing(self.plugin_pointer))
                if not started:
                    raise RuntimeError("plugin.start_processing returned false")
                status = int(self.plugin_pointer.contents.process(self.plugin_pointer, ctypes.byref(process)))
            finally:
                if started:
                    self.plugin_pointer.contents.stop_processing(self.plugin_pointer)
                if activated:
                    self.plugin_pointer.contents.deactivate(self.plugin_pointer)

        if status == CLAP_PROCESS_ERROR:
            if use_render_session:
                self._stop_offline_render_locked()
            raise RuntimeError("plugin.process returned CLAP_PROCESS_ERROR")

        peak = 0.0
        raw_peak = 0.0
        sum_squares = 0.0
        finite = True
        safety_reason = ""
        returned_audio: list[list[float]] = []
        for channel in range(total_output_channels):
            returned_channel: list[float] = []
            for frame in range(frames):
                raw_value = float(output_arrays[channel][frame])
                if not math.isfinite(raw_value):
                    finite = False
                    safety_reason = safety_reason or "non-finite plugin output"
                    value = 0.0
                else:
                    raw_peak = max(raw_peak, abs(raw_value))
                    if abs(raw_value) > CLAP_SAFETY_PEAK_LIMIT and not safety_reason:
                        safety_reason = f"raw output peak exceeded {CLAP_SAFETY_PEAK_LIMIT}"
                    value = raw_value
                value = max(-1.0, min(1.0, value))
                peak = max(peak, abs(value))
                sum_squares += value * value
                if return_audio:
                    returned_channel.append(value)
            if return_audio:
                returned_audio.append(returned_channel)
        if safety_reason:
            self.trip_safety_latch(safety_reason, raw_peak)
            if use_render_session:
                self._stop_offline_render_locked()
            peak = 0.0
            sum_squares = 0.0
            if return_audio:
                returned_audio = [
                    [0.0 for _frame in range(frames)]
                    for _channel in range(total_output_channels)
                ]
        rms = math.sqrt(sum_squares / max(1, sample_count))
        result = {
            "ok": True,
            "instanceId": self.instance_id,
            "sampleRate": float(sample_rate),
            "frames": int(frames),
            "inputChannels": int(total_input_channels),
            "outputChannels": int(total_output_channels),
            "audioInputPortCount": int(audio_input_port_count),
            "audioOutputPortCount": int(audio_output_port_count),
            "processStatus": status,
            "finite": finite,
            "peak": peak,
            "rms": rms,
            "audioReturned": bool(return_audio),
            "rawPeak": raw_peak,
            "latency": latency_state,
            "tail": tail_state,
            "safety": self.safety_state(),
            "safetyMuted": bool(self.safety_latched),
        }
        if render_session_id:
            result["renderSessionId"] = render_session_id
        if parameter_result is not None:
            result["processParameters"] = parameter_result
        if return_audio:
            result["audioFormat"] = return_audio_format
            if return_audio_format == PLANAR_F32_BASE64:
                result["audio"] = [
                    encode_planar_f32_base64_channel(channel)
                    for channel in returned_audio
                ]
            else:
                result["audio"] = returned_audio
        return result

    @locked_clap_instance_method
    def process_muted_result(
        self,
        sample_rate: float,
        frames: int,
        input_channels: int,
        output_channels: int,
        audio_input_port_count: int,
        audio_output_port_count: int,
        return_audio: bool,
        return_audio_format: str,
        status: int,
        parameter_result: dict[str, Any] | None = None,
        render_session_id: str = "",
        latency_state: dict[str, Any] | None = None,
        tail_state: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        returned_audio = [
            [0.0 for _frame in range(frames)]
            for _channel in range(output_channels)
        ]
        result = {
            "ok": True,
            "instanceId": self.instance_id,
            "sampleRate": float(sample_rate),
            "frames": int(frames),
            "inputChannels": int(input_channels),
            "outputChannels": int(output_channels),
            "audioInputPortCount": int(audio_input_port_count),
            "audioOutputPortCount": int(audio_output_port_count),
            "processStatus": status,
            "finite": True,
            "peak": 0.0,
            "rms": 0.0,
            "audioReturned": bool(return_audio),
            "rawPeak": 0.0,
            "latency": latency_state or self.latency_state(),
            "tail": tail_state or self.tail_state(),
            "safety": self.safety_state(),
            "safetyMuted": True,
        }
        if render_session_id:
            result["renderSessionId"] = render_session_id
        if parameter_result is not None:
            result["processParameters"] = parameter_result
        if return_audio:
            result["audioFormat"] = return_audio_format
            if return_audio_format == PLANAR_F32_BASE64:
                result["audio"] = [
                    encode_planar_f32_base64_channel(channel)
                    for channel in returned_audio
                ]
            else:
                result["audio"] = returned_audio
        return result

    @locked_clap_instance_method
    def close(self) -> None:
        self._close_editor_locked()
        self._stop_live_audio_locked()
        self._stop_offline_render_locked()
        if getattr(self, "plugin_pointer", None):
            try:
                self.plugin_pointer.contents.destroy(self.plugin_pointer)
            except Exception:
                pass
            self.plugin_pointer = None
        if getattr(self, "entry_initialized", False):
            try:
                self.entry.deinit()
            except Exception:
                pass
            self.entry_initialized = False


def create_clap_instance(server: ThreadingHTTPServer, plugin_path: Path, clap_id: str) -> dict[str, Any]:
    if not clap_id:
        raise RuntimeError("clapId is required")
    instance_id = f"clap-{next(INSTANCE_ID_COUNTER)}"
    instance = PersistentClapInstance(instance_id, plugin_path, clap_id)
    with server_clap_instances_lock(server):
        server.clap_instances[instance_id] = instance
    return {"ok": True, "instance": instance.summary()}


def process_clap_batch(server: ThreadingHTTPServer, payload: dict[str, Any]) -> dict[str, Any]:
    items = payload.get("items")
    if not isinstance(items, list):
        raise RuntimeError("items must be an array")
    if len(items) > CLAP_MAX_PROCESS_BATCH_ITEMS:
        raise RuntimeError(f"items must contain no more than {CLAP_MAX_PROCESS_BATCH_ITEMS} entries")
    results: list[dict[str, Any]] = []
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            results.append({"ok": False, "index": index, "error": "batch item must be an object"})
            continue
        instance_id = str(item.get("instanceId") or "")
        with server_clap_instances_lock(server):
            instance = server.clap_instances.get(instance_id)
        if not instance:
            results.append(
                {
                    "ok": False,
                    "index": index,
                    "instanceId": instance_id,
                    "error": "unknown instance",
                }
            )
            continue
        try:
            result = instance.process_offline_probe(
                sample_rate=float(item.get("sampleRate") or payload.get("sampleRate") or 48000.0),
                frames=int(item.get("frames") or payload.get("frames") or 256),
                amplitude=float(item.get("amplitude") if "amplitude" in item else payload.get("amplitude", 0.125)),
                input_audio=item.get("inputAudio"),
                input_audio_format=str(item.get("inputAudioFormat") or payload.get("inputAudioFormat") or PLANAR_F32_JSON),
                parameter_updates=item.get("parameters") if "parameters" in item else None,
                return_audio=bool(item.get("returnAudio")),
                return_audio_format=str(item.get("returnAudioFormat") or payload.get("returnAudioFormat") or PLANAR_F32_JSON),
                render_session_id=str(item.get("renderSessionId") or payload.get("renderSessionId") or ""),
            )
            result["index"] = index
            results.append(result)
        except Exception as error:
            results.append(
                {
                    "ok": False,
                    "index": index,
                    "instanceId": instance_id,
                    "error": str(error),
                }
            )
    return {
        "ok": True,
        "count": len(results),
        "items": results,
    }


def server_clap_instances_lock(server: ThreadingHTTPServer) -> threading.RLock:
    lock = getattr(server, "clap_instances_lock", None)
    if lock is None:
        lock = threading.RLock()
        server.clap_instances_lock = lock
    return lock


def close_clap_instances(server: ThreadingHTTPServer) -> None:
    with server_clap_instances_lock(server):
        instances = list(getattr(server, "clap_instances", {}).values())
        server.clap_instances.clear()
    for instance in instances:
        instance.close()


def probe_clap_metadata(plugin_path: Path, test_instantiate: bool = False) -> dict[str, Any]:
    import ctypes

    class ClapVersion(ctypes.Structure):
        _fields_ = [
            ("major", ctypes.c_uint32),
            ("minor", ctypes.c_uint32),
            ("revision", ctypes.c_uint32),
        ]

    class ClapPluginDescriptor(ctypes.Structure):
        _fields_ = [
            ("clap_version", ClapVersion),
            ("id", ctypes.c_char_p),
            ("name", ctypes.c_char_p),
            ("vendor", ctypes.c_char_p),
            ("url", ctypes.c_char_p),
            ("manual_url", ctypes.c_char_p),
            ("support_url", ctypes.c_char_p),
            ("version", ctypes.c_char_p),
            ("description", ctypes.c_char_p),
            ("features", ctypes.POINTER(ctypes.c_char_p)),
        ]

    plugin_callback = ctypes.CFUNCTYPE(ctypes.c_bool, ctypes.c_void_p)
    plugin_destroy_callback = ctypes.CFUNCTYPE(None, ctypes.c_void_p)
    plugin_activate_callback = ctypes.CFUNCTYPE(
        ctypes.c_bool,
        ctypes.c_void_p,
        ctypes.c_double,
        ctypes.c_uint32,
        ctypes.c_uint32,
    )
    plugin_deactivate_callback = ctypes.CFUNCTYPE(None, ctypes.c_void_p)
    plugin_process_callback = ctypes.CFUNCTYPE(ctypes.c_int32, ctypes.c_void_p, ctypes.c_void_p)
    plugin_get_extension_callback = ctypes.CFUNCTYPE(
        ctypes.c_void_p,
        ctypes.c_void_p,
        ctypes.c_char_p,
    )
    plugin_on_main_thread_callback = ctypes.CFUNCTYPE(None, ctypes.c_void_p)

    class ClapPlugin(ctypes.Structure):
        _fields_ = [
            ("desc", ctypes.POINTER(ClapPluginDescriptor)),
            ("plugin_data", ctypes.c_void_p),
            ("init", plugin_callback),
            ("destroy", plugin_destroy_callback),
            ("activate", plugin_activate_callback),
            ("deactivate", plugin_deactivate_callback),
            ("start_processing", plugin_callback),
            ("stop_processing", plugin_deactivate_callback),
            ("reset", plugin_deactivate_callback),
            ("process", plugin_process_callback),
            ("get_extension", plugin_get_extension_callback),
            ("on_main_thread", plugin_on_main_thread_callback),
        ]

    host_get_extension_callback = ctypes.CFUNCTYPE(ctypes.c_void_p, ctypes.c_void_p, ctypes.c_char_p)
    host_void_callback = ctypes.CFUNCTYPE(None, ctypes.c_void_p)

    class ClapHost(ctypes.Structure):
        _fields_ = [
            ("clap_version", ClapVersion),
            ("host_data", ctypes.c_void_p),
            ("name", ctypes.c_char_p),
            ("vendor", ctypes.c_char_p),
            ("url", ctypes.c_char_p),
            ("version", ctypes.c_char_p),
            ("get_extension", host_get_extension_callback),
            ("request_restart", host_void_callback),
            ("request_process", host_void_callback),
            ("request_callback", host_void_callback),
        ]

    init_callback = ctypes.CFUNCTYPE(ctypes.c_bool, ctypes.c_char_p)
    deinit_callback = ctypes.CFUNCTYPE(None)
    get_factory_callback = ctypes.CFUNCTYPE(ctypes.c_void_p, ctypes.c_char_p)

    class ClapPluginEntry(ctypes.Structure):
        _fields_ = [
            ("clap_version", ClapVersion),
            ("init", init_callback),
            ("deinit", deinit_callback),
            ("get_factory", get_factory_callback),
        ]

    get_count_callback = ctypes.CFUNCTYPE(ctypes.c_uint32, ctypes.c_void_p)
    get_descriptor_callback = ctypes.CFUNCTYPE(
        ctypes.POINTER(ClapPluginDescriptor),
        ctypes.c_void_p,
        ctypes.c_uint32,
    )
    create_plugin_callback = ctypes.CFUNCTYPE(
        ctypes.POINTER(ClapPlugin),
        ctypes.c_void_p,
        ctypes.c_void_p,
        ctypes.c_char_p,
    )

    class ClapPluginFactory(ctypes.Structure):
        _fields_ = [
            ("get_plugin_count", get_count_callback),
            ("get_plugin_descriptor", get_descriptor_callback),
            ("create_plugin", create_plugin_callback),
        ]

    load_path = clap_load_path(plugin_path)
    if load_path is None:
        return {"ok": False, "error": "no loadable .clap binary found"}

    library = ctypes.CDLL(str(load_path))
    entry = ClapPluginEntry.in_dll(library, "clap_entry")
    if entry.clap_version.major < 1:
        return {"ok": False, "error": "incompatible CLAP ABI version"}

    initialized = bool(entry.init(str(plugin_path).encode("utf-8")))
    if not initialized:
        return {"ok": False, "error": "clap_entry.init returned false"}

    @host_get_extension_callback
    def host_get_extension(_host: int, _extension_id: bytes) -> int:
        return 0

    @host_void_callback
    def host_noop(_host: int) -> None:
        return None

    host_name = HOST_NAME.encode("utf-8")
    host_vendor = b"Soundemote"
    host_url = b"https://soundemote.io"
    host_version = HOST_VERSION.encode("utf-8")
    host = ClapHost(
        ClapVersion(1, 2, 8),
        None,
        host_name,
        host_vendor,
        host_url,
        host_version,
        host_get_extension,
        host_noop,
        host_noop,
        host_noop,
    )
    host_pointer = ctypes.cast(ctypes.pointer(host), ctypes.c_void_p)

    try:
        factory_pointer = entry.get_factory(CLAP_PLUGIN_FACTORY_ID.encode("utf-8"))
        if not factory_pointer:
            return {"ok": False, "error": "plugin factory not provided"}
        factory = ctypes.cast(factory_pointer, ctypes.POINTER(ClapPluginFactory)).contents
        count = int(factory.get_plugin_count(factory_pointer))
        descriptors: list[dict[str, Any]] = []
        for index in range(count):
            descriptor_pointer = factory.get_plugin_descriptor(factory_pointer, index)
            if not descriptor_pointer:
                continue
            descriptor = descriptor_pointer.contents
            clap_id = safe_cstr(descriptor.id)
            instantiation_result = {
                "instantiationTested": False,
                "instantiable": False,
                "instantiationError": "",
            }
            if test_instantiate:
                instantiation_result = probe_clap_plugin_instantiation(
                    factory,
                    factory_pointer,
                    host_pointer,
                    clap_id,
                )
            descriptors.append(
                {
                    "clapId": clap_id,
                    "name": safe_cstr(descriptor.name),
                    "vendor": safe_cstr(descriptor.vendor),
                    "url": safe_cstr(descriptor.url),
                    "manualUrl": safe_cstr(descriptor.manual_url),
                    "supportUrl": safe_cstr(descriptor.support_url),
                    "version": safe_cstr(descriptor.version),
                    "description": safe_cstr(descriptor.description),
                    "features": read_null_terminated_features(descriptor.features),
                    **instantiation_result,
                }
            )
        return {
            "ok": True,
            "loadPath": str(load_path.resolve()),
            "pluginCount": len(descriptors),
            "plugins": descriptors,
        }
    finally:
        entry.deinit()


def probe_clap_plugin_instantiation(
    factory: object,
    factory_pointer: int,
    host_pointer: object,
    clap_id: str,
) -> dict[str, Any]:
    result = {
        "instantiationTested": True,
        "instantiable": False,
        "instantiationError": "",
    }
    if not clap_id:
        result["instantiationError"] = "descriptor missing CLAP id"
        return result
    plugin_pointer = None
    try:
        plugin_pointer = factory.create_plugin(
            factory_pointer,
            host_pointer,
            clap_id.encode("utf-8"),
        )
        if not plugin_pointer:
            result["instantiationError"] = "factory.create_plugin returned null"
            return result
        plugin = plugin_pointer.contents
        initialized = bool(plugin.init(plugin_pointer))
        if not initialized:
            result["instantiationError"] = "plugin.init returned false"
            return result
        result["instantiable"] = True
        return result
    except Exception as error:
        result["instantiationError"] = str(error)
        return result
    finally:
        if plugin_pointer:
            try:
                plugin_pointer.contents.destroy(plugin_pointer)
            except Exception:
                pass


class ClapHostRequestHandler(BaseHTTPRequestHandler):
    server_version = f"SoundemoteWebUIClapHost/{HOST_VERSION}"

    def log_message(self, format: str, *args: object) -> None:
        return

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path in ("/", "/health", "/version"):
            self.write_json(
                200,
                host_status_payload(
                    self.server.clap_inspect_metadata,
                    self.server.clap_test_instantiate,
                    host_config_payload(self.server),
                ),
            )
            return
        if path == "/plugins":
            query = parse_qs(urlsplit(self.path).query)
            force_refresh = query.get("refresh", ["0"])[0].lower() in ("1", "true", "yes")
            self.write_json(200, cached_discover_clap_plugins(self.server, force_refresh))
            return
        if path == "/presets":
            self.write_json(200, list_clap_presets(self.server.clap_preset_dir))
            return
        preset_get_id = self.match_preset_route(path)
        if preset_get_id:
            record = read_clap_preset(self.server.clap_preset_dir, preset_get_id)
            if record is None:
                self.write_json(404, {"ok": False, "error": "unknown preset"})
                return
            self.write_json(200, {"ok": True, "id": preset_get_id, **record})
            return
        if path == "/diagnostics":
            bind_host, bind_port = self.server.server_address[:2]
            self.write_json(
                200,
                host_diagnostics_payload(
                    mode="http",
                    bind_host=str(bind_host),
                    bind_port=int(bind_port),
                    scan_dirs=self.server.clap_scan_dirs,
                    explicit_plugins=self.server.clap_explicit_plugins,
                    inspect_metadata=bool(self.server.clap_inspect_metadata),
                    test_instantiate=bool(self.server.clap_test_instantiate),
                ),
            )
            return
        if path == "/instances":
            with server_clap_instances_lock(self.server):
                instances = [
                    instance.summary()
                    for instance in self.server.clap_instances.values()
                ]
            self.write_json(
                200,
                {
                    "ok": True,
                    "instances": instances,
                },
            )
            return
        instance_live = self.match_instance_route(path, "/live")
        if instance_live:
            with server_clap_instances_lock(self.server):
                instance = self.server.clap_instances.get(instance_live)
            if not instance:
                self.write_json(404, {"ok": False, "error": "unknown instance"})
                return
            self.write_json(200, instance.live_status())
            return
        instance_editor = self.match_instance_route(path, "/editor")
        if instance_editor:
            with server_clap_instances_lock(self.server):
                instance = self.server.clap_instances.get(instance_editor)
            if not instance:
                self.write_json(404, {"ok": False, "error": "unknown instance"})
                return
            self.write_json(
                200,
                {
                    "ok": True,
                    "instanceId": instance.instance_id,
                    "editor": instance.editor_status(),
                },
            )
            return
        instance_latency = self.match_instance_route(path, "/latency")
        if instance_latency:
            with server_clap_instances_lock(self.server):
                instance = self.server.clap_instances.get(instance_latency)
            if not instance:
                self.write_json(404, {"ok": False, "error": "unknown instance"})
                return
            self.write_json(
                200,
                {
                    "ok": True,
                    "instanceId": instance.instance_id,
                    "latency": instance.latency_state(),
                },
            )
            return
        instance_tail = self.match_instance_route(path, "/tail")
        if instance_tail:
            with server_clap_instances_lock(self.server):
                instance = self.server.clap_instances.get(instance_tail)
            if not instance:
                self.write_json(404, {"ok": False, "error": "unknown instance"})
                return
            self.write_json(
                200,
                {
                    "ok": True,
                    "instanceId": instance.instance_id,
                    "tail": instance.tail_state(),
                },
            )
            return
        instance_state = self.match_instance_route(path, "/state")
        if instance_state:
            with server_clap_instances_lock(self.server):
                instance = self.server.clap_instances.get(instance_state)
            if not instance:
                self.write_json(404, {"ok": False, "error": "unknown instance"})
                return
            try:
                self.write_json(200, instance.save_state())
            except Exception as error:
                self.write_json(400, {"ok": False, "error": str(error)})
            return
        instance_params = self.match_instance_route(path, "/params")
        if instance_params:
            with server_clap_instances_lock(self.server):
                instance = self.server.clap_instances.get(instance_params)
            if not instance:
                self.write_json(404, {"ok": False, "error": "unknown instance"})
                return
            self.write_json(200, instance.parameters())
            return
        self.write_json(404, {"ok": False, "error": "unknown endpoint"})

    def do_POST(self) -> None:
        path = urlsplit(self.path).path
        if path == "/shutdown":
            close_clap_instances(self.server)
            self.write_json(200, {"ok": True, "status": "shutting down"})
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return
        if path == "/instances":
            try:
                payload = self.read_json_body()
                instance_payload = create_clap_instance(
                    self.server,
                    Path(str(payload.get("path") or "")),
                    str(payload.get("clapId") or ""),
                )
            except Exception as error:
                self.write_json(400, {"ok": False, "error": str(error)})
                return
            self.write_json(201, instance_payload)
            return
        if path == "/presets":
            try:
                payload = self.read_json_body()
                self.write_json(201, write_clap_preset(self.server.clap_preset_dir, payload))
            except Exception as error:
                self.write_json(400, {"ok": False, "error": str(error)})
            return
        if path == "/process-batch":
            try:
                payload = self.read_json_body()
                self.write_json(200, process_clap_batch(self.server, payload))
            except Exception as error:
                self.write_json(400, {"ok": False, "error": str(error)})
            return
        instance_render_begin = self.match_instance_route(path, "/render/begin")
        if instance_render_begin:
            with server_clap_instances_lock(self.server):
                instance = self.server.clap_instances.get(instance_render_begin)
            if not instance:
                self.write_json(404, {"ok": False, "error": "unknown instance"})
                return
            try:
                payload = self.read_json_body()
                self.write_json(
                    200,
                    instance.begin_offline_render(
                        sample_rate=float(payload.get("sampleRate") or 48000.0),
                        max_block_frames=int(payload.get("maxBlockFrames") or CLAP_MAX_PROCESS_FRAMES),
                    ),
                )
            except Exception as error:
                self.write_json(400, {"ok": False, "error": str(error)})
            return
        instance_render_end = self.match_instance_route(path, "/render/end")
        if instance_render_end:
            with server_clap_instances_lock(self.server):
                instance = self.server.clap_instances.get(instance_render_end)
            if not instance:
                self.write_json(404, {"ok": False, "error": "unknown instance"})
                return
            try:
                payload = self.read_json_body()
                self.write_json(200, instance.end_offline_render(str(payload.get("renderSessionId") or "")))
            except Exception as error:
                self.write_json(400, {"ok": False, "error": str(error)})
            return
        instance_live_start = self.match_instance_route(path, "/live/start")
        if instance_live_start:
            with server_clap_instances_lock(self.server):
                instance = self.server.clap_instances.get(instance_live_start)
            if not instance:
                self.write_json(404, {"ok": False, "error": "unknown instance"})
                return
            try:
                payload = self.read_json_body()
                sample_rate = float(payload.get("sampleRate") or 48000.0)
                block_size = int(payload.get("blockSize") or CLAP_LIVE_DEFAULT_BLOCK_FRAMES)
                self.write_json(200, instance.start_live_audio(sample_rate, block_size))
            except Exception as error:
                self.write_json(400, {"ok": False, "error": str(error)})
            return
        instance_live_stop = self.match_instance_route(path, "/live/stop")
        if instance_live_stop:
            with server_clap_instances_lock(self.server):
                instance = self.server.clap_instances.get(instance_live_stop)
            if not instance:
                self.write_json(404, {"ok": False, "error": "unknown instance"})
                return
            try:
                self.write_json(200, instance.stop_live_audio())
            except Exception as error:
                self.write_json(400, {"ok": False, "error": str(error)})
            return
        instance_live_note = self.match_instance_route(path, "/live/note")
        if instance_live_note:
            with server_clap_instances_lock(self.server):
                instance = self.server.clap_instances.get(instance_live_note)
            if not instance:
                self.write_json(404, {"ok": False, "error": "unknown instance"})
                return
            try:
                payload = self.read_json_body()
                self.write_json(
                    200,
                    instance.queue_live_note(
                        bool(payload.get("noteOn")),
                        int(payload.get("key") if payload.get("key") is not None else 60),
                        float(payload.get("velocity") if payload.get("velocity") is not None else 0.8),
                        int(payload.get("channel") or 0),
                    ),
                )
            except Exception as error:
                self.write_json(400, {"ok": False, "error": str(error)})
            return
        instance_editor_open = self.match_instance_route(path, "/editor/open")
        if instance_editor_open:
            with server_clap_instances_lock(self.server):
                instance = self.server.clap_instances.get(instance_editor_open)
            if not instance:
                self.write_json(404, {"ok": False, "error": "unknown instance"})
                return
            try:
                payload = instance.open_editor()
                self.write_json(200, payload)
            except Exception as error:
                self.write_json(400, {"ok": False, "error": str(error), "editor": instance.editor_status()})
            return
        instance_editor_close = self.match_instance_route(path, "/editor/close")
        if instance_editor_close:
            with server_clap_instances_lock(self.server):
                instance = self.server.clap_instances.get(instance_editor_close)
            if not instance:
                self.write_json(404, {"ok": False, "error": "unknown instance"})
                return
            try:
                self.write_json(200, instance.close_editor())
            except Exception as error:
                self.write_json(400, {"ok": False, "error": str(error), "editor": instance.editor_status()})
            return
        instance_state = self.match_instance_route(path, "/state")
        if instance_state:
            with server_clap_instances_lock(self.server):
                instance = self.server.clap_instances.get(instance_state)
            if not instance:
                self.write_json(404, {"ok": False, "error": "unknown instance"})
                return
            try:
                payload = self.read_json_body()
                self.write_json(200, instance.load_state(str(payload.get("stateBase64") or "")))
            except Exception as error:
                self.write_json(400, {"ok": False, "error": str(error)})
            return
        instance_param = self.match_instance_route(path, "/param")
        if instance_param:
            with server_clap_instances_lock(self.server):
                instance = self.server.clap_instances.get(instance_param)
            if not instance:
                self.write_json(404, {"ok": False, "error": "unknown instance"})
                return
            try:
                payload = self.read_json_body()
                param_id = int(payload.get("paramId"))
                value = float(payload.get("value"))
                self.write_json(200, instance.set_parameter(param_id, value))
            except Exception as error:
                self.write_json(400, {"ok": False, "error": str(error)})
            return
        instance_params = self.match_instance_route(path, "/params")
        if instance_params:
            with server_clap_instances_lock(self.server):
                instance = self.server.clap_instances.get(instance_params)
            if not instance:
                self.write_json(404, {"ok": False, "error": "unknown instance"})
                return
            try:
                payload = self.read_json_body()
                self.write_json(200, instance.set_parameters(payload.get("parameters")))
            except Exception as error:
                self.write_json(400, {"ok": False, "error": str(error)})
            return
        instance_safety_reset = self.match_instance_route(path, "/safety/reset")
        if instance_safety_reset:
            with server_clap_instances_lock(self.server):
                instance = self.server.clap_instances.get(instance_safety_reset)
            if not instance:
                self.write_json(404, {"ok": False, "error": "unknown instance"})
                return
            self.write_json(200, instance.reset_safety_latch())
            return
        instance_process = self.match_instance_route(path, "/process")
        if instance_process:
            with server_clap_instances_lock(self.server):
                instance = self.server.clap_instances.get(instance_process)
            if not instance:
                self.write_json(404, {"ok": False, "error": "unknown instance"})
                return
            try:
                payload = self.read_json_body()
                self.write_json(
                    200,
                    instance.process_offline_probe(
                        sample_rate=float(payload.get("sampleRate") or 48000.0),
                        frames=int(payload.get("frames") or 256),
                        amplitude=float(payload.get("amplitude") if "amplitude" in payload else 0.125),
                        input_audio=payload.get("inputAudio"),
                        input_audio_format=str(payload.get("inputAudioFormat") or PLANAR_F32_JSON),
                        parameter_updates=payload.get("parameters") if "parameters" in payload else None,
                        return_audio=bool(payload.get("returnAudio")),
                        return_audio_format=str(payload.get("returnAudioFormat") or PLANAR_F32_JSON),
                        render_session_id=str(payload.get("renderSessionId") or ""),
                    ),
                )
            except Exception as error:
                self.write_json(400, {"ok": False, "error": str(error)})
            return
        self.write_json(404, {"ok": False, "error": "unknown endpoint"})

    def do_DELETE(self) -> None:
        path = urlsplit(self.path).path
        instance_id = self.match_instance_route(path)
        if instance_id:
            with server_clap_instances_lock(self.server):
                instance = self.server.clap_instances.pop(instance_id, None)
            if not instance:
                self.write_json(404, {"ok": False, "error": "unknown instance"})
                return
            instance.close()
            self.write_json(200, {"ok": True, "instanceId": instance_id, "deleted": True})
            return
        preset_id = self.match_preset_route(path)
        if preset_id:
            if not delete_clap_preset(self.server.clap_preset_dir, preset_id):
                self.write_json(404, {"ok": False, "error": "unknown preset"})
                return
            self.write_json(200, {"ok": True, "id": preset_id, "deleted": True})
            return
        self.write_json(404, {"ok": False, "error": "unknown endpoint"})

    def read_json_body(self) -> dict[str, Any]:
        content_length = int(self.headers.get("Content-Length") or 0)
        if content_length <= 0:
            return {}
        body = self.rfile.read(content_length)
        payload = json.loads(body.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("request JSON must be an object")
        return payload

    @staticmethod
    def match_instance_route(path: str, suffix: str = "") -> str:
        prefix = "/instances/"
        if not path.startswith(prefix):
            return ""
        remainder = path[len(prefix):]
        if suffix:
            if not remainder.endswith(suffix):
                return ""
            return remainder[: -len(suffix)].strip("/")
        return remainder.strip("/")

    @staticmethod
    def match_preset_route(path: str) -> str:
        prefix = "/presets/"
        if not path.startswith(prefix):
            return ""
        return path[len(prefix):].strip("/")

    def write_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=HOST_NAME)
    parser.add_argument(
        "--host",
        default=DEFAULT_BIND_ADDRESS,
        help=f"bind address, default {DEFAULT_BIND_ADDRESS}",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=DEFAULT_PORT,
        help=f"bind port, default {DEFAULT_PORT}",
    )
    parser.add_argument(
        "--scan-dir",
        action="append",
        default=[],
        help="additional CLAP folder to scan; may be provided more than once",
    )
    parser.add_argument(
        "--plugin",
        action="append",
        default=[],
        help="explicit .clap path to include in the catalog; may be provided more than once",
    )
    parser.add_argument(
        "--preset-dir",
        default="",
        help="folder to read/write saved CLAP presets; default <script folder>/presets",
    )
    parser.add_argument(
        "--inspect-metadata",
        action="store_true",
        help="load discovered CLAP libraries in isolated probe subprocesses and read descriptors",
    )
    parser.add_argument(
        "--test-instantiate",
        action="store_true",
        help="with --inspect-metadata, create/init/destroy plugin instances in isolated probe subprocesses",
    )
    parser.add_argument(
        "--doctor",
        action="store_true",
        help="print a JSON host preflight report and exit without starting the server",
    )
    parser.add_argument(
        "--probe-metadata-json",
        help=argparse.SUPPRESS,
    )
    parser.add_argument(
        "--probe-instantiate",
        action="store_true",
        help=argparse.SUPPRESS,
    )
    return parser


def main() -> int:
    args = build_arg_parser().parse_args()
    if args.probe_metadata_json:
        print(json.dumps(probe_clap_metadata(Path(args.probe_metadata_json), args.probe_instantiate)))
        return 0
    if args.doctor:
        print(json.dumps(host_doctor_payload(args), indent=2))
        return 0

    server = ThreadingHTTPServer((args.host, args.port), ClapHostRequestHandler)
    server.clap_scan_dirs = dedupe_paths(
        default_clap_scan_dirs() + [Path(path) for path in args.scan_dir]
    )
    server.clap_explicit_plugins = dedupe_paths([Path(path) for path in args.plugin])
    server.clap_inspect_metadata = bool(args.inspect_metadata or args.test_instantiate)
    server.clap_test_instantiate = bool(args.test_instantiate)
    server.clap_instances = {}
    server.clap_instances_lock = threading.RLock()
    server.clap_preset_dir = (
        Path(args.preset_dir).expanduser() if args.preset_dir
        else Path(__file__).resolve().parent / "presets"
    )
    # Descriptor inspection spawns one isolated probe subprocess per
    # discovered .clap file -- with metadata inspection on, a real plugin
    # folder can take several seconds to scan, which used to happen fresh
    # on every /plugins request (including the browser's automatic scan
    # right after connecting) and could outrun the browser's fetch timeout.
    # scan_dirs/explicit_plugins/inspect_metadata/test_instantiate are fixed
    # for the process lifetime, so a lazily-populated cache is safe; the
    # "Refresh Plugins" button bypasses it via ?refresh=1.
    server.clap_catalog_cache = None
    server.clap_catalog_cache_lock = threading.Lock()

    def stop_server(_signum: int, _frame: object) -> None:
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGINT, stop_server)
    signal.signal(signal.SIGTERM, stop_server)

    print(f"{HOST_NAME} {HOST_VERSION} listening on http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    finally:
        close_clap_instances(server)
        server.server_close()
    print(f"{HOST_NAME} stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
