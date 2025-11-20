#!/usr/bin/env python3
"""Deprecated helper for hosting a local LLM server.

Use the Nexa CLI instead:
  nexa serve --model <chat-model>

Then set LOCAL_LLM_SERVER_URL (and LOCAL_LLM_SERVER_MODEL if needed) to point
to the Nexa server.
"""
import sys

sys.stderr.write(
    "local_llm_server.py has been deprecated.\n"
    "Launch `nexa serve` to host the local model instead.\n"
)
sys.exit(1)
