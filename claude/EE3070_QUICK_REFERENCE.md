# EE3070 Smart Cat Home - Quick Reference Guide

## Project at a Glance

| Aspect | Details |
|--------|---------|
| **Type** | Educational IoT Dashboard with AI |
| **Frontend** | React 19 + Vite + TypeScript + PWA |
| **Backend** | Node.js + Express + TypeScript + SQLite |
| **Hardware** | Arduino + ESP8266 + Sensors (DHT11, HC-SR04, FSR) |
| **AI** | Nexa/Ollama/OpenAI with multi-tier models |
| **Status** | Good security, needs UI/UX polish |

---

## Repository Structure

```
/Users/meaqua/Desktop/EE3070/
├── smart-cat-backend/           # Express API server
│   ├── src/
│   │   ├── index.ts            # Main routes (40+ endpoints)
│   │   ├── auth.ts             # Session auth (ISSUE: hardcoded creds)
│   │   ├── db.ts               # SQLite with better-sqlite3
│   │   ├── validators.ts       # Input validation (GOOD!)
│   │   ├── ai.ts               # AI/chat logic (121KB)
│   │   └── config.ts           # Environment config
│   └── package.json
│
├── smart-cat-home/              # React frontend
│   ├── src/
│   │   ├── components/          # 35+ React components
│   │   │   ├── LoginPanel.tsx           ✅ Good auth form
│   │   │   ├── PluginManagerPanel.tsx   ⚠️ No URL validation
│   │   │   ├── AlertRuleManager.tsx     ⚠️ Missing labels
│   │   │   └── CalibrationPanel.tsx     ⚠️ Unvalidated numbers
│   │   ├── hooks/               # Custom React hooks
│   │   ├── App.tsx              # Main app (154KB CSS file)
│   │   └── i18n/                # English/Chinese translations
│   └── package.json
│
├── arduino/                     # ESP8266 firmware
│   └── smart_cat_serial_bridge/
│       ├── smart_cat_serial_bridge.ino
│       └── credentials.h.example
│
└── README.md                    # Good documentation

```

---

## Security Issues Summary

### High Priority (FIX FIRST)
1. **Hardcoded Test Credentials** (auth.ts:31-46)
   - Username: meaqua / admin
   - Passwords: meaqua / admin (publicly known)
   - Fix: Load from environment variables

### Medium Priority
2. **Plugin URL Validation Missing** (PluginManagerPanel.tsx:45)
   - No URL.parse() validation
   - Risk: SSRF, invalid data in database
   
3. **Session Management Weak** (auth.ts)
   - In-memory storage (lost on restart)
   - No HTTPS enforcement
   - Fix: Use Redis/database + secure cookies

### Low Priority
4. **Password Complexity** - No strength requirements
5. **Rate Limiting** - Could be per-user based
6. **CORS** - Can be empty (allows all origins)

---

## Input Validation Assessment

### Backend ✅ GOOD
- Chat: message length, temperature ranges
- Settings: temperature (15-35°C), humidity (30-80%)
- Calibration: whitelist 7 fields only
- All with bilingual error messages

### Frontend ✅ GOOD
- Controlled React components
- No XSS (no innerHTML)
- Type guards on numbers

### Database ✅ GOOD
- Parameterized queries (prevents SQL injection)
- Foreign keys enabled
- WAL mode (concurrent safety)

---

## UI/UX Issues Summary

### Critical (Accessibility Violations)
1. **Form Labels Not Associated** (WCAG violation)
   - Missing: `htmlFor` on labels, `id` on inputs
   - Files: PluginManagerPanel, AlertRuleManager
   - Fix: Add `htmlFor="field-name"` to labels

### High Priority
2. **Missing Placeholder Text** - No input hints
3. **Unvalidated Number Inputs** - No min/max client-side validation
4. **No Delete Confirmation** - Can accidentally delete data
5. **Inconsistent Error Display** - Errors set but not shown

### Medium Priority
6. **Large CSS File** (154KB, needs modules)
7. **No Toast Notifications** - No success feedback
8. **Uncontrolled Selects** - Some missing `value` prop
9. **Missing Alt Text** - Images need accessibility

---

## File Locations - Key Components

### Backend Routes
**File**: `/Users/meaqua/Desktop/EE3070/smart-cat-backend/src/index.ts`

Key endpoints:
```
POST   /api/auth/login                    # Session auth
GET    /api/auth/me                       # Get current user
POST   /api/snapshots                     # Hardware data ingestion
POST   /api/chat/suggestions              # AI chat (rate limited)
POST   /api/settings                      # Update settings
POST   /api/calibration                   # Sensor calibration
POST   /api/hardware/commands             # Queue Arduino commands
GET    /api/hardware/commands/pending     # Arduino polls commands
```

### Frontend Components
**Directory**: `/Users/meaqua/Desktop/EE3070/smart-cat-home/src/components/`

Critical components:
- `LoginPanel.tsx` - Authentication form (good)
- `PluginManagerPanel.tsx` - Plugin registration (needs URL validation)
- `AlertRuleManager.tsx` - Alert rule CRUD (needs labels, confirmations)
- `CalibrationPanel.tsx` - Sensor calibration (needs number validation)
- `AiChatPanel.tsx` - AI chat interface (good, large)

---

## Testing Credentials

```
User: meaqua
Password: meaqua
Role: user

User: admin
Password: admin
Role: developer
```

**⚠️ WARNING**: These are hardcoded. Must be removed for production.

---

## Environment Variables Required

### Critical
```bash
PORT=4000                          # Server port
HARDWARE_API_KEY=<32+ chars>       # Arduino authentication
ADMIN_API_KEY=<32+ chars>          # Admin operations
```

### AI Configuration (choose one)
```bash
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b
# OR
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
# OR
LOCAL_LLM_SERVER_URL=http://localhost:8000
```

### Optional
```bash
HTTPS_CERT_PATH=/path/to/cert.pem
HTTPS_KEY_PATH=/path/to/key.pem
VAPID_PUBLIC_KEY=...  # Push notifications
VAPID_PRIVATE_KEY=...
ALLOWED_ORIGINS=http://localhost:5173,https://yourdomain.com
```

---

## Database Schema

**File**: `/Users/meaqua/Desktop/EE3070/smart-cat-backend/src/db.ts`

Tables:
- `snapshots` - Sensor readings (timestamp, JSON)
- `settings` - Home automation settings
- `preferences` - User preferences (language, theme)
- `push_subscriptions` - Web push endpoints
- `calibration` - Sensor calibration values
- `automation_alerts` - Real-time alerts
- `memories` - AI memory storage
- `chat_favorites` - Pinned messages
- `hardware_commands` - Arduino command queue
- `care_tasks` - Care reminders
- `alert_rules` - Custom alert conditions

---

## API Key Authentication

### Hardware Endpoints
Require header: `x-smartcat-api-key: ${HARDWARE_API_KEY}`
```
POST /api/snapshots
GET  /api/hardware/commands/pending
POST /api/hardware/commands/:id/ack
```

### Admin Endpoints
Require header: `x-smartcat-admin: Bearer ${ADMIN_API_KEY}`
```
POST /api/settings
POST /api/calibration
POST /api/hardware/commands
```

**Security**: Uses constant-time comparison (prevents timing attacks) ✅

---

## Development Commands

### Backend
```bash
cd smart-cat-backend
npm run dev              # Fast: ts-node, no build
npm run build           # esbuild (0.04 seconds!)
npm start               # Run compiled dist/
npm run typecheck       # Type checking only
npm run chat:smoke      # Test AI endpoint
```

### Frontend
```bash
cd smart-cat-home
npm run dev             # Vite with HMR
npm run build           # Production build
npm run lint            # ESLint
npm run test            # Vitest
```

### Hardware
See `arduino/README.md` for firmware flashing instructions.

---

## Security Checklist for Production

- [ ] Remove hardcoded credentials from auth.ts
- [ ] Generate strong HARDWARE_API_KEY (32+ random chars)
- [ ] Generate strong ADMIN_API_KEY (32+ random chars)
- [ ] Set ALLOWED_ORIGINS to specific domains
- [ ] Enable HTTPS (set HTTPS_CERT_PATH, HTTPS_KEY_PATH)
- [ ] Generate VAPID keys for push notifications
- [ ] Setup AI provider (Ollama, OpenAI, or Local LLM)
- [ ] Run `npm audit` and update dependencies
- [ ] Persist sessions to Redis/database
- [ ] Add password complexity requirements
- [ ] Implement per-user rate limiting
- [ ] Test push notifications on HTTPS
- [ ] Setup database backup strategy
- [ ] Monitor rate limiting effectiveness

---

## Build Performance

### Backend Build
- **Old** (TypeScript): 234 seconds
- **New** (esbuild): 0.04 seconds
- **Improvement**: 5850x faster! 

### Frontend Development
- **HMR Enabled**: Code changes reflected instantly
- **State Preserved**: Form data/chat history maintained
- **Lazy Loading**: Components load on-demand

---

## Known Issues (To Fix)

| ID | Component | Issue | Severity | Effort |
|---|-----------|-------|----------|--------|
| 1 | auth.ts | Hardcoded credentials | HIGH | 30min |
| 2 | PluginManagerPanel | No URL validation | MEDIUM | 30min |
| 3 | Forms | Missing label associations | CRITICAL | 1hr |
| 4 | Forms | No placeholder text | MEDIUM | 30min |
| 5 | Number inputs | No range validation | MEDIUM | 1hr |
| 6 | Delete buttons | No confirmation | MEDIUM | 1hr |
| 7 | Forms | Error display inconsistent | MEDIUM | 1.5hr |
| 8 | App.css | 154KB, not modularized | MEDIUM | 2hr |
| 9 | Auth | Weak session management | MEDIUM | 3hr |
| 10 | Components | No toast notifications | LOW | 1.5hr |

---

## Positive Highlights ✅

1. **Bcrypt Hashing** - Cost factor 12 (strong)
2. **Constant-Time Comparison** - Timing attack prevention
3. **Parameterized Queries** - SQL injection protected
4. **Input Validation** - Comprehensive, bilingual
5. **Rate Limiting** - Sensitive endpoints protected
6. **No XSS** - No innerHTML usage
7. **Modern Stack** - React 19, Vite, TypeScript
8. **PWA Support** - Offline capability
9. **Multi-Language** - English/Chinese
10. **AI Integration** - Multiple provider support

---

## Estimated Timeline to Production

| Task | Effort | Priority |
|------|--------|----------|
| Remove hardcoded credentials | 30min | P1 |
| Fix accessibility issues | 1.5hr | P1 |
| Add input validation | 2hr | P1 |
| Security improvements | 3hr | P2 |
| UX polish (confirmations, toasts) | 2.5hr | P2 |
| Performance optimization | 2hr | P3 |
| Testing & QA | 3hr | All |
| **Total** | **17 hours** | |

**Estimate**: 2-3 weeks with 1-2 developers

---

## Contact & Documentation

- **Main README**: `/Users/meaqua/Desktop/EE3070/README.md`
- **Backend Guide**: `/Users/meaqua/Desktop/EE3070/smart-cat-backend/README.md`
- **Frontend Guide**: `/Users/meaqua/Desktop/EE3070/smart-cat-home/README.md`
- **Arduino Guide**: `/Users/meaqua/Desktop/EE3070/arduino/README.md`
- **Course**: EE3070 (Educational project)

---

**Generated**: 2025-11-02  
**Analysis Scope**: Medium Thoroughness  
**Report Files**:
- `EE3070_Comprehensive_Analysis.md` (detailed, 22KB)
- `EE3070_FINDINGS_SUMMARY.txt` (formatted, 12KB)
- `EE3070_QUICK_REFERENCE.md` (this file, 9KB)

