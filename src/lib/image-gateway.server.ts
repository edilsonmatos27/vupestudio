// Server-only client for image generation/editing through the managed Lovable AI Gateway.
import { createParser } from "eventsource-parser";
import { OPENAI_SIZE, type ModelInfo } from "./models";

const BASE_URL = "https://ai.gateway.lovable.dev";

export class GatewayError extends Error {
  constructor(public status: number, public code: string, message: string, public retryable = false) {
    super(message);
  }
}

export type InputImage = { bytes: Uint8Array; mime: string; name: string };
export type ImageParams = { aspect?: string; quality?: string; transparent?: boolean };

function b64(bytes: Uint8Array) {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

function apiKey() {
  const k = process.env["LOVABLE_API_KEY"];
  if (!k) throw new GatewayError(401, "config", "Integração de IA não configurada no servidor.");
  return k;
}

function friendly(status: number, raw: string, code?: string): GatewayError {
  if (code === "content_policy_violation" || code === "moderation_blocked")
    return new GatewayError(400, "moderation", "O pedido foi recusado pela política de conteúdo do modelo. Ajuste a descrição (evite personagens protegidos ou pessoas reais identificáveis).");
  if (status === 402) return new GatewayError(402, "operational_balance", "O saldo operacional de IA do projeto se esgotou. O administrador precisa recarregar os créditos do projeto.");
  if (status === 403) return new GatewayError(403, "model_denied", "Este modelo não está liberado para o projeto no momento.");
  if (status === 429) return new GatewayError(429, "rate_limited", "Muitas solicitações ao serviço de IA. Tente novamente em instantes.", true);
  if (status >= 500) return new GatewayError(status, "upstream", "O serviço de IA está indisponível no momento.", true);
  return new GatewayError(status, "bad_request", raw ? `O modelo recusou a solicitação: ${raw.slice(0, 240)}` : "Solicitação inválida para o modelo.");
}

function buildRequest(model: ModelInfo, prompt: string, images: InputImage[], params: ImageParams, stream: boolean): { url: string; init: RequestInit } {
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey()}`, "X-Lovable-AIG-SDK": "fetch" };
  if (model.format === "openai") {
    const size = params.aspect ? OPENAI_SIZE[params.aspect] ?? "auto" : "auto";
    if (images.length === 0) {
      const body: Record<string, unknown> = { model: model.id, prompt, size };
      if (params.quality && model.qualities.includes(params.quality)) body["quality"] = params.quality;
      if (model.transparency && params.transparent) {
        body["background"] = "transparent";
        body["output_format"] = "png";
      }
      if (stream) {
        body["stream"] = true;
        body["partial_images"] = 1;
      }
      return { url: `${BASE_URL}/v1/images/generations`, init: { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) } };
    }
    const form = new FormData();
    form.set("model", model.id);
    form.set("prompt", prompt);
    form.set("size", size);
    if (params.quality && model.qualities.includes(params.quality)) form.set("quality", params.quality);
    if (model.transparency && params.transparent) {
      form.set("background", "transparent");
      form.set("output_format", "png");
    }
    for (const img of images) form.append("image[]", new File([img.bytes], img.name, { type: img.mime }));
    if (stream) {
      form.set("stream", "true");
      form.set("partial_images", "1");
    }
    return { url: `${BASE_URL}/v1/images/edits`, init: { method: "POST", headers, body: form } };
  }
  let body: Record<string, unknown>;
  if (model.format === "generate-content") {
    body = {
      model: model.id,
      contents: [{ role: "user", parts: [{ text: prompt }, ...images.map((i) => ({ inlineData: { mimeType: i.mime, data: b64(i.bytes) } }))] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    };
  } else {
    body = {
      model: model.id,
      messages: [
        {
          role: "user",
          content: images.length
            ? [{ type: "text", text: prompt }, ...images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mime};base64,${b64(i.bytes)}` } }))]
            : prompt,
        },
      ],
      modalities: ["image", "text"],
    };
    if (params.aspect && model.aspects.includes(params.aspect)) body["image_config"] = { aspect_ratio: params.aspect };
  }
  if (stream) body["stream"] = true;
  return { url: `${BASE_URL}/v1/images/generations`, init: { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) } };
}

async function once(model: ModelInfo, prompt: string, images: InputImage[], params: ImageParams, stream: boolean): Promise<string | null> {
  const { url, init } = buildRequest(model, prompt, images, params, stream);
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let code: string | undefined;
    let msg = text;
    try {
      const j = JSON.parse(text);
      code = j?.error?.code;
      msg = j?.error?.message ?? j?.message ?? text;
    } catch {}
    throw friendly(res.status, msg, code);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (!stream || !ct.includes("text/event-stream")) {
    const j = (await res.json()) as any;
    return j?.data?.[0]?.b64_json ?? null;
  }
  let final: string | null = null;
  let events = 0;
  let streamErr: GatewayError | null = null;
  const parser = createParser({
    onEvent(ev) {
      if (!ev.data || ev.data === "[DONE]") return;
      events++;
      let p: any;
      try {
        p = JSON.parse(ev.data);
      } catch {
        return;
      }
      const type = p?.type ?? ev.event;
      if (ev.event === "error" || type === "error") {
        streamErr = friendly(400, p?.error?.message ?? "", p?.error?.code);
        return;
      }
      if (typeof type === "string" && type.endsWith(".completed") && p?.b64_json) final = p.b64_json;
    },
  });
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.feed(dec.decode(value, { stream: true }));
  }
  if (streamErr) throw streamErr;
  if (!final && events === 0) return once(model, prompt, images, params, false);
  if (!final) throw new GatewayError(502, "no_image", "O modelo encerrou sem entregar a imagem final.");
  return final;
}

/** Runs one image request; retries only transient failures (429/5xx) with bounded backoff. */
export async function runImageModel(model: ModelInfo, prompt: string, images: InputImage[], params: ImageParams) {
  let attempt = 0;
  for (;;) {
    try {
      const b = await once(model, prompt, images, params, true);
      if (!b) throw new GatewayError(502, "no_image", "O modelo não retornou imagem.");
      const bin = atob(b);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    } catch (e) {
      if (e instanceof GatewayError && e.retryable && attempt < 2) {
        attempt++;
        await new Promise((r) => setTimeout(r, 1500 * attempt + Math.random() * 500));
        continue;
      }
      throw e;
    }
  }
}

export async function listGatewayImageModels(): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/v1/models`, { headers: { Authorization: `Bearer ${apiKey()}` } });
  if (!res.ok) throw new GatewayError(res.status, "catalog", "Não foi possível consultar o catálogo de modelos.");
  const j = (await res.json()) as any;
  return (j?.data ?? []).filter((m: any) => m?.modalities?.output?.includes("image")).map((m: any) => m.id as string);
}
