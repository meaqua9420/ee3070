import type { SmartHomeSnapshot } from '../types/smartHome'

const DB_NAME = 'smart-cat-home'
const STORE_NAME = 'history'
const DB_VERSION = 1

export interface HistoricalRecord extends SmartHomeSnapshot {
  timestamp: string
}

function openHistoryDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'timestamp' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'))
  })
}

function wrapRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

async function putRecord(db: IDBDatabase, record: HistoricalRecord) {
  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).put(record)
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error ?? new Error('Failed to store record'))
  })
}

async function getAllRecords(db: IDBDatabase) {
  const tx = db.transaction(STORE_NAME, 'readonly')
  const request = tx.objectStore(STORE_NAME).getAll()
  const result = await wrapRequest(request)
  return (result as HistoricalRecord[]).sort((a, b) =>
    a.timestamp < b.timestamp ? 1 : -1,
  )
}

async function deleteRecords(db: IDBDatabase, timestamps: string[]) {
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)
  timestamps.forEach((timestamp) => store.delete(timestamp))
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error ?? new Error('Failed to delete records'))
  })
}

function applyDrift(value: number, scale: number, fractionDigits = 1) {
  const drift = (Math.random() * 2 - 1) * scale
  return +Number(value + drift).toFixed(fractionDigits)
}

function generateBackfillRecords(
  latest: SmartHomeSnapshot,
  missingCount: number,
): HistoricalRecord[] {
  const baseTime = new Date(latest.reading.timestamp).getTime()
  const records: HistoricalRecord[] = []

  for (let index = 1; index <= missingCount; index++) {
    const timestamp = new Date(baseTime - index * 60 * 60 * 1000).toISOString()
    const reading = {
      temperatureC: applyDrift(latest.reading.temperatureC, 1.5, 1),
      humidityPercent: Math.round(applyDrift(latest.reading.humidityPercent, 6, 0)),
      waterIntakeMl: Math.max(
        0,
        Math.round(applyDrift(latest.reading.waterIntakeMl, 35, 0)),
      ),
      airQualityIndex: Math.max(
        0,
        Math.round(applyDrift(latest.reading.airQualityIndex, 5, 0)),
      ),
      catWeightKg: applyDrift(latest.reading.catWeightKg, 0.1, 2),
      lastFeedingMinutesAgo: Math.max(
        0,
        Math.round(applyDrift(latest.reading.lastFeedingMinutesAgo, 20, 0)),
      ),
      timestamp,
    }

    records.push({
      timestamp,
      reading,
      settings: latest.settings,
      status: latest.status,
    })
  }

  return records
}

async function ensureBackfill(
  db: IDBDatabase,
  latest: SmartHomeSnapshot,
  limit: number,
  currentRecords: HistoricalRecord[],
) {
  if (currentRecords.length >= limit) {
    return currentRecords
  }

  const missing = limit - currentRecords.length - 1
  if (missing <= 0) {
    return currentRecords
  }

  const synthetic = generateBackfillRecords(latest, missing)
  for (const record of synthetic) {
    await putRecord(db, record)
  }

  const refreshed = await getAllRecords(db)
  return refreshed
}

export async function syncHistoricalLogs(
  latest: SmartHomeSnapshot,
  limit = 24,
): Promise<HistoricalRecord[]> {
  try {
    const db = await openHistoryDB()
    const record: HistoricalRecord = {
      timestamp: latest.reading.timestamp,
      reading: latest.reading,
      settings: latest.settings,
      status: latest.status,
    }

    await putRecord(db, record)
    let records = await getAllRecords(db)

    records = await ensureBackfill(db, latest, limit, records)

    if (records.length > limit) {
      const toDelete = records.slice(limit).map((item) => item.timestamp)
      await deleteRecords(db, toDelete)
      records = records.slice(0, limit)
    }

    return records
  } catch (error) {
    console.warn('[history] sync failed', error)
    return []
  }
}

export async function getHistoricalLogs(limit = 24): Promise<HistoricalRecord[]> {
  try {
    const db = await openHistoryDB()
    const records = await getAllRecords(db)
    return records.slice(0, limit)
  } catch (error) {
    console.warn('[history] load failed', error)
    return []
  }
}

export async function clearHistoricalLogs() {
  try {
    const db = await openHistoryDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).clear()
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error ?? new Error('Failed to clear history'))
    })
  } catch (error) {
    console.warn('[history] clear failed', error)
  }
}
