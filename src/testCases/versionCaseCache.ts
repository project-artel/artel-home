/**
 * 한 번 받은 버전 케이스 표를 기억해 둔다(ARTEL-1211). 같은 버전을 다시 열면 기억한 표를 바로 보이고, 뒤에서 새로
 * 받아 갈아 끼운다. 2천 건 넘는 버전은 받는 데만 1초 가까이 걸려, 버전을 오갈 때마다 빈 표를 기다리게 했다.
 *
 * 화면을 떠나도 남도록 모듈에 둔다. 버전 하나가 수 MB 라 최근에 연 [limit] 개만 남긴다.
 */
export class RecentCache<V> {
  private readonly entries = new Map<string, V>()
  private readonly limit: number

  constructor(limit: number) {
    this.limit = limit
  }

  get(key: string): V | undefined {
    const value = this.entries.get(key)
    if (value === undefined) return undefined
    // 꺼낸 것을 맨 뒤로 옮겨, 지울 때 가장 오래 안 쓴 것부터 지운다.
    this.entries.delete(key)
    this.entries.set(key, value)
    return value
  }

  set(key: string, value: V): void {
    this.entries.delete(key)
    this.entries.set(key, value)
    while (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
  }

  clear(): void {
    this.entries.clear()
  }
}

export function versionCasesKey(projectId: string, gameBuildId: string, compareTo: string | null): string {
  return `${projectId}:${gameBuildId}:${compareTo ?? ''}`
}
