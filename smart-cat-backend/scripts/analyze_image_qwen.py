#!/usr/bin/env python3
"""Forward image analysis requests to a Nexa OpenAI-compatible server."""
import argparse
import base64
import binascii
import io
import json
import math
import os
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, Optional

from PIL import Image, ImageStat

DEFAULT_BASE_URL = (
    os.environ.get("LOCAL_VISION_SERVER_URL")
    or os.environ.get("LOCAL_LLM_SERVER_URL")
    or os.environ.get("NEXA_BASE_URL")
    or "http://127.0.0.1:18181"
)


def env_int(name: str) -> Optional[int]:
    raw = os.environ.get(name)
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def env_float(name: str) -> Optional[float]:
    raw = os.environ.get(name)
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def resolve_timeout(default_ms: int = 240_000) -> float:
    raw = os.environ.get("LOCAL_VISION_TIMEOUT_MS")
    try:
        value_ms = int(raw) if raw else default_ms
    except ValueError:
        value_ms = default_ms
    if value_ms <= 0:
        return 0.0
    value_sec = value_ms / 1000.0
    return max(10.0, min(value_sec, 360.0))


def resolve_max_side() -> int:
    raw = os.environ.get("LOCAL_VISION_MAX_IMAGE_SIDE", "").strip()
    if not raw:
        return 640
    try:
        value = int(raw)
    except ValueError:
        return 640
    return max(256, min(value, 2048))


@dataclass
class Payload:
    image_base64: str
    prompt: str
    language: str
    mime_type: str


def load_payload() -> Payload:
    raw = sys.stdin.read()
    if not raw.strip():
        raise SystemExit("No JSON payload provided on stdin")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Failed to parse JSON payload: {exc}") from exc
    if not isinstance(data, dict):
        raise SystemExit("JSON payload must be an object")
    image_b64 = data.get("imageBase64") or ""
    if not isinstance(image_b64, str) or not image_b64.strip():
        raise SystemExit("imageBase64 must be provided")
    prompt = data.get("prompt") or ""
    language = data.get("language") or ""
    mime_type = data.get("mimeType") or ""
    return Payload(
        image_base64=image_b64.strip(),
        prompt=str(prompt),
        language=str(language),
        mime_type=str(mime_type) or "image/png",
    )


def decode_image(image_b64: str) -> Image.Image:
    try:
        binary = base64.b64decode(image_b64, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise SystemExit(f"Failed to decode base64 image: {exc}") from exc
    buffer = io.BytesIO(binary)
    try:
        image = Image.open(buffer)
    except (OSError, ValueError) as exc:
        raise SystemExit(f"Failed to load image: {exc}") from exc
    if image.mode != "RGB":
        image = image.convert("RGB")
    return image


def evaluate_image_quality(image: Image.Image) -> str:
    grayscale = image.convert("L")
    stats = ImageStat.Stat(grayscale)
    mean = stats.mean[0]
    stddev = stats.stddev[0]
    histogram = grayscale.histogram()
    total = sum(histogram) or 1
    dark_ratio = sum(histogram[:24]) / total
    bright_ratio = sum(histogram[-24:]) / total

    entropy = 0.0
    for count in histogram:
        if count:
            probability = count / total
            entropy -= probability * math.log2(probability)

    min_pixel, max_pixel = grayscale.getextrema()
    contrast = max_pixel - min_pixel

    if dark_ratio > 0.95 and mean < 20 and stddev < 10:
        return "too_dark"
    if bright_ratio > 0.95 and mean > 235 and stddev < 10:
        return "too_bright"
    if contrast < 15 and stddev < 12:
        return "low_contrast"
    if entropy < 1.0:
        return "low_entropy"
    return "ok"


def resize_if_needed(image: Image.Image, max_side: int) -> Image.Image:
    width, height = image.size
    largest = max(width, height)
    if largest <= max_side:
        return image
    scale = max_side / float(largest)
    new_size = (int(width * scale), int(height * scale))
    return image.resize(new_size, Image.LANCZOS)


def encode_image(image: Image.Image, mime_type: str) -> str:
    buffer = io.BytesIO()
    format_map = {
        "image/jpeg": "JPEG",
        "image/jpg": "JPEG",
        "image/png": "PNG",
        "image/webp": "WEBP",
    }
    pil_format = format_map.get(mime_type.lower(), "PNG")
    image.save(buffer, format=pil_format)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def extract_completion_text(choice: Optional[Dict[str, Any]]) -> str:
    if not choice:
        return ""
    message = choice.get("message")
    if not isinstance(message, dict):
        return ""
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        segments = []
        for item in content:
            if isinstance(item, str):
                segments.append(item)
            elif isinstance(item, dict):
                for key in ("text", "content", "value"):
                    value = item.get(key)
                    if isinstance(value, str):
                        segments.append(value)
                        break
        return "".join(segments).strip()
    if isinstance(content, dict):
        value = content.get("text")
        if isinstance(value, str):
            return value.strip()
    return ""


def build_prompt(prompt: str, language: str) -> str:
    language = language.lower()
    trimmed = prompt.strip()
    if len(trimmed) > 200:
        trimmed = f"{trimmed[:200]}…"
    caution = (
        'Return JSON only in the format {"catVisible": true|false, "summary": "...", "careTips": "..."}. If no cat is visible, respond exactly {"catVisible":false,"summary":"","careTips":""} and nothing else. If the scene is unclear or too dark/blurry, say so explicitly—never guess.'
        if not language.startswith("zh")
        else '僅能輸出 JSON：{"catVisible": true|false, "summary": "...", "careTips": "..."}。若沒有貓咪，必須回覆 {"catVisible":false,"summary":"","careTips":""} 並立即結束。畫面模糊或過暗要直接說明，禁止臆測。'
    )
    if trimmed:
        return f"{trimmed}\n\n{caution}"
    return caution


def build_system_prompt(language: str) -> str:
    language = language.lower()
    if language.startswith("zh"):
        return (
            "你是 Smart Cat Home 的視覺檢查助手。回覆必須是純 JSON："
            '{"catVisible": true|false, "summary": "...", "careTips": "..."}。'
            "若畫面沒有看到真實貓咪，就輸出 {" + '"catVisible":false,"summary":"","careTips":""' + "} 並停止，絕對不能杜撰細節。"
        )
    return (
        "You are the Smart Cat Home vision assistant. Respond ONLY with JSON matching "
        '{"catVisible": true|false, "summary": "...", "careTips": "..."} and nothing more. '
        "If no real cat is visible, return {" + '"catVisible":false,"summary":"","careTips":""' + "} and stop—never hallucinate details."
    )


def parse_json_response(raw: str) -> Optional[Dict[str, Any]]:
    if not raw:
        return None
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`").strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    return data


def main() -> None:
    parser = argparse.ArgumentParser(description="Proxy vision analysis to Nexa server")
    parser.add_argument("--model", required=True, help="Model identifier registered with the Nexa server")
    parser.add_argument("--base-url", dest="base_url", default=DEFAULT_BASE_URL, help="Nexa server base URL")
    parser.add_argument("--api-key", dest="api_key", default=os.environ.get("LOCAL_VISION_SERVER_KEY") or os.environ.get("LOCAL_LLM_SERVER_KEY"), help="Optional bearer token")
    parser.add_argument("--max-tokens", "--max_tokens", type=int, default=env_int("LOCAL_VISION_MAX_TOKENS"), help="Maximum new tokens to request")
    parser.add_argument("--temperature", type=float, default=env_float("LOCAL_VISION_TEMPERATURE"), help="Generation temperature")
    parser.add_argument("--top-p", type=float, default=env_float("LOCAL_VISION_TOP_P"), help="Top-p sampling value")
    parser.add_argument("--timeout", type=float, default=resolve_timeout(), help="Request timeout in seconds (0 to disable)")
    args = parser.parse_args()

    payload = load_payload()
    image = decode_image(payload.image_base64)
    quality = evaluate_image_quality(image)
    if quality != "ok":
        if quality == "too_dark":
            message = (
                "The photo appears almost completely dark, so I can’t see the habitat. Please retake it with more light."
                if not payload.language.lower().startswith("zh")
                else "影像幾乎全黑，看不到貓咪環境，請在光線足夠時重新拍攝。"
            )
        elif quality == "too_bright":
            message = (
                "The photo is overexposed, so no details are visible. Please adjust the lighting and try again."
                if not payload.language.lower().startswith("zh")
                else "影像幾乎全白或過曝，看不到細節，請調整曝光後再拍攝。"
            )
        else:
            message = (
                "The photo doesn’t contain enough detail to analyse. Please retake it closer or describe the situation in text."
                if not payload.language.lower().startswith("zh")
                else "影像細節不足，無法判讀。請重新拍一張更清楚的照片或改用文字描述。"
            )
        print(message.strip())
        return

    image = resize_if_needed(image, resolve_max_side())
    encoded = encode_image(image, payload.mime_type)

    base_url = args.base_url.rstrip("/")
    headers = {"Content-Type": "application/json"}
    if args.api_key:
        headers["Authorization"] = f"Bearer {args.api_key}"

    request_body: Dict[str, Any] = {
        "model": args.model,
        "messages": [
            {"role": "system", "content": build_system_prompt(payload.language)},
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{payload.mime_type};base64,{encoded}"},
                    },
                    {"type": "text", "text": build_prompt(payload.prompt, payload.language)},
                ],
            },
        ],
    }
    if args.max_tokens:
        request_body["max_tokens"] = int(args.max_tokens)
    if args.temperature is not None:
        request_body["temperature"] = float(args.temperature)
    if args.top_p is not None:
        request_body["top_p"] = float(args.top_p)

    data = json.dumps(request_body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(f"{base_url}/v1/chat/completions", data=data, headers=headers, method="POST")
    timeout = None if args.timeout <= 0 else args.timeout

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore").strip()
        print(f"[analyze_image_qwen] HTTP {exc.code}: {detail}", file=sys.stderr)
        raise SystemExit(1) from exc
    except urllib.error.URLError as exc:
        print(f"[analyze_image_qwen] Request failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc

    try:
        data = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError:
        print("[analyze_image_qwen] Failed to decode Nexa response JSON.", file=sys.stderr)
        raise SystemExit(1)

    text = extract_completion_text(data.get("choices", [{}])[0])
    if not text:
        print("[analyze_image_qwen] Nexa response contained no assistant content.", file=sys.stderr)
        raise SystemExit(1)
    parsed = parse_json_response(text)
    if not parsed:
        print("這張照片目前無法判讀，請換張更清楚的照片或直接描述你觀察到的狀況。")
        return
    if not parsed.get("catVisible"):
        print("未看到貓咪，請重新拍攝或改用文字描述。")
        return
    summary = (parsed.get("summary") or "").strip()
    care = (parsed.get("careTips") or "").strip()
    combined = "\n\n".join([part for part in (summary, care) if part])
    if combined:
        print(combined.strip())
        return
    print("這張照片的資訊有限，請再補充描述或提供另一張照片。")


if __name__ == "__main__":
    main()
