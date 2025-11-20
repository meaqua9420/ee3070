import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { DEFAULT_HISTORY_LIMIT } from './constants'
import { logger } from './logger'
import type {
  LanguageCode,
  SmartHomeSettings,
  SmartHomeSnapshot,
  CalibrationProfile,
  AutomationAlert,
  AlertMessageKey,
  ToolExecutionLog,
  NotificationFixLog,
  AlertRule,
  ChatFavorite,
  CareTask,
  CareTaskStatus,
  CarePlugin,
  CatProfile,
  BehaviorProfile,
  DashboardLayoutPreference,
  DashboardLayoutUpdate,
} from './types'

export interface StoredPushSubscription {
  endpoint: string
  keys?: {
    p256dh?: string
    auth?: string
  }
  [key: string]: unknown
}

export type NativePushPlatform = 'ios' | 'android'
export type NativePushTransport = 'apns' | 'fcm'

export interface NativePushDeviceRecord {
  token: string
  platform: NativePushPlatform
  transport: NativePushTransport
  language: LanguageCode
  metadata?: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type HardwareCommandStatus = 'pending' | 'claimed' | 'completed' | 'failed'

export interface HardwareCommandRecord {
  id: number
  type: string
  payload: unknown
  status: HardwareCommandStatus
  createdAt: string
  claimedAt?: string | null
  completedAt?: string | null
  resultMessage?: string | null
}

const DB_PATH =
  process.env.DB_PATH ?? path.resolve(process.cwd(), 'smart-cat-home.db')

const db = new Database(DB_PATH)

// Export database instance for modules that need direct access
export function getDb() {
  return db
}

// 🔒 配置 SQLite WAL 模式以支持并发读写 / Configure SQLite WAL mode for concurrent read/write
// WAL (Write-Ahead Logging) allows multiple readers while a writer is active
const walResult = db.pragma('journal_mode = WAL', { simple: true })
logger.info(`[database] Journal mode: ${walResult}`)

// 🔒 设置合理的 WAL 检查点大小 / Set reasonable WAL checkpoint size
// 默认 1000 页，改为 2000 以减少检查点频率（约 4MB）
db.pragma('wal_autocheckpoint = 2000')

// 🔒 设置同步模式为 NORMAL（安全且高效）/ Set synchronous mode to NORMAL (safe and efficient)
// FULL = 最安全但慢 / Most safe but slow
// NORMAL = 平衡（推荐） / Balanced (recommended)
// OFF = 最快但有数据丢失风险 / Fastest but risk data loss
db.pragma('synchronous = NORMAL')

// 🔒 启用外键约束 / Enable foreign key constraints
db.pragma('foreign_keys = ON')

logger.info('[database] SQLite optimizations applied')

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const configuredHistoryLimit = parsePositiveInt(process.env.HISTORY_LIMIT, DEFAULT_HISTORY_LIMIT)
const configuredHistoryCacheLimit = parsePositiveInt(process.env.HISTORY_CACHE_LIMIT, 0)
const HISTORY_CACHE_LIMIT =
  configuredHistoryCacheLimit > 0
    ? Math.max(configuredHistoryLimit, configuredHistoryCacheLimit)
    : Math.max(configuredHistoryLimit, 120)

const historyCache = new Map<string, SmartHomeSnapshot[]>()

function normalizeCatId(catId?: string | null): string {
  if (typeof catId === 'string') {
    const trimmed = catId.trim()
    if (trimmed.length > 0) {
      return trimmed
    }
  }
  return 'default'
}

function cloneHistorySlice(entries: SmartHomeSnapshot[], limit: number): SmartHomeSnapshot[] {
  if (entries.length <= limit) {
    return entries.slice()
  }
  return entries.slice(0, limit)
}

function dedupeSnapshots(entries: SmartHomeSnapshot[], limit: number): SmartHomeSnapshot[] {
  const seen = new Set<string>()
  const deduped: SmartHomeSnapshot[] = []
  for (const snapshot of entries) {
    const timestamp = snapshot.reading?.timestamp
    if (!timestamp || seen.has(timestamp)) {
      continue
    }
    deduped.push(snapshot)
    seen.add(timestamp)
    if (deduped.length >= limit) {
      break
    }
  }
  return deduped
}

function replaceHistoryCache(catId: string, snapshots: SmartHomeSnapshot[], limitHint: number) {
  if (snapshots.length === 0) {
    historyCache.delete(catId)
    return
  }
  const cacheSize = Math.max(HISTORY_CACHE_LIMIT, limitHint, snapshots.length)
  historyCache.set(catId, dedupeSnapshots(snapshots, cacheSize))
}

function appendSnapshotsToCache(catId: string, snapshots: SmartHomeSnapshot[], limitHint: number) {
  if (snapshots.length === 0) {
    return
  }
  const existing = historyCache.get(catId)
  if (!existing || existing.length === 0) {
    replaceHistoryCache(catId, snapshots, limitHint)
    return
  }
  const cacheSize = Math.max(HISTORY_CACHE_LIMIT, limitHint, existing.length + snapshots.length)
  historyCache.set(catId, dedupeSnapshots([...snapshots, ...existing], cacheSize))
}

function readHistoryCache(catId: string, limit: number): SmartHomeSnapshot[] | null {
  const cached = historyCache.get(catId)
  if (!cached || cached.length === 0) {
    return null
  }
  return cloneHistorySlice(cached, limit)
}

function clearHistoryCache(catId?: string) {
  if (typeof catId === 'string' && catId.length > 0) {
    historyCache.delete(catId)
    return
  }
  historyCache.clear()
}

type Migration = {
  id: string
  up: (database: Database.Database) => void
}

const MIGRATIONS: Migration[] = [
  {
    id: '001_initial_schema',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS snapshots (
          timestamp TEXT PRIMARY KEY,
          snapshot_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          payload TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS preferences (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          language TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS push_subscriptions (
          endpoint TEXT PRIMARY KEY,
          language TEXT NOT NULL,
          payload TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS calibration (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          payload TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS automation_alerts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL,
          message TEXT NOT NULL,
          severity TEXT NOT NULL,
          message_key TEXT,
          message_variables TEXT
        );

        CREATE TABLE IF NOT EXISTS memories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          content TEXT NOT NULL,
          source TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS pinned_tool_events (
          timestamp TEXT PRIMARY KEY,
          tool TEXT NOT NULL,
          success INTEGER NOT NULL,
          message TEXT NOT NULL,
          args_json TEXT,
          output TEXT,
          duration_ms INTEGER,
          pinned_at TEXT NOT NULL
        );
      `)

      const hasPayloadColumn = (database
        .prepare(`PRAGMA table_info(push_subscriptions)`)
        .all() as Array<{ name: string }>).some((column) => column.name === 'payload')

      if (!hasPayloadColumn) {
        database.exec(`ALTER TABLE push_subscriptions ADD COLUMN payload TEXT`)
      }
    },
  },
  {
    id: '002_notification_fix_logs',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS notification_fixes (
          id TEXT PRIMARY KEY,
          step TEXT NOT NULL,
          success INTEGER NOT NULL,
          message TEXT,
          created_at TEXT NOT NULL
        );
      `)
    },
  },
  {
    id: '003_alert_rules',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS alert_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          metric TEXT NOT NULL,
          comparison TEXT NOT NULL,
          threshold REAL NOT NULL,
          severity TEXT NOT NULL,
          message TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `)
    },
  },
  {
    id: '004_chat_favorites',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS chat_favorites (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          message_id TEXT,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          metadata_json TEXT,
          created_at TEXT NOT NULL,
          UNIQUE(message_id)
        );
      `)
    },
  },
  {
    id: '005_hardware_commands',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS hardware_commands (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          payload_json TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          result_message TEXT,
          created_at TEXT NOT NULL,
          claimed_at TEXT,
          completed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_hardware_commands_status_created
          ON hardware_commands (status, created_at);
      `)
    },
  },
  {
    id: '006_care_tasks',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS care_tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          category TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          source TEXT NOT NULL,
          metadata_json TEXT,
          due_at TEXT,
          created_at TEXT NOT NULL,
          completed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_care_tasks_status ON care_tasks (status, due_at);
      `)
    },
  },
  {
    id: '007_care_plugins',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS care_plugins (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          capabilities_json TEXT,
          api_base_url TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          metadata_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_care_plugins_name ON care_plugins (name);
      `)
    },
  },
  {
    id: '008_performance_indexes',
    up: (database) => {
      // 🚀 效能優化索引 / Performance optimization indexes
      // 為經常查詢的時間戳欄位建立索引，可將查詢速度提升 10-20 倍
      // Create indexes for frequently queried timestamp columns for 10-20x speedup
      database.exec(`
        -- automation_alerts: ORDER BY timestamp DESC 查詢
        CREATE INDEX IF NOT EXISTS idx_automation_alerts_timestamp
          ON automation_alerts (timestamp DESC);

        -- memories: ORDER BY created_at DESC 查詢
        CREATE INDEX IF NOT EXISTS idx_memories_created_at
          ON memories (created_at DESC);

        -- chat_favorites: ORDER BY created_at DESC 查詢
        CREATE INDEX IF NOT EXISTS idx_chat_favorites_created_at
          ON chat_favorites (created_at DESC);

        -- notification_fixes: ORDER BY created_at DESC 查詢
        CREATE INDEX IF NOT EXISTS idx_notification_fixes_created_at
          ON notification_fixes (created_at DESC);

        -- alert_rules: WHERE enabled = 1 查詢（啟用的規則）
        CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled
          ON alert_rules (enabled, id);
      `)
      logger.info('[db] ✅ Performance indexes created successfully')
    },
  },
  {
    id: '009_multi_cat_support',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS cats (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          avatar_url TEXT,
          breed TEXT,
          birthdate TEXT,
          weight_kg REAL,
          notes TEXT,
          tags_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `)

      const defaultCatExists =
        (database
          .prepare(`SELECT COUNT(*) AS count FROM cats WHERE id = 'default'`)
          .get() as { count: number }).count > 0
      if (!defaultCatExists) {
        const now = new Date().toISOString()
        database
          .prepare(
            `INSERT INTO cats (id, name, created_at, updated_at)
             VALUES ('default', 'Default Cat', @created_at, @updated_at)`,
          )
          .run({ created_at: now, updated_at: now })
      }

      const snapshotColumns = database
        .prepare(`PRAGMA table_info(snapshots)`)
        .all() as Array<{ name: string }>
      const hasCatId = snapshotColumns.some((column) => column.name === 'cat_id')

      if (!hasCatId) {
        database.exec(`
          CREATE TABLE IF NOT EXISTS snapshots__new (
            cat_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            snapshot_json TEXT NOT NULL,
            PRIMARY KEY (cat_id, timestamp),
            FOREIGN KEY (cat_id) REFERENCES cats(id) ON DELETE CASCADE
          );
        `)

        database.exec(`
          INSERT INTO snapshots__new (cat_id, timestamp, snapshot_json)
          SELECT 'default', timestamp, snapshot_json FROM snapshots;
        `)

        database.exec(`DROP TABLE snapshots;`)
        database.exec(`ALTER TABLE snapshots__new RENAME TO snapshots;`)
        database.exec(
          `CREATE INDEX IF NOT EXISTS idx_snapshots_cat_id_timestamp
             ON snapshots (cat_id, timestamp DESC);`,
        )
      }
    },
  },
  {
    id: '010_behavior_learning',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS cat_behavior_profiles (
          cat_id TEXT PRIMARY KEY,
          window_hours INTEGER NOT NULL,
          sample_count INTEGER NOT NULL,
          summary_json TEXT NOT NULL,
          insights_json TEXT,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (cat_id) REFERENCES cats(id) ON DELETE CASCADE
        );
      `)
    },
  },
  {
    id: '011_user_preferences',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS user_preferences (
          username TEXT PRIMARY KEY,
          preferences_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `)
    },
  },
  {
    id: '012_calibration_history',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS calibration_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          calibration_json TEXT NOT NULL,
          change_summary TEXT,
          changed_fields TEXT,
          changed_by TEXT NOT NULL,
          previous_values TEXT,
          new_values TEXT,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_calibration_history_created_at
          ON calibration_history (created_at DESC);
      `)
    },
  },
  {
    id: '013_file_uploads',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS file_uploads (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          cat_id TEXT,
          filename TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          file_type TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          storage_path TEXT NOT NULL,
          analysis_result TEXT,
          uploaded_at TEXT NOT NULL,
          FOREIGN KEY (cat_id) REFERENCES cats(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_file_uploads_user_id
          ON file_uploads (user_id);

        CREATE INDEX IF NOT EXISTS idx_file_uploads_cat_id
          ON file_uploads (cat_id);

        CREATE INDEX IF NOT EXISTS idx_file_uploads_uploaded_at
          ON file_uploads (uploaded_at DESC);

        CREATE INDEX IF NOT EXISTS idx_file_uploads_file_type
          ON file_uploads (file_type);
      `)
    },
  },
  {
    id: '014_knowledge_extraction',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS extracted_knowledge (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          content TEXT NOT NULL,
          source TEXT NOT NULL,
          confidence REAL NOT NULL,
          cat_id TEXT,
          related_date TEXT,
          tags TEXT,
          created_at TEXT NOT NULL,
          importance TEXT NOT NULL,
          FOREIGN KEY (cat_id) REFERENCES cats(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_knowledge_cat_id
          ON extracted_knowledge (cat_id);

        CREATE INDEX IF NOT EXISTS idx_knowledge_type
          ON extracted_knowledge (type);

        CREATE INDEX IF NOT EXISTS idx_knowledge_created_at
          ON extracted_knowledge (created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_knowledge_importance
          ON extracted_knowledge (importance);

        CREATE INDEX IF NOT EXISTS idx_knowledge_content
          ON extracted_knowledge (content);
      `)
    },
  },
  {
    id: '015_proactive_insights',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS proactive_insights (
          id TEXT PRIMARY KEY,
          category TEXT NOT NULL,
          priority TEXT NOT NULL,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          recommendation TEXT NOT NULL,
          related_data TEXT,
          cat_id TEXT,
          created_at TEXT NOT NULL,
          expires_at TEXT,
          dismissed INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (cat_id) REFERENCES cats(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_insights_cat_id
          ON proactive_insights (cat_id);

        CREATE INDEX IF NOT EXISTS idx_insights_priority
          ON proactive_insights (priority);

        CREATE INDEX IF NOT EXISTS idx_insights_dismissed
          ON proactive_insights (dismissed);

        CREATE INDEX IF NOT EXISTS idx_insights_created_at
          ON proactive_insights (created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_insights_expires_at
          ON proactive_insights (expires_at);
      `)
    },
  },
  {
    id: '016_fix_insights_foreign_key',
    up: (database) => {
      // Drop and recreate table with correct foreign key
      database.exec(`
        -- Backup existing data
        CREATE TABLE IF NOT EXISTS proactive_insights_backup AS
          SELECT * FROM proactive_insights;

        -- Drop old table
        DROP TABLE IF EXISTS proactive_insights;

        -- Recreate with correct foreign key (referencing cats table)
        CREATE TABLE proactive_insights (
          id TEXT PRIMARY KEY,
          category TEXT NOT NULL,
          priority TEXT NOT NULL,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          recommendation TEXT NOT NULL,
          related_data TEXT,
          cat_id TEXT,
          created_at TEXT NOT NULL,
          expires_at TEXT,
          dismissed INTEGER NOT NULL DEFAULT 0
        );

        -- Restore data
        INSERT INTO proactive_insights
          SELECT * FROM proactive_insights_backup;

        -- Drop backup
        DROP TABLE proactive_insights_backup;

        -- Recreate indexes
        CREATE INDEX idx_insights_cat_id
          ON proactive_insights (cat_id);

        CREATE INDEX idx_insights_priority
          ON proactive_insights (priority);

        CREATE INDEX idx_insights_dismissed
          ON proactive_insights (dismissed);

        CREATE INDEX idx_insights_created_at
          ON proactive_insights (created_at DESC);

        CREATE INDEX idx_insights_expires_at
          ON proactive_insights (expires_at);
      `)
    },
  },
  {
    id: '017_native_push_devices',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS native_push_devices (
          token TEXT PRIMARY KEY,
          platform TEXT NOT NULL,
          transport TEXT NOT NULL DEFAULT 'apns',
          language TEXT NOT NULL,
          metadata_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_native_push_platform
          ON native_push_devices (platform);

        CREATE INDEX IF NOT EXISTS idx_native_push_transport
          ON native_push_devices (transport);
      `)
    },
  },
  {
    id: '018_pet_profiles',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS pet_profiles (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL CHECK(type IN ('cat', 'dog', 'bird', 'custom')),
          name TEXT NOT NULL,
          custom_label TEXT,
          icon TEXT,
          temperature_range_min REAL NOT NULL DEFAULT 18,
          temperature_range_max REAL NOT NULL DEFAULT 28,
          humidity_range_min REAL NOT NULL DEFAULT 40,
          humidity_range_max REAL NOT NULL DEFAULT 60,
          water_target REAL NOT NULL DEFAULT 200,
          feeding_schedule TEXT NOT NULL DEFAULT '08:00,18:00',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_pet_profiles_type ON pet_profiles(type);
        CREATE INDEX IF NOT EXISTS idx_pet_profiles_created_at ON pet_profiles(created_at);

        -- Insert default cat profile
        INSERT OR IGNORE INTO pet_profiles (
          id, type, name, custom_label, icon,
          temperature_range_min, temperature_range_max,
          humidity_range_min, humidity_range_max,
          water_target, feeding_schedule,
          created_at, updated_at
        ) VALUES (
          'default',
          'cat',
          'Meme',
          NULL,
          '🐱',
          18, 28,
          40, 60,
          200,
          '08:00,18:00',
          datetime('now'),
          datetime('now')
        );
      `)
    },
  },
]

function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)

  const applied = new Set(
    (db.prepare(`SELECT id FROM schema_migrations`).all() as Array<{ id: string }>).map((row) => row.id),
  )

  const insertMigrationStmt = db.prepare(
    `INSERT INTO schema_migrations (id, applied_at) VALUES (@id, @appliedAt)`,
  )

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue

    const apply = db.transaction(() => {
      migration.up(db)
      insertMigrationStmt.run({ id: migration.id, appliedAt: new Date().toISOString() })
    })

    apply()
  }
}

runMigrations()

const insertHardwareCommandStmt = db.prepare(
  `INSERT INTO hardware_commands (type, payload_json, status, created_at)
   VALUES (@type, @payload_json, 'pending', @created_at)`
)

// 🔒 原子性命令領取查詢（防止競爭條件）
// Atomic command claiming query (prevents race conditions)
// 使用 UPDATE...RETURNING 在單一原子操作中同時更新和返回記錄
// Uses UPDATE...RETURNING to update and return the record in a single atomic operation
const claimHardwareCommandAtomicStmt = db.prepare(
  `UPDATE hardware_commands
   SET status = 'claimed', claimed_at = @claimed_at
   WHERE id = (
     SELECT id
     FROM hardware_commands
     WHERE status = 'pending'
     ORDER BY created_at ASC
     LIMIT 1
   )
   RETURNING id, type, payload_json AS payloadJson, status, result_message AS resultMessage,
             created_at AS createdAt, claimed_at AS claimedAt, completed_at AS completedAt`
)

const selectHardwareCommandByIdStmt = db.prepare(
  `SELECT id, type, payload_json AS payloadJson, status, result_message AS resultMessage,
          created_at AS createdAt, claimed_at AS claimedAt, completed_at AS completedAt
   FROM hardware_commands
   WHERE id = @id`
)

const updateHardwareCommandStatusStmt = db.prepare(
  `UPDATE hardware_commands
   SET status = @status, result_message = @result_message, completed_at = @completed_at
   WHERE id = @id`
)

const insertSnapshotStmt = db.prepare(
  `INSERT INTO snapshots (cat_id, timestamp, snapshot_json)
   VALUES (@cat_id, @timestamp, @snapshot_json)
   ON CONFLICT(cat_id, timestamp) DO UPDATE SET snapshot_json = excluded.snapshot_json`,
)

const deleteOldSnapshotsStmt = db.prepare(
  `DELETE FROM snapshots
   WHERE cat_id = @cat_id
     AND timestamp NOT IN (
       SELECT timestamp FROM snapshots
       WHERE cat_id = @cat_id
       ORDER BY timestamp DESC
       LIMIT @limit
     )`,
)

const selectLatestSnapshotStmt = db.prepare(
  `SELECT snapshot_json FROM snapshots
   WHERE cat_id = @cat_id
   ORDER BY timestamp DESC
   LIMIT 1`,
)

const selectHistoryStmt = db.prepare(
  `SELECT snapshot_json FROM snapshots
   WHERE cat_id = @cat_id
   ORDER BY timestamp DESC
   LIMIT @limit`,
)

const selectHistorySinceStmt = db.prepare(
  `SELECT snapshot_json FROM snapshots
   WHERE cat_id = @cat_id
     AND timestamp >= @since
   ORDER BY timestamp DESC`,
)

const upsertBehaviorProfileStmt = db.prepare(
  `INSERT INTO cat_behavior_profiles (cat_id, window_hours, sample_count, summary_json, insights_json, updated_at)
   VALUES (@cat_id, @window_hours, @sample_count, @summary_json, @insights_json, @updated_at)
   ON CONFLICT(cat_id) DO UPDATE SET
     window_hours = excluded.window_hours,
     sample_count = excluded.sample_count,
     summary_json = excluded.summary_json,
     insights_json = excluded.insights_json,
     updated_at = excluded.updated_at`,
)

const selectBehaviorProfileStmt = db.prepare(
  `SELECT cat_id AS catId,
          window_hours AS windowHours,
          sample_count AS sampleCount,
          summary_json AS summaryJson,
          insights_json AS insightsJson,
          updated_at AS updatedAt
     FROM cat_behavior_profiles
    WHERE cat_id = @cat_id`,
)

const selectUserPreferencesStmt = db.prepare(
  `SELECT preferences_json AS preferencesJson,
          updated_at AS updatedAt
     FROM user_preferences
    WHERE username = @username`,
)

const upsertUserPreferencesStmt = db.prepare(
  `INSERT INTO user_preferences (username, preferences_json, updated_at)
   VALUES (@username, @preferences_json, @updated_at)
   ON CONFLICT(username) DO UPDATE SET
     preferences_json = excluded.preferences_json,
     updated_at = excluded.updated_at`,
)

type UpsertCatPayload = {
  id?: string
  name: string
  avatarUrl?: string | null
  breed?: string | null
  birthdate?: string | null
  weightKg?: number | null
  notes?: string | null
  tags?: string[] | null
}

function serializeTags(tags: string[] | null | undefined): string | null {
  if (!tags) return null
  const filtered = tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0)
  return filtered.length > 0 ? JSON.stringify(filtered) : null
}

type StoredBehaviorProfileRow = {
  catId: string
  windowHours: number
  sampleCount: number
  summaryJson: string | null
  insightsJson: string | null
  updatedAt: string
}

type StoredUserPreferencesRow = {
  preferencesJson: string | null
  updatedAt: string
}

function mapBehaviorProfileRow(row: StoredBehaviorProfileRow): BehaviorProfile | null {
  let summary: Partial<BehaviorProfile> & Record<string, unknown> = {}
  let insights: {
    activityNotes?: { zh?: string[]; en?: string[] }
    careRecommendations?: { zh?: string[]; en?: string[] }
  } = {}
  if (row.summaryJson) {
    try {
      summary = JSON.parse(row.summaryJson) as typeof summary
    } catch (error) {
      logger.warn('[db] Failed to parse behavior summary JSON', { error })
    }
  }
  if (row.insightsJson) {
    try {
      insights = JSON.parse(row.insightsJson) as typeof insights
    } catch (error) {
      logger.warn('[db] Failed to parse behavior insights JSON', { error })
    }
  }
  try {
    return {
      catId: row.catId,
      windowHours: row.windowHours,
      sampleCount: row.sampleCount,
      updatedAt: row.updatedAt,
      confidence: (summary.confidence as BehaviorProfile['confidence']) ?? 'low',
      presencePercent:
        typeof summary.presencePercent === 'number' && Number.isFinite(summary.presencePercent)
          ? summary.presencePercent
          : null,
      longestHomeMinutes:
        typeof summary.longestHomeMinutes === 'number' && Number.isFinite(summary.longestHomeMinutes)
          ? summary.longestHomeMinutes
          : null,
      longestAwayMinutes:
        typeof summary.longestAwayMinutes === 'number' && Number.isFinite(summary.longestAwayMinutes)
          ? summary.longestAwayMinutes
          : null,
      hydrationAverageMl:
        typeof summary.hydrationAverageMl === 'number' && Number.isFinite(summary.hydrationAverageMl)
          ? summary.hydrationAverageMl
          : null,
      hydrationTrend:
        summary.hydrationTrend === 'rising' || summary.hydrationTrend === 'falling' ? summary.hydrationTrend : 'stable',
      hydrationChangeMl:
        typeof summary.hydrationChangeMl === 'number' && Number.isFinite(summary.hydrationChangeMl)
          ? summary.hydrationChangeMl
          : null,
      peakPeriods: Array.isArray(summary.peakPeriods) ? (summary.peakPeriods as BehaviorProfile['peakPeriods']) : [],
      quietHours: Array.isArray(summary.quietHours) ? (summary.quietHours as BehaviorProfile['quietHours']) : [],
      activityNotes: {
        zh: Array.isArray(insights.activityNotes?.zh) ? insights.activityNotes?.zh ?? [] : [],
        en: Array.isArray(insights.activityNotes?.en) ? insights.activityNotes?.en ?? [] : [],
      },
      careRecommendations: {
        zh: Array.isArray(insights.careRecommendations?.zh) ? insights.careRecommendations?.zh ?? [] : [],
        en: Array.isArray(insights.careRecommendations?.en) ? insights.careRecommendations?.en ?? [] : [],
      },
    }
  } catch (error) {
    logger.warn('[db] Failed to map behavior profile row', { error })
    return null
  }
}

function sanitizePanelArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const result: string[] = []
  const seen = new Set<string>()
  for (const value of raw) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed || trimmed.length > 64) continue
    if (!/^[a-z0-9:_-]+$/i.test(trimmed)) continue
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

function loadUserPreferencesJson(username: string): { preferences: Record<string, unknown>; updatedAt: string } | null {
  const row = selectUserPreferencesStmt.get({ username }) as StoredUserPreferencesRow | undefined
  if (!row) return null
  if (!row.preferencesJson) {
    return {
      preferences: {},
      updatedAt: row.updatedAt,
    }
  }
  try {
    const parsed = JSON.parse(row.preferencesJson) as Record<string, unknown>
    return {
      preferences: parsed ?? {},
      updatedAt: row.updatedAt,
    }
  } catch (error) {
    logger.warn('[db] Failed to parse user preferences JSON', { error })
    return {
      preferences: {},
      updatedAt: row.updatedAt,
    }
  }
}

function persistUserPreferencesJson(username: string, preferences: Record<string, unknown>, updatedAt: string) {
  upsertUserPreferencesStmt.run({
    username,
    preferences_json: JSON.stringify(preferences),
    updated_at: updatedAt,
  })
}

function parseTagsJson(value: unknown): string[] | null {
  if (!value) return null
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0)
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      if (!Array.isArray(parsed)) return null
      return parsed
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0)
    } catch {
      return null
    }
  }
  return null
}

function mapCatRow(row: any): CatProfile {
  if (!row) {
    throw new Error('Cat row is undefined')
  }
  return {
    id: row.id,
    name: row.name,
    avatarUrl: row.avatarUrl ?? null,
    breed: row.breed ?? null,
    birthdate: row.birthdate ?? null,
    weightKg: row.weightKg ?? null,
    notes: row.notes ?? null,
    tags: parseTagsJson(row.tagsJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

const selectCatsStmt = db.prepare(
  `SELECT id,
          name,
          avatar_url AS avatarUrl,
          breed,
          birthdate,
          weight_kg AS weightKg,
          notes,
          tags_json AS tagsJson,
          created_at AS createdAt,
          updated_at AS updatedAt
   FROM cats
   ORDER BY created_at ASC`,
)

const selectCatByIdStmt = db.prepare(
  `SELECT id,
          name,
          avatar_url AS avatarUrl,
          breed,
          birthdate,
          weight_kg AS weightKg,
          notes,
          tags_json AS tagsJson,
          created_at AS createdAt,
          updated_at AS updatedAt
   FROM cats
   WHERE id = @id`,
)

const upsertCatStmt = db.prepare(
  `INSERT INTO cats (id, name, avatar_url, breed, birthdate, weight_kg, notes, tags_json, created_at, updated_at)
   VALUES (@id, @name, @avatar_url, @breed, @birthdate, @weight_kg, @notes, @tags_json, @created_at, @updated_at)
   ON CONFLICT(id) DO UPDATE SET
     name = excluded.name,
     avatar_url = excluded.avatar_url,
     breed = excluded.breed,
     birthdate = excluded.birthdate,
     weight_kg = excluded.weight_kg,
     notes = excluded.notes,
     tags_json = excluded.tags_json,
     updated_at = excluded.updated_at`,
)

const deleteCatStmt = db.prepare(`DELETE FROM cats WHERE id = @id`)

const upsertSettingsStmt = db.prepare(
  `INSERT INTO settings (id, payload) VALUES (1, @payload)
   ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`,
)

const getSettingsStmt = db.prepare(`SELECT payload FROM settings WHERE id = 1`)

const upsertLanguageStmt = db.prepare(
  `INSERT INTO preferences (id, language) VALUES (1, @language)
   ON CONFLICT(id) DO UPDATE SET language = excluded.language`,
)

const getLanguageStmt = db.prepare(`SELECT language FROM preferences WHERE id = 1`)

const upsertSubscriptionStmt = db.prepare(
  `INSERT INTO push_subscriptions (endpoint, language, payload, created_at)
   VALUES (@endpoint, @language, @payload, @created_at)
   ON CONFLICT(endpoint) DO UPDATE SET
     language = excluded.language,
     payload = excluded.payload,
     created_at = excluded.created_at`,
)

const selectSubscriptionsStmt = db.prepare(
  `SELECT endpoint, language, payload FROM push_subscriptions`,
)

const deleteSubscriptionStmt = db.prepare(
  `DELETE FROM push_subscriptions WHERE endpoint = @endpoint`,
)

const upsertNativeDeviceStmt = db.prepare(
  `INSERT INTO native_push_devices (token, platform, transport, language, metadata_json, created_at, updated_at)
   VALUES (@token, @platform, @transport, @language, @metadata_json, @timestamp, @timestamp)
   ON CONFLICT(token) DO UPDATE SET
     platform = excluded.platform,
     transport = excluded.transport,
     language = excluded.language,
     metadata_json = excluded.metadata_json,
     updated_at = excluded.updated_at`,
)

const selectNativeDevicesStmt = db.prepare(
  `SELECT token, platform, transport, language, metadata_json AS metadataJson,
          created_at AS createdAt, updated_at AS updatedAt
   FROM native_push_devices`,
)

const deleteNativeDeviceStmt = db.prepare(
  `DELETE FROM native_push_devices WHERE token = @token`,
)

const upsertCalibrationStmt = db.prepare(
  `INSERT INTO calibration (id, payload) VALUES (1, @payload)
   ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`,
)

const getCalibrationStmt = db.prepare(`SELECT payload FROM calibration WHERE id = 1`)

const insertCareTaskStmt = db.prepare(
  `INSERT INTO care_tasks (title, description, category, status, source, metadata_json, due_at, created_at)
   VALUES (@title, @description, @category, @status, @source, @metadata_json, @due_at, @created_at)`,
)

const listCareTasksStmt = db.prepare(
  `SELECT id, title, description, category, status, source,
          metadata_json AS metadataJson, due_at AS dueAt,
          created_at AS createdAt, completed_at AS completedAt
   FROM care_tasks
   ORDER BY status = 'pending' DESC, COALESCE(due_at, created_at) ASC, id DESC
   LIMIT @limit`,
)

const selectCareTaskByIdStmt = db.prepare(
  `SELECT id, title, description, category, status, source,
          metadata_json AS metadataJson, due_at AS dueAt,
          created_at AS createdAt, completed_at AS completedAt
   FROM care_tasks
   WHERE id = @id`,
)

const updateCareTaskStatusStmt = db.prepare(
  `UPDATE care_tasks
   SET status = @status,
       completed_at = @completed_at
   WHERE id = @id`,
)

const deleteCareTaskStmt = db.prepare(
  `DELETE FROM care_tasks WHERE id = @id`,
)

const insertPluginStmt = db.prepare(
  `INSERT INTO care_plugins (name, description, capabilities_json, api_base_url, enabled, metadata_json, created_at, updated_at)
   VALUES (@name, @description, @capabilities_json, @api_base_url, @enabled, @metadata_json, @created_at, @updated_at)
   ON CONFLICT(name) DO UPDATE SET
     description = excluded.description,
     capabilities_json = excluded.capabilities_json,
     api_base_url = excluded.api_base_url,
     enabled = excluded.enabled,
     metadata_json = excluded.metadata_json,
     updated_at = excluded.updated_at`,
)

const listPluginsStmt = db.prepare(
  `SELECT id, name, description, capabilities_json AS capabilitiesJson, api_base_url AS apiBaseUrl,
          enabled, metadata_json AS metadataJson, created_at AS createdAt, updated_at AS updatedAt
   FROM care_plugins
   ORDER BY name ASC`,
)

const selectPluginByNameStmt = db.prepare(
  `SELECT id, name, description, capabilities_json AS capabilitiesJson, api_base_url AS apiBaseUrl,
          enabled, metadata_json AS metadataJson, created_at AS createdAt, updated_at AS updatedAt
   FROM care_plugins
   WHERE name = @name
   LIMIT 1`,
)

const selectPluginByIdStmt = db.prepare(
  `SELECT id, name, description, capabilities_json AS capabilitiesJson, api_base_url AS apiBaseUrl,
          enabled, metadata_json AS metadataJson, created_at AS createdAt, updated_at AS updatedAt
   FROM care_plugins
   WHERE id = @id`,
)

const updatePluginEnabledStmt = db.prepare(
  `UPDATE care_plugins
   SET enabled = @enabled,
       updated_at = @updated_at
   WHERE id = @id`,
)

const deletePluginStmt = db.prepare(
  `DELETE FROM care_plugins WHERE id = @id`,
)

function ensureAutomationAlertColumns() {
  try {
    const columns = db.prepare('PRAGMA table_info(automation_alerts)').all() as Array<{ name: string }>
    const hasKey = columns.some((column) => column.name === 'message_key')
    const hasVariables = columns.some((column) => column.name === 'message_variables')
    if (!hasKey) {
      db.exec('ALTER TABLE automation_alerts ADD COLUMN message_key TEXT')
    }
    if (!hasVariables) {
      db.exec('ALTER TABLE automation_alerts ADD COLUMN message_variables TEXT')
    }
  } catch (error) {
    logger.warn('[db] Failed to ensure automation_alerts columns', { error })
  }
}

ensureAutomationAlertColumns()

const insertAutomationAlertStmt = db.prepare(
  `INSERT INTO automation_alerts (timestamp, message, severity, message_key, message_variables)
   VALUES (@timestamp, @message, @severity, @message_key, @message_variables)`,
)

const selectRecentAlertsStmt = db.prepare(
  `SELECT timestamp, message, severity, message_key AS messageKey, message_variables AS messageVariables
   FROM automation_alerts
   ORDER BY timestamp DESC
   LIMIT ?`,
)

const deleteOldAlertsStmt = db.prepare(
  `DELETE FROM automation_alerts
   WHERE id NOT IN (
     SELECT id FROM automation_alerts ORDER BY timestamp DESC LIMIT ?
   )`,
)

function inferLegacyAlertMetadata(
  message: string,
): { key: AlertMessageKey; variables?: Record<string, string | number | boolean> } | null {
  const trimmed = message.trim()

  const matchWaterCritical =
    trimmed.match(/^水位僅剩\s*(\d+)%[，,]請立即補水。?$/) ??
    trimmed.match(/^Water level at\s*(\d+)%\. Refill immediately\.$/)
  if (matchWaterCritical) {
    const percentText = matchWaterCritical[1]
    if (!percentText) return null
    return {
      key: 'waterLevelCritical',
      variables: { percent: Number.parseInt(percentText, 10) },
    }
  }

  const matchWaterLow =
    trimmed.match(/^水位偏低[（(]\s*(\d+)%[）)]，/) ??
    trimmed.match(/^水位約\s*(\d+)%[，,]?\s*請/) ??
    trimmed.match(/^Water level low\s*\((\d+)%\)\./)
  if (matchWaterLow) {
    const percentText = matchWaterLow[1]
    if (!percentText) return null
    return {
      key: 'waterLevelLow',
      variables: { percent: Number.parseInt(percentText, 10) },
    }
  }

  if (
    /^偵測到貓咪在屋內且環境亮度偏暗/.test(trimmed) ||
    /^Brightness is very low while the cat is inside/.test(trimmed)
  ) {
    return { key: 'brightnessLow' }
  }

  const matchBrightnessHigh =
    trimmed.match(/^偵測到貓咪在屋內且亮度過高[（(]\s*(\d+)%[）)]/) ??
    trimmed.match(/^亮度約\s*(\d+)%，光線過強/) ??
    trimmed.match(/^Brightness extremely high\s*\((\d+)%\)/)
  if (matchBrightnessHigh) {
    const percentText = matchBrightnessHigh[1]
    if (!percentText) return null
    return {
      key: 'brightnessHigh',
      variables: { percent: Number.parseInt(percentText, 10) },
    }
  }

  if (
    trimmed === '偵測到貓咪剛離開智慧貓屋，請確認是否為預期情況。' ||
    trimmed === 'Cat just left the habitat. Monitor if this was expected.'
  ) {
    return { key: 'catLeft' }
  }

  if (
    trimmed === '貓咪離開超過 6 小時且未餵食，請確認其狀態。' ||
    trimmed === 'Cat has been away for over 6 hours since last feeding. Please check on them.'
  ) {
    return { key: 'catAwayTooLong' }
  }

  return null
}

const insertMemoryStmt = db.prepare(
  `INSERT INTO memories (type, content, source, created_at)
   VALUES (@type, @content, @source, @created_at)`,
)

const updateMemoryStmt = db.prepare(
  `UPDATE memories SET content = @content WHERE id = @id`,
)

const deleteMemoryStmt = db.prepare(
  `DELETE FROM memories WHERE id = @id`,
)

const pruneMemoriesStmt = db.prepare(
  `DELETE FROM memories
   WHERE id NOT IN (
     SELECT id
     FROM memories
     ORDER BY datetime(created_at) DESC, id DESC
     LIMIT @limit
   )`,
)

const selectMemoriesStmt = db.prepare(
  `SELECT id, type, content, source, created_at AS createdAt
   FROM memories
   ORDER BY created_at DESC
   LIMIT @limit`,
)

const selectMemoriesByTypeStmt = db.prepare(
  `SELECT id, type, content, source, created_at AS createdAt
   FROM memories
   WHERE type = @type
   ORDER BY created_at DESC
   LIMIT @limit`,
)

const upsertPinnedToolEventStmt = db.prepare(
  `INSERT INTO pinned_tool_events (timestamp, tool, success, message, args_json, output, duration_ms, pinned_at)
   VALUES (@timestamp, @tool, @success, @message, @args_json, @output, @duration_ms, @pinned_at)
   ON CONFLICT(timestamp) DO UPDATE SET
     tool = excluded.tool,
     success = excluded.success,
     message = excluded.message,
     args_json = excluded.args_json,
     output = excluded.output,
     duration_ms = excluded.duration_ms,
     pinned_at = excluded.pinned_at`,
)

const deletePinnedToolEventStmt = db.prepare(
  `DELETE FROM pinned_tool_events WHERE timestamp = @timestamp`,
)

const selectPinnedToolEventsStmt = db.prepare(
  `SELECT timestamp, tool, success, message, args_json AS argsJson, output, duration_ms AS durationMs, pinned_at AS pinnedAt
   FROM pinned_tool_events
   ORDER BY pinned_at DESC`,
)

const insertNotificationFixStmt = db.prepare(
  `INSERT INTO notification_fixes (id, step, success, message, created_at)
   VALUES (@id, @step, @success, @message, @created_at)
   ON CONFLICT(id) DO UPDATE SET
     step = excluded.step,
     success = excluded.success,
     message = excluded.message,
     created_at = excluded.created_at`,
)

const selectNotificationFixesStmt = db.prepare(
  `SELECT id, step, success, message, created_at AS createdAt
   FROM notification_fixes
   ORDER BY created_at DESC
   LIMIT @limit`,
)

const insertAlertRuleStmt = db.prepare(
  `INSERT INTO alert_rules (metric, comparison, threshold, severity, message, enabled, created_at, updated_at)
   VALUES (@metric, @comparison, @threshold, @severity, @message, @enabled, @created_at, @updated_at)`,
)

const updateAlertRuleStmt = db.prepare(
  `UPDATE alert_rules
   SET comparison = @comparison,
       threshold = @threshold,
       severity = @severity,
       message = @message,
       enabled = @enabled,
       updated_at = @updated_at
   WHERE id = @id`,
)

const deleteAlertRuleStmt = db.prepare(
  `DELETE FROM alert_rules WHERE id = @id`,
)

const selectAlertRulesStmt = db.prepare(
  `SELECT id, metric, comparison, threshold, severity, message, enabled, created_at AS createdAt, updated_at AS updatedAt
   FROM alert_rules
   ORDER BY created_at DESC`,
)

const insertChatFavoriteStmt = db.prepare(
  `INSERT INTO chat_favorites (message_id, role, content, metadata_json, created_at)
   VALUES (@message_id, @role, @content, @metadata_json, @created_at)
   ON CONFLICT(message_id) DO UPDATE SET
     role = excluded.role,
     content = excluded.content,
     metadata_json = excluded.metadata_json,
     created_at = excluded.created_at`,
)

const deleteChatFavoriteStmt = db.prepare(
  `DELETE FROM chat_favorites WHERE id = @id OR (message_id IS NOT NULL AND message_id = @message_id)`,
)

const selectChatFavoritesStmt = db.prepare(
  `SELECT id, message_id AS messageId, role, content, metadata_json AS metadataJson, created_at AS createdAt
   FROM chat_favorites
   ORDER BY created_at DESC`,
)

const selectChatFavoriteByIdStmt = db.prepare(
  `SELECT id, message_id AS messageId, role, content, metadata_json AS metadataJson, created_at AS createdAt
   FROM chat_favorites
   WHERE id = @id`,
)

const selectChatFavoriteByMessageIdStmt = db.prepare(
  `SELECT id, message_id AS messageId, role, content, metadata_json AS metadataJson, created_at AS createdAt
   FROM chat_favorites
   WHERE message_id = @message_id
   ORDER BY created_at DESC
   LIMIT 1`,
)

const insertCalibrationHistoryStmt = db.prepare(
  `INSERT INTO calibration_history (calibration_json, change_summary, changed_fields, changed_by, previous_values, new_values, created_at)
   VALUES (@calibration_json, @change_summary, @changed_fields, @changed_by, @previous_values, @new_values, @created_at)`,
)

const selectCalibrationHistoryStmt = db.prepare(
  `SELECT id, calibration_json AS calibrationJson, change_summary AS changeSummary,
          changed_fields AS changedFields, changed_by AS changedBy,
          previous_values AS previousValues, new_values AS newValues,
          created_at AS createdAt
   FROM calibration_history
   ORDER BY created_at DESC
   LIMIT @limit OFFSET @offset`,
)

const selectCalibrationHistoryByIdStmt = db.prepare(
  `SELECT id, calibration_json AS calibrationJson, change_summary AS changeSummary,
          changed_fields AS changedFields, changed_by AS changedBy,
          previous_values AS previousValues, new_values AS newValues,
          created_at AS createdAt
   FROM calibration_history
   WHERE id = @id`,
)

const countCalibrationHistoryStmt = db.prepare(
  `SELECT COUNT(*) AS count FROM calibration_history`,
)

export function saveSnapshot(snapshot: SmartHomeSnapshot, limit = DEFAULT_HISTORY_LIMIT, catId?: string) {
  const resolvedCatId = normalizeCatId(catId ?? snapshot.catId)
  const retentionLimit = Math.max(limit, DEFAULT_HISTORY_LIMIT)
  const enrichedSnapshot: SmartHomeSnapshot = snapshot.catId
    ? snapshot
    : { ...snapshot, catId: resolvedCatId }

  insertSnapshotStmt.run({
    cat_id: resolvedCatId,
    timestamp: enrichedSnapshot.reading.timestamp,
    snapshot_json: JSON.stringify(enrichedSnapshot),
  })

  deleteOldSnapshotsStmt.run({
    cat_id: resolvedCatId,
    limit: retentionLimit,
  })

  appendSnapshotsToCache(resolvedCatId, [enrichedSnapshot], retentionLimit)
}

export function loadLatestSnapshot(catId = 'default'): SmartHomeSnapshot | null {
  const resolvedCatId = normalizeCatId(catId)
  const cached = readHistoryCache(resolvedCatId, 1)
  if (cached && cached.length > 0) {
    return cached[0] ?? null
  }

  const row = selectLatestSnapshotStmt.get({ cat_id: resolvedCatId }) as { snapshot_json: string } | undefined
  if (!row) {
    clearHistoryCache(resolvedCatId)
    return null
  }

  try {
    const snapshot = JSON.parse(row.snapshot_json) as SmartHomeSnapshot
    appendSnapshotsToCache(resolvedCatId, [snapshot], 1)
    return snapshot
  } catch (error) {
    logger.warn('[db] Failed to parse latest snapshot', { error })
    return null
  }
}

export function loadHistory(limit = DEFAULT_HISTORY_LIMIT, catId = 'default'): SmartHomeSnapshot[] {
  const resolvedCatId = normalizeCatId(catId)
  const normalizedLimit = Math.max(limit, 1)
  const cached = readHistoryCache(resolvedCatId, normalizedLimit)
  if (cached) {
    return cached
  }

  const fetchLimit = Math.max(normalizedLimit, HISTORY_CACHE_LIMIT)
  const rows = (selectHistoryStmt.all({ limit: fetchLimit, cat_id: resolvedCatId }) as Array<{ snapshot_json: string }>)
    .map((row) => {
      try {
        return JSON.parse(row.snapshot_json) as SmartHomeSnapshot
      } catch (error) {
        logger.warn('[db] Failed to parse snapshot', { error })
        return null
      }
    })
    .filter((snapshot): snapshot is SmartHomeSnapshot => Boolean(snapshot))

  if (rows.length === 0) {
    clearHistoryCache(resolvedCatId)
    return []
  }

  replaceHistoryCache(resolvedCatId, rows, fetchLimit)
  return cloneHistorySlice(rows, normalizedLimit)
}

export function loadHistorySince(sinceIso: string, catId = 'default'): SmartHomeSnapshot[] {
  const resolvedCatId = normalizeCatId(catId)
  const cachedEntries = historyCache.get(resolvedCatId)
  if (cachedEntries && cachedEntries.length > 0) {
    const oldestCachedTimestamp = cachedEntries[cachedEntries.length - 1]?.reading?.timestamp
    if (!oldestCachedTimestamp || oldestCachedTimestamp <= sinceIso) {
      return cachedEntries
        .filter((snapshot) => {
          const timestamp = snapshot.reading?.timestamp
          return typeof timestamp === 'string' && timestamp >= sinceIso
        })
        .slice()
    }
  }

  const rows = (selectHistorySinceStmt.all({ since: sinceIso, cat_id: resolvedCatId }) as Array<{
    snapshot_json: string
  }>)
    .map((row) => {
      try {
        return JSON.parse(row.snapshot_json) as SmartHomeSnapshot
      } catch (error) {
        logger.warn('[db] Failed to parse snapshot', { error })
        return null
      }
    })
    .filter((snapshot): snapshot is SmartHomeSnapshot => Boolean(snapshot))

  if (rows.length === 0) {
    clearHistoryCache(resolvedCatId)
    return []
  }

  appendSnapshotsToCache(resolvedCatId, rows, rows.length)
  return rows
}

export function listCats(): CatProfile[] {
  const rows = selectCatsStmt.all() as Array<{
    id: string
    name: string
    avatarUrl?: string | null
    breed?: string | null
    birthdate?: string | null
    weightKg?: number | null
    notes?: string | null
    tagsJson?: string | null
    createdAt: string
    updatedAt: string
  }>

  return rows.map((row) => mapCatRow(row))
}

export function getCat(id: string): CatProfile | null {
  const row = selectCatByIdStmt.get({ id }) as
    | {
        id: string
        name: string
        avatarUrl?: string | null
        breed?: string | null
        birthdate?: string | null
        weightKg?: number | null
        notes?: string | null
        tagsJson?: string | null
        createdAt: string
        updatedAt: string
      }
    | undefined

  if (!row) return null
  try {
    return mapCatRow(row)
  } catch (error) {
    logger.warn('[db] Failed to map cat row', { error })
    return null
  }
}

export function upsertCat(payload: UpsertCatPayload): CatProfile {
  const id = payload.id?.trim() && payload.id.trim().length > 0 ? payload.id.trim() : randomUUID()
  const now = new Date().toISOString()
  const createdAt = getCat(id)?.createdAt ?? now

  upsertCatStmt.run({
    id,
    name: payload.name.trim() || 'Unnamed Cat',
    avatar_url: payload.avatarUrl ?? null,
    breed: payload.breed ?? null,
    birthdate: payload.birthdate ?? null,
    weight_kg: payload.weightKg ?? null,
    notes: payload.notes ?? null,
    tags_json: serializeTags(payload.tags ?? null),
    created_at: createdAt,
    updated_at: now,
  })

  const updated = getCat(id)
  if (!updated) {
    throw new Error('Failed to load cat after upsert')
  }
  return updated
}

export function removeCat(id: string): boolean {
  if (id === 'default') {
    return false
  }
  const info = deleteCatStmt.run({ id })
  if (info.changes > 0) {
    clearHistoryCache(id)
    return true
  }
  return false
}

export function saveBehaviorProfile(profile: BehaviorProfile) {
  const summaryPayload = {
    confidence: profile.confidence,
    presencePercent: profile.presencePercent,
    longestHomeMinutes: profile.longestHomeMinutes,
    longestAwayMinutes: profile.longestAwayMinutes,
    hydrationAverageMl: profile.hydrationAverageMl,
    hydrationTrend: profile.hydrationTrend,
    hydrationChangeMl: profile.hydrationChangeMl,
    peakPeriods: profile.peakPeriods,
    quietHours: profile.quietHours,
  }
  const insightsPayload = {
    activityNotes: profile.activityNotes,
    careRecommendations: profile.careRecommendations,
  }
  upsertBehaviorProfileStmt.run({
    cat_id: profile.catId,
    window_hours: profile.windowHours,
    sample_count: profile.sampleCount,
    summary_json: JSON.stringify(summaryPayload),
    insights_json: JSON.stringify(insightsPayload),
    updated_at: profile.updatedAt,
  })
}

export function loadBehaviorProfile(catId: string): BehaviorProfile | null {
  const row = selectBehaviorProfileStmt.get({ cat_id: catId }) as StoredBehaviorProfileRow | undefined
  if (!row) return null
  return mapBehaviorProfileRow(row)
}

export function loadDashboardLayoutPreference(username: string): DashboardLayoutPreference | null {
  const stored = loadUserPreferencesJson(username)
  if (!stored) return null
  const raw = stored.preferences.dashboardLayout
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const hiddenPanels = sanitizePanelArray((raw as Record<string, unknown>).hiddenPanels)
  const panelOrder = sanitizePanelArray((raw as Record<string, unknown>).panelOrder)
  const updatedAtRaw = (raw as Record<string, unknown>).updatedAt
  const updatedAt = typeof updatedAtRaw === 'string' ? updatedAtRaw : stored.updatedAt
  return {
    hiddenPanels,
    panelOrder,
    updatedAt,
  }
}

export function saveDashboardLayoutPreference(
  username: string,
  update: DashboardLayoutUpdate,
): DashboardLayoutPreference {
  const existing = loadUserPreferencesJson(username)
  const currentLayout = existing?.preferences.dashboardLayout
  const currentHidden = sanitizePanelArray(
    currentLayout && typeof currentLayout === 'object'
      ? (currentLayout as Record<string, unknown>).hiddenPanels
      : [],
  )
  const currentOrder = sanitizePanelArray(
    currentLayout && typeof currentLayout === 'object'
      ? (currentLayout as Record<string, unknown>).panelOrder
      : [],
  )

  const hiddenPanels = update.hiddenPanels ? sanitizePanelArray(update.hiddenPanels) : currentHidden
  const panelOrder = update.panelOrder ? sanitizePanelArray(update.panelOrder) : currentOrder
  const updatedAt = new Date().toISOString()

  const preferences = { ...(existing?.preferences ?? {}) }
  const layout: DashboardLayoutPreference = {
    hiddenPanels,
    panelOrder,
    updatedAt,
  }
  preferences.dashboardLayout = layout
  persistUserPreferencesJson(username, preferences, updatedAt)
  return layout
}

export function saveSettings(settings: SmartHomeSettings) {
  upsertSettingsStmt.run({ payload: JSON.stringify(settings) })
}

export function loadSettings(): SmartHomeSettings | null {
  const row = getSettingsStmt.get() as { payload: string } | undefined
  if (!row) return null
  try {
    return JSON.parse(row.payload) as SmartHomeSettings
  } catch (error) {
    logger.warn('[db] Failed to parse stored settings', { error })
    return null
  }
}

export function saveLanguage(language: LanguageCode) {
  upsertLanguageStmt.run({ language })
}

export function loadLanguage(): LanguageCode {
  const row = getLanguageStmt.get() as { language: LanguageCode } | undefined
  return row?.language ?? 'zh'
}

export function savePushSubscription(
  subscription: StoredPushSubscription,
  language: LanguageCode,
) {
  if (typeof subscription?.endpoint !== 'string' || subscription.endpoint.length === 0) {
    throw new Error('invalid-subscription')
  }

  upsertSubscriptionStmt.run({
    endpoint: subscription.endpoint,
    language,
    payload: JSON.stringify(subscription),
    created_at: new Date().toISOString(),
  })
}

export function listPushSubscriptions(): Array<{
  endpoint: string
  language: LanguageCode
  subscription: StoredPushSubscription
}> {
  const rows = selectSubscriptionsStmt.all() as Array<{
    endpoint: string
    language: LanguageCode
    payload: string | null
  }>

  return rows
    .map((row) => {
      if (!row.payload) return null
      try {
        return {
          endpoint: row.endpoint,
          language: row.language,
          subscription: JSON.parse(row.payload) as StoredPushSubscription,
        }
      } catch (error) {
        logger.warn('[db] Failed to parse stored subscription', { endpoint: row.endpoint, error })
        return null
      }
    })
    .filter(
      (value): value is {
        endpoint: string
        language: LanguageCode
        subscription: StoredPushSubscription
      } => value !== null,
    )
}

export function removePushSubscription(endpoint: string) {
  deleteSubscriptionStmt.run({ endpoint })
}

export function saveNativePushDevice(options: {
  token: string
  platform: NativePushPlatform
  transport: NativePushTransport
  language: LanguageCode
  metadata?: Record<string, unknown> | null
}) {
  const { token, platform, transport, language, metadata } = options
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('invalid-native-token')
  }

  if (!['ios', 'android'].includes(platform)) {
    throw new Error('invalid-native-platform')
  }

  const normalizedTransport: NativePushTransport = transport === 'fcm' ? 'fcm' : 'apns'
  const timestamp = new Date().toISOString()

  upsertNativeDeviceStmt.run({
    token,
    platform,
    transport: normalizedTransport,
    language,
    metadata_json: metadata ? JSON.stringify(metadata) : null,
    timestamp,
  })
}

export function listNativePushDevices(): NativePushDeviceRecord[] {
  const rows = selectNativeDevicesStmt.all() as Array<{
    token: string
    platform: string
    transport: string
    language: LanguageCode
    metadataJson?: string | null
    createdAt: string
    updatedAt: string
  }>

  return rows.map((row) => {
    let metadata: Record<string, unknown> | null = null
    if (row.metadataJson) {
      try {
        metadata = JSON.parse(row.metadataJson) as Record<string, unknown>
      } catch (error) {
        logger.warn('[db] Failed to parse native push metadata for token', { token: row.token, error })
      }
    }

    const platform: NativePushPlatform = row.platform === 'android' ? 'android' : 'ios'
    const transport: NativePushTransport = row.transport === 'fcm' ? 'fcm' : 'apns'

    return {
      token: row.token,
      platform,
      transport,
      language: row.language,
      metadata,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  })
}

export function removeNativePushDevice(token: string) {
  deleteNativeDeviceStmt.run({ token })
}

export function saveCalibration(calibration: CalibrationProfile) {
  upsertCalibrationStmt.run({ payload: JSON.stringify({ ...calibration, updatedAt: new Date().toISOString() }) })
}

type HardwareCommandRow = {
  id: number
  type: string
  payloadJson?: string | null
  status: string
  resultMessage?: string | null
  createdAt: string
  claimedAt?: string | null
  completedAt?: string | null
}

function mapHardwareCommandRow(row: HardwareCommandRow | undefined): HardwareCommandRecord | null {
  if (!row) return null
  let payload: unknown = undefined
  if (row.payloadJson && row.payloadJson.length > 0) {
    try {
      payload = JSON.parse(row.payloadJson)
    } catch (error) {
      logger.warn('[db] Failed to parse hardware command payload', { error })
      payload = row.payloadJson
    }
  }

  return {
    id: row.id,
    type: row.type,
    payload,
    status: row.status as HardwareCommandStatus,
    createdAt: row.createdAt,
    claimedAt: row.claimedAt ?? null,
    completedAt: row.completedAt ?? null,
    resultMessage: row.resultMessage ?? null,
  }
}

export function enqueueHardwareCommand(type: string, payload: unknown): HardwareCommandRecord {
  const createdAt = new Date().toISOString()
  const payloadJson = typeof payload === 'undefined' ? null : JSON.stringify(payload)
  const info = insertHardwareCommandStmt.run({
    type,
    payload_json: payloadJson,
    created_at: createdAt,
  })

  const id = Number(info.lastInsertRowid)
  const record = getHardwareCommandById(id)
  if (!record) {
    throw new Error('Failed to load hardware command after insert')
  }
  return record
}

export function getHardwareCommandById(id: number): HardwareCommandRecord | null {
  const row = selectHardwareCommandByIdStmt.get({ id }) as HardwareCommandRow | undefined
  return mapHardwareCommandRow(row)
}

// 🔒 原子性命令領取（完全消除競爭條件）
// Atomic command claiming (completely eliminates race conditions)
const claimHardwareCommandTxn = db.transaction(() => {
  const claimedAt = new Date().toISOString()
  const row = claimHardwareCommandAtomicStmt.get({ claimed_at: claimedAt }) as HardwareCommandRow | undefined
  return mapHardwareCommandRow(row)
})

export function claimNextHardwareCommand(): HardwareCommandRecord | null {
  return claimHardwareCommandTxn()
}

export function completeHardwareCommand(
  id: number,
  status: 'completed' | 'failed',
  message?: string,
): HardwareCommandRecord | null {
  const completedAt = new Date().toISOString()
  const result = updateHardwareCommandStatusStmt.run({
    id,
    status,
    result_message: message ?? null,
    completed_at: completedAt,
  })
  if (result.changes === 0) {
    return null
  }
  return getHardwareCommandById(id)
}

/**
 * ⏱️ Reset stale commands: If a command has been claimed but not completed
 * for more than the timeout period, reset it to 'pending' so it can be retried.
 * This prevents commands from being stuck forever if Arduino crashes after claiming.
 *
 * @param timeoutMs - Commands claimed longer than this will be reset (default: 5 minutes)
 * @returns Number of commands that were reset
 */
export function resetStaleHardwareCommands(timeoutMs = 5 * 60 * 1000): number {
  const now = Date.now()
  const cutoffTime = new Date(now - timeoutMs).toISOString()

  const result = db
    .prepare(
      `UPDATE hardware_commands
       SET status = 'pending', claimed_at = NULL
       WHERE status = 'claimed'
         AND claimed_at IS NOT NULL
         AND claimed_at < @cutoff_time
       RETURNING id`
    )
    .all({ cutoff_time: cutoffTime }) as Array<{ id: number }>

  if (result.length > 0) {
    logger.warn(
      `[hardware] Reset ${result.length} stale command(s): ${result.map(r => r.id).join(', ')}`
    )
  }

  return result.length
}

export function loadCalibration(): CalibrationProfile | null {
  const row = getCalibrationStmt.get() as { payload: string } | undefined
  if (!row) return null
  try {
    return JSON.parse(row.payload) as CalibrationProfile
  } catch (error) {
    logger.warn('[db] Failed to parse calibration profile', { error })
    return null
  }
}

type CareTaskRow = {
  id: number
  title: string
  description: string
  category: string
  status: string
  source: string
  metadataJson?: string | null
  dueAt?: string | null
  createdAt: string
  completedAt?: string | null
}

function mapCareTaskRow(row: CareTaskRow | undefined): CareTask | null {
  if (!row) return null
  let metadata: Record<string, unknown> | undefined
  if (row.metadataJson) {
    try {
      metadata = JSON.parse(row.metadataJson) as Record<string, unknown>
    } catch (error) {
      logger.warn('[db] Failed to parse care task metadata', { error })
    }
  }
  const task: CareTask = {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category as CareTask['category'],
    status: (row.status as CareTaskStatus) ?? 'pending',
    createdAt: row.createdAt,
    dueAt: row.dueAt ?? null,
    completedAt: row.completedAt ?? null,
    source: (row.source as CareTask['source']) ?? 'system',
  }

  if (metadata) {
    task.metadata = metadata
  }

  return task
}

export function listCareTasks(limit = 50): CareTask[] {
  const rows = listCareTasksStmt.all({ limit }) as CareTaskRow[]
  return rows
    .map((row) => mapCareTaskRow(row))
    .filter((task): task is CareTask => task !== null)
}

export function getCareTaskById(id: number): CareTask | null {
  const row = selectCareTaskByIdStmt.get({ id }) as CareTaskRow | undefined
  return mapCareTaskRow(row)
}

interface CareTaskInsertInput {
  title: string
  description: string
  category: CareTask['category']
  source: CareTask['source']
  metadata?: Record<string, unknown> | undefined
  dueAt?: string | null
  status?: CareTaskStatus
}

export function createCareTask(input: CareTaskInsertInput): CareTask {
  const createdAt = new Date().toISOString()
  const status = input.status ?? 'pending'
  const info = insertCareTaskStmt.run({
    title: input.title,
    description: input.description,
    category: input.category,
    status,
    source: input.source,
    metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
    due_at: input.dueAt ?? null,
    created_at: createdAt,
  })

  const id = Number(info.lastInsertRowid)
  const row = selectCareTaskByIdStmt.get({ id }) as CareTaskRow | undefined

  if (row) {
    const task = mapCareTaskRow(row)
    if (task) return task
  }

  throw new Error('care-task-insert-failed')
}

export function updateCareTaskStatus(
  id: number,
  status: CareTaskStatus,
): CareTask | null {
  const completedAt =
    status === 'completed'
      ? new Date().toISOString()
      : null
  const result = updateCareTaskStatusStmt.run({
    id,
    status,
    completed_at: completedAt,
  })
  if (result.changes === 0) {
    return null
  }
  return getCareTaskById(id)
}

export function removeCareTask(id: number) {
  deleteCareTaskStmt.run({ id })
}

type CarePluginRow = {
  id: number
  name: string
  description?: string | null
  capabilitiesJson?: string | null
  apiBaseUrl?: string | null
  enabled: number
  metadataJson?: string | null
  createdAt: string
  updatedAt: string
}

function mapCarePluginRow(row: CarePluginRow | undefined): CarePlugin | null {
  if (!row) return null
  let capabilities: string[] = []
  if (row.capabilitiesJson) {
    try {
      const parsed = JSON.parse(row.capabilitiesJson)
      if (Array.isArray(parsed)) {
        capabilities = parsed
          .map((item) => (typeof item === 'string' ? item : null))
          .filter((item): item is string => item !== null)
      }
    } catch (error) {
      logger.warn('[db] Failed to parse plugin capabilities', { error })
    }
  }
  let metadata: Record<string, unknown> | undefined
  if (row.metadataJson) {
    try {
      metadata = JSON.parse(row.metadataJson) as Record<string, unknown>
    } catch (error) {
      logger.warn('[db] Failed to parse plugin metadata', { error })
    }
  }
  const plugin: CarePlugin = {
    id: row.id,
    name: row.name,
    capabilities,
    apiBaseUrl: row.apiBaseUrl ?? null,
    enabled: row.enabled === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }

  if (row.description) {
    plugin.description = row.description
  }
  if (metadata) {
    plugin.metadata = metadata
  }

  return plugin
}

export function upsertCarePlugin(input: {
  name: string
  description?: string
  capabilities?: string[]
  apiBaseUrl?: string | null
  enabled?: boolean
  metadata?: Record<string, unknown>
}): CarePlugin {
  const now = new Date().toISOString()
  insertPluginStmt.run({
    name: input.name,
    description: input.description ?? null,
    capabilities_json: input.capabilities ? JSON.stringify(input.capabilities) : JSON.stringify([]),
    api_base_url: input.apiBaseUrl ?? null,
    enabled: input.enabled === false ? 0 : 1,
    metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
    created_at: now,
    updated_at: now,
  })

  const row =
    selectPluginByNameStmt.get({ name: input.name }) as CarePluginRow | undefined
  const mapped = mapCarePluginRow(row)
  if (!mapped) {
    throw new Error('care-plugin-upsert-failed')
  }
  return mapped
}

export function listCarePlugins(): CarePlugin[] {
  const rows = listPluginsStmt.all() as CarePluginRow[]
  return rows
    .map((row) => mapCarePluginRow(row))
    .filter((plugin): plugin is CarePlugin => plugin !== null)
}

export function updateCarePluginEnabled(id: number, enabled: boolean): CarePlugin | null {
  const result = updatePluginEnabledStmt.run({
    id,
    enabled: enabled ? 1 : 0,
    updated_at: new Date().toISOString(),
  })
  if (result.changes === 0) return null
  const row = selectPluginByIdStmt.get({ id }) as CarePluginRow | undefined
  return mapCarePluginRow(row)
}

export function deleteCarePlugin(id: number) {
  deletePluginStmt.run({ id })
}

export function saveAutomationAlert(alert: AutomationAlert, limit: number) {
  insertAutomationAlertStmt.run({
    timestamp: alert.timestamp,
    message: alert.message,
    severity: alert.severity,
    message_key: alert.messageKey ?? null,
    message_variables: alert.messageVariables ? JSON.stringify(alert.messageVariables) : null,
  })
  deleteOldAlertsStmt.run(limit)
}

export function loadAutomationAlerts(limit: number): AutomationAlert[] {
  const rows = selectRecentAlertsStmt.all(limit) as Array<{
    timestamp: string
    message: string
    severity: AutomationAlert['severity']
    messageKey?: string | null
    messageVariables?: string | null
  }>

  return rows.map((row) => {
    const base: AutomationAlert = {
      timestamp: row.timestamp,
      message: row.message,
      severity: row.severity,
      ...(row.messageKey ? { messageKey: row.messageKey } : {}),
    }

    if (row.messageVariables) {
      try {
        base.messageVariables = JSON.parse(row.messageVariables) as Record<string, string | number | boolean>
      } catch (error) {
        logger.warn('[db] Failed to parse automation alert variables', { error })
      }
    }

    if (!base.messageKey) {
      const inferred = inferLegacyAlertMetadata(base.message)
      if (inferred) {
        base.messageKey = inferred.key
        if (inferred.variables) {
          base.messageVariables = inferred.variables
        }
      }
    }

    return base
  })
}

export interface MemoryEntryRecord {
  id: number
  type: string
  content: string
  source: string
  createdAt: string
}

const MEMORY_RETENTION_LIMIT = 400

export function listMemories(limit: number, type?: string): MemoryEntryRecord[] {
  const params = { limit }
  const rows = type
    ? selectMemoriesByTypeStmt.all({ type, limit })
    : selectMemoriesStmt.all(params)
  return (rows as MemoryEntryRecord[]).map((row) => ({
    ...row,
    type: row.type as MemoryEntryRecord['type'],
  }))
}

export function addMemory(entry: { type: string; content: string; source: string }): MemoryEntryRecord {
  const createdAt = new Date().toISOString()
  const info = insertMemoryStmt.run({ ...entry, created_at: createdAt })
  if (MEMORY_RETENTION_LIMIT > 0) {
    try {
      pruneMemoriesStmt.run({ limit: MEMORY_RETENTION_LIMIT })
    } catch (error) {
      logger.warn('[db] Failed to prune old memories', { error })
    }
  }
  return {
    id: Number(info.lastInsertRowid),
    type: entry.type,
    content: entry.content,
    source: entry.source,
    createdAt,
  }
}

export function updateMemory(id: number, content: string) {
  updateMemoryStmt.run({ id, content })
}

export function removeMemory(id: number) {
  deleteMemoryStmt.run({ id })
}

export interface PinnedToolEventRecord extends ToolExecutionLog {
  timestamp: string
  pinnedAt: string
}

function parseArgs(raw: string | null): unknown | undefined {
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as unknown
  } catch (error) {
    logger.warn('[db] Failed to parse pinned tool event args', { error })
    return undefined
  }
}

export function listPinnedToolEvents(): PinnedToolEventRecord[] {
  const rows = selectPinnedToolEventsStmt.all() as Array<{
    timestamp: string
    tool: ToolExecutionLog['tool']
    success: number
    message: string
    argsJson: string | null
    output: string | null
    durationMs: number | null
    pinnedAt: string
  }>

  return rows.map((row) => {
    const record: PinnedToolEventRecord = {
      timestamp: row.timestamp,
      tool: row.tool,
      success: Boolean(row.success),
      message: row.message,
      pinnedAt: row.pinnedAt,
    }
    const parsedArgs = parseArgs(row.argsJson)
    if (parsedArgs !== undefined) {
      record.args = parsedArgs
    }
    if (row.output) {
      record.output = row.output
    }
    if (typeof row.durationMs === 'number') {
      record.durationMs = row.durationMs
    }
    return record
  })
}

export function savePinnedToolEvent(event: ToolExecutionLog & { timestamp: string; pinnedAt?: string }) {
  const pinnedAt = event.pinnedAt ?? new Date().toISOString()
  upsertPinnedToolEventStmt.run({
    timestamp: event.timestamp,
    tool: event.tool,
    success: event.success ? 1 : 0,
    message: event.message,
    args_json: event.args ? JSON.stringify(event.args) : null,
    output: event.output ?? null,
    duration_ms: typeof event.durationMs === 'number' ? event.durationMs : null,
    pinned_at: pinnedAt,
  })
}

export function removePinnedToolEvent(timestamp: string) {
  deletePinnedToolEventStmt.run({ timestamp })
}

export function addNotificationFix(log: NotificationFixLog) {
  insertNotificationFixStmt.run({
    id: log.id,
    step: log.step,
    success: log.success ? 1 : 0,
    message: log.message ?? null,
    created_at: log.timestamp,
  })
}

export function listNotificationFixes(limit: number): NotificationFixLog[] {
  const rows = selectNotificationFixesStmt.all({ limit }) as Array<{
    id: string
    step: NotificationFixLog['step']
    success: number
    message: string | null
    createdAt: string
  }>

  return rows.map((row) => ({
    id: row.id,
    step: row.step,
    success: Boolean(row.success),
    message: row.message ?? undefined,
    timestamp: row.createdAt,
  }))
}

function mapAlertRuleRow(row: {
  id: number
  metric: string
  comparison: string
  threshold: number
  severity: string
  message: string | null
  enabled: number
  createdAt: string
  updatedAt: string
}): AlertRule {
  return {
    id: row.id,
    metric: row.metric as AlertRule['metric'],
    comparison: row.comparison as AlertRule['comparison'],
    threshold: row.threshold,
    severity: row.severity as AlertRule['severity'],
    message: row.message ?? undefined,
    enabled: Boolean(row.enabled),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function listAlertRules(): AlertRule[] {
  const rows = selectAlertRulesStmt.all() as Array<{
    id: number
    metric: string
    comparison: string
    threshold: number
    severity: string
    message: string | null
    enabled: number
    createdAt: string
    updatedAt: string
  }>
  return rows.map(mapAlertRuleRow)
}

export function createAlertRule(rule: {
  metric: AlertRule['metric']
  comparison: AlertRule['comparison']
  threshold: number
  severity: AlertRule['severity']
  message?: string | undefined
  enabled?: boolean | undefined
}): AlertRule {
  const timestamp = new Date().toISOString()
  const enabled = rule.enabled ?? true
  const info = insertAlertRuleStmt.run({
    metric: rule.metric,
    comparison: rule.comparison,
    threshold: rule.threshold,
    severity: rule.severity,
    message: rule.message ?? null,
    enabled: enabled ? 1 : 0,
    created_at: timestamp,
    updated_at: timestamp,
  })
  const id = Number(info.lastInsertRowid)
  return {
    id,
    metric: rule.metric,
    comparison: rule.comparison,
    threshold: rule.threshold,
    severity: rule.severity,
    message: rule.message,
    enabled,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function updateAlertRule(rule: {
  id: number
  comparison: AlertRule['comparison']
  threshold: number
  severity: AlertRule['severity']
  message?: string | undefined
  enabled: boolean
}): void {
  const updatedAt = new Date().toISOString()
  updateAlertRuleStmt.run({
    id: rule.id,
    comparison: rule.comparison,
    threshold: rule.threshold,
    severity: rule.severity,
    message: rule.message ?? null,
    enabled: rule.enabled ? 1 : 0,
    updated_at: updatedAt,
  })
}

export function removeAlertRule(id: number) {
  deleteAlertRuleStmt.run({ id })
}

function parseMetadata(raw: string | null): Record<string, unknown> | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return parsed
  } catch (error) {
    logger.warn('[db] Failed to parse chat favorite metadata', { error })
    return undefined
  }
}

export function listChatFavorites(): ChatFavorite[] {
  const rows = selectChatFavoritesStmt.all() as Array<{
    id: number
    messageId: string | null
    role: string
    content: string
    metadataJson: string | null
    createdAt: string
  }>

  return rows.map((row) => {
    const metadata = parseMetadata(row.metadataJson)
    const entry: ChatFavorite = {
      id: row.id,
      messageId: row.messageId,
      role: (row.role as ChatFavorite['role']) ?? 'assistant',
      content: row.content,
      createdAt: row.createdAt,
    }
    if (metadata) {
      entry.metadata = metadata
    }
    return entry
  })
}

export function saveChatFavorite(favorite: {
  messageId?: string | null
  role: ChatFavorite['role']
  content: string
  metadata?: Record<string, unknown>
}): ChatFavorite {
  const createdAt = new Date().toISOString()
  insertChatFavoriteStmt.run({
    message_id: favorite.messageId ?? null,
    role: favorite.role,
    content: favorite.content,
    metadata_json: favorite.metadata ? JSON.stringify(favorite.metadata) : null,
    created_at: createdAt,
  })

  const favorites = listChatFavorites()
  if (favorite.messageId) {
    const matchByMessageId = favorites.find((entry) => entry.messageId === favorite.messageId)
    if (matchByMessageId) {
      return matchByMessageId
    }
  }

  const lastRow = db.prepare('SELECT last_insert_rowid() AS id').get() as { id: number }
  const matchById = favorites.find((entry) => entry.id === lastRow.id)
  if (matchById) {
    return matchById
  }

  const fallback: ChatFavorite = {
    id: lastRow.id,
    messageId: favorite.messageId ?? null,
    role: favorite.role,
    content: favorite.content,
    createdAt,
  }
  if (favorite.metadata) {
    fallback.metadata = favorite.metadata
  }

  return favorites[favorites.length - 1] ?? fallback
}

export function deleteChatFavorite(params: { id?: number; messageId?: string | null }) {
  deleteChatFavoriteStmt.run({
    id: params.id ?? null,
    message_id: params.messageId ?? null,
  })
}

// ============================================
// 🔒 数据保留策略 / Data Retention Policy
// ============================================

/**
 * 清理旧的快照数据 / Clean up old snapshot data
 * @param retentionDays 保留天数 / Days to retain
 * @returns 删除的记录数 / Number of records deleted
 */
export function cleanupOldSnapshots(retentionDays: number): number {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays)
  const cutoffTimestamp = cutoffDate.toISOString()

  const result = db
    .prepare(
      `
      DELETE FROM snapshots
      WHERE timestamp < ?
    `,
    )
    .run(cutoffTimestamp)

  if (result.changes > 0) {
    clearHistoryCache()
  }

  return result.changes
}

/**
 * 清理旧的自动化警报 / Clean up old automation alerts
 * @param retentionDays 保留天数 / Days to retain
 * @returns 删除的记录数 / Number of records deleted
 */
export function cleanupOldAlerts(retentionDays: number): number {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays)
  const cutoffTimestamp = cutoffDate.toISOString()

  const result = db
    .prepare(
      `
      DELETE FROM automation_alerts
      WHERE timestamp < ?
    `,
    )
    .run(cutoffTimestamp)

  return result.changes
}

/**
 * 清理旧的通知修复日志 / Clean up old notification fix logs
 * @param retentionDays 保留天数 / Days to retain
 * @returns 删除的记录数 / Number of records deleted
 */
export function cleanupOldNotificationFixes(retentionDays: number): number {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays)
  const cutoffTimestamp = cutoffDate.toISOString()

  const result = db
    .prepare(
      `
      DELETE FROM notification_fixes
      WHERE created_at < ?
    `,
    )
    .run(cutoffTimestamp)

  return result.changes
}

/**
 * 清理旧的记忆（可选，仅清理非系统记忆）/ Clean up old memories (optional, only non-system memories)
 * @param retentionDays 保留天数 / Days to retain
 * @returns 删除的记录数 / Number of records deleted
 */
export function cleanupOldMemories(retentionDays: number): number {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays)
  const cutoffTimestamp = cutoffDate.toISOString()

  const result = db
    .prepare(
      `
      DELETE FROM memories
      WHERE created_at < ? AND source != 'system'
    `,
    )
    .run(cutoffTimestamp)

  return result.changes
}

/**
 * 执行完整的数据库清理 / Perform full database cleanup
 * @param options 清理选项 / Cleanup options
 * @returns 清理统计 / Cleanup statistics
 */
export function performDatabaseCleanup(options: {
  snapshotRetentionDays?: number
  alertRetentionDays?: number
  notificationFixRetentionDays?: number
  memoryRetentionDays?: number
}): {
  snapshotsDeleted: number
  alertsDeleted: number
  notificationFixesDeleted: number
  memoriesDeleted: number
} {
  const stats = {
    snapshotsDeleted: 0,
    alertsDeleted: 0,
    notificationFixesDeleted: 0,
    memoriesDeleted: 0,
  }

  if (options.snapshotRetentionDays !== undefined) {
    stats.snapshotsDeleted = cleanupOldSnapshots(options.snapshotRetentionDays)
  }

  if (options.alertRetentionDays !== undefined) {
    stats.alertsDeleted = cleanupOldAlerts(options.alertRetentionDays)
  }

  if (options.notificationFixRetentionDays !== undefined) {
    stats.notificationFixesDeleted = cleanupOldNotificationFixes(options.notificationFixRetentionDays)
  }

  if (options.memoryRetentionDays !== undefined) {
    stats.memoriesDeleted = cleanupOldMemories(options.memoryRetentionDays)
  }

  return stats
}

/**
 * 获取数据库统计信息 / Get database statistics
 */
export function getDatabaseStats(): {
  snapshotCount: number
  alertCount: number
  memoryCount: number
  notificationFixCount: number
  databaseSizeKb: number | null
} {
  const snapshotCount = (db.prepare('SELECT COUNT(*) as count FROM snapshots').get() as { count: number }).count
  const alertCount = (db.prepare('SELECT COUNT(*) as count FROM automation_alerts').get() as { count: number }).count
  const memoryCount = (db.prepare('SELECT COUNT(*) as count FROM memories').get() as { count: number }).count
  const notificationFixCount = (db.prepare('SELECT COUNT(*) as count FROM notification_fixes').get() as { count: number })
    .count

  // 获取数据库文件大小 / Get database file size
  let databaseSizeKb: number | null = null
  try {
    const fs = require('node:fs')
    const stats = fs.statSync(DB_PATH)
    databaseSizeKb = Math.round(stats.size / 1024)
  } catch (error) {
    logger.warn('[database] Failed to get database file size', { error })
  }

  return {
    snapshotCount,
    alertCount,
    memoryCount,
    notificationFixCount,
    databaseSizeKb,
  }
}

// ============================================
// 🔧 Calibration History Functions
// ============================================

export interface CalibrationHistoryRecord {
  id: number
  calibrationJson: string
  changeSummary: string | null
  changedFields: string | null
  changedBy: string
  previousValues: string | null
  newValues: string | null
  createdAt: string
}

type CalibrationHistoryRow = {
  id: number
  calibrationJson: string
  changeSummary: string | null
  changedFields: string | null
  changedBy: string
  previousValues: string | null
  newValues: string | null
  createdAt: string
}

export interface SaveCalibrationHistoryInput {
  calibration: CalibrationProfile
  changeSummary?: string | null
  changedFields?: string[] | null
  changedBy: string
  previousValues?: Record<string, unknown> | null
  newValues?: Record<string, unknown> | null
}

export function saveCalibrationHistory(input: SaveCalibrationHistoryInput): CalibrationHistoryRecord {
  const createdAt = new Date().toISOString()
  const info = insertCalibrationHistoryStmt.run({
    calibration_json: JSON.stringify(input.calibration),
    change_summary: input.changeSummary ?? null,
    changed_fields: input.changedFields ? JSON.stringify(input.changedFields) : null,
    changed_by: input.changedBy,
    previous_values: input.previousValues ? JSON.stringify(input.previousValues) : null,
    new_values: input.newValues ? JSON.stringify(input.newValues) : null,
    created_at: createdAt,
  })

  const id = Number(info.lastInsertRowid)
  const record = getCalibrationHistoryById(id)
  if (!record) {
    throw new Error('Failed to load calibration history after insert')
  }
  return record
}

export function getCalibrationHistory(limit = 50, offset = 0): CalibrationHistoryRecord[] {
  const rows = selectCalibrationHistoryStmt.all({ limit, offset }) as CalibrationHistoryRow[]
  return rows
}

export function getCalibrationHistoryById(id: number): CalibrationHistoryRecord | null {
  const row = selectCalibrationHistoryByIdStmt.get({ id }) as CalibrationHistoryRow | undefined
  return row ?? null
}

export function countCalibrationHistory(): number {
  const result = countCalibrationHistoryStmt.get() as { count: number }
  return result.count
}

// ============================================
// 🐾 Pet Profile Functions
// ============================================

export type PetType = 'cat' | 'dog' | 'bird' | 'custom'

export interface PetProfile {
  id: string
  type: PetType
  name: string
  customLabel?: string | null
  icon?: string | null
  temperatureRangeMin: number
  temperatureRangeMax: number
  humidityRangeMin: number
  humidityRangeMax: number
  waterTarget: number
  feedingSchedule: string
  createdAt: string
  updatedAt: string
}

type PetProfileRow = {
  id: string
  type: PetType
  name: string
  custom_label: string | null
  icon: string | null
  temperature_range_min: number
  temperature_range_max: number
  humidity_range_min: number
  humidity_range_max: number
  water_target: number
  feeding_schedule: string
  created_at: string
  updated_at: string
}

function rowToPetProfile(row: PetProfileRow): PetProfile {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    customLabel: row.custom_label,
    icon: row.icon,
    temperatureRangeMin: row.temperature_range_min,
    temperatureRangeMax: row.temperature_range_max,
    humidityRangeMin: row.humidity_range_min,
    humidityRangeMax: row.humidity_range_max,
    waterTarget: row.water_target,
    feedingSchedule: row.feeding_schedule,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * List all pet profiles
 */
export function listPetProfiles(): PetProfile[] {
  const rows = db.prepare('SELECT * FROM pet_profiles ORDER BY created_at DESC').all() as PetProfileRow[]
  return rows.map(rowToPetProfile)
}

/**
 * Get a single pet profile by ID
 */
export function getPetProfile(id: string): PetProfile | null {
  const row = db.prepare('SELECT * FROM pet_profiles WHERE id = ?').get(id) as PetProfileRow | undefined
  return row ? rowToPetProfile(row) : null
}

/**
 * Create a new pet profile
 */
export function createPetProfile(input: {
  type: PetType
  name: string
  customLabel?: string | null
  icon?: string | null
  temperatureRangeMin?: number
  temperatureRangeMax?: number
  humidityRangeMin?: number
  humidityRangeMax?: number
  waterTarget?: number
  feedingSchedule?: string
}): PetProfile {
  const id = randomUUID()
  const now = new Date().toISOString()

  const stmt = db.prepare(`
    INSERT INTO pet_profiles (
      id, type, name, custom_label, icon,
      temperature_range_min, temperature_range_max,
      humidity_range_min, humidity_range_max,
      water_target, feeding_schedule,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  stmt.run(
    id,
    input.type,
    input.name,
    input.customLabel ?? null,
    input.icon ?? null,
    input.temperatureRangeMin ?? 18,
    input.temperatureRangeMax ?? 28,
    input.humidityRangeMin ?? 40,
    input.humidityRangeMax ?? 60,
    input.waterTarget ?? 200,
    input.feedingSchedule ?? '08:00,18:00',
    now,
    now,
  )

  const profile = getPetProfile(id)
  if (!profile) {
    throw new Error('Failed to create pet profile')
  }
  return profile
}

/**
 * Update an existing pet profile
 */
export function updatePetProfile(
  id: string,
  input: {
    name?: string
    customLabel?: string | null
    icon?: string | null
    temperatureRangeMin?: number
    temperatureRangeMax?: number
    humidityRangeMin?: number
    humidityRangeMax?: number
    waterTarget?: number
    feedingSchedule?: string
  },
): PetProfile | null {
  const existing = getPetProfile(id)
  if (!existing) {
    return null
  }

  const now = new Date().toISOString()

  const stmt = db.prepare(`
    UPDATE pet_profiles
    SET name = ?,
        custom_label = ?,
        icon = ?,
        temperature_range_min = ?,
        temperature_range_max = ?,
        humidity_range_min = ?,
        humidity_range_max = ?,
        water_target = ?,
        feeding_schedule = ?,
        updated_at = ?
    WHERE id = ?
  `)

  stmt.run(
    input.name ?? existing.name,
    input.customLabel !== undefined ? input.customLabel : existing.customLabel,
    input.icon !== undefined ? input.icon : existing.icon,
    input.temperatureRangeMin ?? existing.temperatureRangeMin,
    input.temperatureRangeMax ?? existing.temperatureRangeMax,
    input.humidityRangeMin ?? existing.humidityRangeMin,
    input.humidityRangeMax ?? existing.humidityRangeMax,
    input.waterTarget ?? existing.waterTarget,
    input.feedingSchedule ?? existing.feedingSchedule,
    now,
    id,
  )

  return getPetProfile(id)
}

/**
 * Delete a pet profile
 */
export function deletePetProfile(id: string): boolean {
  const result = db.prepare('DELETE FROM pet_profiles WHERE id = ?').run(id)
  return result.changes > 0
}
