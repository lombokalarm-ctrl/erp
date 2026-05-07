import { getEnv } from '../lib/env.js'
import { sweepOverdueInvoiceNotifications } from '../services/notificationService.js'

let intervalHandle: NodeJS.Timeout | null = null
let isRunning = false

function isEnabled() {
  const raw = getEnv('OVERDUE_NOTIF_SCHEDULER_ENABLED', 'true').toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes'
}

function getIntervalMs() {
  const parsed = Number(getEnv('OVERDUE_NOTIF_INTERVAL_MS', '300000'))
  if (!Number.isFinite(parsed) || parsed < 60_000) return 300_000
  return parsed
}

async function runSweep() {
  if (isRunning) return
  isRunning = true
  try {
    const result = await sweepOverdueInvoiceNotifications()
    if (!result.skippedByLock) {
      console.log(
        `[scheduler] overdue invoice notification sweep: upsert=${result.insertedOrUpdated}, resolved=${result.resolved}`,
      )
    }
  } catch (err) {
    console.error('[scheduler] overdue invoice notification sweep failed', err)
  } finally {
    isRunning = false
  }
}

export function startNotificationScheduler() {
  if (!isEnabled()) {
    console.log('[scheduler] overdue notification scheduler disabled')
    return () => {}
  }

  const intervalMs = getIntervalMs()
  console.log(`[scheduler] overdue notification scheduler enabled (${intervalMs}ms)`)

  void runSweep()
  intervalHandle = setInterval(() => {
    void runSweep()
  }, intervalMs)

  return () => {
    if (intervalHandle) {
      clearInterval(intervalHandle)
      intervalHandle = null
    }
  }
}
