# 🤖 AI Auto Mode Integration Guide

## 📋 Overview

This guide explains how to integrate the AI Auto Mode Manager into the Smart Cat Home backend, allowing AI to automatically control Arduino hardware based on sensor readings.

---

## 🔧 Integration Steps

### Step 1: Import the Auto Mode Manager

**File:** `smart-cat-backend/src/index.ts`
**Location:** Top of file, with other imports

```typescript
// Add after other imports (around line 25-30)
import {
  initializeAutoModeManager,
  startAutoMode,
  stopAutoMode,
  getAutoModeStatus,
} from './autoModeManager'
```

---

### Step 2: Initialize on Server Startup

**File:** `smart-cat-backend/src/index.ts`
**Location:** After `initializeAlertManager` (around line 7745)

```typescript
// Add after line 7744 (after alert manager initialization)

// 🤖 Initialize Auto Mode Manager
initializeAutoModeManager({
  checkIntervalMs: 60 * 1000,        // Check every 1 minute
  actionCooldownMs: 10 * 60 * 1000,  // 10 min cooldown between actions
  maxActionsPerHour: 6,               // Max 6 automated actions per hour
})

// Start auto mode if enabled in settings
const currentSettings = getSettings()
if (currentSettings.autoMode) {
  startAutoMode(
    () => mostRecentSnapshot,          // Get current snapshot
    (toolCall) => executeToolCall(toolCall, 'auto-mode')  // Execute hardware commands
  )
  logger.info('[auto-mode] Started (autoMode enabled in settings)')
} else {
  logger.info('[auto-mode] Manager initialized but not started (autoMode disabled)')
}
```

---

### Step 3: Handle Auto Mode Toggle

**File:** `smart-cat-backend/src/index.ts`
**Location:** In the `PUT /api/settings` endpoint (search for "app.put('/api/settings'")

Find the settings update handler and add auto mode management:

```typescript
// Inside the PUT /api/settings handler, after updateSettings() call
// Around line 5640-5660

// Update settings in database
const updated = updateSettings(settingsInput)

// 🤖 Handle auto mode toggle
if (typeof settingsInput.autoMode === 'boolean') {
  if (settingsInput.autoMode) {
    // Enable auto mode
    startAutoMode(
      () => mostRecentSnapshot,
      (toolCall) => executeToolCall(toolCall, 'auto-mode')
    )
    logger.info('[auto-mode] Enabled by user')
  } else {
    // Disable auto mode
    stopAutoMode()
    logger.info('[auto-mode] Disabled by user')
  }
}

// Continue with existing response...
res.json({ ok: true, settings: updated })
```

---

### Step 4: Create Auto Mode Status API

**File:** `smart-cat-backend/src/index.ts`
**Location:** Add new API endpoint (around line 6500, with other GET endpoints)

```typescript
/**
 * GET /api/auto-mode/status
 * Get current auto mode status and recent actions
 */
app.get('/api/auto-mode/status', (req, res) => {
  try {
    const status = getAutoModeStatus()
    const currentSettings = getSettings()

    res.json({
      ok: true,
      autoMode: {
        enabled: currentSettings.autoMode,
        ...status,
      },
    })
  } catch (error) {
    console.error('[auto-mode] Failed to get status:', error)
    res.status(500).json({
      ok: false,
      error: 'Failed to retrieve auto mode status',
    })
  }
})
```

---

## 🎯 How It Works

### Automatic Control Logic

The Auto Mode Manager monitors the following conditions:

1. **Water Level Critical** (< 20%)
   - Action: Trigger water pump for 3 seconds
   - Priority: **Highest**

2. **Temperature High** (> 30°C)
   - Action: Turn on cooling fan
   - Safety: UV remains off

3. **Temperature Normalized** (< 26°C)
   - Action: Turn off fan to save energy
   - Condition: Only if not cleaning

4. **Food Low** (< 20g, cat present)
   - Action: Start feeding cycle (target 50g)
   - Condition: Only if cat detected

### Safety Mechanisms

✅ **Cooldown Period**: 10 minutes between automated actions
✅ **Rate Limiting**: Maximum 6 actions per hour
✅ **Manual Override**: Users can still control devices manually
✅ **Logging**: All automated actions are logged
✅ **Auto Mode Toggle**: Can be disabled anytime via settings

---

## 📡 API Usage

### Check Auto Mode Status

```bash
GET /api/auto-mode/status

Response:
{
  "ok": true,
  "autoMode": {
    "enabled": true,
    "running": true,
    "recentActionsCount": 2,
    "lastAction": {
      "timestamp": 1699876543210,
      "action": "trigger_water_pump",
      "reason": "Water level critical: 15.2%"
    }
  }
}
```

### Enable/Disable Auto Mode

```bash
PUT /api/settings
Content-Type: application/json

{
  "autoMode": true
}
```

---

## 🧪 Testing

### Test Scenario 1: Water Level Alert

1. Set `autoMode: true` in settings
2. Send snapshot with `waterLevelPercent: 15`
3. Wait 1 minute
4. Check logs for `[auto-mode] Taking action: trigger_water_pump`
5. Verify water pump command in `hardware_commands` table

### Test Scenario 2: Temperature Control

1. Set `autoMode: true`
2. Send snapshot with `temperatureC: 32`
3. Wait 1 minute
4. Check logs for `[auto-mode] Taking action: enable_cooling_fan`
5. Verify fan turned on

### Test Scenario 3: Cooldown

1. Trigger automated action
2. Create another alert condition within 10 minutes
3. Verify no action is taken (cooldown active)
4. Check logs for `[auto-mode] Still in cooldown period`

---

## 🔍 Monitoring

### Backend Logs

```bash
# Enable auto mode
[auto-mode] Starting automatic control system

# Condition detected
[auto-mode] Taking action: trigger_water_pump (Water level critical: 15.2%)

# Action completed
[auto-mode] Action completed successfully: trigger_water_pump

# Cooldown active
[auto-mode] Still in cooldown period, skipping

# Rate limit reached
[auto-mode] Max actions per hour reached, skipping
```

### Database Queries

```sql
-- Check recent automated hardware commands
SELECT * FROM hardware_commands
WHERE created_at > datetime('now', '-1 hour')
ORDER BY created_at DESC;

-- Count automated actions by type
SELECT type, COUNT(*) as count
FROM hardware_commands
WHERE created_at > datetime('now', '-1 day')
GROUP BY type;
```

---

## ⚠️ Important Notes

1. **UV Safety**: Auto mode will NEVER turn on UV lights automatically - only manual control
2. **Human Override**: Manual commands always take priority
3. **Cooldown**: 10 minutes between automated actions prevents oscillation
4. **Rate Limiting**: Max 6 actions/hour prevents excessive automation
5. **Monitoring**: Always check logs to verify automated behavior

---

## 🚀 Next Steps

After integration:

1. ✅ Test with simulated sensor data
2. ✅ Monitor logs for automated actions
3. ✅ Verify hardware responds correctly
4. ✅ Test manual override capability
5. ✅ Add frontend UI toggle for auto mode

---

## 📝 Frontend Integration

To add a toggle in the frontend:

```typescript
// In settings panel
<label>
  <input
    type="checkbox"
    checked={settings.autoMode}
    onChange={(e) => updateSetting('autoMode', e.target.checked)}
  />
  AI Auto Mode (让 AI 自动控制设备)
</label>

// Show status indicator
{autoModeStatus.enabled && (
  <div className="auto-mode-indicator">
    🤖 AI 自动模式运行中
    {autoModeStatus.lastAction && (
      <span>最近操作: {autoModeStatus.lastAction.action}</span>
    )}
  </div>
)}
```

---

## 🎉 Benefits

✅ Automatic water refill when low
✅ Smart temperature control
✅ Automatic feeding when cat is present
✅ Energy saving (turns off fan when not needed)
✅ Safety mechanisms prevent over-control
✅ Full logging and monitoring
✅ User can override or disable anytime

