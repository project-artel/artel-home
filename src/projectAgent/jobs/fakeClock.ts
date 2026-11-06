import type { Clock } from './watchRunner'

type PendingSleep = { dueAt: number; resolve: (elapsed: boolean) => void }

/** 테스트용 시계. `advance` 로 시간을 밀어야 `sleep` 이 풀린다. abort 되면 false 로 풀린다. */
export function createFakeClock(startMs = 1_000_000): Clock & { advance: (milliseconds: number) => Promise<void>; requested: number[] } {
  let now = startMs
  let pending: PendingSleep[] = []
  const requested: number[] = []
  return {
    requested,
    now: () => now,
    sleep: (milliseconds, signal) =>
      new Promise<boolean>((resolve) => {
        requested.push(milliseconds)
        if (signal.aborted) {
          resolve(false)
          return
        }
        const entry: PendingSleep = { dueAt: now + milliseconds, resolve }
        pending.push(entry)
        signal.addEventListener(
          'abort',
          () => {
            pending = pending.filter((one) => one !== entry)
            resolve(false)
          },
          { once: true },
        )
      }),
    advance: async (milliseconds) => {
      const target = now + milliseconds
      for (;;) {
        const due = pending.filter((one) => one.dueAt <= target).sort((left, right) => left.dueAt - right.dueAt)[0]
        if (due === undefined) break
        pending = pending.filter((one) => one !== due)
        now = due.dueAt
        due.resolve(true)
        await flushMicrotasks()
      }
      now = target
      await flushMicrotasks()
    },
  }
}

export async function flushMicrotasks(): Promise<void> {
  for (let round = 0; round < 10; round += 1) await Promise.resolve()
}
