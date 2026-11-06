/**
 * 스텝 문장에서 맵의 마우스 카드에 보일 동작 · 대상을 뽑는다(ARTEL-1245).
 *
 * 스텝은 사람이 읽는 문장이라 동작과 대상을 따로 들고 있지 않다. 맵은 그 둘을 한 줄로 보여 주려고 문장의
 * 낱말과 이름 꼴(백틱 이름 · `Canvas/…` 경로 · 키 이름)을 본다. 못 찾으면 `step` 과 문장의 첫 낱말이다.
 */
export type StepVerb = 'gap' | 'drag' | 'click' | 'key' | 'move' | 'check' | 'wait' | 'start' | 'progress' | 'step'

export function verbOf(action: string, gap: boolean): StepVerb {
  if (gap) return 'gap'
  if (/드래그/.test(action)) return 'drag'
  if (/클릭/.test(action)) return 'click'
  if (/(키|Escape|Return|Arrow|Shift)/.test(action) && /(눌|누르|누른)/.test(action)) return 'key'
  if (/(전환되는지|넘어가|이동한다|이동하는지|진입)/.test(action) && !/확인한다\s*$/.test(action)) return 'move'
  if (/확인/.test(action)) return 'check'
  if (/(기다|대기)/.test(action)) return 'wait'
  if (/(부팅|실행|시작)/.test(action)) return 'start'
  if (/진행/.test(action)) return 'progress'
  return 'step'
}

export function targetOf(action: string): string {
  const quoted = action.match(/`([^`]+)`/)
  if (quoted) return quoted[1]
  const path = action.match(/([A-Za-z_]\w*(?:\/[\w()-]+(?: \([\w ]+\))?)+)/)
  if (path) return path[1].trim()
  const key = action.match(/\b(LeftShift|RightShift|Escape|Return|Space|RightArrow|LeftArrow|UpArrow|DownArrow|[A-Z])\s*키/)
  if (key) return key[1]
  const name = action.match(/\b([A-Za-z]+(?:[A-Z][a-z0-9]+)+(?:\.[A-Za-z]+)*|[A-Z][a-zA-Z]+_scene|[A-Z][a-zA-Z]+Scene)\b/)
  if (name) return name[1]
  return action.replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ')
}
