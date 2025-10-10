import { useCallback, useMemo, useState } from 'react'
import { listEquipment, testEquipmentConnection } from '../data/equipment'
import type { EquipmentItem, EquipmentTestResult } from '../data/equipment'
import type { Language } from '../i18n/translations'

interface EquipmentStatus extends EquipmentItem {
  lastResult?: EquipmentTestResult
  loading: boolean
}

export function useEquipmentDiagnostics(language: Language) {
  const equipment = useMemo(() => listEquipment(), [])
  const [results, setResults] = useState<Record<string, EquipmentTestResult | undefined>>({})
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())

  const runTest = useCallback(
    async (id: string) => {
      setLoadingIds((prev) => new Set(prev).add(id))
      try {
        const result = await testEquipmentConnection(id, language)
        setResults((prev) => ({ ...prev, [id]: result }))
        return result
      } finally {
        setLoadingIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    },
    [language],
  )

  const runAll = useCallback(async () => {
    const results: EquipmentTestResult[] = []
    for (const item of equipment) {
      // eslint-disable-next-line no-await-in-loop
      const result = await runTest(item.id)
      if (result) {
        results.push(result)
      }
    }
    return results
  }, [equipment, runTest])

  const items: EquipmentStatus[] = useMemo(
    () =>
      equipment.map((item) => ({
        ...item,
        lastResult: results[item.id],
        loading: loadingIds.has(item.id),
      })),
    [equipment, loadingIds, results],
  )

  return {
    items,
    runTest,
    runAll,
    busy: loadingIds.size > 0,
  }
}
