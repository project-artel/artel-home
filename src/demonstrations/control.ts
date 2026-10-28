import type { ControlReply, GameInput, InputCommand } from './types'

export function parseControlReply(raw: string): ControlReply | null {
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null || !('type' in value)) return null
    if (value.type === 'READY') return { type: 'READY' }
    if (value.type === 'ACK' && 'sequence' in value && Number.isSafeInteger(value.sequence) && 'eventId' in value && Number.isSafeInteger(value.eventId)) {
      return { type: 'ACK', sequence: value.sequence as number, eventId: value.eventId as number }
    }
    if (value.type === 'ERROR' && 'code' in value && typeof value.code === 'string' && 'message' in value && typeof value.message === 'string') {
      return { type: 'ERROR', code: value.code, message: value.message }
    }
    return null
  } catch { return null }
}

/** ACK는 SDK 처리 결과가 저장된 뒤 다음 입력을 허용한다. 성공 여부는 ACTION_RESULT에서 읽는다. */
export class InputQueue {
  private sequence = 0
  private inFlight: number | null = null
  private pending: GameInput[] = []
  private ready = false
  private stopped = false
  private dispatch: (command: InputCommand) => void
  private failed: () => void
  private limit: number
  constructor(dispatch: (command: InputCommand) => void, failed: () => void, limit = 32) {
    this.dispatch = dispatch; this.failed = failed; this.limit = limit
  }
  start() { if (!this.stopped) this.ready = true }
  stop() { this.stopped = true; this.ready = false; this.pending = []; this.inFlight = null }
  send(input: GameInput): boolean {
    if (!this.ready || this.stopped) return false
    if (input.method === 'move_mouse' && this.pending.at(-1)?.method === 'move_mouse') this.pending[this.pending.length - 1] = input
    else if (this.pending.length >= this.limit) { this.stop(); this.failed(); return false }
    else this.pending.push(input)
    this.flush()
    return true
  }
  acknowledge(sequence: number) {
    if (this.stopped) return
    if (sequence !== this.inFlight) { this.stop(); this.failed(); return }
    this.inFlight = null
    this.flush()
  }
  private flush() {
    if (this.inFlight !== null || this.pending.length === 0 || this.stopped) return
    const input = this.pending.shift()!
    this.inFlight = ++this.sequence
    this.dispatch({ ...input, type: 'INPUT', sequence: this.sequence })
  }
}

type Rectangle = { left: number; top: number; width: number; height: number }
/** object-fit: contain의 여백을 제외하고 정규화한다. SDK가 실행 시 게임 해상도로 변환한다. */
export function videoPoint(clientX: number, clientY: number, bounds: Rectangle, width: number, height: number) {
  if (width <= 0 || height <= 0 || bounds.width <= 0 || bounds.height <= 0) return null
  const scale = Math.min(bounds.width / width, bounds.height / height)
  const left = bounds.left + (bounds.width - width * scale) / 2
  const top = bounds.top + (bounds.height - height * scale) / 2
  const x = (clientX - left) / scale
  const y = (clientY - top) / scale
  if (x < 0 || y < 0 || x >= width || y >= height) return null
  return { x: x / width, y: y / height }
}

export function unityButton(browserButton: number) { return [0, 2, 1][browserButton] ?? null }
export function unityKey(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return `Alpha${code.slice(5)}`
  if (/^F([1-9]|1[0-2])$/.test(code)) return code
  const keys: { [code: string]: string } = {
    ArrowUp: 'UpArrow', ArrowDown: 'DownArrow', ArrowLeft: 'LeftArrow', ArrowRight: 'RightArrow',
    Enter: 'Return', Space: 'Space', Backspace: 'Backspace', Delete: 'Delete',
    ShiftLeft: 'LeftShift', ShiftRight: 'RightShift', ControlLeft: 'LeftControl', ControlRight: 'RightControl',
    AltLeft: 'LeftAlt', AltRight: 'RightAlt', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  }
  // Escape와 Tab은 조작 종료와 키보드 탐색에 남긴다.
  return keys[code] ?? null
}
