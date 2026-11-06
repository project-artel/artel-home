import { useI18n } from '../i18n/useI18n'
import { PaneIcon } from '../testCases/PaneIcon'
import './chatRail.css'

/**
 * 접힌 대화 칸. 케이스 라이브러리의 접힌 왼쪽 창(`tcl-rail`)과 같은 모양을 오른쪽에 둔다 — 막대 전체가 펴기 단추다.
 * AI 가 일하는 중이면 점이 깜박여, 접어 둬도 대화가 돌고 있는 것을 안다.
 */
export function ChatRail({ onExpand, busy = false }: { onExpand: () => void; busy?: boolean }) {
  const { t } = useI18n()
  const c = t.scenarios.chat
  return (
    <button aria-expanded={false} aria-label={c.expand} className="tcl-rail st-chat-rail" onClick={onExpand} title={c.expand} type="button">
      <span className="tcl-rail-icon"><PaneIcon collapsed side="right" /></span>
      <span className="tcl-rail-label">{c.title}</span>
      {busy && <span aria-hidden="true" className="st-chat-rail-busy" />}
    </button>
  )
}
