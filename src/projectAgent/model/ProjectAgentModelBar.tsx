import { useCallback, useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import { QaModelPicker } from '../../qa/QaModelPicker'
import type { QaModel } from '../../qa/qaTypes'
import {
  choiceFromOptionKey,
  defaultModelName,
  getProjectAgentModel,
  listProjectAgentModels,
  preferenceOptionKey,
  putProjectAgentModel,
  saveFailureText,
  type ProjectAgentModelPreference,
} from './projectAgentModelApi'

/**
 * 사용자의 프로젝트 agent 모델 선택. 헤더 아래에 열리는 줄이다.
 * 첫 선택지 "기본 모델" 은 null 을 저장한다. 나머지는 `/api/qa-models` 의 picker 가 고른다.
 */
export function ProjectAgentModelBar({ projectId, open }: { projectId: string; open: boolean }) {
  const { t } = useI18n()
  const copy = t.projectAgent.model
  const pickerId = useId()
  const [models, setModels] = useState<QaModel[]>([])
  const [preference, setPreference] = useState<ProjectAgentModelPreference | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    const controller = new AbortController()
    listProjectAgentModels(controller.signal).then(setModels).catch(() => undefined)
    getProjectAgentModel(projectId, controller.signal).then(setPreference).catch(() => undefined)
    return () => controller.abort()
  }, [open, projectId])

  const save = useCallback(
    async (optionKey: string) => {
      const choice = choiceFromOptionKey(optionKey, models)
      if (choice === null) return
      setSaving(true)
      setFailure(null)
      try {
        // 응답의 effective 모델이 이 프로젝트의 모델 설정까지 따지도록 `projectId` 를 함께 보낸다.
        setPreference(await putProjectAgentModel(choice, projectId))
      } catch (error: unknown) {
        setFailure(saveFailureText(error))
      } finally {
        setSaving(false)
      }
    },
    [models, projectId],
  )

  if (!open) return null
  const value = preference === null ? '' : preferenceOptionKey(preference)
  const usingDefault = value === ''
  return (
    <div className="agent-model-bar">
      <label className="agent-model-bar__label" htmlFor={pickerId}>{copy.label}</label>
      <button
        aria-pressed={usingDefault}
        className={'agent-model-bar__default' + (usingDefault ? ' is-selected' : '')}
        disabled={saving || preference === null}
        onClick={() => void save('')}
        type="button"
      >
        {copy.defaultOption(defaultModelName(preference, models))}
      </button>
      <QaModelPicker
        disabled={saving || models.length === 0}
        id={pickerId}
        models={models}
        onChange={(key) => void save(key)}
        popoverWidth={360}
        value={value}
      />
      {preference?.problem != null && (
        <p className="agent-model-bar__warning" role="status">{copy.problem(preference.problem)}</p>
      )}
      {failure !== null && <p className="agent-model-bar__error" role="alert">{copy.saveFailed(failure)}</p>}
    </div>
  )
}

/** NOTICE 안에서 key 를 넣을 곳으로 보내는 링크. */
export function NoticeKeyLink({ to }: { to: '/account' | '/admin/settings' }) {
  const { t } = useI18n()
  return (
    <Link className="agent-notice__link" to={to}>
      {to === '/account' ? t.projectAgent.model.accountLink : t.projectAgent.model.adminLink}
    </Link>
  )
}
