#!/usr/bin/env python3
"""Thin wrapper that forwards chat completions to a Nexa OpenAI-compatible server."""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

DEFAULT_BASE_URL = (
    os.environ.get("LOCAL_LLM_SERVER_URL")
    or os.environ.get("NEXA_BASE_URL")
    or "http://127.0.0.1:18181"
)

def default_timeout() -> float:
    raw = os.environ.get("LOCAL_LLM_TIMEOUT_MS") or "120000"
    try:
        value_ms = int(raw)
    except ValueError:
        value_ms = 120000
    if value_ms <= 0:
        return 0.0
    # clamp to 10s..300s for safety
    value_sec = value_ms / 1000.0
    return max(10.0, min(value_sec, 300.0))


def read_messages() -> List[Dict[str, Any]]:
    raw = sys.stdin.read()
    if not raw.strip():
        raise SystemExit("No messages provided on stdin")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:  # pragma: no cover - CLI validation
        raise SystemExit(f"Failed to parse messages JSON: {exc}") from exc
    if not isinstance(data, list):
        raise SystemExit("Messages JSON must be a list")
    return data


REASONING_TYPES = {
    "thinking",
    "reasoning",
    "analysis",
    "internal",
    "chain_of_thought",
    "cot",
    "reflection",
    "thought",
}

ASSISTANT_TEXT_TYPES = {
    "",
    "text",
    "output",
    "message",
    "assistant",
    "assistant_response",
    "final",
    "reply",
}

SKIP_TYPES = {
    "tool",
    "tool_result",
    "function",
    "function_call",
    "tool_call",
}


def _flatten_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        parts: List[str] = []
        for item in value:
            flattened = _flatten_text(item)
            if flattened:
                parts.append(flattened)
        return "\n".join(parts).strip()
    if isinstance(value, dict):
        for key in ("text", "content", "value", "message", "reasoning", "thinking", "thought"):
            if key in value:
                flattened = _flatten_text(value.get(key))
                if flattened:
                    return flattened
    return ""


def extract_completion_parts(choice: Optional[Dict[str, Any]]) -> Tuple[str, str]:
    if not choice:
        return "", ""

    message = choice.get("message")
    content_text = ""
    thinking_text = ""

    if isinstance(message, dict):
        content = message.get("content")
        reasoning_parts: List[str] = []
        answer_parts: List[str] = []

        if isinstance(content, list):
            for item in content:
                if isinstance(item, dict):
                    item_type = str(item.get("type") or "").strip().lower()
                    text_value = _flatten_text(item.get("text") if "text" in item else item)
                    if not text_value:
                        # Try other nested keys if direct text missing
                        text_value = _flatten_text(item)
                    if not text_value:
                        continue
                    if item_type in SKIP_TYPES:
                        continue
                    if item_type in REASONING_TYPES:
                        reasoning_parts.append(text_value)
                    elif item_type in ASSISTANT_TEXT_TYPES:
                        answer_parts.append(text_value)
                    else:
                        # Unrecognized type: treat reasoning-like types specially if keyword present
                        lowered = text_value.lower()
                        if "think" in item_type or "reason" in item_type:
                            reasoning_parts.append(text_value)
                        else:
                            answer_parts.append(text_value)
                else:
                    flattened = _flatten_text(item)
                    if flattened:
                        answer_parts.append(flattened)

            if answer_parts:
                content_text = "\n".join(answer_parts).strip()
            else:
                content_text = _flatten_text(content)

            if not thinking_text and reasoning_parts:
                thinking_text = "\n\n".join(reasoning_parts).strip()
        else:
            content_text = _flatten_text(content)

        for key in ("thinking", "reasoning", "analysis", "internal", "thought"):
            if key in message:
                thinking_text = _flatten_text(message.get(key))
                if thinking_text:
                    break

    if not thinking_text:
        for key in ("thinking", "reasoning", "analysis"):
            if key in choice:
                thinking_text = _flatten_text(choice.get(key))
                if thinking_text:
                    break

    if not thinking_text:
        metadata = choice.get("metadata")
        if isinstance(metadata, dict):
            for key in ("thinking", "reasoning", "analysis"):
                if key in metadata:
                    thinking_text = _flatten_text(metadata.get(key))
                    if thinking_text:
                        break

    return content_text.strip(), thinking_text.strip()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Proxy chat completions to Nexa server")
    parser.add_argument("--model", required=True, help="Model identifier registered with the Nexa server")
    parser.add_argument("--base-url", dest="base_url", default=DEFAULT_BASE_URL, help="Nexa server base URL")
    parser.add_argument("--api-key", dest="api_key", default=os.environ.get("LOCAL_LLM_SERVER_KEY"), help="Optional bearer token")
    parser.add_argument("--max-tokens", "--max_tokens", type=int, default=None, help="Max new tokens to request")
    parser.add_argument("--temperature", type=float, default=None, help="Generation temperature")
    parser.add_argument("--top-p", type=float, default=None, help="Top-p sampling value")
    parser.add_argument("--top-k", type=int, default=None, help="Top-k sampling value")
    parser.add_argument("--min-p", type=float, default=None, help="Min-p sampling value")
    parser.add_argument("--enable-thinking", dest="enable_thinking", action="store_true", help="Enable thinking mode")
    parser.add_argument("--disable-thinking", dest="enable_thinking", action="store_false", help="Disable thinking mode")
    parser.set_defaults(enable_thinking=None)
    parser.add_argument(
        "--reasoning-effort",
        dest="reasoning_effort",
        choices=["low", "medium", "high"],
        help="Override the model's reasoning effort",
    )
    parser.add_argument("--timeout", type=float, default=default_timeout(), help="Request timeout in seconds (0 to disable)")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    messages = read_messages()
    payload: Dict[str, Any] = {
        "model": args.model,
        "messages": messages,
    }
    if args.max_tokens is not None and args.max_tokens > 0:
        payload["max_tokens"] = int(args.max_tokens)
    if args.temperature is not None and args.temperature >= 0:
        payload["temperature"] = float(args.temperature)
    if args.top_p is not None and 0 < args.top_p <= 1:
        payload["top_p"] = float(args.top_p)
    if args.top_k is not None and args.top_k > 0:
        payload["top_k"] = int(args.top_k)
    if args.min_p is not None and args.min_p >= 0:
        payload["min_p"] = float(args.min_p)
    if args.enable_thinking is not None:
        payload["enable_thinking"] = bool(args.enable_thinking)
    if args.reasoning_effort:
        payload["reasoning_effort"] = args.reasoning_effort

    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    url = args.base_url.rstrip("/") + "/v1/chat/completions"
    headers = {"Content-Type": "application/json"}
    if args.api_key:
        headers["Authorization"] = f"Bearer {args.api_key}"

    request = urllib.request.Request(url, data=data, headers=headers, method="POST")
    timeout = None if args.timeout <= 0 else args.timeout

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore").strip()
        print(f"[local_llm_infer] HTTP {exc.code}: {detail}", file=sys.stderr)
        raise SystemExit(1) from exc
    except urllib.error.URLError as exc:
        print(f"[local_llm_infer] Request failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc

    if os.environ.get("LOCAL_LLM_DEBUG_RAW", "").lower() in ("1", "true", "yes", "on"):
        try:
            raw_text = body.decode("utf-8")
        except UnicodeDecodeError:
            raw_text = body.decode("utf-8", errors="replace")
        print("[local_llm_infer] RAW RESPONSE:", raw_text, file=sys.stderr)

    try:
        parsed = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError:
        print("[local_llm_infer] Failed to decode Nexa response JSON.", file=sys.stderr)
        raise SystemExit(1)

    choice = parsed.get("choices", [{}])[0]
    text, thinking = extract_completion_parts(choice)

    # 部分伺服器會漏掉開頭的 <think> 標籤，只輸出 </think>
    # 若模型確實啟用推理，但只提供關閉標籤，這裡補上開頭標籤以便後續解析
    if text.startswith("</think>"):
        text = "<think>" + text

    if not text and thinking:
        text = thinking
        thinking = ""

    if not text:
        print("[local_llm_infer] Nexa response contained no assistant content.", file=sys.stderr)
        raise SystemExit(1)

    def wrap_thinking(block: str) -> str:
        trimmed = block.strip()
        if not trimmed:
            return ""
        if "<think>" in trimmed and "</think>" in trimmed:
            return trimmed
        return f"<think>\n{trimmed}\n</think>"

    output = text.strip()
    wrapped_thinking = wrap_thinking(thinking)
    if wrapped_thinking:
        output = f"{wrapped_thinking}\n\n{output}" if output else wrapped_thinking

    print(output.strip())


if __name__ == "__main__":
    main()
