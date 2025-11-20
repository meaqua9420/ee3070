#!/usr/bin/env python3
"""This helper is deprecated.

Nexa now provides an OpenAI-compatible server (`nexa serve`) that keeps the
vision model in memory. Please launch that server instead of this script and
set LOCAL_VISION_SERVER_URL (or LOCAL_LLM_SERVER_URL) to its base URL.
"""
import sys

sys.stderr.write(
    "local_vision_server.py has been replaced by the Nexa CLI.\n"
    "Run `nexa serve --model <vision-model>` and point the backend to that host.\n"
)
sys.exit(1)
