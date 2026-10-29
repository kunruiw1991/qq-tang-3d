#!/usr/bin/env python3
"""Disk-safe Chrome 156 CDP + gbrowser E2E test harness for QQ Tang 3D.

Key guarantees:
1. Never writes outside the project directory or /tmp.
2. Isolates all Chrome profiles, HOME, XDG caches, SAR extractions, and scratch
   screenshots inside /tmp/qqtang_e2e_<pid>_<id>/ (53G+ tmpfs) and cleans up
   with recursive chmod 0770 + rmtree on exit/signals so / (99% full) stays untouched.
3. Serves static files via an in-process ThreadingHTTPServer recording every
   HTTP method, path, and status code in memory for exact 0-404/500 verification,
   plus supports strict /qq-tang-3d/ subpath hosting tests.
4. Drives local /usr/bin/google-chrome (ANGLE Vulkan SwiftShader WebGL2) via a
   zero-dependency stdlib RFC-6455 CDP WebSocket client AND supports gbrowser CLI
   (--debug-port) invocations.
"""

from __future__ import annotations

import argparse
import atexit
import base64
import dataclasses
import functools
from http import server as http_server
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
from typing import Any, Callable
import urllib.request

DEFAULT_PROJECT_ROOT = Path(__file__).resolve().parent.parent
CHROME_BIN = os.environ.get("CHROME_BIN", "/usr/bin/google-chrome")
GBROWSER_BIN = os.environ.get("GBROWSER_BIN", "gbrowser")
MAGICK_BIN = os.environ.get("MAGICK_BIN", "/usr/bin/magick")

EARLY_ERROR_HOOK_JS = r"""
(() => {
  if (window.__E2E_ERROR_TRACKER__) return;
  const tracker = {
    jsErrors: [],
    unhandledRejections: [],
    resourceErrors: [],
  };
  Object.defineProperty(window, '__E2E_ERROR_TRACKER__', {
    value: tracker,
    writable: false,
    configurable: false,
    enumerable: false,
  });
  window.addEventListener('error', (ev) => {
    try {
      if (ev && ev.target && ev.target !== window) {
        const tag = String(ev.target.tagName || 'UNKNOWN');
        const src = String(ev.target.src || ev.target.href || '');
        tracker.resourceErrors.push({ tag, src, time: Date.now() });
      } else {
        tracker.jsErrors.push({
          message: String(ev && ev.message ? ev.message : ev),
          filename: String((ev && ev.filename) || ''),
          lineno: Number((ev && ev.lineno) || 0),
          colno: Number((ev && ev.colno) || 0),
          stack: String((ev && ev.error && ev.error.stack) || ''),
        });
      }
    } catch (_) {}
  }, true);
  window.addEventListener('unhandledrejection', (ev) => {
    try {
      const r = ev ? ev.reason : 'unknown';
      tracker.unhandledRejections.push({
        reason: String((r && (r.stack || r.message)) || r),
        time: Date.now(),
      });
    } catch (_) {}
  });
})();
"""

# Shared browser-side helper preamble injected into simulation test evaluations.
# Uses ONLY legitimate public window.__QQTANG__ methods — ZERO cheat backdoors!
SIM_PREAMBLE_JS = r"""
const api = window.__QQTANG__ || window.__QQ_TANG__;
if (!api) {
  throw new Error('window.__QQTANG__ diagnostic API is not defined on window');
}

function makeGrid(opts = {}) {
  const rows = 13;
  const cols = 15;
  const fill = opts.fill ?? 0;
  const g = Array.from({ length: rows }, () => Array(cols).fill(fill));
  for (const [c, r] of (opts.walls || [])) {
    if (r >= 0 && r < rows && c >= 0 && c < cols) g[r][c] = 1;
  }
  for (const [c, r] of (opts.softBlocks || [])) {
    if (r >= 0 && r < rows && c >= 0 && c < cols) g[r][c] = 2;
  }
  for (const [c, r, tileType] of (opts.tiles || [])) {
    if (r >= 0 && r < rows && c >= 0 && c < cols) g[r][c] = tileType;
  }
  return g;
}

function getPlayer(st, id = 'p1') {
  if (!st || !st.sim || !Array.isArray(st.sim.players)) return null;
  return st.sim.players.find((p) => p.id === id) || null;
}

function getAllies(st, excludeId = 'p1') {
  const p1 = getPlayer(st, 'p1');
  const team = p1 ? p1.team : 0;
  return (st?.sim?.players || []).filter((p) => p.team === team && p.id !== excludeId);
}

function getEnemies(st) {
  const p1 = getPlayer(st, 'p1');
  const team = p1 ? p1.team : 0;
  return (st?.sim?.players || []).filter((p) => p.team !== team);
}

function clearInput(slot = 'p1') {
  api.setPlayerInput(slot, { moveX: 0, moveZ: 0, dropBubble: false, useItem: false });
}

function pulseDropBubble(slot = 'p1', moveX = 0, moveZ = 0) {
  api.setPlayerInput(slot, { moveX, moveZ, dropBubble: true, useItem: false });
  const st = api.stepFrames(1);
  api.setPlayerInput(slot, { moveX, moveZ, dropBubble: false, useItem: false });
  return st;
}

function pulseUseItem(slot = 'p1', moveX = 0, moveZ = 0) {
  api.setPlayerInput(slot, { moveX, moveZ, dropBubble: false, useItem: true });
  const st = api.stepFrames(1);
  api.setPlayerInput(slot, { moveX, moveZ, dropBubble: false, useItem: false });
  return st;
}

function moveHold(slot, moveX, moveZ, frames) {
  api.setPlayerInput(slot, { moveX, moveZ, dropBubble: false, useItem: false });
  const st = api.stepFrames(frames);
  api.setPlayerInput(slot, { moveX: 0, moveZ: 0, dropBubble: false, useItem: false });
  return st;
}

// Measures initial tile-center offset convention dynamically from frame-0 spawn
// (works whether tile center is col + 0.5, col, or world-offset col - 7!).
function inferTileCenterCoord(player) {
  const offsetX = player.x - player.col;
  const offsetZ = player.z - player.row;
  return {
    toX: (col) => col + offsetX,
    toZ: (row) => row + offsetZ,
  };
}

function steerToWorld(slot, playerId, targetX, targetZ, maxFrames = 260, tol = 0.09) {
  let st = api.getState();
  for (let i = 0; i < maxFrames; i++) {
    const p = getPlayer(st, playerId);
    if (!p) throw new Error(`Player ${playerId} not found`);
    const dx = targetX - p.x;
    const dz = targetZ - p.z;
    if (Math.hypot(dx, dz) <= tol) {
      clearInput(slot);
      return st;
    }
    const step = Math.max(0.06, (p.effectiveSpeed || 5.2) / 60);
    let mx = 0;
    let mz = 0;
    if (Math.abs(dx) >= Math.abs(dz)) {
      mx = Math.abs(dx) >= step ? Math.sign(dx) : Math.sign(dx) * Math.max(0.15, Math.abs(dx) / step);
    } else {
      mz = Math.abs(dz) >= step ? Math.sign(dz) : Math.sign(dz) * Math.max(0.15, Math.abs(dz) / step);
    }
    api.setPlayerInput(slot, { moveX: mx, moveZ: mz, dropBubble: false, useItem: false });
    st = api.stepFrames(1);
  }
  clearInput(slot);
  return st;
}
"""


def safe_rmtree(target: Path | str) -> None:
  """Recursively restores write permissions (incl. 0555 SAR dirs) and deletes."""
  p = Path(target)
  if not p.exists() and not p.is_symlink():
    return
  try:
    if p.is_dir() and not p.is_symlink():
      for root, dirs, files in os.walk(p, topdown=True):
        try:
          os.chmod(root, 0o770)
        except OSError:
          pass
        for d in dirs:
          try:
            os.chmod(os.path.join(root, d), 0o770)
          except OSError:
            pass
        for fn in files:
          fp = os.path.join(root, fn)
          if not os.path.islink(fp):
            try:
              os.chmod(fp, 0o660)
            except OSError:
              pass
  except OSError:
    pass
  shutil.rmtree(p, ignore_errors=True)


def find_free_port() -> int:
  with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
    s.bind(("127.0.0.1", 0))
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    return int(s.getsockname()[1])


@dataclasses.dataclass
class HTTPRecord:
  method: str
  path: str
  status: int
  timestamp: float


class RecordedStaticHTTPServer:
  """Threaded local static HTTP server recording every request & status code."""

  def __init__(self, root_dir: Path, strict_subpath: str | None = None):
    self.root_dir = Path(root_dir).resolve()
    self.strict_subpath = (
        strict_subpath.rstrip("/") if strict_subpath else None
    )
    self._lock = threading.Lock()
    self._records: list[HTTPRecord] = []
    self._httpd: http_server.ThreadingHTTPServer | None = None
    self._thread: threading.Thread | None = None
    self.port: int = 0

  def _record(self, method: str, path: str, status: int) -> None:
    with self._lock:
      self._records.append(
          HTTPRecord(
              method=method,
              path=path,
              status=int(status),
              timestamp=time.time(),
          )
      )

  def start(self) -> "RecordedStaticHTTPServer":
    outer = self

    class Handler(http_server.SimpleHTTPRequestHandler):

      def __init__(self, *args: Any, **kwargs: Any):
        super().__init__(*args, directory=str(outer.root_dir), **kwargs)

      def do_GET(self) -> None:
        if not self._check_subpath():
          return
        super().do_GET()

      def do_HEAD(self) -> None:
        if not self._check_subpath():
          return
        super().do_HEAD()

      def _check_subpath(self) -> bool:
        if not outer.strict_subpath:
          return True
        clean_path = self.path.split("?", 1)[0].split("#", 1)[0]
        if clean_path == outer.strict_subpath:
          self.send_response(301)
          self.send_header("Location", outer.strict_subpath + "/")
          self.end_headers()
          return False
        prefix = outer.strict_subpath + "/"
        if not clean_path.startswith(prefix):
          self.send_error(
              404, f"Escaped strict subpath {outer.strict_subpath}: {self.path}"
          )
          return False
        suffix = self.path[len(outer.strict_subpath) :]
        self.path = suffix if suffix.startswith("/") else ("/" + suffix)
        self._raw_request_path = clean_path
        return True

      def send_response(self, code: int, message: str | None = None) -> None:
        orig_path = getattr(self, "_raw_request_path", self.path)
        outer._record(getattr(self, "command", "GET"), orig_path, int(code))
        super().send_response(code, message)

      def end_headers(self) -> None:
        # Disable browser caching so test iterations always read fresh modules.
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

      def log_message(self, format: str, *args: Any) -> None:
        pass

    self._httpd = http_server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    self.port = int(self._httpd.server_address[1])
    self._thread = threading.Thread(
        target=self._httpd.serve_forever,
        name=f"qqtang-http-{self.port}",
        daemon=True,
    )
    self._thread.start()
    return self

  @property
  def base_url(self) -> str:
    if self.strict_subpath:
      return f"http://127.0.0.1:{self.port}{self.strict_subpath}/"
    return f"http://127.0.0.1:{self.port}/"

  def clear_records(self) -> None:
    with self._lock:
      self._records.clear()

  def get_records(self) -> list[HTTPRecord]:
    with self._lock:
      return list(self._records)

  def get_error_records(
      self, ignore_favicon: bool = False
  ) -> list[HTTPRecord]:
    errs: list[HTTPRecord] = []
    for r in self.get_records():
      if r.status >= 400:
        clean = r.path.split("?", 1)[0]
        if ignore_favicon and clean.endswith("/favicon.ico"):
          continue
        errs.append(r)
    return errs

  def close(self) -> None:
    if self._httpd is not None:
      try:
        self._httpd.shutdown()
        self._httpd.server_close()
      except OSError:
        pass
      self._httpd = None


class CDPWebSocket:
  """Minimal RFC-6455 WebSocket client built purely on Python stdlib socket."""

  def __init__(self, ws_url: str, timeout: float = 25.0):
    # ws://127.0.0.1:PORT/devtools/page/ID
    if not ws_url.startswith("ws://"):
      raise ValueError(f"Expected ws:// URL, got {ws_url}")
    rest = ws_url[len("ws://") :]
    host_port, sep, path_part = rest.partition("/")
    path = "/" + path_part if sep else "/"
    host, _, port_str = host_port.partition(":")
    port = int(port_str) if port_str else 80

    self._sock = socket.create_connection((host, port), timeout=timeout)
    self._sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    self._buffer = bytearray()

    key = base64.b64encode(os.urandom(16)).decode("ascii")
    handshake = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {host}:{port}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n"
        "\r\n"
    ).encode("ascii")
    self._sock.sendall(handshake)

    while b"\r\n\r\n" not in self._buffer:
      chunk = self._sock.recv(4096)
      if not chunk:
        raise RuntimeError("EOF during CDP WebSocket HTTP Upgrade handshake")
      self._buffer.extend(chunk)

    idx = self._buffer.index(b"\r\n\r\n")
    header_bytes = bytes(self._buffer[:idx])
    del self._buffer[: idx + 4]
    first_line = header_bytes.split(b"\r\n", 1)[0].decode("latin1")
    if " 101 " not in first_line:
      raise RuntimeError(f"CDP WebSocket handshake rejected: {first_line}")

  def _recv_exact(self, n: int) -> bytes:
    while len(self._buffer) < n:
      chunk = self._sock.recv(max(65536, n - len(self._buffer)))
      if not chunk:
        raise EOFError("CDP WebSocket closed unexpectedly")
      self._buffer.extend(chunk)
    out = bytes(self._buffer[:n])
    del self._buffer[:n]
    return out

  def _send_frame(self, opcode: int, payload: bytes) -> None:
    n = len(payload)
    mask_key = os.urandom(4)
    b0 = 0x80 | (opcode & 0x0F)
    if n < 126:
      header = struct.pack("!BB", b0, 0x80 | n)
    elif n < 65536:
      header = struct.pack("!BBH", b0, 0x80 | 126, n)
    else:
      header = struct.pack("!BBQ", b0, 0x80 | 127, n)
    masked = bytes(b ^ mask_key[i & 3] for i, b in enumerate(payload))
    self._sock.sendall(header + mask_key + masked)

  def send_json(self, obj: dict[str, Any]) -> None:
    raw = json.dumps(obj, separators=(",", ":")).encode("utf-8")
    self._send_frame(0x1, raw)

  def recv_json(self) -> dict[str, Any]:
    fragments: list[bytes] = []
    while True:
      b0, b1 = self._recv_exact(2)
      fin = (b0 & 0x80) != 0
      opcode = b0 & 0x0F
      masked = (b1 & 0x80) != 0
      length = b1 & 0x7F
      if length == 126:
        length = struct.unpack("!H", self._recv_exact(2))[0]
      elif length == 127:
        length = struct.unpack("!Q", self._recv_exact(8))[0]
      mkey = self._recv_exact(4) if masked else b""
      payload = self._recv_exact(length)
      if masked:
        payload = bytes(b ^ mkey[i & 3] for i, b in enumerate(payload))

      if opcode == 0x9:  # PING -> PONG
        self._send_frame(0xA, payload)
        continue
      if opcode == 0xA:  # PONG
        continue
      if opcode == 0x8:  # CLOSE
        raise EOFError("CDP WebSocket closed by Chrome")

      fragments.append(payload)
      if fin:
        text = b"".join(fragments).decode("utf-8")
        return json.loads(text)

  def close(self) -> None:
    try:
      self._send_frame(0x8, b"")
    except OSError:
      pass
    try:
      self._sock.close()
    except OSError:
      pass


KEY_DEFINITIONS: dict[str, tuple[str, str, int]] = {
    "KeyW": ("w", "KeyW", 87),
    "KeyA": ("a", "KeyA", 65),
    "KeyS": ("s", "KeyS", 83),
    "KeyD": ("d", "KeyD", 68),
    "KeyE": ("e", "KeyE", 69),
    "KeyQ": ("q", "KeyQ", 81),
    "KeyM": ("m", "KeyM", 77),
    "KeyP": ("p", "KeyP", 80),
    "Space": (" ", "Space", 32),
    "Enter": ("Enter", "Enter", 13),
    "Escape": ("Escape", "Escape", 27),
    "ShiftLeft": ("Shift", "ShiftLeft", 16),
    "ShiftRight": ("Shift", "ShiftRight", 16),
    "Slash": ("/", "Slash", 191),
    "ArrowUp": ("ArrowUp", "ArrowUp", 38),
    "ArrowDown": ("ArrowDown", "ArrowDown", 40),
    "ArrowLeft": ("ArrowLeft", "ArrowLeft", 37),
    "ArrowRight": ("ArrowRight", "ArrowRight", 39),
}


class QQTangTestHarness:
  """Manages HTTP server + /tmp-isolated Chrome 156 WebGL2 + CDP/gbrowser."""

  def __init__(self, root_dir: Path | str = DEFAULT_PROJECT_ROOT):
    self.root_dir = Path(root_dir).resolve()
    forbidden_prefix = os.environ.get("QQTANG_FORBIDDEN_ROOT_PREFIX", "")
    if forbidden_prefix and str(self.root_dir).startswith(forbidden_prefix):
      raise RuntimeError(f"Refusing to run inside forbidden workspace: {self.root_dir}")

    self.tmp_dir = Path(
        tempfile.mkdtemp(prefix=f"qqtang_e2e_{os.getpid()}_", dir="/tmp")
    )
    self.home_dir = self.tmp_dir / "home"
    self.profile_dir = self.tmp_dir / "prof"
    self.sar_dir = self.tmp_dir / "sar"
    self.shots_dir = self.tmp_dir / "shots"
    for d in (
        self.home_dir / ".config",
        self.home_dir / ".cache",
        self.profile_dir,
        self.sar_dir,
        self.shots_dir,
    ):
      d.mkdir(parents=True, exist_ok=True)

    self.http_server = RecordedStaticHTTPServer(self.root_dir)
    self.chrome_proc: subprocess.Popen[bytes] | None = None
    self.debug_port: int = 0
    self.ws: CDPWebSocket | None = None
    self._msg_id: int = 0
    self._closed: bool = False

    self.cdp_exceptions: list[dict[str, Any]] = []
    self.cdp_console_errors: list[dict[str, Any]] = []
    self.cdp_network_failures: list[dict[str, Any]] = []
    self._page_loaded: bool = False
    self._touch_enabled: bool = False

    atexit.register(self.close)

  def __enter__(self) -> "QQTangTestHarness":
    return self.start()

  def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
    self.close()

  def _clean_env(self) -> dict[str, str]:
    return {
        "PATH": "/usr/local/bin:/usr/bin:/bin",
        "HOME": str(self.home_dir),
        "TMPDIR": str(self.tmp_dir),
        "XDG_CONFIG_HOME": str(self.home_dir / ".config"),
        "XDG_CACHE_HOME": str(self.home_dir / ".cache"),
        "SAR_EXTRACT_DIR": str(self.sar_dir),
        "LANG": "en_US.UTF-8",
    }

  def start(self) -> "QQTangTestHarness":
    self.http_server.start()
    self.debug_port = find_free_port()

    chrome_out = open(self.tmp_dir / "chrome.out", "wb")
    chrome_err = open(self.tmp_dir / "chrome.err", "wb")
    cmd = [
        CHROME_BIN,
        "--headless=new",
        "--ozone-platform=headless",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-default-browser-check",
        "--no-proxy-server",
        "--disable-background-networking",
        "--disable-extensions",
        "--disable-sync",
        "--mute-audio",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
        "--window-size=1280,800",
        f"--remote-debugging-port={self.debug_port}",
        "--remote-allow-origins=*",
        f"--user-data-dir={self.profile_dir}",
        "about:blank",
    ]
    self.chrome_proc = subprocess.Popen(
        cmd,
        cwd="/tmp",
        env=self._clean_env(),
        stdin=subprocess.DEVNULL,
        stdout=chrome_out,
        stderr=chrome_err,
        start_new_session=True,
    )
    chrome_out.close()
    chrome_err.close()

    ws_url = self._wait_for_page_ws_url(timeout=15.0)
    self.ws = CDPWebSocket(ws_url, timeout=25.0)

    self.cdp("Page.enable")
    self.cdp("Runtime.enable")
    self.cdp("Log.enable")
    self.cdp("Network.enable")
    self.cdp("DOM.enable")
    self.cdp(
        "Page.addScriptToEvaluateOnNewDocument",
        {"source": EARLY_ERROR_HOOK_JS},
    )
    self.set_viewport(1280, 800, mobile=False, touch=False)
    return self

  def _wait_for_page_ws_url(self, timeout: float = 15.0) -> str:
    deadline = time.time() + timeout
    list_url = f"http://127.0.0.1:{self.debug_port}/json/list"
    last_err = ""
    while time.time() < deadline:
      if self.chrome_proc and self.chrome_proc.poll() is not None:
        err_txt = (self.tmp_dir / "chrome.err").read_text(errors="replace")
        raise RuntimeError(
            f"Chrome exited early (rc={self.chrome_proc.returncode}): {err_txt[-800:]}"
        )
      try:
        req = urllib.request.Request(list_url)
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(req, timeout=2.0) as resp:
          targets = json.loads(resp.read().decode("utf-8"))
          for t in targets:
            if t.get("type") == "page" and t.get("webSocketDebuggerUrl"):
              return str(t["webSocketDebuggerUrl"])
      except Exception as e:  # pylint: disable=broad-except
        last_err = str(e)
      time.sleep(0.08)
    raise TimeoutError(
        f"Timed out waiting for Chrome CDP target on {list_url}: {last_err}"
    )

  def _handle_event(self, method: str, params: dict[str, Any]) -> None:
    if method == "Page.loadEventFired":
      self._page_loaded = True
    elif method == "Runtime.exceptionThrown":
      details = params.get("exceptionDetails", {})
      self.cdp_exceptions.append({
          "text": details.get("text", ""),
          "url": details.get("url", ""),
          "line": details.get("lineNumber", 0),
          "exception": details.get("exception", {}).get("description", ""),
      })
    elif method == "Runtime.consoleAPICalled":
      if params.get("type") == "error":
        args_desc = [
            str(a.get("value", a.get("description", "")))
            for a in params.get("args", [])
        ]
        self.cdp_console_errors.append({"args": args_desc})
    elif method == "Network.loadingFailed":
      if not params.get("canceled"):
        self.cdp_network_failures.append({
            "errorText": params.get("errorText", ""),
            "type": params.get("type", ""),
        })

  def cdp(
      self, method: str, params: dict[str, Any] | None = None
  ) -> dict[str, Any]:
    if self.ws is None:
      raise RuntimeError("CDP WebSocket is not connected")
    self._msg_id += 1
    req_id = self._msg_id
    payload: dict[str, Any] = {"id": req_id, "method": method}
    if params is not None:
      payload["params"] = params
    self.ws.send_json(payload)

    while True:
      msg = self.ws.recv_json()
      if "id" in msg:
        if msg["id"] == req_id:
          if "error" in msg:
            raise RuntimeError(f"CDP {method} error: {msg['error']}")
          return msg.get("result", {})
      elif "method" in msg:
        self._handle_event(msg["method"], msg.get("params", {}))

  def clear_diagnostics(self) -> None:
    self.http_server.clear_records()
    self.cdp_exceptions.clear()
    self.cdp_console_errors.clear()
    self.cdp_network_failures.clear()
    try:
      self.eval_js(
          """(() => {
            if (window.__E2E_ERROR_TRACKER__) {
              window.__E2E_ERROR_TRACKER__.jsErrors.length = 0;
              window.__E2E_ERROR_TRACKER__.unhandledRejections.length = 0;
              window.__E2E_ERROR_TRACKER__.resourceErrors.length = 0;
            }
            return true;
          })()"""
      )
    except Exception:  # pylint: disable=broad-except
      pass

  def navigate(
      self,
      url: str | None = None,
      wait_qqtang: bool = True,
      timeout: float = 12.0,
  ) -> None:
    target_url = url or self.http_server.base_url
    self._page_loaded = False
    self.cdp("Page.navigate", {"url": target_url})
    deadline = time.time() + timeout
    while time.time() < deadline:
      ready = self.eval_js("document.readyState")
      if ready == "complete":
        if not wait_qqtang:
          return
        has_api = self.eval_js(
            "Boolean(window.__QQTANG__ || window.__QQ_TANG__)"
        )
        if has_api:
          return
      time.sleep(0.04)
    if wait_qqtang:
      errs = self.collect_error_summary()
      raise TimeoutError(
          f"Timed out waiting for window.__QQTANG__ on {target_url}; errors={errs}"
      )

  def set_viewport(
      self,
      width: int,
      height: int,
      mobile: bool = False,
      touch: bool = False,
      device_scale_factor: float = 1.0,
  ) -> dict[str, int]:
    self._touch_enabled = bool(touch)
    self.cdp(
        "Emulation.setDeviceMetricsOverride",
        {
            "width": int(width),
            "height": int(height),
            "deviceScaleFactor": float(device_scale_factor),
            "mobile": bool(mobile),
            "screenWidth": int(width),
            "screenHeight": int(height),
        },
    )
    touch_params: dict[str, Any] = {"enabled": bool(touch)}
    if touch:
      touch_params["maxTouchPoints"] = 5
    self.cdp("Emulation.setTouchEmulationEnabled", touch_params)
    dims = self.eval_js(
        """(() => {
          window.dispatchEvent(new Event('resize'));
          return {
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            scrollWidth: document.documentElement.scrollWidth,
            scrollHeight: document.documentElement.scrollHeight,
          };
        })()"""
    )
    return dims

  def eval_js(self, expression: str, await_promise: bool = True) -> Any:
    res = self.cdp(
        "Runtime.evaluate",
        {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": bool(await_promise),
        },
    )
    if "exceptionDetails" in res:
      exc = res["exceptionDetails"]
      desc = exc.get("exception", {}).get("description") or exc.get("text", "")
      raise RuntimeError(f"JS evaluation threw exception: {desc}")
    remote_obj = res.get("result", {})
    if remote_obj.get("type") == "undefined":
      return None
    return remote_obj.get("value")

  def run_sim_js(self, body_js: str) -> Any:
    """Executes body_js inside an async IIFE with SIM_PREAMBLE_JS helpers."""
    wrapped = f"(async () => {{\n{SIM_PREAMBLE_JS}\n{body_js}\n}})()"
    return self.eval_js(wrapped, await_promise=True)

  def get_state(self) -> dict[str, Any]:
    st = self.eval_js("(window.__QQTANG__ || window.__QQ_TANG__).getState()")
    if not isinstance(st, dict):
      raise RuntimeError(f"Expected dict from getState(), got {type(st)}")
    return st

  def get_testid_rect(self, testid: str) -> dict[str, Any] | None:
    return self.eval_js(
        f"""(() => {{
          const el = document.querySelector({json.dumps(f'[data-testid="{testid}"]')});
          if (!el) return null;
          const cs = window.getComputedStyle(el);
          const r = el.getBoundingClientRect();
          const visible = !el.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' &&
                          Number(cs.opacity) > 0 && r.width > 0 && r.height > 0;
          return {{
            exists: true,
            visible,
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
            cx: r.left + r.width * 0.5,
            cy: r.top + r.height * 0.5,
            tagName: el.tagName,
            role: el.getAttribute('role') || '',
          }};
        }})()"""
    )

  def click_at(self, x: float, y: float) -> None:
    self.cdp(
        "Input.dispatchMouseEvent",
        {"type": "mouseMoved", "x": float(x), "y": float(y), "button": "none"},
    )
    self.cdp(
        "Input.dispatchMouseEvent",
        {
            "type": "mousePressed",
            "x": float(x),
            "y": float(y),
            "button": "left",
            "buttons": 1,
            "clickCount": 1,
        },
    )
    self.cdp(
        "Input.dispatchMouseEvent",
        {
            "type": "mouseReleased",
            "x": float(x),
            "y": float(y),
            "button": "left",
            "buttons": 0,
            "clickCount": 1,
        },
    )

  def click_testid(self, testid: str, timeout: float = 4.0) -> dict[str, Any]:
    deadline = time.time() + timeout
    info = None
    while time.time() < deadline:
      info = self.get_testid_rect(testid)
      if info and info.get("visible"):
        break
      time.sleep(0.04)
    if not info or not info.get("visible"):
      raise AssertionError(
          f'Element [data-testid="{testid}"] is missing or not visible: {info}'
      )
    self.click_at(info["cx"], info["cy"])
    return info

  def drag_testid(
      self,
      testid: str,
      dx: float,
      dy: float,
      hold_frames: int = 20,
      steps: int = 5,
  ) -> dict[str, Any]:
    info = self.get_testid_rect(testid)
    if not info or not info.get("visible"):
      raise AssertionError(
          f'Joystick/element [data-testid="{testid}"] not visible: {info}'
      )
    cx, cy = float(info["cx"]), float(info["cy"])
    if self._touch_enabled:
      self.cdp(
          "Input.dispatchTouchEvent",
          {
              "type": "touchStart",
              "touchPoints": [{"x": round(cx, 2), "y": round(cy, 2), "id": 1}],
          },
      )
      for i in range(1, steps + 1):
        frac = i / steps
        self.cdp(
            "Input.dispatchTouchEvent",
            {
                "type": "touchMove",
                "touchPoints": [{
                    "x": round(cx + dx * frac, 2),
                    "y": round(cy + dy * frac, 2),
                    "id": 1,
                }],
            },
        )
      st = self.eval_js(
          f"(window.__QQTANG__ || window.__QQ_TANG__).stepFrames({int(hold_frames)})"
      )
      self.cdp(
          "Input.dispatchTouchEvent",
          {"type": "touchEnd", "touchPoints": []},
      )
      return st

    self.cdp(
        "Input.dispatchMouseEvent",
        {"type": "mouseMoved", "x": cx, "y": cy, "button": "none"},
    )
    self.cdp(
        "Input.dispatchMouseEvent",
        {
            "type": "mousePressed",
            "x": cx,
            "y": cy,
            "button": "left",
            "buttons": 1,
            "clickCount": 1,
        },
    )
    for i in range(1, steps + 1):
      frac = i / steps
      self.cdp(
          "Input.dispatchMouseEvent",
          {
              "type": "mouseMoved",
              "x": cx + dx * frac,
              "y": cy + dy * frac,
              "button": "left",
              "buttons": 1,
          },
      )
    st = self.eval_js(
        f"(window.__QQTANG__ || window.__QQ_TANG__).stepFrames({int(hold_frames)})"
    )
    self.cdp(
        "Input.dispatchMouseEvent",
        {
            "type": "mouseReleased",
            "x": cx + dx,
            "y": cy + dy,
            "button": "left",
            "buttons": 0,
            "clickCount": 1,
        },
    )
    return st

  def key_down(self, code: str) -> None:
    key, dom_code, vk = KEY_DEFINITIONS.get(code, (code, code, 0))
    self.cdp(
        "Input.dispatchKeyEvent",
        {
            "type": "keyDown",
            "key": key,
            "code": dom_code,
            "windowsVirtualKeyCode": vk,
            "nativeVirtualKeyCode": vk,
        },
    )

  def key_up(self, code: str) -> None:
    key, dom_code, vk = KEY_DEFINITIONS.get(code, (code, code, 0))
    self.cdp(
        "Input.dispatchKeyEvent",
        {
            "type": "keyUp",
            "key": key,
            "code": dom_code,
            "windowsVirtualKeyCode": vk,
            "nativeVirtualKeyCode": vk,
        },
    )

  def tap_key(self, code: str, hold_frames: int = 1) -> dict[str, Any]:
    self.key_down(code)
    st = self.eval_js(
        f"(window.__QQTANG__ || window.__QQ_TANG__).stepFrames({int(hold_frames)})"
    )
    self.key_up(code)
    return st

  def audit_viewport_and_hud(self) -> dict[str, Any]:
    """Audits scrollbars, visible clickable controls, sizes, and overlaps."""
    return self.eval_js(
        """(() => {
          const isVisible = (el) => {
            let cur = el;
            while (cur && cur.nodeType === 1) {
              if (cur.hidden || cur.getAttribute('aria-hidden') === 'true') return false;
              const cs = window.getComputedStyle(cur);
              if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) {
                return false;
              }
              cur = cur.parentElement;
            }
            const selfCs = window.getComputedStyle(el);
            if (selfCs.pointerEvents === 'none') return false;
            const r = el.getBoundingClientRect();
            return r.width > 1 && r.height > 1;
          };

          const selector = [
            'button',
            'a[href]',
            'input:not([type="hidden"])',
            'select',
            'textarea',
            '[role="button"]',
            '[role="slider"]',
            '[data-testid^="hud-btn-"]',
            '[data-testid="hud-joystick"]',
          ].join(',');

          const rawCandidates = Array.from(document.querySelectorAll(selector)).filter(isVisible);
          // Deduplicate nested descendants inside an already-counted interactive control
          const controls = rawCandidates.filter(
            (el) => !rawCandidates.some((other) => other !== el && other.contains(el))
          );

          const rects = controls.map((el) => {
            const r = el.getBoundingClientRect();
            return {
              testid: el.getAttribute('data-testid') || '',
              tag: el.tagName.toLowerCase(),
              role: el.getAttribute('role') || '',
              left: r.left,
              top: r.top,
              right: r.right,
              bottom: r.bottom,
              width: r.width,
              height: r.height,
            };
          });

          const overlaps = [];
          for (let i = 0; i < rects.length; i++) {
            for (let j = i + 1; j < rects.length; j++) {
              const a = rects[i];
              const b = rects[j];
              const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
              const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
              if (ix > 0.75 && iy > 0.75) {
                overlaps.push({ a: a.testid || a.tag, b: b.testid || b.tag, ix, iy });
              }
            }
          }

          const joystickEl = document.querySelector('[data-testid="hud-joystick"]');
          const joystickChildButtons = joystickEl
            ? joystickEl.querySelectorAll('button, a, [role="button"]').length
            : 0;

          return {
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            scrollWidth: document.documentElement.scrollWidth,
            scrollHeight: document.documentElement.scrollHeight,
            controlCount: rects.length,
            controls: rects,
            overlaps,
            joystickChildButtons,
          };
        })()"""
    )

  def capture_screenshot(self, out_path: Path | str | None = None) -> Path:
    dest = (
        Path(out_path)
        if out_path is not None
        else (self.shots_dir / f"shot_{int(time.time() * 1000)}.png")
    )
    dest.parent.mkdir(parents=True, exist_ok=True)
    res = self.cdp(
        "Page.captureScreenshot",
        {"format": "png", "captureBeyondViewport": False},
    )
    png_bytes = base64.b64decode(res["data"])
    dest.write_bytes(png_bytes)
    return dest

  def inspect_image(self, image_path: Path | str) -> dict[str, float | int]:
    proc = subprocess.run(
        [
            MAGICK_BIN,
            str(image_path),
            "-format",
            "%w %h %[fx:mean] %[fx:standard_deviation]",
            "info:",
        ],
        cwd="/tmp",
        env=self._clean_env(),
        capture_output=True,
        text=True,
        check=True,
        timeout=15,
    )
    parts = proc.stdout.strip().split()
    return {
        "width": int(parts[0]),
        "height": int(parts[1]),
        "mean": float(parts[2]),
        "std_dev": float(parts[3]),
        "bytes": Path(image_path).stat().st_size,
    }

  def run_gbrowser_cli(
      self, args: list[str], timeout: float = 30.0
  ) -> subprocess.CompletedProcess[str]:
    """Runs official gbrowser CLI connected to this Chrome's --debug-port."""
    cmd = [
        GBROWSER_BIN,
        "--debug-port",
        str(self.debug_port),
        "--no-proxy-server",
        *args,
    ]
    return subprocess.run(
        cmd,
        cwd="/tmp",
        env=self._clean_env(),
        capture_output=True,
        text=True,
        check=False,
        timeout=timeout,
    )

  def collect_error_summary(
      self, ignore_favicon: bool = True
  ) -> dict[str, Any]:
    in_page = None
    app_errs = None
    try:
      in_page = self.eval_js("window.__E2E_ERROR_TRACKER__ || null")
    except Exception:  # pylint: disable=broad-except
      in_page = None
    try:
      app_errs = self.eval_js(
          "(() => { const a = window.__QQTANG__ || window.__QQ_TANG__; "
          "return a && a.getState ? (a.getState().errors || null) : null; })()"
      )
    except Exception:  # pylint: disable=broad-except
      app_errs = None

    http_errs = [
        {"method": r.method, "path": r.path, "status": r.status}
        for r in self.http_server.get_error_records(
            ignore_favicon=ignore_favicon
        )
    ]
    return {
        "jsErrors": (in_page or {}).get("jsErrors", []),
        "unhandledRejections": (in_page or {}).get("unhandledRejections", []),
        "resourceErrors": (in_page or {}).get("resourceErrors", []),
        "appErrors": app_errs or {},
        "cdpExceptions": list(self.cdp_exceptions),
        "cdpNetworkFailures": list(self.cdp_network_failures),
        "httpErrors": http_errs,
    }

  def assert_zero_errors(
      self, context: str = "", ignore_favicon: bool = True
  ) -> None:
    summary = self.collect_error_summary(ignore_favicon=ignore_favicon)
    problems: list[str] = []
    if summary["jsErrors"]:
      problems.append(f"jsErrors={summary['jsErrors']}")
    if summary["unhandledRejections"]:
      problems.append(f"unhandledRejections={summary['unhandledRejections']}")
    if summary["resourceErrors"]:
      problems.append(f"resourceErrors={summary['resourceErrors']}")
    app_e = summary.get("appErrors") or {}
    for k in ("jsErrors", "unhandledRejections", "resourceErrors"):
      if app_e.get(k):
        problems.append(f"app.{k}={app_e[k]}")
    if summary["cdpExceptions"]:
      problems.append(f"cdpExceptions={summary['cdpExceptions']}")
    if summary["httpErrors"]:
      problems.append(f"httpErrors={summary['httpErrors']}")
    if problems:
      prefix = f"[{context}] " if context else ""
      raise AssertionError(
          f"{prefix}Expected 0 browser/HTTP errors, found: {'; '.join(problems)}"
      )

  def close(self) -> None:
    if self._closed:
      return
    self._closed = True
    if self.ws is not None:
      self.ws.close()
      self.ws = None
    if self.chrome_proc is not None:
      pid = self.chrome_proc.pid
      try:
        os.killpg(os.getpgid(pid), signal.SIGTERM)
      except OSError:
        try:
          self.chrome_proc.terminate()
        except OSError:
          pass
      try:
        self.chrome_proc.wait(timeout=3.0)
      except subprocess.TimeoutExpired:
        try:
          os.killpg(os.getpgid(pid), signal.SIGKILL)
        except OSError:
          try:
            self.chrome_proc.kill()
          except OSError:
            pass
      self.chrome_proc = None
    self.http_server.close()
    safe_rmtree(self.tmp_dir)


@dataclasses.dataclass
class TestCaseSpec:
  tier: int
  name: str
  group: str
  fn: Callable[[QQTangTestHarness], None]


@dataclasses.dataclass
class TestResult:
  tier: int
  name: str
  group: str
  passed: bool
  duration_ms: float
  error: str = ""


def run_self_test() -> int:
  """Verifies Chrome 156 WebGL2, 390x844 viewport, 404 tracking & screenshots."""
  smoke_dir = Path(tempfile.mkdtemp(prefix="qqtang_harness_smoke_", dir="/tmp"))
  try:
    (smoke_dir / "index.html").write_text(
        """<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" href="data:,">
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #1e293b; }
    canvas { display: block; width: 100vw; height: 100vh; }
    #btn { position: fixed; right: 16px; bottom: 16px; width: 72px; height: 72px; border: 0; border-radius: 36px; background: #ff5e99; }
  </style>
</head>
<body>
  <canvas id="gl" data-testid="arena-canvas"></canvas>
  <button id="btn" data-testid="btn-play" aria-label="Play"></button>
  <script type="module">
    const canvas = document.getElementById('gl');
    canvas.width = 640;
    canvas.height = 400;
    const gl = canvas.getContext('webgl2');
    let clicked = 0;
    document.getElementById('btn').addEventListener('click', () => { clicked += 1; });
    if (gl) {
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, 0, 640, 400);
      gl.clearColor(0.98, 0.86, 0.93, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.scissor(160, 80, 320, 240);
      gl.clearColor(0.12, 0.72, 0.96, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    window.__QQTANG__ = {
      getState: () => ({
        uiScreen: 'title',
        clicked,
        webgl2: Boolean(gl),
        renderer: gl ? gl.getParameter(gl.RENDERER) : 'none',
        errors: { jsErrors: [], unhandledRejections: [], resourceErrors: [] },
      }),
      stepFrames: () => window.__QQTANG__.getState(),
    };
  </script>
</body>
</html>
""",
        encoding="utf-8",
    )

    with QQTangTestHarness(root_dir=smoke_dir) as h:
      h.navigate(wait_qqtang=True)
      st = h.get_state()
      assert st["webgl2"] is True, f"Expected WebGL2 true, got {st}"
      h.assert_zero_errors("smoke-initial", ignore_favicon=False)

      # Verify exact narrow portrait viewport (390x844) without 500px clamping!
      dims = h.set_viewport(390, 844, mobile=True, touch=True)
      assert dims["innerWidth"] == 390 and dims["innerHeight"] == 844, dims
      audit = h.audit_viewport_and_hud()
      assert audit["scrollWidth"] <= 390 and audit["scrollHeight"] <= 844, audit
      assert audit["controlCount"] == 1, audit
      assert audit["controls"][0]["width"] >= 64, audit

      # Verify real CDP click dispatch
      h.click_testid("btn-play")
      assert h.get_state()["clicked"] == 1

      # Verify screenshot + ImageMagick non-blank variance check
      shot = h.capture_screenshot()
      img_stats = h.inspect_image(shot)
      assert img_stats["width"] == 390 and img_stats["height"] == 844, img_stats
      assert img_stats["std_dev"] > 0.05, img_stats

      # Verify 404 tracking catches a missing asset deterministically
      h.eval_js("fetch('./missing_asset_404_probe.bin').then(r => r.status)")
      err_records = h.http_server.get_error_records(ignore_favicon=False)
      assert len(err_records) == 1 and err_records[0].status == 404, err_records

      # Verify strict subpath server catches root-escaped /src/ paths
      sub = RecordedStaticHTTPServer(smoke_dir, strict_subpath="/qq-tang-3d").start()
      try:
        h.clear_diagnostics()
        h.navigate(sub.base_url, wait_qqtang=True)
        assert sub.get_error_records() == [], sub.get_error_records()
        h.eval_js("fetch('/escaped_root_path.js').then(r => r.status)")
        sub_errs = sub.get_error_records()
        assert len(sub_errs) == 1 and sub_errs[0].status == 404, sub_errs
      finally:
        sub.close()

    print(
        "SELF_TEST_OK:",
        json.dumps({
            "webgl2": st["webgl2"],
            "renderer": st["renderer"],
            "portraitViewport": dims,
            "screenshotStats": img_stats,
        }),
    )
    return 0
  finally:
    safe_rmtree(smoke_dir)


if __name__ == "__main__":
  parser = argparse.ArgumentParser(description="QQ Tang 3D E2E Browser Harness")
  parser.add_argument(
      "--self-test",
      action="store_true",
      help="Run standalone /tmp WebGL2 + CDP + HTTP 404 self-verification.",
  )
  args = parser.parse_args()
  if args.self_test:
    sys.exit(run_self_test())
  print("Use --self-test or run python3 tests/run_e2e.py --tier all")
