// Vercel Serverless Function for MOSS-5B Krea Studio (/api/moss)
// Compatible with local server.py API contract

const supabaseConfig = require("../config/supabase.json");
const DEFAULT_GATEWAY_URL = process.env.MOSS_GATEWAY_URL || "";
const DEFAULT_NEGATIVE_PROMPT =
  "worst quality, bad anatomy, extra limbs, fused body, folded body, duplicate person, multiple people, disembodied legs, mutated hands, extra fingers, airbrushed plastic skin, beauty filter, over-smoothed skin, blurry background bokeh, watermark, text, logo, signature";

const ASPECT_DIMS = {
  "16:9": [1344, 768],
  "9:16": [896, 1152],
  "1:1": [1024, 1024],
};

function normalizeBaseUrl(raw) {
  const url = String(raw || DEFAULT_GATEWAY_URL).trim().replace(/\/+$/, "");
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) return `https://${url}`;
  return url;
}

function buildMossWorkflow({ prompt, width = 1344, height = 768, steps = 35, cfg = 2.8, seed = 42 }) {
  return {
    "1": {
      class_type: "UNETLoader",
      inputs: {
        unet_name: "moss_image_sft_int8_convrot.safetensors",
        weight_dtype: "default",
      },
    },
    "5": {
      class_type: "SkipLayerGuidanceDiTSimple",
      inputs: {
        model: ["1", 0],
        double_layers: "",
        single_layers: "22",
        start_percent: 0.0,
        end_percent: 0.5,
      },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: "qwen3.5_9b_int8_convrot.safetensors",
        type: "moss_image",
        device: "default",
      },
    },
    "3": {
      class_type: "VAELoader",
      inputs: {
        vae_name: "flux2-vae.safetensors",
      },
    },
    "4": {
      class_type: "EmptyFlux2LatentImage",
      inputs: {
        width: Number(width) || 1344,
        height: Number(height) || 768,
        batch_size: 1,
      },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: {
        clip: ["2", 0],
        text: String(prompt || ""),
      },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: {
        clip: ["2", 0],
        text: DEFAULT_NEGATIVE_PROMPT,
      },
    },
    "8": {
      class_type: "KSampler",
      inputs: {
        model: ["5", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["4", 0],
        seed: Number(seed) || 42,
        steps: Number(steps) || 35,
        cfg: Number(cfg) || 2.8,
        sampler_name: "euler",
        scheduler: "simple",
        denoise: 1.0,
      },
    },
    "9": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["8", 0],
        vae: ["3", 0],
      },
    },
    "10": {
      class_type: "SaveImage",
      inputs: {
        images: ["9", 0],
        filename_prefix: `moss_studio/moss5b_${Date.now()}`,
      },
    },
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}


async function generationLease(req, action, lease = null) {
  const authorization = String(req.headers?.authorization || "");
  if (!/^Bearer [A-Za-z0-9._-]+$/.test(authorization)) {
    const error = new Error("Please sign in"); error.status = 401; throw error;
  }
  const response = await fetchWithTimeout(`${supabaseConfig.url}/rest/v1/rpc/viora_${action}_generation`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: supabaseConfig.publishableKey, Authorization: authorization },
    body: JSON.stringify(action === "release" ? { claim: lease } : {})
  }, 12000);
  if (response.status === 401 || response.status === 403) {
    const error = new Error("Please sign in again"); error.status = 401; throw error;
  }
  if (!response.ok) { const error = new Error("Queue coordination unavailable"); error.status = 503; throw error; }
  if (action === "release") return null;
  const value = await response.json();
  if (value === null) { const error = new Error("Generation server is busy"); error.status = 409; throw error; }
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/.test(value)) { const error = new Error("Queue coordination unavailable"); error.status = 503; throw error; }
  return value;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const parsedUrl = new URL(req.url || "/", "http://localhost");
  const sp = parsedUrl.searchParams;
  const action = String(sp.get("action") || "").trim().toLowerCase();
  try {
    const bodyObj = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    if (sp.has("gateway_url") || sp.has("comfy_url") || Object.hasOwn(bodyObj, "comfy_url") || Object.hasOwn(bodyObj, "gateway_url")) {
      return res.status(400).json({ error: "Server configuration is not available through this endpoint" });
    }
    if (action === "settings") return res.status(404).json({ error: "Not found" });
    const baseUrl = normalizeBaseUrl(DEFAULT_GATEWAY_URL);
    if (!baseUrl) {
      if (action === "ping") return res.status(200).json({ online: false });
      return res.status(503).json({ error: "Generation server is not configured" });
    }

    if (action === "ping") {
      let online = false;
      let gpu = "";
      let running = 0;
      let pending = 0;
      let queueAvailable = false;
      try {
        const sRes = await fetchWithTimeout(`${baseUrl}/system_stats`, { method: "GET" }, 10000);
        if (sRes.ok) {
          online = true;
          const sData = await sRes.json();
          if (Array.isArray(sData.devices) && sData.devices[0]) {
            gpu = sData.devices[0].name || "";
          }
        }
        const qRes = await fetchWithTimeout(`${baseUrl}/queue`, { method: "GET" }, 8000);
        if (qRes.ok) {
          online = true;
          const qData = await qRes.json();
          if (Array.isArray(qData.queue_running) && Array.isArray(qData.queue_pending)) {
            running = qData.queue_running.length;
            pending = qData.queue_pending.length;
            queueAvailable = true;
          }
        }
      } catch (_) {}
      return res.status(200).json({ online, queue_available: queueAvailable, running, pending });
    }

    if (action === "history_list") {
      return res.status(200).json({ items: [] });
    }

    if (action === "delete") {
      return res.status(200).json({ ok: true });
    }

    if (action === "prompt" && req.method === "POST") {
      const prompt = String(bodyObj.prompt || "").trim();
      if (!prompt) return res.status(400).json({ error: "Prompt cannot be empty" });
      const aspect_ratio = String(bodyObj.aspect_ratio || "16:9");
      const [width, height] = ASPECT_DIMS[aspect_ratio] || [1344, 768];
      const steps = Math.max(10, Math.min(60, Number(bodyObj.steps) || 35));
      const cfg = Number(bodyObj.cfg) || 2.8;
      const seed = Number(bodyObj.seed) || 42;

      const workflow = buildMossWorkflow({ prompt, width, height, steps, cfg, seed });
      const lease = await generationLease(req, "claim");
      let releaseLease = true;
      let data;
      try {
        const queueResponse = await fetchWithTimeout(`${baseUrl}/queue`, { method: "GET" }, 12000);
        if (!queueResponse.ok) return res.status(503).json({ error: "Queue status unavailable" });
        const queue = await queueResponse.json();
        if (!Array.isArray(queue.queue_running) || !Array.isArray(queue.queue_pending)) {
          return res.status(503).json({ error: "Queue status unavailable" });
        }
        if (queue.queue_running.length || queue.queue_pending.length) {
          return res.status(409).json({ error: "Generation server is busy" });
        }
        // A timeout could mean the upstream accepted the request; retain the lease until it expires.
        releaseLease = false;
        const upstream = await fetchWithTimeout(`${baseUrl}/prompt`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: workflow, client_id: `viora_${Date.now()}` })
        }, 20000);
        data = await upstream.json();
        if (!upstream.ok || typeof data.prompt_id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(data.prompt_id)) {
          return res.status(502).json({ error: "Generation request failed" });
        }
        releaseLease = true;
      } finally {
        if (releaseLease) { try { await generationLease(req, "release", lease); } catch (_) {} }
      }

      return res.status(200).json({ ok: true, prompt_id: data.prompt_id, width, height });
    }

    if (action === "status") {
      const promptId = String(sp.get("prompt_id") || "").trim();
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(promptId)) return res.status(400).json({ error: "Invalid prompt_id" });

      const histRes = await fetchWithTimeout(`${baseUrl}/history/${encodeURIComponent(promptId)}`, { method: "GET" }, 12000);
      if (histRes.ok) {
        const histData = await histRes.json();
        const entry = histData && histData[promptId];
        if (entry) {
          if (entry.status && entry.status.status_str === "error") {
            return res.status(200).json({ status: "FAILED", error: "Generation failed" });
          }
          const outputs = entry.outputs || {};
          for (const nodeOut of Object.values(outputs)) {
            const images = nodeOut && nodeOut.images;
            if (Array.isArray(images) && images.length > 0) {
              const viewParams = new URLSearchParams({ action: "view", prompt_id: promptId });
              return res.status(200).json({
                status: "DONE",
                progress: 100,
                item: {
                  id: `moss_${Date.now()}`,
                  prompt_id: promptId,
                  media_url: `/api/moss?${viewParams.toString()}`,
                },
              });
            }
          }
        }
      }

      const qRes = await fetchWithTimeout(`${baseUrl}/queue`, { method: "GET" }, 8000);
      if (qRes.ok) {
        const qData = await qRes.json();
        const running = Array.isArray(qData.queue_running) ? qData.queue_running : [];
        const pending = Array.isArray(qData.queue_pending) ? [...qData.queue_pending].sort((a, b) => (a?.[0] ?? Infinity) - (b?.[0] ?? Infinity)) : [];
        const isRunning = running.some((x) => Array.isArray(x) && x[1] === promptId);
        const pendingIdx = pending.findIndex((x) => Array.isArray(x) && x[1] === promptId);
        if (isRunning) {
          return res.status(200).json({ status: "RUNNING", queue_position: 0, progress: 55, node: "Creating image..." });
        }
        if (pendingIdx >= 0) {
          return res.status(200).json({ status: "QUEUED", queue_position: pendingIdx + 1, queue_ahead: running.length + pendingIdx, progress: 5, node: `Queued in FIFO (#${pendingIdx + 1} waiting)` });
        }
      }
      return res.status(200).json({ status: "RUNNING", progress: 15, node: "Creating image..." });
    }

    if (action === "view") {
      const promptId = String(sp.get("prompt_id") || "").trim();
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(promptId)) return res.status(400).json({ error: "Invalid prompt_id" });
      const histRes = await fetchWithTimeout(`${baseUrl}/history/${encodeURIComponent(promptId)}`, { method: "GET" }, 12000);
      if (!histRes.ok) return res.status(502).json({ error: "Image unavailable" });
      const histData = await histRes.json();
      const outputs = histData?.[promptId]?.outputs || {};
      const img = Object.values(outputs).flatMap(node => Array.isArray(node?.images) ? node.images : [])[0];
      if (!img || typeof img.filename !== "string") return res.status(404).json({ error: "Image unavailable" });
      const params = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder || "", type: img.type || "output" });
      const viewRes = await fetchWithTimeout(`${baseUrl}/view?${params.toString()}`, { method: "GET" }, 60000);
      if (!viewRes.ok) return res.status(502).json({ error: "Image unavailable" });
      const buf = Buffer.from(await viewRes.arrayBuffer());
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).send(buf);
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    if (err.status === 401 || err.status === 409 || err.status === 503) return res.status(err.status).json({ error: err.message });
    return res.status(502).json({ online: false, error: "Generation service unavailable" });
  }
};
