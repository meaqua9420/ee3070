# Smart Cat Home AI Model Card

## Overview
- Purpose: Multimodal assistant for smart cat home monitoring and control (dashboards, care insights, hardware commands).
- Deployment: Backend-hosted models with front-end tooling; supports text, voice playback, file uploads (PDF/Word), and image inputs.
- Tools: MCP functions (task/status, knowledge, FS, graph, shortcuts), online search proxy, hardware control hooks.

## Model Tiers
- **Standard — Meme**: Fast, balanced responses for routine Q&A, device status, quick tips. Lower latency, shorter context.
- **Pro — PhilIa093**: Higher reasoning depth for care plans, troubleshooting, calibration guidance; longer context; upgrades automatically on complex asks.
- **Ultra — Elysia**: Maximum depth/creativity, richer multi-step analysis; used when explicitly requested or when advanced insight is needed.

## Modalities & Inputs
- Text chat with streaming responses.
- Voice: Server TTS + client playback; parses spoken content.
- Files: PDF, DOC/DOCX ingest for summarization and knowledge grounding.
- Images: Upload for visual inspection (e.g., setup photos); respects allowed MIME whitelist.

## Tools & Integrations
- **MCP**: knowledge search, task status, file/FS helpers (gated), graph memory, Apple Shortcuts, Codex tasks, analytics, browser/search proxy.
- **Online search**: Opt-in; routes through backend proxy with safety filters.
- **Hardware hooks**: Feeder, hydration, UV/fan, audio, camera status; commands acknowledged with telemetry.

## Safety & Guardrails
- Auth: Requires session/developer role for control actions; API keys stored server-side.
- Rate limits: Backend enforces request throttling; command cooldowns on hardware paths.
- Content safety: File upload MIME whitelist and size limits; search results filtered; MCP domains allowlisted.
- Data handling: No credentials in prompts; sensitive files (`.env`, `credentials.h`, DB) excluded from commits.

## Known Limitations
- Large/long documents may be truncated to fit context.
- Visual analysis limited by model resolution and upload size caps.
- Ultra tier is slower; may be downgraded if resources constrained.
- Offline mode reduces search/tool availability; falls back to local knowledge.

## Evaluation & Logging
- Telemetry: Command success/failure, tool calls, search usage, and TTS events are logged for debugging.
- Manual checks before release: build passes, ARIA/UX smoke tests, feeder/hydration control dry-runs with mocked data.

## Intended Use & Misuse
- Intended: Pet care guidance, environment monitoring, hardware control with consent, educational insights.
- Not intended: Medical diagnosis, handling of sensitive personal data, or unattended operation without user oversight.
