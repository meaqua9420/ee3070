#!/usr/bin/env python3
"""
Convert Smart Cat pro fine-tune JSONL conversations into
Hugging Face-friendly format (prompt/response fields).
"""
import argparse
import json
from pathlib import Path

from datasets import Dataset


def load_messages(path: Path):
    items = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            items.append(json.loads(line))
    return items


def flatten(records):
    rows = []
    for row in records:
        messages = row["messages"]
        if len(messages) < 3:
            continue
        system_msg = ""
        prompt_parts = []
        for message in messages:
            role = message["role"]
            content = message["content"]
            if role == "system":
                system_msg = content
            elif role == "user":
                prompt_parts.append(f"<|user|>{content}")
            elif role == "assistant":
                rows.append(
                    {
                        "prompt": f"<|system|>{system_msg}" + "".join(prompt_parts) + "<|assistant|>",
                        "response": content,
                    }
                )
                prompt_parts.append(f"<|assistant|>{content}")
    return rows


def main():
    parser = argparse.ArgumentParser(description="Convert Smart Cat JSONL to HF JSON.")
    parser.add_argument("--input", required=True, help="Input JSONL file")
    parser.add_argument("--output", required=True, help="Output JSON file")
    args = parser.parse_args()

    records = load_messages(Path(args.input))
    dataset = Dataset.from_list(flatten(records))
    dataset.to_json(args.output)
    print(f"Wrote {len(dataset)} rows to {args.output}")


if __name__ == "__main__":
    main()

