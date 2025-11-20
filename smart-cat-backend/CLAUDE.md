# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Smart Cat Home Backend is an Express + TypeScript server that manages a smart home system for cat care. It receives sensor data from Arduino hardware, stores it in SQLite, provides REST APIs for the frontend, and integrates with local LLM models (Nexa/Qwen) to generate AI-powered cat care advice.

**Key Components:**
- **Hardware Integration**: Receives sensor data via HTTP (`POST /api/snapshots`) or serial port, sends commands back to Arduino
- **AI Chat System**: Multi-tier LLM integration (Standard/Pro models) with tool calling, memory management, and vision analysis
- **Data Layer**: SQLite with WAL mode, migrations system, and optimized concurrent access
- **Security**: Helmet headers, rate limiting, API key authentication, child process sandboxing

## Essential Commands

```bash
# Development (fastest - no build step)
npm run dev

# Production Build (uses esbuild - 0.04s vs tsc's 234s)
npm run build
npm start

# Type Checking (esbuild doesn't type-check)
npm run typecheck

# Legacy TypeScript Build (slow but includes type checking)
npm run build:tsc

# Testing
npm run seed:snapshot        # Send test snapshot to server
npm run chat:smoke           # Test AI chat endpoint
```

## Architecture

### 1. AI System (`src/ai.ts`)

**Multi-Tier Model Architecture:**
- `standard`: Fast responses (default: Qwen3-4B-Thinking, temp=0.7, top_p=0.9, max_tokens=2048)
- `pro`: Deep reasoning (temp=1.0, top_p=1.0, max_tokens=4096, can upgrade from standard)

**Tool Calling System:**
The AI can invoke 7 tools via JSON responses:
- `updateSettings`: Modify home automation settings
- `updateCalibration`: Adjust sensor calibration values
- `analyzeImage`: Vision analysis via Qwen3-VL or Gemma
- `saveMemory`: Persist user/cat information (proactive memory management)
- `createCareTask`: Schedule cat care reminders
- `switchToProModel`: Escalate to pro-tier for complex queries
- `searchWeb`: Fetch curated external references (via search proxy)

**System Prompt Structure** (`buildSystemPrompt`):
Located at `src/ai.ts:2601-2797`. The prompt is modular with sections for:
- Core identity & tone (conversational, empathetic cat care advisor)
- Internal reasoning framework (5-step process - hidden from users)
- Data handling rules (evidence-based, timestamp-aware, uncertainty markers)
- Safety rules (jailbreak rejection, never invent capabilities)
- Proactive memory management (save important facts without explicit "remember" commands)
- Tool orchestration (sequential calling for dependent tools)

**Key Functions:**
- `generateChatContent()`: Main entry point, handles heuristic detection, model selection, and response generation
- `buildPromptContent()`: Assembles context (sensor data, memories, history, knowledge base)
- `detectSearchIntent()`, `detectSettingsIntent()`, etc.: Heuristic patterns for fast-path tool invocation

**Config Hierarchy** (`src/config.ts`):
```
.env variables → parseIntegerEnv/parseNumberEnv → ModelTierConfig → aiConfig
```
Model parameters have validation ranges (e.g., `max_tokens: 16-10000`, `temperature: 0+`)

### 2. Database Layer (`src/db.ts`)

**Optimizations:**
- WAL (Write-Ahead Logging) mode for concurrent reads
- `synchronous=NORMAL` (balanced safety/speed)
- Foreign keys enabled
- 2000-page autocheckpoint (~4MB)

**Migration System:**
```typescript
const MIGRATIONS: Migration[] = [
  { id: '001_initial_schema', up: (db) => {...} },
  { id: '002_alert_rules', up: (db) => {...} },
  // ...
]
```
Migrations run automatically on server start. Schema is tracked in `schema_migrations` table.

**Key Tables:**
- `snapshots`: Sensor readings (timestamped JSON blobs)
- `settings`, `preferences`: User config & language preference
- `automation_alerts`: Real-time alerts (circular buffer in-memory + SQLite)
- `alert_rules`: Custom user-defined alert conditions
- `memories`: AI memory storage (searchable by keyword)
- `chat_favorites`: Pinned chat messages
- `care_tasks`: Scheduled reminders (hydration/nutrition/behavior/wellness/safety/maintenance)
- `hardware_commands`: Wi-Fi command queue for Arduino (pending → claimed → completed/failed)

### 3. API Routes (`src/index.ts`)

**Authentication:**
- Hardware endpoints (`/api/snapshots`, `/api/hardware/*`): `HARDWARE_API_KEY`
- Admin endpoints (`/api/settings`, `/api/calibration`, hardware commands): `ADMIN_API_KEY`
- Uses `verifyHardwareAuth()` and `verifyAdminAuth()` middleware

**Rate Limiting:**
- General API: 100 req/15min per IP
- AI chat (`/api/chat/suggestions`): 10 req/5min per IP
- TTS (`/api/ai/tts`): 6 req/1min per IP

**Critical Endpoints:**
- `POST /api/snapshots`: Hardware data ingestion (triggers automation alerts)
- `POST /api/chat/suggestions`: AI chat with streaming support
- `POST /api/hardware/commands`: Queue command for Arduino (admin-only)
- `GET /api/hardware/commands/pending`: Arduino polls for commands (hardware auth)
- `POST /api/hardware/commands/:id/ack`: Arduino reports execution result

**Serial Bridge Mode:**
When `SERIAL_ENABLED=true`, the server directly reads Arduino JSON from serial port and can push settings/calibration updates immediately (bypasses Wi-Fi command queue).

### 4. Knowledge Base (`src/knowledge.ts`)

The `buildKnowledgePrompt()` function searches 5 Markdown articles in `datasets/cat-care-knowledge/`:
- `01_hydration_zh.md`, `02_nutrition_zh.md`, `03_behavior_zh.md`, `04_wellness_zh.md`, `05_safety_zh.md`

Searches for keyword matches (case-insensitive, ignores punctuation) and returns top 3 article sections as context for AI responses.

### 5. Analytics & Reports (`src/analytics.ts`, `src/reports.ts`)

**Analytics Engine:**
- Trend detection (rising/falling/stable for temperature, humidity, water intake)
- Anomaly detection (outlier readings beyond ±2 std dev)
- Behavior pattern analysis (cat presence timing, feeding schedule adherence)
- Forecast generation (simple linear projection for next 6 hours)

**Professional Reports:**
- Generated via `generateProfessionalReport()` using AI
- Consolidates 24h trends, anomalies, care recommendations
- Output in user's preferred language

### 6. TTS System (`src/speech.ts`)

**Multi-Engine Support:**
1. **Xenova** (default): Local transformers.js (`Xenova/xtts-v2`)
2. **Edge TTS**: Microsoft Neural voices (network fallback)
3. **Google TTS**: Browser-compatible voices (legacy)

Voice presets stored in SQLite (`tts_voice_presets` table). The system auto-selects engine based on `TTS_ENGINE` env var and falls back on errors.

### 7. Alert Manager (`src/alertManager.ts`)

**Multi-Channel Alert Distribution:**
The AlertManager handles critical events with intelligent routing across multiple notification channels:

1. **Database Persistence** (always): Saves to `automation_alerts` table with SQLite
2. **PWA Push Notifications** (warning/critical only): Uses `web-push` with VAPID authentication
3. **Auto Task Creation** (critical only): Creates entries in `care_tasks` table

**Key Features:**
- **Deduplication**: 5-minute time window prevents alert spam (configurable)
- **Severity Routing**:
  - `info`: Database only
  - `warning`: Database + Push notifications
  - `critical`: Database + Push + Auto task creation
- **Multi-language**: Dynamically generates titles in user's language (zh/en)
- **Smart Escalation**: Allows more frequent alerts if severity increases

**Architecture:**
```typescript
// Singleton pattern with lazy initialization
initializeAlertManager({
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
  deduplicationWindowMs: 5 * 60 * 1000,
  alertHistoryLimit: 100,
})

// High-level dispatch
await dispatchAlert(message, severity, {
  messageKey: 'visionRisk',
  audioAlert: true,
  showBanner: true,
  autoTask: { category: 'safety', priority: 'high', dueInHours: 1 }
})
```

**Integration Points:**
- `index.ts:3012-3018`: Vision risk alerts automatically dispatched
- `index.ts:5881-5888`: AlertManager initialized at server startup
- Push subscription management via existing `listPushSubscriptions()` in db.ts

**Frontend Integration:**
The frontend receives alerts via:
1. **Polling**: `useAutomationAlerts` hook polls `/api/alerts/recent` every 30s
2. **AlertBanner Component**: Fixed-position banner at top of screen (z-index 9999)
   - Red gradient for critical, yellow for warning
   - Auto-dismisses after 10s (configurable)
   - Manual dismiss button
   - Slide-in animation with icon pulse effect
   - Audio alert trigger for critical severity
3. **PWA Push**: Background notifications when tab not active (requires user permission)

**Deduplication Logic:**
```typescript
// Key generation: messageKey or content hash
const key = config.messageKey || `msg_${config.message.substring(0, 50)}`

// Allow escalation: info → warning → critical can bypass window
if (cached.severity === 'info' && config.severity !== 'info') return false
```

## Configuration Deep Dive

### AI Model Parameters

**Standard Model** (`.env`):
```bash
LOCAL_LLM_MAX_TOKENS=2048         # Response length limit
LOCAL_LLM_TEMPERATURE=0.7         # Creativity (0=deterministic, 1=creative)
LOCAL_LLM_TOP_P=0.9               # Nucleus sampling threshold
LOCAL_LLM_TIMEOUT_MS=600000       # Overall timeout (10min)
LOCAL_LLM_REQUEST_TIMEOUT_MS=60000 # HTTP request timeout
```

**Pro Model** (`.env`):
```bash
LOCAL_LLM_PRO_MAX_TOKENS=4096
LOCAL_LLM_PRO_TEMPERATURE=1.0     # Maximum creativity
LOCAL_LLM_PRO_TOP_P=1.0           # Full vocabulary access
LOCAL_LLM_PRO_ENABLE_THINKING=true # Enable CoT reasoning
```

**Vision Model**:
```bash
LOCAL_VISION_MAX_TOKENS=1024
LOCAL_VISION_MAX_IMAGE_SIDE=768   # Auto-resize images
LOCAL_VISION_ALLOW_SCRIPT_FALLBACK=true # Fallback to Python script
```

### Security Settings

**API Keys:**
- `HARDWARE_API_KEY`: Arduino authentication (matches `BACKEND_API_KEY_STR` in `arduino/credentials.h`)
- `ADMIN_API_KEY`: Optional fallback token for admin endpoints（若未設定，需以 developer 帳號登入前端）
- `LOCAL_LLM_SERVER_KEY`: Nexa server authorization token
- `VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY`: Web push notifications

**CORS:**
`ALLOWED_ORIGINS`: Comma-separated list of allowed frontend origins. Leave empty to allow all (dev mode).

**HTTPS:**
Set `HTTPS_CERT_PATH` and `HTTPS_KEY_PATH` to enable HTTPS server.

## Development Workflow

### Typical Code Changes

1. **Add new API endpoint:**
   - Add route in `src/index.ts` (use existing auth middleware if needed)
   - Update types in `src/types.ts` if new data structures
   - Add database methods in `src/db.ts` if persisting data
   - Test with `npm run dev`

2. **Modify AI behavior:**
   - Edit system prompt in `buildSystemPrompt()` (`src/ai.ts:2601+`)
   - Add/modify tool patterns in `src/aiPatterns.ts`
   - Update tool handlers in `generateChatContent()` switch statement
   - Test with `npm run chat:smoke`

3. **Add database migration:**
   ```typescript
   // In src/db.ts MIGRATIONS array
   {
     id: '00X_descriptive_name',
     up: (db) => {
       db.exec(`CREATE TABLE IF NOT EXISTS new_table (...);`)
     }
   }
   ```
   Migration runs automatically on next server start.

4. **Update model configuration:**
   - Modify defaults in `src/config.ts` (lines 153, 188, 242 for max_tokens)
   - Update `.env` for runtime values
   - Update `.env.example` for documentation
   - Run `npm run build && npm start` to apply

### Debugging Tips

**Enable AI Debug Logging:**
```bash
SMART_CAT_AI_DEBUG=true npm run dev
```
Logs all AI requests, tool calls, and heuristic detections to console.

**Check Database State:**
```bash
sqlite3 smart-cat-home.db "SELECT * FROM schema_migrations;"
sqlite3 smart-cat-home.db "SELECT * FROM memories ORDER BY createdAt DESC LIMIT 5;"
```

**Monitor Hardware Commands:**
```bash
sqlite3 smart-cat-home.db "SELECT id, type, status, createdAt FROM hardware_commands ORDER BY createdAt DESC LIMIT 10;"
```

**Test Tool Invocation:**
Send chat message with explicit tool trigger:
```bash
curl -X POST http://localhost:4000/api/chat/suggestions \
  -H "Content-Type: application/json" \
  -d '{"message": "Remember that my cat Neko is 3 years old", "language": "en"}'
```
Should invoke `saveMemory` tool automatically.

## Common Patterns

### Adding a New Chat Tool

1. **Define in types** (`src/types.ts`):
   ```typescript
   export type ChatTool = ... | 'myNewTool'
   ```

2. **Add tool description** (`src/ai.ts:342+`):
   ```typescript
   const TOOL_DESCRIPTION_EN = `...
   - myNewTool (args: "param1" required, "param2" optional)
   `
   ```

3. **Implement handler** in `generateChatContent()`:
   ```typescript
   if (toolCall.tool === 'myNewTool') {
     const result = await handleMyNewTool(toolCall.args)
     return { text: result, toolCall, provider: 'local' }
   }
   ```

4. **Add heuristic detection** (optional, for fast-path):
   ```typescript
   function detectMyNewToolIntent(question: string): MyArgs | null {
     const patterns = [/keyword1/, /keyword2/]
     // ... pattern matching logic
   }
   ```

### Modifying System Prompt

**The system prompt is highly structured** - follow existing section format:

```typescript
const myNewRule = language === 'en'
  ? '🔧 My Rule: Description...'
  : '🔧 我的規則：說明...'

// Add to final assembly (line ~2757)
return `${base}
...
${myNewRule}
...
${toolHelp}`
```

**Important:** The prompt uses emoji prefixes for visual organization. Keep sections concise (1-2 sentences per rule).

### Working with Circular Buffers

The `AutomationAlertBuffer` (`src/circularBuffer.ts`) maintains in-memory recent alerts and syncs to SQLite:

```typescript
// Add alert (auto-syncs to DB)
automationAlerts.add({
  timestamp: new Date().toISOString(),
  message: 'Water level critical',
  severity: 'critical'
})

// Retrieve recent alerts
const recent = automationAlerts.toArray()
```

## Build System

**esbuild** is the default builder (configured in `build.mjs`):
- **Speed**: 0.04s vs tsc's 234s (5850x faster)
- **No Type Checking**: Run `npm run typecheck` separately
- **Output**: Maintains directory structure in `dist/`
- **Excludes**: Documentation files (`AI_REFACTORING_GUIDE.ts`, etc.)

The build script uses `glob` to find all `src/**/*.ts` files and compiles them individually (not bundled) to preserve module structure for Node.js.

## Environment Variable Validation

Uses custom parsers in `src/config.ts`:
- `parseIntegerEnv()`: Validates integer range, provides defaults
- `parseNumberEnv()`: Validates float range
- `parseBooleanEnv()`: Parses `true/false/1/0/yes/no`

All AI config is centralized in `aiConfig` object, loaded once on server start.

## Hardware Integration

**Two Modes:**

1. **Serial Bridge** (`SERIAL_ENABLED=true`):
   - Direct USB connection to Arduino
   - Real-time bidirectional communication
   - Settings/calibration pushed immediately via serial

2. **Wi-Fi Mode** (`SERIAL_ENABLED=false`):
   - Arduino POSTs to `/api/snapshots` (requires `HARDWARE_API_KEY`)
   - Commands queued in `hardware_commands` table
   - Arduino polls `/api/hardware/commands/pending` every 10s
   - Reports completion via `/api/hardware/commands/:id/ack`

**Automation Alerts:**
Triggered in `POST /api/snapshots` handler when thresholds exceeded (water level, cat absence, brightness). Alerts stored in circular buffer + SQLite.

## Code Style Notes

- **Bilingual**: Most user-facing strings have English and Chinese versions
- **Type Safety**: Strict TypeScript, use `unknown` over `any`
- **Error Handling**: All async endpoints wrapped in try-catch, return 500 on errors
- **Logging**: Use `console.log` for info, `console.error` for errors, `aiDebugLog()` for AI internals
- **Database**: Always use parameterized queries (better-sqlite3 auto-escapes with `?` placeholders)

## Testing

No formal test suite. Manual testing via:
- `npm run seed:snapshot`: Posts fake sensor data
- `npm run chat:smoke`: Tests AI chat endpoint
- Browser-based frontend for integration testing

When adding features, ensure they work with both English and Chinese language settings.
