#!/usr/bin/env python3
"""
Deduplicate the pro fine-tuning dataset and rebuild the train/val/test splits.

The script keeps the first occurrence of each unique conversation (identified by
its `messages` payload) and drops later duplicates. Split sizes are recomputed to
match the original ratios so evaluation sets remain representative.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple
import re

DATASET_DIR = Path(__file__).resolve().parent.parent / "datasets" / "pro-finetune"
SPLITS = ("train.jsonl", "val.jsonl", "test.jsonl")


@dataclass
class Record:
  payload: Dict[str, object]
  source_split: str


def load_split(path: Path) -> List[Dict[str, object]]:
  records: List[Dict[str, object]] = []
  with path.open("r", encoding="utf-8") as handle:
    for line in handle:
      stripped = line.strip()
      if not stripped:
        continue
      records.append(json.loads(stripped))
  return records


def main() -> None:
  if not DATASET_DIR.exists():
    raise SystemExit(f"Dataset directory not found: {DATASET_DIR}")

  combined: List[Record] = []
  seen: Dict[str, Tuple[str, int]] = {}
  duplicate_log: List[Tuple[str, int, str]] = []
  original_counts: Dict[str, int] = {}
  total_original = 0

  for split in SPLITS:
    path = DATASET_DIR / split
    records = load_split(path)
    original_counts[split] = len(records)
    total_original += len(records)

    for idx, payload in enumerate(records):
      key = json.dumps(payload.get("messages"), sort_keys=True, ensure_ascii=False)
      if key in seen:
        first_split, _ = seen[key]
        duplicate_log.append((split, idx, first_split))
        continue
      seen[key] = (split, len(combined))
      combined.append(Record(payload=payload, source_split=split))

  def canonicalize(record: Record) -> str:
    user = ""
    for message in record.payload.get("messages", []):
      if isinstance(message, dict) and message.get("role") == "user":
        user = str(message.get("content", ""))
        break
    if not user:
      return ""
    normalized = re.sub(r"\d+(?:\.\d+)?", " ", user.lower())
    normalized = re.sub(r"[^0-9a-z\u4e00-\u9fff\s]", " ", normalized)
    return " ".join(normalized.split())

  filtered: List[Record] = []
  canon_seen: Dict[str, int] = {}
  canonical_dropped = 0
  for record in combined:
    canon = canonicalize(record)
    if canon and canon in canon_seen:
      canonical_dropped += 1
      continue
    if canon:
      canon_seen[canon] = len(filtered)
    filtered.append(record)

  total_unique = len(filtered)
  if total_unique == total_original:
    print("No duplicates detected; nothing to do.")
    return

  train_target = round(total_unique * original_counts["train.jsonl"] / total_original)
  val_target = round(total_unique * original_counts["val.jsonl"] / total_original)
  test_target = total_unique - train_target - val_target

  splits = {
    "train.jsonl": filtered[:train_target],
    "val.jsonl": filtered[train_target : train_target + val_target],
    "test.jsonl": filtered[train_target + val_target :],
  }

  for split, records in splits.items():
    path = DATASET_DIR / split
    with path.open("w", encoding="utf-8") as handle:
      for record in records:
        handle.write(json.dumps(record.payload, ensure_ascii=False))
        handle.write("\n")

  print("Deduplication complete.")
  print(f"  Original samples: {total_original}")
  print(f"  Unique samples:   {total_unique}")
  print(f"  Duplicates pruned: {total_original - total_unique}")
  if canonical_dropped:
    print(f"    (including {canonical_dropped} high-similarity snapshots)")
  print("  New split sizes:")
  for split, records in splits.items():
    print(f"    {split}: {len(records)}")
  if duplicate_log:
    print("  Examples of duplicates removed:")
    for entry in duplicate_log[:10]:
      split, idx, first = entry
      print(f"    {split}[{idx}] duplicate of {first}")


if __name__ == "__main__":
  main()
