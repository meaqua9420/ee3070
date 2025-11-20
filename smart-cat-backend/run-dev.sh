#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export NODE_ENV=development
FORCE_FULL_BUILD=1 node build.mjs
node --env-file .env dist/index.js
