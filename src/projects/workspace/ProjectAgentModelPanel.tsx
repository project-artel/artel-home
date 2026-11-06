import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import type { QaModel } from '../../qa/qaTypes'
import {
  getProjectLevelAgentModel,
  platformModels,
  putProjectLevelAgentModel,
  saveFailureText,
  type ProjectLevelAgentModel,
} from '../../projectAgent/model/projectAgentModelApi'

/**
 * 프로젝트 단위 agent 모델. 개인 선택이 없는 멤버가 쓰는 모델이다. 플랫폼 key 모델만 고를 수 있고,
 * 바꾸기는 프로젝트 OWNER 만 한다.
 */
export function ProjectAgentModelPanel({
  projectId,
  models,
  canEdit,
}: {
  projectId: string
  models: QaModel[]
  canEdit: boolean
}) {
  const { t } = useI18n()
  const copy = t.projectAgent.model
  const [current, setCurrent] = useState<ProjectLevelAgentModel | null>(null)
  const [value, setValue] = useState('')
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getProjectLevelAgentModel(projectId, controller.signal)
      .then((result) => {
        setCurrent(result)
        setValue(result.model ?? '')
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [projectId])

  async function save() {
    setPending(true)
    setFailure(null)
    try {
      const result = await putProjectLevelAgentModel(projectId, value === '' ? null : value)
      setCurrent(result)
      setValue(result.model ?? '')
    } catch (error: unknown) {
      setFailure(saveFailureText(error))
    } finally {
      setPending(false)
    }
  }

  const options = platformModels(models)
  // 저장된 모델이 목록에서 빠졌어도 선택지로 보인다.
  const stored = current?.model ?? null
  const orphan = stored !== null && !options.some((model) => model.id === stored)
  return (
    <section aria-labelledby="project-agent-model-title" className="panel">
      <header className="panel-header">
        <h2 id="project-agent-model-title">{copy.projectTitle}</h2>
      </header>
      <div className="review-settings">
        <select
          aria-label={copy.projectTitle}
          className="dc-input"
          disabled={!canEdit || pending || current === null}
          onChange={(event) => setValue(event.target.value)}
          value={value}
        >
          <option value="">{copy.projectFollowGlobal}</option>
          {orphan && <option value={stored}>{stored}</option>}
          {options.map((model) => (
            <option key={model.id} value={model.id}>{model.label}</option>
          ))}
        </select>
        {canEdit ? (
          <button
            className="button button--secondary"
            disabled={pending || current === null || value === (stored ?? '')}
            onClick={() => void save()}
            type="button"
          >
            {pending ? copy.projectSaving : copy.projectSave}
          </button>
        ) : (
          <span className="dc-quiet">{copy.projectOwnerOnly}</span>
        )}
      </div>
      {current?.problem != null && <p className="dc-error" role="status">{copy.problem(current.problem)}</p>}
      {failure !== null && <p className="dc-error" role="alert">{copy.saveFailed(failure)}</p>}
    </section>
  )
}
