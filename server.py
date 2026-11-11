# -*- coding: utf-8 -*-
"""
MOSS-5B Krea Studio —— 独立本地服务端 (Port 3091)
================================================================
完全独立于 AI_Anime_Studio：
- 静态页面：public/index.html (Krea 2 风格落地页) & public/generate.html (纯生图工作台)
- 接口路由：/api/moss (与 Vercel Serverless api/moss.js 100% 兼容)
- 自动识别 Windows 系统代理 (如 127.0.0.1:5732) 连接 Colab Cloudflare 隧道
- 实时监听 ComfyUI WebSocket 采样步数 (Step 1/35 -> 35/35)，驱动前端 ChatGPT 风格渐进式生成卡片
"""
from __future__ import annotations

import asyncio
import contextlib
import json
import os
import re
import socket
import sys
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
import uvicorn
import websockets
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

ROOT_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT_DIR / "public"
OUTPUTS_DIR = ROOT_DIR / "outputs"
OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
SETTINGS_FILE = ROOT_DIR / "outputs" / "settings.json"
HISTORY_FILE = ROOT_DIR / "outputs" / "history.json"

DEFAULT_GATEWAY_URL = os.environ.get("MOSS_GATEWAY_URL", "").strip().rstrip("/")
DEFAULT_NEGATIVE_PROMPT = (
    "worst quality, bad anatomy, extra limbs, fused body, folded body, "
    "duplicate person, multiple people, disembodied legs, mutated hands, "
    "extra fingers, airbrushed plastic skin, beauty filter, over-smoothed skin, "
    "blurry background bokeh, watermark, text, logo, signature"
)

ASPECT_DIMS = {
    "16:9": (1344, 768),
    "9:16": (896, 1152),
    "1:1": (1024, 1024),
}

NODE_STAGE_LABELS = {
    "1": "Loading MOSS-Image 5B SFT weights...",
    "2": "Encoding prompt with Qwen3.5-9B...",
    "3": "Loading FLUX.2 VAE...",
    "4": "Preparing latent canvas...",
    "5": "Applying SkipLayerGuidance (SLG=22)...",
    "6": "Encoding prompt tokens...",
    "7": "Applying negative guardrails...",
    "8": "Creating image...",
    "9": "Decoding high-res details (FLUX.2 VAE)...",
    "10": "Finalizing image...",
}


def load_settings() -> dict[str, Any]:
    if DEFAULT_GATEWAY_URL:
        return {"comfy_url": DEFAULT_GATEWAY_URL}
    if SETTINGS_FILE.is_file():
        with contextlib.suppress(Exception):
            data = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
            if isinstance(data, dict) and data.get("comfy_url"):
                return data
    return {"comfy_url": DEFAULT_GATEWAY_URL}


def save_settings(comfy_url: str) -> dict[str, Any]:
    clean = str(comfy_url or DEFAULT_GATEWAY_URL).strip().rstrip("/")
    if clean and not clean.startswith(("http://", "https://")):
        clean = f"https://{clean}"
    data = {"comfy_url": clean}
    SETTINGS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data


def load_history() -> list[dict[str, Any]]:
    if HISTORY_FILE.is_file():
        with contextlib.suppress(Exception):
            items = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
            if isinstance(items, list):
                return items
    return []


def save_history(items: list[dict[str, Any]]) -> None:
    HISTORY_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def _local_proxy_alive(proxy_url: str) -> bool:
    parsed = urlparse(proxy_url)
    host = (parsed.hostname or "").strip().lower()
    port = parsed.port
    if host not in {"127.0.0.1", "localhost", "::1"} or not port:
        return True
    try:
        with socket.create_connection((host, port), timeout=0.15):
            return True
    except OSError:
        return False


def resolve_outbound_proxy(target_url: str) -> str | None:
    parsed = urlparse(str(target_url or "").strip())
    host = (parsed.hostname or "").strip().lower()
    if not host or host in {"127.0.0.1", "localhost", "::1"}:
        return None
    for k in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"):
        val = (os.environ.get(k) or "").strip()
        if val:
            if "://" not in val:
                val = f"http://{val}"
            if _local_proxy_alive(val):
                return val
    if sys.platform == "win32":
        with contextlib.suppress(Exception):
            import winreg
            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Internet Settings",
            ) as reg:
                enabled, _ = winreg.QueryValueEx(reg, "ProxyEnable")
                if int(enabled or 0) == 1:
                    raw_server, _ = winreg.QueryValueEx(reg, "ProxyServer")
                    cand = str(raw_server or "").strip()
                    if cand:
                        if "://" not in cand:
                            cand = f"http://{cand}"
                        if _local_proxy_alive(cand):
                            return cand
    return None


def make_http_client(base_url: str, timeout_sec: float = 20.0) -> httpx.AsyncClient:
    proxy_url = resolve_outbound_proxy(base_url)
    return httpx.AsyncClient(
        proxy=proxy_url,
        trust_env=False,
        http2=False,
        follow_redirects=True,
        timeout=httpx.Timeout(timeout_sec, connect=10.0),
    )


def build_moss_workflow(
    prompt: str,
    width: int,
    height: int,
    steps: int,
    cfg: float,
    seed: int,
) -> dict[str, Any]:
    return {
        "1": {
            "class_type": "UNETLoader",
            "inputs": {
                "unet_name": "moss_image_sft_int8_convrot.safetensors",
                "weight_dtype": "default",
            },
        },
        "5": {
            "class_type": "SkipLayerGuidanceDiTSimple",
            "inputs": {
                "model": ["1", 0],
                "double_layers": "",
                "single_layers": "22",
                "start_percent": 0.0,
                "end_percent": 0.5,
            },
        },
        "2": {
            "class_type": "CLIPLoader",
            "inputs": {
                "clip_name": "qwen3.5_9b_int8_convrot.safetensors",
                "type": "moss_image",
                "device": "default",
            },
        },
        "3": {
            "class_type": "VAELoader",
            "inputs": {
                "vae_name": "flux2-vae.safetensors",
            },
        },
        "4": {
            "class_type": "EmptyFlux2LatentImage",
            "inputs": {
                "width": int(width),
                "height": int(height),
                "batch_size": 1,
            },
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "clip": ["2", 0],
                "text": prompt,
            },
        },
        "7": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "clip": ["2", 0],
                "text": DEFAULT_NEGATIVE_PROMPT,
            },
        },
        "8": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["5", 0],
                "positive": ["6", 0],
                "negative": ["7", 0],
                "latent_image": ["4", 0],
                "seed": int(seed),
                "steps": int(steps),
                "cfg": float(cfg),
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": 1.0,
            },
        },
        "9": {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": ["8", 0],
                "vae": ["3", 0],
            },
        },
        "10": {
            "class_type": "SaveImage",
            "inputs": {
                "images": ["9", 0],
                "filename_prefix": f"moss_studio/moss5b_{int(time.time())}",
            },
        },
    }


_pending_meta: dict[str, dict[str, Any]] = {}


async def _watch_comfy_ws(base_url: str, client_id: str, prompt_id: str) -> None:
    """Listen to ComfyUI WebSocket for exact step-by-step KSampler progress."""
    parsed = urlparse(base_url)
    ws_scheme = "wss" if parsed.scheme == "https" else "ws"
    ws_uri = f"{ws_scheme}://{parsed.netloc}/ws?clientId={client_id}"
    proxy_url = resolve_outbound_proxy(base_url)
    deadline = time.time() + 600
    with contextlib.suppress(Exception):
        async with websockets.connect(
            ws_uri,
            proxy=proxy_url,
            max_size=16 * 1024 * 1024,
            open_timeout=15,
        ) as ws:
            while time.time() < deadline and prompt_id in _pending_meta:
                raw = await asyncio.wait_for(ws.recv(), timeout=20.0)
                if isinstance(raw, bytes):
                    continue
                msg = json.loads(raw)
                msg_type = msg.get("type")
                data = msg.get("data") or {}
                if data.get("prompt_id") and data.get("prompt_id") != prompt_id:
                    continue
                meta = _pending_meta.get(prompt_id)
                if not meta:
                    break
                if msg_type == "executing":
                    node_id = str(data.get("node") or "")
                    if not node_id:
                        meta["ws_progress"] = 99
                        meta["ws_node"] = "Finalizing image..."
                        break
                    meta["ws_node"] = NODE_STAGE_LABELS.get(node_id, "Creating image...")
                    if node_id in {"1", "2", "3", "4", "5", "6", "7"}:
                        meta["ws_progress"] = max(int(meta.get("ws_progress") or 6), 8)
                    elif node_id == "9":
                        meta["ws_progress"] = 95
                elif msg_type == "progress":
                    val = int(data.get("value") or 0)
                    maximum = max(1, int(data.get("max") or 35))
                    pct = min(94, max(10, int(10 + (val / maximum) * 84)))
                    meta["ws_step"] = val
                    meta["ws_max"] = maximum
                    meta["ws_progress"] = pct
                    meta["ws_node"] = f"Creating image · Step {val}/{maximum}"
                elif msg_type == "execution_success":
                    meta["ws_progress"] = 99
                    meta["ws_node"] = "Finalizing image..."
                    break


app = FastAPI(title="MOSS-5B Krea Studio Standalone")
@app.get("/outputs/{filename}")
async def output_image(filename: str):
    if not re.fullmatch(r"[A-Za-z0-9_-]+\.png", filename):
        raise HTTPException(404, "Not found")
    path = OUTPUTS_DIR / filename
    if not path.is_file():
        raise HTTPException(404, "Not found")
    return FileResponse(path, media_type="image/png")
app.mount("/assets", StaticFiles(directory=str(PUBLIC_DIR / "assets")), name="assets")


@app.get("/")
async def root_page():
    return FileResponse(PUBLIC_DIR / "index.html", headers={"Cache-Control": "no-store"})


@app.get("/index.html")
async def index_page():
    return FileResponse(PUBLIC_DIR / "index.html", headers={"Cache-Control": "no-store"})


@app.get("/generate.html")
async def generate_page():
    return FileResponse(PUBLIC_DIR / "generate.html", headers={"Cache-Control": "no-store"})


async def _generation_lease(request: Request, action: str, lease: str | None = None) -> str | None:
    authorization = request.headers.get("authorization", "")
    if not re.fullmatch(r"Bearer [A-Za-z0-9._-]+", authorization):
        raise HTTPException(401, "Please sign in")
    try:
        config = json.loads((ROOT_DIR / "config" / "supabase.json").read_text(encoding="utf-8"))
        url = config["url"].rstrip("/")
        headers = {"apikey": config["publishableKey"], "Authorization": authorization}
        payload = {"claim": lease} if action == "release" else {}
        async with make_http_client(url, timeout_sec=12.0) as client:
            response = await client.post(f"{url}/rest/v1/rpc/viora_{action}_generation", headers=headers, json=payload)
        if response.status_code in {401, 403}:
            raise HTTPException(401, "Please sign in again")
        if not response.is_success:
            raise HTTPException(503, "Queue coordination unavailable")
        if action == "release":
            return None
        value = response.json()
        if value is None:
            raise HTTPException(409, "Generation server is busy")
        if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f-]{36}", value):
            raise HTTPException(503, "Queue coordination unavailable")
        return value
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, "Queue coordination unavailable") from exc


@app.api_route("/api/moss", methods=["GET", "POST", "DELETE"])
async def moss_api(request: Request):
    action = (request.query_params.get("action") or "").strip().lower()
    if "gateway_url" in request.query_params or "comfy_url" in request.query_params:
        raise HTTPException(400, "Server configuration is not available through this endpoint")
    if action == "settings":
        raise HTTPException(404, "Not found")
    base_url = str(load_settings().get("comfy_url") or "").rstrip("/")
    if not base_url:
        if action == "ping":
            return JSONResponse({"online": False})
        raise HTTPException(503, "Generation server is not configured")

    if action == "ping":
        online = False
        gpu_name = ""
        running_count = 0
        pending_count = 0
        queue_available = False
        async with make_http_client(base_url, timeout_sec=12.0) as client:
            with contextlib.suppress(Exception):
                r_stats = await client.get(f"{base_url}/system_stats")
                if r_stats.is_success:
                    online = True
                    payload = r_stats.json()
                    devices = payload.get("devices") or []
                    if devices:
                        gpu_name = str(devices[0].get("name", ""))
                r_q = await client.get(f"{base_url}/queue")
                if r_q.is_success:
                    online = True
                    q_data = r_q.json()
                    if isinstance(q_data.get("queue_running"), list) and isinstance(q_data.get("queue_pending"), list):
                        running_count = len(q_data["queue_running"])
                        pending_count = len(q_data["queue_pending"])
                        queue_available = True
        return JSONResponse({
            "online": online,
            "queue_available": queue_available,
            "running": running_count,
            "pending": pending_count,
        })

    if action in {"history_list", "delete"}:
        raise HTTPException(404, "Not found")

    if action == "prompt" and request.method == "POST":
        body = await request.json()
        prompt_text = str(body.get("prompt") or "").strip()
        if not prompt_text:
            raise HTTPException(400, "Prompt cannot be empty")
        aspect_ratio = str(body.get("aspect_ratio") or "16:9")
        width, height = ASPECT_DIMS.get(aspect_ratio, (1344, 768))
        steps = max(10, min(60, int(body.get("steps") or 35)))
        cfg = float(body.get("cfg") or 2.8)
        seed = int(body.get("seed") or 42)
        if "comfy_url" in body or "gateway_url" in body:
            raise HTTPException(400, "Server configuration is not available through this endpoint")

        workflow = build_moss_workflow(
            prompt=prompt_text,
            width=width,
            height=height,
            steps=steps,
            cfg=cfg,
            seed=seed,
        )
        client_id = f"moss_krea_{uuid.uuid4().hex[:10]}"
        lease = await _generation_lease(request, "claim")
        release_lease = True
        try:
            async with make_http_client(base_url, timeout_sec=25.0) as client:
                try:
                    queue_response = await client.get(f"{base_url}/queue")
                    if not queue_response.is_success:
                        raise HTTPException(503, "Queue status unavailable")
                    queue = queue_response.json()
                    running, pending = queue.get("queue_running"), queue.get("queue_pending")
                    if not isinstance(running, list) or not isinstance(pending, list):
                        raise HTTPException(503, "Queue status unavailable")
                    if running or pending:
                        raise HTTPException(409, "Generation server is busy")
                    # If submission times out, retain the short lease: the upstream may have accepted it.
                    release_lease = False
                    r = await client.post(f"{base_url}/prompt", json={"prompt": workflow, "client_id": client_id})
                except HTTPException:
                    raise
                except Exception as exc:
                    raise HTTPException(503, "Generation server unavailable") from exc
                if not r.is_success:
                    raise HTTPException(502, "Generation server rejected the request")
                data = r.json()
                prompt_id = data.get("prompt_id")
                if not isinstance(prompt_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", prompt_id):
                    raise HTTPException(502, "Generation server returned an invalid response")
                release_lease = True
        finally:
            if release_lease:
                with contextlib.suppress(Exception):
                    await _generation_lease(request, "release", lease)

        _pending_meta[prompt_id] = {
            "prompt_id": prompt_id,
            "client_id": client_id,
            "prompt": prompt_text,
            "aspect_ratio": aspect_ratio,
            "width": width,
            "height": height,
            "steps": steps,
            "cfg": cfg,
            "seed": seed,
            "image_model": "moss_image_5b",
            "submitted_at": time.time(),
            "ws_progress": 4,
            "ws_step": 0,
            "ws_max": steps,
            "ws_node": "Starting generation...",
        }
        asyncio.create_task(_watch_comfy_ws(base_url, client_id, prompt_id))
        return JSONResponse({
            "ok": True,
            "prompt_id": prompt_id,
            "width": width,
            "height": height,
        })

    if action == "status":
        prompt_id = (request.query_params.get("prompt_id") or "").strip()
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", prompt_id):
            raise HTTPException(400, "Invalid prompt_id")

        existing_items = load_history()
        for it in existing_items:
            if it.get("prompt_id") == prompt_id:
                media_url = str(it.get("media_url") or "")
                if re.fullmatch(r"/outputs/[A-Za-z0-9_-]+\.png", media_url):
                    return JSONResponse({"status": "DONE", "progress": 100, "item": {
                        "prompt_id": prompt_id, "media_url": media_url, "elapsed": it.get("elapsed")
                    }})

        async with make_http_client(base_url, timeout_sec=20.0) as client:
            with contextlib.suppress(Exception):
                r_hist = await client.get(f"{base_url}/history/{prompt_id}")
                if r_hist.is_success:
                    hist_data = r_hist.json()
                    entry = hist_data.get(prompt_id) if isinstance(hist_data, dict) else None
                    if isinstance(entry, dict):
                        st = entry.get("status") or {}
                        if st.get("status_str") == "error":
                            _pending_meta.pop(prompt_id, None)
                            return JSONResponse({
                                "status": "FAILED",
                                "error": "Generation failed",
                            })
                        outputs = entry.get("outputs") or {}
                        for node_out in outputs.values():
                            images = (node_out or {}).get("images") or []
                            if images:
                                img_info = images[0]
                                filename = img_info.get("filename", "")
                                subfolder = img_info.get("subfolder", "")
                                img_type = img_info.get("type", "output")
                                r_view = await client.get(
                                    f"{base_url}/view",
                                    params={"filename": filename, "subfolder": subfolder, "type": img_type},
                                    timeout=60.0,
                                )
                                if r_view.is_success:
                                    local_name = f"moss5b_{int(time.time())}_{uuid.uuid4().hex[:6]}.png"
                                    local_path = OUTPUTS_DIR / local_name
                                    local_path.write_bytes(r_view.content)
                                    meta = _pending_meta.pop(prompt_id, {})
                                    elapsed = round(max(1.0, time.time() - float(meta.get("submitted_at") or time.time())), 1)
                                    new_item = {
                                        "id": f"moss_{int(time.time() * 1000)}",
                                        "prompt_id": prompt_id,
                                        "prompt": meta.get("prompt", ""),
                                        "aspect_ratio": meta.get("aspect_ratio", "16:9"),
                                        "width": meta.get("width", 1344),
                                        "height": meta.get("height", 768),
                                        "steps": meta.get("steps", 35),
                                        "cfg": meta.get("cfg", 2.8),
                                        "seed": meta.get("seed", 42),
                                        "elapsed": elapsed,
                                        "image_model": "moss_image_5b",
                                        "media_url": f"/outputs/{local_name}",
                                        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                                    }
                                    items = load_history()
                                    items.insert(0, new_item)
                                    save_history(items)
                                    return JSONResponse({"status": "DONE", "progress": 100, "item": {"prompt_id": prompt_id, "media_url": new_item["media_url"], "elapsed": elapsed}})

            with contextlib.suppress(Exception):
                r_q = await client.get(f"{base_url}/queue")
                if r_q.is_success:
                    q_data = r_q.json()
                    running = q_data.get("queue_running") or []
                    pending = q_data.get("queue_pending") or []
                    is_running = any(isinstance(x, list) and len(x) > 1 and x[1] == prompt_id for x in running)
                    pending = sorted(pending, key=lambda x: x[0] if isinstance(x, list) and x and isinstance(x[0], (int, float)) else float("inf"))
                    pending_idx = next(
                        (i for i, x in enumerate(pending) if isinstance(x, list) and len(x) > 1 and x[1] == prompt_id),
                        -1,
                    )
                    meta = _pending_meta.get(prompt_id) or {}
                    elapsed = max(1.0, time.time() - float(meta.get("submitted_at") or time.time()))
                    if is_running:
                        ws_pct = int(meta.get("ws_progress") or 0)
                        ws_step = int(meta.get("ws_step") or 0)
                        ws_max = int(meta.get("ws_max") or meta.get("steps") or 35)
                        ws_node = str(meta.get("ws_node") or "")
                        if ws_pct > 8:
                            pct = ws_pct
                            node_txt = ws_node or f"Creating image · Step {ws_step}/{ws_max}"
                        else:
                            pct = min(94, max(8, int((elapsed / 65.0) * 90)))
                            est_step = min(ws_max, max(1, int((pct / 95.0) * ws_max)))
                            node_txt = f"Creating image · Step {est_step}/{ws_max}"
                        return JSONResponse({
                            "status": "RUNNING",
                            "queue_position": 0,
                            "progress": pct,
                            "step": ws_step or min(ws_max, max(1, int((pct / 95.0) * ws_max))),
                            "max_steps": ws_max,
                            "elapsed": round(elapsed, 1),
                            "node": "Creating image...",
                        })
                    if pending_idx >= 0:
                        return JSONResponse({
                            "status": "QUEUED",
                            "queue_position": pending_idx + 1,
                            "queue_ahead": len(running) + pending_idx,
                            "progress": 3,
                            "elapsed": round(elapsed, 1),
                            "node": f"Waiting in queue (#{pending_idx + 1})",
                        })

        meta = _pending_meta.get(prompt_id) or {}
        return JSONResponse({
            "status": "RUNNING",
            "progress": int(meta.get("ws_progress") or 8),
            "node": "Creating image...",
        })

    raise HTTPException(400, f"Unknown action: {action}")


if __name__ == "__main__":
    print("=" * 64)
    print("🚀 MOSS-5B Krea Studio (Standalone) 已启动:")
    print("👉 首页 (Krea 2 Landing):  http://127.0.0.1:3091/")
    print("👉 工作台 (Generate UI):   http://127.0.0.1:3091/generate.html")
    print("=" * 64)
    uvicorn.run(app, host="127.0.0.1", port=3091, log_level="info")
