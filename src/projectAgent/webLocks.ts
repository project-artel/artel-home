/*
 * 같은 브라우저의 여러 탭 가운데 한 탭만 일을 맡게 하는 Web Locks API 의 얇은 층.
 *
 * `ifAvailable: true` 로만 요청한다. 다른 탭이 잡고 있으면 기다리지 않고 그 일을 하지 않는다.
 * 기다리게 하면 앞 탭이 끝난 뒤 뒤 탭이 같은 tool 호출이나 같은 job 감시를 한 번 더 한다.
 * `navigator.locks` 가 없는 브라우저에서는 잠금 없이 그대로 실행한다.
 */

/** `navigator.locks` 에서 쓰는 부분만. 테스트가 가짜를 넣는다. */
export type LockManagerLike = {
  request: (
    name: string,
    options: { ifAvailable: true },
    callback: (lock: unknown) => Promise<void>,
  ) => Promise<unknown>
  query: () => Promise<{ held?: { name?: string }[] }>
}

export function browserLockManager(): LockManagerLike | null {
  if (typeof navigator === 'undefined' || navigator.locks === undefined) return null
  return navigator.locks
}

/** 한 대화의 tool 호출 묶음을 실행하는 탭이 잡는 잠금. */
export function conversationLockName(conversationId: number): string {
  return `artel.projectAgent.conversation.${conversationId}`
}

/**
 * 잠금을 얻으면 `task` 가 끝날 때까지 잡고 있다가 풀고 true 를 돌려준다. 다른 탭이 잡고 있으면
 * `task` 를 부르지 않고 false 를 돌려준다. `task` 가 던지면 그대로 던진다.
 */
export async function runIfLockAvailable(
  lockManager: LockManagerLike | null,
  name: string,
  task: () => Promise<void>,
): Promise<boolean> {
  if (lockManager === null) {
    await task()
    return true
  }
  let granted = false
  await lockManager.request(name, { ifAvailable: true }, async (lock) => {
    if (lock === null) return
    granted = true
    await task()
  })
  return granted
}

/** 어느 탭이든 지금 그 잠금을 잡고 있는지. `navigator.locks` 가 없으면 늘 false. */
export async function isLockHeld(lockManager: LockManagerLike | null, name: string): Promise<boolean> {
  if (lockManager === null) return false
  const snapshot = await lockManager.query()
  return (snapshot.held ?? []).some((lock) => lock.name === name)
}
