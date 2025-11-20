/**
 * autoModeManager.ts
 *
 * AI-powered automatic control system for Smart Cat Home
 *
 * Features:
 * - Monitors sensor data when autoMode is enabled
 * - Analyzes conditions and determines optimal actions
 * - Sends hardware commands via AI tool calling
 * - Safety mechanisms to prevent over-control
 * - Cooldown periods between automated actions
 */

import type { SmartHomeSnapshot, ChatToolCall } from './types'

interface AutoAction {
  timestamp: number
  action: string
  reason: string
}

interface AutoModeConfig {
  enabled: boolean
  checkIntervalMs: number
  actionCooldownMs: number
  maxActionsPerHour: number
}

const defaultConfig: AutoModeConfig = {
  enabled: false,
  checkIntervalMs: 60 * 1000, // Check every minute
  actionCooldownMs: 10 * 60 * 1000, // 10 minutes between actions
  maxActionsPerHour: 6, // Maximum 6 automated actions per hour
}

class AutoModeManager {
  private config: AutoModeConfig
  private recentActions: AutoAction[] = []
  private lastCheckTimestamp: number = 0
  private intervalHandle: NodeJS.Timeout | null = null

  constructor(config?: Partial<AutoModeConfig>) {
    this.config = { ...defaultConfig, ...config }
  }

  /**
   * Start automatic monitoring
   */
  start(
    getSnapshot: () => SmartHomeSnapshot | null,
    executeToolCall: (call: ChatToolCall) => Promise<unknown>
  ): void {
    if (this.intervalHandle) {
      console.warn('[auto-mode] Already running, stopping previous instance')
      this.stop()
    }

    console.log('[auto-mode] Starting automatic control system')

    this.intervalHandle = setInterval(async () => {
      try {
        await this.checkAndAct(getSnapshot, executeToolCall)
      } catch (error) {
        console.error('[auto-mode] Check failed:', error)
      }
    }, this.config.checkIntervalMs)
  }

  /**
   * Stop automatic monitoring
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle)
      this.intervalHandle = null
      console.log('[auto-mode] Stopped automatic control system')
    }
  }

  /**
   * Enable or disable auto mode
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled
    console.log(`[auto-mode] ${enabled ? 'Enabled' : 'Disabled'}`)
  }

  /**
   * Check current conditions and take action if needed
   */
  private async checkAndAct(
    getSnapshot: () => SmartHomeSnapshot | null,
    executeToolCall: (call: ChatToolCall) => Promise<unknown>
  ): Promise<void> {
    if (!this.config.enabled) {
      return
    }

    const snapshot = getSnapshot()
    if (!snapshot) {
      return
    }

    // Skip if not in auto mode
    if (!snapshot.settings.autoMode) {
      return
    }

    const now = Date.now()

    // Clean up old actions (older than 1 hour)
    this.recentActions = this.recentActions.filter(a => now - a.timestamp < 60 * 60 * 1000)

    // Check if we've exceeded max actions per hour
    if (this.recentActions.length >= this.config.maxActionsPerHour) {
      console.log('[auto-mode] Max actions per hour reached, skipping')
      return
    }

    // Check cooldown period
    if (this.recentActions.length > 0) {
      const lastAction = this.recentActions[this.recentActions.length - 1] ?? null
      if (lastAction && now - lastAction.timestamp < this.config.actionCooldownMs) {
        return // Still in cooldown period
      }
    }

    // Analyze conditions and determine action
    const action = this.analyzeConditions(snapshot)
    if (!action) {
      return // No action needed
    }

    console.log(`[auto-mode] Taking action: ${action.action} (${action.reason})`)

    try {
      // Execute the hardware control command
      await executeToolCall(action.toolCall)

      // Record the action
      this.recentActions.push({
        timestamp: now,
        action: action.action,
        reason: action.reason,
      })

      console.log(`[auto-mode] Action completed successfully: ${action.action}`)
    } catch (error) {
      console.error('[auto-mode] Action failed:', error)
    }
  }

  /**
   * Analyze sensor data and determine if any action is needed
   */
  private analyzeConditions(snapshot: SmartHomeSnapshot): {
    action: string
    reason: string
    toolCall: ChatToolCall
  } | null {
    const { reading } = snapshot

    // Priority 1: Water level critical (< 20%)
    if (reading.waterLevelPercent !== undefined && reading.waterLevelPercent < 20) {
      return {
        action: 'trigger_water_pump',
        reason: `Water level critical: ${reading.waterLevelPercent.toFixed(1)}%`,
        toolCall: {
          tool: 'hardwareControl',
          args: {
            target: 'hydration',
            action: 'pulse',
            durationMs: 3000, // 3 seconds pulse
          },
        },
      }
    }

    // Priority 2: Temperature too high (> 30°C) - turn on fan
    if (reading.temperatureC > 30 && reading.uvFan && !reading.uvFan.fanOn) {
      return {
        action: 'enable_cooling_fan',
        reason: `Temperature high: ${reading.temperatureC.toFixed(1)}°C`,
        toolCall: {
          tool: 'hardwareControl',
          args: {
            target: 'uvFan',
            action: 'setState',
            fanOn: true,
            uvOn: false, // Safety: don't turn on UV automatically
          },
        },
      }
    }

    // Priority 3: Temperature normalized (< 26°C) - turn off fan to save energy
    if (reading.temperatureC < 26 && reading.uvFan && reading.uvFan.fanOn && !reading.uvFan.cleaningActive) {
      return {
        action: 'disable_cooling_fan',
        reason: `Temperature normalized: ${reading.temperatureC.toFixed(1)}°C`,
        toolCall: {
          tool: 'hardwareControl',
          args: {
            target: 'uvFan',
            action: 'setState',
            fanOn: false,
            uvOn: false,
          },
        },
      }
    }

    // Priority 4: Cat detected and food weight low (< 20g)
    if (
      reading.catPresent &&
      reading.foodWeightGrams !== undefined &&
      reading.foodWeightGrams < 20 &&
      reading.feeder &&
      !reading.feeder.feedingActive
    ) {
      return {
        action: 'start_feeding',
        reason: `Cat present, food low: ${reading.foodWeightGrams.toFixed(1)}g`,
        toolCall: {
          tool: 'hardwareControl',
          args: {
            target: 'feeder',
            action: 'feed',
            targetGrams: 50, // Default target
            minGrams: 40,
          },
        },
      }
    }

    // No action needed
    return null
  }

  /**
   * Get current status
   */
  getStatus(): {
    enabled: boolean
    running: boolean
    recentActionsCount: number
    lastAction: AutoAction | null
  } {
    return {
      enabled: this.config.enabled,
      running: this.intervalHandle !== null,
      recentActionsCount: this.recentActions.length,
      lastAction: this.recentActions.length > 0
        ? this.recentActions[this.recentActions.length - 1] ?? null
        : null,
    }
  }
}

// Singleton instance
let autoModeManagerInstance: AutoModeManager | null = null

export function initializeAutoModeManager(config?: Partial<AutoModeConfig>): void {
  if (autoModeManagerInstance) {
    console.warn('[auto-mode] Already initialized, recreating')
  }
  autoModeManagerInstance = new AutoModeManager(config)
}

export function getAutoModeManager(): AutoModeManager {
  if (!autoModeManagerInstance) {
    throw new Error('[auto-mode] AutoModeManager not initialized')
  }
  return autoModeManagerInstance
}

export function startAutoMode(
  getSnapshot: () => SmartHomeSnapshot | null,
  executeToolCall: (call: ChatToolCall) => Promise<unknown>
): void {
  const manager = getAutoModeManager()
  manager.setEnabled(true)
  manager.start(getSnapshot, executeToolCall)
}

export function stopAutoMode(): void {
  const manager = getAutoModeManager()
  manager.setEnabled(false)
  manager.stop()
}

export function getAutoModeStatus(): ReturnType<AutoModeManager['getStatus']> {
  const manager = getAutoModeManager()
  return manager.getStatus()
}
