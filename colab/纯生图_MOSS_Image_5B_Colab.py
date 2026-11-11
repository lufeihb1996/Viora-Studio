# -*- coding: utf-8 -*-
"""
MOSS-Image 5B SFT (SLG=22) —— 纯生图极速版 Colab 一键启动脚本
================================================================================
专为 MOSS Studio (frontend/moss) 与 AI Anime Studio 生图工作台打造的极速轻量启动脚本：
- 仅下载 MOSS-Image 5B SFT INT8 三件套（省去 40GB+ 视频与音频大模型，启动速度快 3 倍，L4/A100 均可流畅运行）：
  1. diffusion_models/moss_image_sft_int8_convrot.safetensors
  2. text_encoders/qwen3.5_9b_int8_convrot.safetensors（自动走普通 HTTP 直下，防 Xet 72% 卡死）
  3. vae/flux2-vae.safetensors
- 固定 ComfyUI 提交 + 官方预编译 comfy-kitchen 0.2.39 INT8 Attention 加速
- 支持 CF_TUNNEL_TOKEN 固定域名（可通过 MOSS_PUBLIC_URL 配置地址）；未配置时自动开启 trycloudflare 临时公网隧道
"""

from __future__ import annotations

import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

BASE = Path("/content") if Path("/content").exists() else Path.cwd()
COMFY = BASE / "ComfyUI"
PORT = 8188


# ===== 固定且配套的源码提交号（完整 40 位，不跟随 main 漂移）=====
COMFY_REV = "b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c"
KJNODES_REV = "17195fcfa8a05f601b766a0f09c9733284f47416"
KITCHEN_VERSIONS = ("0.2.39", "0.2.38")

# ===== MOSS-Image 5B SFT 纯生图三件套 =====
MOSS_MODELS = [
    (
        "Comfy-Org/MOSS-Image",
        "main",
        "diffusion_models/moss_image_sft_int8_convrot.safetensors",
        "diffusion_models",
    ),
    (
        "Comfy-Org/MOSS-Image",
        "main",
        "text_encoders/qwen3.5_9b_int8_convrot.safetensors",
        "text_encoders",
    ),
    (
        "Comfy-Org/MOSS-Image",
        "main",
        "vae/flux2-vae.safetensors",
        "vae",
    ),
]

# 固定走普通 HTTP 的分块文件白名单（绕开 Xet CAS 重建 72% 卡死与 429 限流）
FORCE_HTTP_FILES = {
    "qwen3.5_9b_int8_convrot.safetensors",
}


def get_secret(name: str) -> str:
    value = os.getenv(name, "").strip()
    if value:
        return value
    try:
        from google.colab import userdata
        return (userdata.get(name) or "").strip()
    except Exception:
        return ""


def run(args, cwd=None, check=True):
    if isinstance(args, str):
        print("$", args, flush=True)
        p = subprocess.run(args, cwd=cwd, shell=True, check=False)
    else:
        print("$", " ".join(map(str, args)), flush=True)
        p = subprocess.run(list(map(str, args)), cwd=cwd, check=False)

    if check and p.returncode != 0:
        raise RuntimeError("命令失败: " + (args if isinstance(args, str) else " ".join(map(str, args))))
    return p.returncode


def clone_pinned(url: str, path: Path, revision: str):
    if len(revision) != 40 or any(c not in "0123456789abcdef" for c in revision):
        raise ValueError(f"必须提供完整40位Git提交号: {revision}")
    fresh = not path.exists()
    if fresh:
        run(["git", "clone", "--filter=blob:none", "--depth", "1", "--no-checkout", url, str(path)])
    if not (path / ".git").is_dir():
        shutil.rmtree(path, ignore_errors=True)
        run(["git", "clone", "--filter=blob:none", "--depth", "1", "--no-checkout", url, str(path)])
        fresh = True

    current = subprocess.run(
        ["git", "-C", str(path), "rev-parse", "HEAD"],
        text=True, capture_output=True, check=False,
    ).stdout.strip()
    if current == revision:
        ready = subprocess.run(
            ["git", "-C", str(path), "ls-files"],
            text=True, capture_output=True, check=False,
        ).stdout.strip()
        if ready:
            print(f"⏩ 固定版本已就绪：{path.name} @ {revision[:10]}", flush=True)
            return
    elif not fresh:
        dirty = subprocess.run(
            ["git", "-C", str(path), "diff", "--name-only", "HEAD"],
            text=True, capture_output=True, check=False,
        ).stdout.strip()
        if dirty:
            run(["git", "-C", str(path), "stash", "push", "-m", "moss-before-version-pin"], check=False)

    run(["git", "-C", str(path), "remote", "set-url", "origin", url])
    run(["git", "-C", str(path), "fetch", "--depth", "1", "origin", revision])
    run(["git", "-C", str(path), "checkout", "-f", "--detach", revision])
    print(f"✅ 固定版本：{path.name} @ {revision[:10]}", flush=True)


def ensure_cuda():
    code = (
        "import torch;"
        "print('Torch:', torch.__version__);"
        "print('CUDA:', torch.version.cuda);"
        "print('GPU:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NONE');"
        "raise SystemExit(0 if torch.cuda.is_available() else 2)"
    )
    p = subprocess.run([sys.executable, "-c", code], text=True, capture_output=True)
    print(p.stdout, flush=True)
    if p.returncode == 0:
        return
    print("⚠️ 当前 Torch 没有 CUDA，安装官方 cu128...", flush=True)
    run([sys.executable, "-m", "pip", "uninstall", "-y", "torch", "torchvision", "torchaudio"], check=False)
    run([
        sys.executable, "-m", "pip", "install", "-U",
        "torch", "torchvision", "torchaudio",
        "--index-url", "https://download.pytorch.org/whl/cu128",
    ])


def install_if_needed(requirements, req_file=None):
    from importlib.metadata import PackageNotFoundError, version
    try:
        try:
            from packaging.requirements import Requirement
        except ImportError:
            from pip._vendor.packaging.requirements import Requirement
        ready = True
        for raw in requirements:
            raw = raw.strip()
            if not raw or raw.startswith("#"):
                continue
            req = Requirement(raw.split(" #", 1)[0].strip())
            if req.marker and not req.marker.evaluate():
                continue
            if req.url or req.extras:
                ready = False
                break
            try:
                installed = version(req.name)
            except PackageNotFoundError:
                ready = False
                break
            if req.specifier and not req.specifier.contains(installed, prereleases=True):
                ready = False
                break
        if ready:
            print(f"⏩ 依赖版本已满足: {req_file or '基础依赖'}", flush=True)
            return
    except Exception:
        pass
    args = [sys.executable, "-m", "pip", "install", "-q", "--prefer-binary", "--disable-pip-version-check"]
    args += ["-r", str(req_file)] if req_file else list(requirements)
    run(args)


def install_base_dependencies():
    install_if_needed([
        "huggingface_hub<2.0.0",
        "hf-xet",
        "transformers>=4.45.0",
        "safetensors>=0.4.3",
        "tokenizers>=0.19.0",
        "triton",
        "einops",
        "typing_extensions",
        "wheel",
        "setuptools",
    ])


def install_comfy_requirements():
    req = COMFY / "requirements.txt"
    if not req.exists():
        raise RuntimeError("ComfyUI requirements.txt 不存在")
    skip = {"torch", "torchvision", "torchaudio", "triton", "comfy-kitchen"}
    kept = []
    for raw in req.read_text(encoding="utf-8").splitlines():
        s = raw.strip()
        if not s or s.startswith("#"):
            kept.append(raw)
            continue
        name = (
            s.split("=", 1)[0].split("<", 1)[0].split(">", 1)[0].split("[", 1)[0]
            .strip().lower().replace("_", "-")
        )
        if name not in skip:
            kept.append(raw)
    tmp = BASE / "comfy_requirements_no_torch.txt"
    tmp.write_text("\n".join(kept) + "\n", encoding="utf-8")
    install_if_needed(kept, tmp)


def ensure_vsa_kitchen() -> str:
    from importlib.metadata import version
    try:
        cur = version("comfy-kitchen")
        if cur in KITCHEN_VERSIONS:
            print(f"⏩ 官方 comfy-kitchen {cur} 已安装", flush=True)
            return cur
    except Exception:
        pass
    for ver in KITCHEN_VERSIONS:
        print(f"\n⚡ 安装官方预编译 comfy-kitchen {ver}", flush=True)
        rc = run([
            sys.executable, "-m", "pip", "install",
            "--index-url", "https://pypi.org/simple",
            "--only-binary=:all:", "--no-deps", "--force-reinstall",
            "--no-cache-dir", f"comfy-kitchen=={ver}",
        ], check=False)
        if rc == 0:
            return ver
    raise RuntimeError("comfy-kitchen 官方预编译包安装失败")


def verify_moss_modules():
    code = (
        "import sys;"
        f"sys.path.insert(0, {str(COMFY)!r});"
        "import comfy.quant_ops;"
        "from comfy.ldm.moss_image.model import MOSSImage;"
        "from comfy.text_encoders.moss_image import MOSSImageTEModel, MOSSImageTokenizer;"
        "from comfy_extras.nodes_moss_image import MOSSImageLayoutPrompt, MOSSImageControl;"
        "from comfy.text_encoders.qwen35 import Qwen35Transformer;"
        "import comfy_kitchen as ck;"
        "assert ck.int8_attention_is_available(), 'INT8 Attention 不可用';"
        "print('MOSS_IMAGE_5B_CORE_OK')"
    )
    p = subprocess.run([sys.executable, "-c", code], cwd=str(COMFY), text=True, capture_output=True)
    if p.stdout:
        print(p.stdout, flush=True)
    if p.returncode != 0 or "MOSS_IMAGE_5B_CORE_OK" not in p.stdout:
        if p.stderr:
            print(p.stderr[-8000:], flush=True)
        raise RuntimeError("MOSS-Image 5B 核心模块预检失败")
    print("✅ MOSS-Image 5B + Qwen3.5-9B + Kitchen INT8 核心模块预检通过", flush=True)


def install_custom_nodes():
    custom = COMFY / "custom_nodes"
    custom.mkdir(parents=True, exist_ok=True)
    kj_path = custom / "ComfyUI-KJNodes"
    clone_pinned("https://github.com/kijai/ComfyUI-KJNodes.git", kj_path, KJNODES_REV)
    req = kj_path / "requirements.txt"
    if req.exists():
        lines = [
            raw for raw in req.read_text(encoding="utf-8").splitlines()
            if not raw.strip().lower().startswith("torch")
        ]
        if any(x.strip() and not x.strip().startswith("#") for x in lines):
            tmp = BASE / f"req_{kj_path.name}_no_torch.txt"
            tmp.write_text("\n".join(lines) + "\n", encoding="utf-8")
            install_if_needed(lines, tmp)


_EXPECTED_SIZE_CACHE = {}


def expected_size(repo, rev, filename):
    key = (repo, rev, filename)
    if key in _EXPECTED_SIZE_CACHE:
        return _EXPECTED_SIZE_CACHE[key]
    size = None
    try:
        from huggingface_hub import HfApi
        info = HfApi().get_paths_info(
            repo_id=repo, paths=[filename], revision=rev,
            token=get_secret("HF_TOKEN") or None,
        )
        if info:
            size = getattr(info[0], "size", None)
    except Exception:
        pass
    _EXPECTED_SIZE_CACHE[key] = size
    return size


def _disable_hf_xet_runtime():
    os.environ["HF_HUB_DISABLE_XET"] = "1"
    os.environ.pop("HF_XET_HIGH_PERFORMANCE", None)
    try:
        import huggingface_hub.constants as hf_consts
        hf_consts.HF_HUB_DISABLE_XET = True
    except Exception:
        pass
    try:
        import huggingface_hub.utils._runtime as hf_runtime
        hf_runtime._is_xet_available = False
        hf_runtime.is_xet_available = lambda: False
    except Exception:
        pass
    try:
        import huggingface_hub.file_download as hf_fd
        hf_fd.is_xet_available = lambda: False
    except Exception:
        pass


def download_one(item):
    from huggingface_hub import hf_hub_download
    repo, rev, filename, category = item
    dst_dir = COMFY / "models" / category
    dst_dir.mkdir(parents=True, exist_ok=True)
    target = dst_dir / Path(filename).name
    expect = expected_size(repo, rev, filename)

    if target.is_file() and target.stat().st_size > 1024 * 1024:
        got = target.stat().st_size
        if expect is None or got == expect:
            print(f"⏩ 已存在: {target.name} ({got / 1024 ** 3:.2f} GB)", flush=True)
            return target
        target.unlink(missing_ok=True)

    print(f"⬇️ 下载: {target.name}", flush=True)
    downloaded = Path(
        hf_hub_download(
            repo_id=repo,
            revision=rev,
            filename=filename,
            local_dir=str(dst_dir),
            token=get_secret("HF_TOKEN") or None,
        )
    )
    if downloaded.resolve() != target.resolve():
        if target.exists() or target.is_symlink():
            target.unlink()
        try:
            target.symlink_to(downloaded)
        except Exception:
            shutil.copy2(downloaded, target)

    got = target.stat().st_size
    if expect is not None and got != expect:
        raise RuntimeError(f"{target.name} 下载后体积不符：{got} / {expect}")
    print(f"✅ {target.name} ({got / 1024 ** 3:.2f} GB)", flush=True)
    return target


def download_moss_models():
    http_items = [it for it in MOSS_MODELS if Path(it[2]).name in FORCE_HTTP_FILES]
    xet_items = [it for it in MOSS_MODELS if Path(it[2]).name not in FORCE_HTTP_FILES]

    print("\n⬇️ 下载 MOSS-Image 5B SFT 生图三件套...", flush=True)
    failed = []
    if xet_items:
        with ThreadPoolExecutor(max_workers=2) as pool:
            future_map = {pool.submit(download_one, item): item for item in xet_items}
            for f in as_completed(future_map):
                item = future_map[f]
                try:
                    f.result()
                except Exception as exc:
                    print(f"⚠️ Xet 下载切换 HTTP 兜底: {Path(item[2]).name}: {exc}", flush=True)
                    failed.append(item)

    todo = http_items + failed
    if todo:
        _disable_hf_xet_runtime()
        for item in todo:
            download_one(item)

    models_root = COMFY / "models"
    if models_root.is_dir():
        for cache_dir in models_root.rglob(".cache"):
            if cache_dir.is_dir():
                shutil.rmtree(cache_dir, ignore_errors=True)


def wait_port(proc, log_path: Path, timeout=180):
    start = time.time()
    print(f"⏳ 等待 ComfyUI :{PORT}", end="", flush=True)
    while time.time() - start < timeout:
        if proc.poll() is not None:
            if log_path.exists():
                print(log_path.read_text(encoding="utf-8", errors="ignore")[-8000:])
            raise RuntimeError(f"ComfyUI 提前退出 exit={proc.returncode}")
        try:
            with socket.create_connection(("127.0.0.1", PORT), timeout=1):
                print(f" ✅ ({int(time.time() - start)}s)", flush=True)
                return
        except OSError:
            print(".", end="", flush=True)
            time.sleep(1)
    raise RuntimeError("ComfyUI 启动超时")


def verify_moss_nodes():
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/object_info", timeout=30) as response:
        info = json.load(response)
    required = [
        "UNETLoader",
        "CLIPLoader",
        "VAELoader",
        "SkipLayerGuidanceDiTSimple",
        "EmptyFlux2LatentImage",
        "MOSSImageLayoutPrompt",
        "MOSSImageControl",
        "KSampler",
        "VAEDecode",
        "SaveImage",
    ]
    missing = [name for name in required if name not in info]
    if missing:
        raise RuntimeError("缺少 MOSS 生图节点: " + ", ".join(missing))
    print(f"✅ MOSS-Image 5B 全部 {len(required)} 个生图核心节点校验通过！", flush=True)


def launch_tunnel() -> str:
    binary = shutil.which("cloudflared")
    if not binary:
        local = BASE / "cloudflared"
        if not local.is_file() or local.stat().st_size < 1024 * 1024:
            partial = local.with_suffix(".part")
            url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
            subprocess.run(["curl", "-fL", "--retry", "3", "-o", str(partial), url], check=True)
            partial.replace(local)
        local.chmod(0o755)
        binary = str(local)

    token = get_secret("CF_TUNNEL_TOKEN")
    cf_log_path = BASE / "moss_cloudflared.log"
    cf_log = open(cf_log_path, "w", encoding="utf-8")

    if token:
        subprocess.Popen(
            [binary, "tunnel", "--protocol", "http2", "run", "--token", token],
            stdout=cf_log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        time.sleep(3)
        public_url = (get_secret("MOSS_PUBLIC_URL") or os.environ.get("MOSS_PUBLIC_URL", "")).strip()
        print("✅ Cloudflare 固定隧道已启动", flush=True)
        return public_url
    else:
        subprocess.Popen(
            [binary, "tunnel", "--protocol", "http2", "--url", f"http://127.0.0.1:{PORT}"],
            stdout=cf_log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        for _ in range(30):
            time.sleep(1)
            txt = cf_log_path.read_text(encoding="utf-8", errors="ignore")
            m = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", txt)
            if m:
                url = m.group(0)
                print(f"✅ Cloudflare 临时隧道已启动：{url}", flush=True)
                return url
        return f"http://127.0.0.1:{PORT}"


def main():
    if sys.platform != "linux":
        raise RuntimeError("请将此脚本复制到 Google Colab (Linux GPU) 单元格中运行")

    total_start = time.time()
    os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
    os.environ["CUDA_MODULE_LOADING"] = "LAZY"
    os.environ["HF_XET_CHUNK_CACHE_SIZE_BYTES"] = "0"
    os.environ["HF_XET_HIGH_PERFORMANCE"] = "1"

    print("=" * 76, flush=True)
    print("🚀 MOSS-Image 5B SFT (SLG=22) 纯生图极速版 Colab 一键启动", flush=True)
    print("=" * 76, flush=True)

    clone_pinned("https://github.com/Comfy-Org/ComfyUI.git", COMFY, COMFY_REV)
    install_if_needed(["huggingface_hub<2.0.0", "hf-xet"])

    model_pool = ThreadPoolExecutor(max_workers=1)
    model_future = model_pool.submit(download_moss_models)

    try:
        ensure_cuda()
        install_base_dependencies()
        install_comfy_requirements()
        ensure_vsa_kitchen()
        verify_moss_modules()
        install_custom_nodes()
        model_future.result()
    finally:
        model_pool.shutdown(wait=False)

    (COMFY / "input").mkdir(exist_ok=True)
    local_output = COMFY / "output_local"
    local_output.mkdir(exist_ok=True)

    subprocess.run(["pkill", "-9", "-f", "main.py"], check=False)
    subprocess.run(["pkill", "-9", "-f", "cloudflared"], check=False)
    time.sleep(1)

    log_path = BASE / "moss_comfyui.log"
    log_fp = open(log_path, "w", encoding="utf-8")
    cmd = [
        sys.executable, "main.py",
        "--listen", "0.0.0.0",
        "--port", str(PORT),
        "--output-directory", str(local_output),
        "--disable-auto-launch",
        "--enable-cors-header", "*",
        "--async-offload", "2",
        "--reserve-vram", "1.5",
        "--use-ck-attention",
        "--fast", "fp16_accumulation",
    ]
    proc = subprocess.Popen(cmd, cwd=str(COMFY), stdout=log_fp, stderr=subprocess.STDOUT, start_new_session=True)
    wait_port(proc, log_path, timeout=180)
    verify_moss_nodes()

    tunnel_url = launch_tunnel()
    print("\n" + "=" * 76, flush=True)
    print(f"🎉 MOSS-Image 5B 纯生图服务就绪！总耗时 {time.time() - total_start:.1f}s", flush=True)
    if tunnel_url:
        print(f"🌐 管理员请将此地址配置到本地服务或部署环境：{tunnel_url}", flush=True)
    else:
        print("🌐 固定隧道地址请通过 MOSS_PUBLIC_URL 设置，或在管理员配置中使用已知地址。", flush=True)
    print("=" * 76, flush=True)

    while True:
        try:
            time.sleep(30)
        except KeyboardInterrupt:
            break


if __name__ == "__main__":
    main()
