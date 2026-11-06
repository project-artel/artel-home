import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { getDiscussionSettings, updateDiscussionSettings } from './discussionApi'

/**
 * 프로젝트 설정의 "확인 요청이 해결되는 승인 수"(ARTEL-1114). 확인 요청 글은 검토자 승인이 이 수만큼 모이면 해결된다.
 * 바꾸기는 프로젝트 OWNER 만 — 다른 멤버에게는 값만 보인다.
 */
export function ReviewSettingsPanel({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const { t } = useI18n()
  const text = t.discussions
  const [value, setValue] = useState<number | null>(null)
  const [saved, setSaved] = useState<number | null>(null)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    getDiscussionSettings(projectId, controller.signal)
      .then((settings) => {
        setValue(settings.approvalsRequired)
        setSaved(settings.approvalsRequired)
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [projectId])

  async function save() {
    if (value === null) return
    setPending(true)
    setFailed(false)
    try {
      const next = await updateDiscussionSettings(projectId, value)
      setSaved(next.approvalsRequired)
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <section aria-labelledby="review-settings-title" className="panel">
      <header className="panel-header">
        <h2 id="review-settings-title">{text.approvalsSetting}</h2>
      </header>
      <p className="section-intro">{text.reviewersHint}</p>
      <div className="review-settings">
        <input
          aria-label={text.approvalsSetting}
          className="dc-input review-settings-input"
          disabled={!canEdit || pending || value === null}
          max={20}
          min={1}
          onChange={(event) => setValue(Math.min(20, Math.max(1, Number(event.target.value) || 1)))}
          type="number"
          value={value ?? ''}
        />
        {canEdit ? (
          <button
            className="button button--secondary"
            disabled={pending || value === null || value === saved}
            onClick={() => void save()}
            type="button"
          >
            {pending ? text.saving : text.save}
          </button>
        ) : (
          <span className="dc-quiet">{text.approvalsSettingHint}</span>
        )}
      </div>
      {failed && (
        <p className="dc-error" role="alert">
          {text.saveFailed}
        </p>
      )}
    </section>
  )
}
