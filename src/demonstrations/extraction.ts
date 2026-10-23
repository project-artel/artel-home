/** 자동 추출은 세션마다 한 번 시도하고 수동 재시도와 같은 실행 잠금을 쓴다. */
export class ExtractionGate {
  private attempted = new Set<string>()
  private running = false
  claim(sessionId: string, automatic: boolean): boolean {
    if (this.running || (automatic && this.attempted.has(sessionId))) return false
    this.running = true
    this.attempted.add(sessionId)
    return true
  }
  finish() { this.running = false }
}
