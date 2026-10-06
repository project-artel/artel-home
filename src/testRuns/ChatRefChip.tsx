import { useContext, useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { ChatLinkContext, ChatRefsContext } from './chatRefContext'

/**
 * TC·TS references inside an agent answer (ARTEL-933).
 *
 * The answer carries `[[tc:N]]` / `[[ts:N]]` markers and, beside them, the names they
 * stand for. A number never reaches the screen: a marker with a known ref becomes a
 * chip with the name, and one without draws nothing — the agent already removed every
 * marker it could not resolve, so an orphan here means a payload from an older turn.
 */

const CARD_WIDTH = 280
const CARD_MARGIN = 8

export function ChatRefChip({ refKind, id }: { refKind: 'tc' | 'ts'; id: number }) {
  const refs = useContext(ChatRefsContext)
  const link = useContext(ChatLinkContext)
  // 열린 카드의 자리. 대화 칸은 300px 남짓이라 칩 아래에 그대로 두면 칸 밖으로 잘린다 —
  // 화면 기준(fixed)으로 띄우고 오른쪽 끝을 넘지 않게 당긴다.
  const [card, setCard] = useState<CSSProperties | null>(null)
  // 스크롤하면 칩이 움직이는데 화면 기준 카드는 그대로라 떨어져 보인다. 그때는 닫는다.
  useEffect(() => {
    if (card === null) return
    const close = () => setCard(null)
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [card])
  const ref = refs.find((one) => one.kind === refKind && one.id === id)
  if (ref === undefined) return null

  const tag = <span className="chat-ref-tag">{refKind.toUpperCase()}</span>
  // 이름은 모델·명세가 쓴 글이라 `Canvas/continue` 같은 코드 표시가 섞여 온다. 칩은 한 덩어리
  // 이름이라 그 백틱이 글자로 보이기만 하므로 걷어 낸다.
  const label = ref.label.replace(/`/g, '')

  if (refKind === 'ts') {
    if (link === null) {
      return <span className="chat-ref chat-ref--ts">{tag}{label}</span>
    }
    const run = link.runId !== null ? `?run=${encodeURIComponent(link.runId)}` : ''
    return (
      <Link
        className="chat-ref chat-ref--ts"
        to={`/projects/${encodeURIComponent(link.projectId)}/test-scenarios/${id}${run}`}
      >
        {tag}{label}
      </Link>
    )
  }

  // A TC has no page of its own, so the chip opens what the case says right here.
  return (
    <span className="chat-ref-wrap">
      <button
        type="button"
        className="chat-ref chat-ref--tc"
        aria-expanded={card !== null}
        onClick={(event) => {
          if (card !== null) {
            setCard(null)
            return
          }
          const at = event.currentTarget.getBoundingClientRect()
          const width = Math.min(CARD_WIDTH, window.innerWidth - 2 * CARD_MARGIN)
          setCard({
            top: at.bottom + 4,
            left: Math.max(CARD_MARGIN, Math.min(at.left, window.innerWidth - width - CARD_MARGIN)),
            width,
          })
        }}
        onBlur={() => setCard(null)}
        onKeyDown={(event) => { if (event.key === 'Escape') setCard(null) }}
      >
        {tag}{label}
      </button>
      {card !== null && (
        <span className="chat-ref-card" role="tooltip" style={card}>
          <span className="chat-ref-card-title">{label}</span>
          {ref.detail !== null && <span className="chat-ref-card-body">{ref.detail.replace(/`/g, '')}</span>}
        </span>
      )}
    </span>
  )
}
