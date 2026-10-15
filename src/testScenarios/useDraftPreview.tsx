import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { draftIdOfNumber, draftNumber, type DraftScenario } from '../testRuns/runChatApi'
import type { RunChatSession } from '../testRuns/useRunChatSession'
import { compareDraftSteps } from './draftChanges'
import { ScenarioStepEditor } from './ScenarioStepEditor'
import { EMPTY_SCENARIO_DRAFT, isScenarioDraftEqual, type ScenarioDraft } from './scenarioTypes'
import { useStepEditor } from './useStepEditor'

/** A draft as the step editor holds it. Drafts are always ordered — FREE is a person's choice. */
function draftBody(draft: DraftScenario): ScenarioDraft {
  return { title: draft.title, description: draft.description, steps: draft.steps, execution_mode: 'ORDERED' }
}

/**
 * 자동저장을 끈 저작 턴의 draft 를 여는 자리(ARTEL-1075). 런 편집의 두 화면(시나리오 스튜디오, 빈 런)이
 * 같은 목록 · 같은 채팅을 쓰므로 draft 도 같은 방식으로 연다.
 *
 * 연 draft 는 주소의 `?preview=<draftId>` 다. `draft` 는 대시보드가 넘긴 요청문이 이미 쓰고 있다.
 * 가운데 편집기는 시나리오 편집기와 같지만 쓰는 곳이 서버의 draft 라, 승인하기 전에는 시나리오가
 * 바뀌지 않는다.
 *
 * @return `listProps` 는 {@link import('./ScenarioList').ScenarioList} 에 그대로 넘긴다. `view` 는 draft 를
 *   열었을 때 가운데에 그릴 것이고, 안 열었으면 null 이다. `editor` 는 헤더의 되돌리기 · 저장 표시가 쓴다.
 */
export function useDraftPreview(projectId: string, runChat: RunChatSession) {
  const { t } = useI18n()
  const d = t.scenarios.draft
  const [searchParams, setSearchParams] = useSearchParams()
  const previewId = searchParams.get('preview')

  const activeDraft = runChat.drafts.find((draft) => draft.draftId === previewId) ?? null
  // 주인 번호는 draft 번호(`new-3` → -3, `edit-7` → 7)다. 다른 draft 를 열면 앞의 것에 남은 편집이
  // 제 주인에게 간다.
  const draftOwner = activeDraft === null ? 0 : (draftNumber(activeDraft.draftId) ?? 0)
  const { saveDraft } = runChat
  const writeDraft = useCallback(
    (owner: number, body: ScenarioDraft) => saveDraft(draftIdOfNumber(owner), body),
    [saveDraft],
  )
  const editor = useStepEditor(draftOwner, EMPTY_SCENARIO_DRAFT, writeDraft)

  // 서버가 draft 를 바꾸면(Agent 가 다시 썼다) 편집기에 들인다. 사람이 고치는 중이면 덮지 않는다 —
  // 그 편집은 곧 서버로 가고, 돌아오는 draft 가 같은 내용이다.
  const editorRef = useRef(editor)
  useEffect(() => {
    editorRef.current = editor
  })
  const seededOwner = useRef<number | null>(null)
  useEffect(() => {
    if (activeDraft === null) {
      seededOwner.current = null
      return
    }
    const current = editorRef.current
    const body = draftBody(activeDraft)
    const switched = seededOwner.current !== draftOwner
    if (!switched && (current.dirty || isScenarioDraftEqual(current.working, body))) return
    seededOwner.current = draftOwner
    current.reset(draftOwner, body)
  }, [activeDraft, draftOwner])

  // 승인했거나 버린 draft 를 가리키는 주소는 걷는다. 처음 읽기 전의 빈 목록으로는 판단하지 않는다.
  useEffect(() => {
    if (previewId === null || !runChat.draftsLoaded || activeDraft !== null) return
    const next = new URLSearchParams(searchParams)
    next.delete('preview')
    setSearchParams(next, { replace: true })
  }, [previewId, runChat.draftsLoaded, activeDraft, searchParams, setSearchParams])

  const openDraft = useCallback((draftId: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('preview', draftId)
    setSearchParams(next)
  }, [searchParams, setSearchParams])

  const { applyDrafts, discardDrafts } = runChat
  const approve = useCallback(async (draftIds: string[]) => {
    // 고치던 것이 아직 서버에 안 갔으면 먼저 보낸다. 안 그러면 고치기 전의 draft 가 저장된다.
    if (activeDraft !== null && draftIds.includes(activeDraft.draftId) && editorRef.current.dirty) {
      if (!(await editorRef.current.flush())) return
    }
    await applyDrafts(draftIds)
  }, [activeDraft, applyDrafts])

  const listProps = {
    drafts: runChat.drafts,
    activeDraftId: activeDraft?.draftId ?? null,
    draftBusy: runChat.applying,
    onOpenDraft: openDraft,
    onApplyDrafts: (draftIds: string[]) => void approve(draftIds),
    onDiscardDrafts: (draftIds: string[]) => void discardDrafts(draftIds),
  }

  // 바뀐 자리(ARTEL-1075). 편집기에 들어온 지금 스텝을 서버가 남긴 기준과 견준다 — 사람이 고친 것도 바로 칠해진다.
  const changes = useMemo(
    () => (activeDraft === null ? null : compareDraftSteps(activeDraft.baseSteps, editor.working.steps)),
    [activeDraft, editor.working.steps],
  )
  const changedCount = changes?.marks.filter((mark) => mark === 'changed').length ?? 0
  const addedCount = changes?.marks.filter((mark) => mark === 'added').length ?? 0

  const view = activeDraft === null ? null : (
    <ScenarioStepEditor
      projectId={projectId}
      editor={editor}
      stepMarks={changes?.marks}
      banner={
        <div className={`draft-banner draft-banner--${activeDraft.scenarioId === null ? 'new' : 'edit'}`} role="note">
          <div className="draft-banner-text">
            <strong>{activeDraft.scenarioId === null ? d.bannerNew : d.bannerEdit}</strong>
            <p>{d.bannerCopy}</p>
            {changes !== null && (
              <p className="draft-legend">
                <span className="draft-legend-item draft-legend-item--changed">{d.changed(changedCount)}</span>
                <span className="draft-legend-item draft-legend-item--added">{d.added(addedCount)}</span>
                {changes.removed > 0 && <span className="draft-legend-item">{d.removed(changes.removed)}</span>}
              </p>
            )}
          </div>
          <div className="draft-banner-acts">
            <button
              className="st-btn st-btn--ghost"
              disabled={runChat.applying}
              onClick={() => void discardDrafts([activeDraft.draftId])}
              type="button"
            >
              {d.discard}
            </button>
            <button
              className="st-btn st-btn--primary"
              disabled={runChat.applying}
              onClick={() => void approve([activeDraft.draftId])}
              type="button"
            >
              {runChat.applying ? d.working : d.approve}
            </button>
          </div>
        </div>
      }
    />
  )

  return { activeDraft, editor, listProps, view }
}
