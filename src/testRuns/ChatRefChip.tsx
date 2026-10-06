import { useContext } from 'react'
import { Link } from 'react-router-dom'
import { ChatLinkContext, ChatRefsContext } from './chatRefContext'

/**
 * TC·TS references inside an agent answer (ARTEL-933).
 *
 * The answer carries `[[tc:N]]` / `[[ts:N]]` markers and, beside them, the names they
 * stand for. A number never reaches the screen: a marker with a known ref becomes a
 * chip with the name, and one without draws nothing — the agent already removed every
 * marker it could not resolve, so an orphan here means a payload from an older turn.
 * A TS chip opens the scenario; a TC chip opens the TC library's detail sheet.
 */

export function ChatRefChip({ refKind, id }: { refKind: 'tc' | 'ts'; id: number }) {
  const refs = useContext(ChatRefsContext)
  const link = useContext(ChatLinkContext)
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

  // TC 는 라이브러리의 상세 시트를 그대로 연다(ARTEL-940). 따로 만든 작은 카드는 내용이 덜하고
  // 그 시트와 어긋나게 된다.
  const openCase = link?.openCase
  if (openCase === undefined) {
    return <span className="chat-ref chat-ref--tc">{tag}{label}</span>
  }
  return (
    <button type="button" className="chat-ref chat-ref--tc" onClick={() => openCase(id)}>
      {tag}{label}
    </button>
  )
}
