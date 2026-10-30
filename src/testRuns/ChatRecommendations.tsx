import { useContext, useEffect, useId, useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { EdgeScrollbar } from '../design-system/primitives/EdgeScrollbar'
import { useI18n } from '../i18n/useI18n'
import { StudioIcon } from '../testScenarios/studioIcons'
import { ChatLinkContext } from './chatRefContext'
import {
  discardCaseRecommendations,
  listCaseRecommendations,
  saveCaseRecommendations,
  type CaseRecommendation,
} from './runChatApi'

/**
 * 저작이 추천한 TC — 시나리오에 필요한데 만드는 TC 가 없던 것. 답 말풍선 안의 카드다.
 *
 * "draft" 는 시나리오에만 쓰는 말이라 이것은 **추천 TC** 라 부르고, 왼쪽 목록에 따로 승인 막대를 두지 않는다. 시나리오
 * draft 를 승인하면 그 시나리오가 쓰는 추천도 서버가 함께 저장한다. 여기서는 TC 만 저장하거나 버릴 수 있다.
 *
 * 저장된 답의 카드는 그 뒤에 무슨 일이 있었는지 모르므로, 그릴 때 이 런의 추천 상태를 한 번 다시 읽는다.
 */
export function ChatRecommendations({ recommendations }: { recommendations: CaseRecommendation[] }) {
  const { t } = useI18n()
  const m = t.scenarios.chat.recommendations
  const link = useContext(ChatLinkContext)
  const [items, setItems] = useState(recommendations)
  const [picked, setPicked] = useState<Set<string>>(() => new Set(recommendations.map((one) => one.id)))
  const [working, setWorking] = useState(false)
  const [failed, setFailed] = useState(false)
  // 여럿이면 대화 칸에서 네 칸이 좁게 접힌다. "크게 보기" 로 같은 카드를 가운데 창에 연다 — 대화 속 표와 같은 창이다.
  const [wide, setWide] = useState(false)
  const titleId = useId()
  const [dialogScroller, setDialogScroller] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (link?.runId == null) return
    let alive = true
    listCaseRecommendations(link.projectId, link.runId)
      .then((latest) => {
        if (!alive) return
        const byId = new Map(latest.map((one) => [one.id, one]))
        setItems((now) => now.map((one) => byId.get(one.id) ?? one))
      })
      .catch(() => undefined)
    return () => { alive = false }
  }, [link?.projectId, link?.runId])

  if (link?.runId == null || items.length === 0) return null
  const runId = link.runId
  const pending = items.filter((one) => one.status === 'PENDING')
  const many = pending.length > 1

  async function run(action: () => Promise<void>) {
    setWorking(true)
    setFailed(false)
    try {
      await action()
    } catch {
      setFailed(true)
    } finally {
      setWorking(false)
    }
  }

  const save = (ids: string[], thenOpen = false) => run(async () => {
    const saved = await saveCaseRecommendations(link.projectId, runId, ids)
    const byId = new Map(saved.map((one) => [one.id, one]))
    setItems((now) => now.map((one) => byId.get(one.id) ?? one))
    // 고쳐서 저장: 저장한 뒤 그 TC 를 기존 TC 상세(편집) 창으로 연다. 새 편집 화면을 만들지 않는다.
    const first = saved[0]?.testCaseId
    if (thenOpen && first != null) link.openCase?.(Number(first))
  })

  const discard = (ids: string[]) => run(async () => {
    await discardCaseRecommendations(link.projectId, runId, ids)
    setItems((now) => now.map((one) => (ids.includes(one.id) ? { ...one, status: 'DISCARDED' } : one)))
  })

  const toggle = (id: string) => setPicked((now) => {
    const next = new Set(now)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const chosen = pending.filter((one) => picked.has(one.id)).map((one) => one.id)

  const head = (
    <header className="chat-recs-head">
      <StudioIcon className="chat-recs-icon" name="bulb" size={15} />
      <strong>{m.title(items.length)}</strong>
      {pending.length > 0 && <span className="chat-recs-hint">{m.hint}</span>}
      {items.length > 1 && (
        <button className="chat-md-table-expand chat-recs-expand" onClick={() => setWide(true)} type="button">
          <StudioIcon name="maximize" size={13} />
          {m.expand}
        </button>
      )}
    </header>
  )
  // 대화 칸과 창이 같은 상태를 쓴다. 창에서 고르고 저장해도 대화 속 카드가 함께 바뀐다.
  const body = (
    <>
      <ul className="chat-recs-list">
        {items.map((one) => (
          <li className={`chat-recs-item is-${one.status.toLowerCase()}`} key={one.id}>
            {one.status === 'PENDING' ? (
              <>
                {many && (
                  <input
                    aria-label={m.select(one.step || one.expectedValue)}
                    checked={picked.has(one.id)}
                    className="chat-recs-check"
                    onChange={() => toggle(one.id)}
                    type="checkbox"
                  />
                )}
                <dl className="chat-recs-grid">
                  <div><dt>{m.scene}</dt><dd>{one.scene || '—'}</dd></div>
                  <div><dt>{m.precondition}</dt><dd>{one.precondition || '—'}</dd></div>
                  <div><dt>{m.step}</dt><dd>{one.step || '—'}</dd></div>
                  <div><dt>{m.expected}</dt><dd>{one.expectedValue}</dd></div>
                </dl>
                {one.why.length > 0 && <p className="chat-recs-why">{m.why}: {one.why}</p>}
              </>
            ) : one.status === 'SAVED' ? (
              <p className="chat-recs-done">
                <StudioIcon name="check" size={14} />
                <span>{m.saved(one.testCaseId ?? '')} · {one.step || one.expectedValue} → {one.expectedValue}</span>
                <span className="chat-recs-hint">{m.savedNote}</span>
                {one.testCaseId != null && link.openCase !== undefined && (
                  <button className="chat-recs-link" onClick={() => link.openCase?.(Number(one.testCaseId))} type="button">{m.openTc}</button>
                )}
              </p>
            ) : (
              <p className="chat-recs-done is-muted">{one.step || one.expectedValue} — {m.discarded}</p>
            )}
          </li>
        ))}
      </ul>
      {pending.length > 0 && (
        <footer className="chat-recs-actions">
          {many ? (
            <>
              <button className="chat-recs-primary" disabled={working || chosen.length === 0} onClick={() => save(chosen)} type="button">{m.saveSelected}</button>
              <button className="chat-recs-secondary" disabled={working} onClick={() => save(pending.map((one) => one.id))} type="button">{m.saveAll}</button>
              <button className="chat-recs-ghost" disabled={working || chosen.length === 0} onClick={() => discard(chosen)} type="button">{m.discard}</button>
            </>
          ) : (
            <>
              <button className="chat-recs-primary" disabled={working} onClick={() => save([pending[0].id])} type="button">{m.save}</button>
              <button className="chat-recs-secondary" disabled={working} onClick={() => save([pending[0].id], true)} type="button">{m.saveAndEdit}</button>
              <button className="chat-recs-ghost" disabled={working} onClick={() => discard([pending[0].id])} type="button">{m.discard}</button>
            </>
          )}
          {working && <span className="chat-recs-hint" role="status">{m.working}</span>}
          {failed && <span className="chat-recs-error" role="alert">{m.failed}</span>}
        </footer>
      )}
    </>
  )

  return (
    <section aria-label={m.title(items.length)} className="chat-recs">
      {head}
      {body}
      {wide && (
        <Dialog labelledBy={titleId} onClose={() => setWide(false)} title={m.title(items.length)}>
          {/* 창은 body 로 뜬다. 대화 칸의 범위 이름을 함께 달아 카드 모양이 같게 한다. */}
          <div className="scenario-studio chat-table-scope">
            <div className="st-chat chat-table-dialog">
              <div className="chat-table-dialog-scroll" ref={setDialogScroller}>
                {/* 제목은 창이 단다. */}
                <section aria-label={m.title(items.length)} className="chat-recs chat-recs--wide">
                  {body}
                </section>
              </div>
              <EdgeScrollbar label={m.title(items.length)} scroller={dialogScroller} side="right" />
            </div>
          </div>
        </Dialog>
      )}
    </section>
  )
}
