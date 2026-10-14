import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { UnauthorizedError } from '../shared/adminApi'
import { adminFormat } from '../shared/format'
import { ProjectPicker } from '../shared/projects/ProjectPicker'
import { listProjects, type ProjectSummary } from '../shared/projects/projectsApi'
import { StepLabelList } from './StepLabelList'
import { fetchScenario, listScenarios, saveLabels, type LabelScenario, type ScenarioListItem } from './expectedLabelsApi'
import { changedLabels } from './labels'
import './labels.css'

/**
 * 기대 판정 라벨링 화면(ARTEL-302).
 *
 * **왜 admin-page인가.** 이 라벨은 모델 비교용 **정답지**다. 같은 리포의 QA 대시보드가 이 라벨로
 * 채점된 결과(미탐·오탐·미보고)를 축별로 읽는다. 제품 화면에 두면 제품 사용자가 정답지를 건드리게
 * 되고, 라벨 품질이 곧 벤치마크 신뢰도라 그대로 무너진다.
 *
 * **본문은 편집하지 않는다.** 스텝의 행위·TC는 읽기 전용으로만 보인다. 서버도 라벨 전용 경로를
 * 따로 두어 본문을 안 받으므로, 이 화면이 저작자가 방금 고친 스텝을 되돌릴 방법이 없다.
 */
export default function LabelsPage() {
  const { t } = useI18n()
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    listProjects(controller.signal)
      .then((items) => {
        setProjects(items)
        setProjectId(items[0]?.id ?? null)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || cause instanceof UnauthorizedError) return
        setProjects([])
        setError(true)
      })
    return () => controller.abort()
  }, [])

  return (
    <div className="shell">
      <main className="main">
        <p className="section__note section__note--block">{t.adminLabels.intro}</p>
        <ProjectPicker projects={projects} value={projectId} onChange={setProjectId} />
        {error && <p className="notice notice--critical">{t.admin.states.loadFailed}</p>}
        {projectId !== null && <ProjectLabels key={projectId} projectId={projectId} />}
      </main>
    </div>
  )
}

function ProjectLabels({ projectId }: { projectId: string }) {
  const { t } = useI18n()
  const [scenarios, setScenarios] = useState<ScenarioListItem[] | null>(null)
  const [scenarioId, setScenarioId] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    listScenarios(projectId, controller.signal)
      .then((items) => {
        setScenarios(items)
        setScenarioId(items[0]?.testScenarioId ?? null)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || cause instanceof UnauthorizedError) return
        setScenarios([])
        setError(true)
      })
    return () => controller.abort()
  }, [projectId])

  return (
    <>
      {error && <p className="notice notice--critical">{t.admin.states.loadFailed}</p>}
      <div className="labels__layout">
        <nav className="labels__scenarios" aria-label={t.adminLabels.scenariosLabel}>
          {scenarios !== null && scenarios.length === 0 ? (
            <p className="muted">{t.adminLabels.noScenarios}</p>
          ) : scenarios?.map((item) => (
            <button
              key={item.testScenarioId}
              type="button"
              className={item.testScenarioId === scenarioId ? 'control control--action' : 'control'}
              aria-pressed={item.testScenarioId === scenarioId}
              onClick={() => setScenarioId(item.testScenarioId)}
            >
              {item.title === '' ? t.adminLabels.untitled : item.title}
            </button>
          ))}
        </nav>
        <section className="labels__panel">
          {scenarioId === null ? (
            <p className="muted">{t.adminLabels.chooseScenario}</p>
          ) : (
            <ScenarioLabels key={scenarioId} projectId={projectId} scenarioId={scenarioId} />
          )}
        </section>
      </div>
    </>
  )
}

function ScenarioLabels({ projectId, scenarioId }: { projectId: string; scenarioId: string }) {
  const { t, locale } = useI18n()
  const format = adminFormat(locale)
  const [saved, setSaved] = useState<LabelScenario | null>(null)
  const [draft, setDraft] = useState<LabelScenario | null>(null)
  const [error, setError] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetchScenario(projectId, scenarioId, controller.signal)
      .then((scenario) => {
        setSaved(scenario)
        setDraft(scenario)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || cause instanceof UnauthorizedError) return
        setError(true)
      })
    return () => controller.abort()
  }, [projectId, scenarioId])

  const setLabel = useCallback((step: number, value: boolean | null) => {
    setDraft((current) => current === null ? current : {
      ...current,
      steps: current.steps.map((row) => row.step === step ? { ...row, expectedPassed: value } : row),
    })
  }, [])

  const pending = saved !== null && draft !== null ? changedLabels(saved.steps, draft.steps) : []

  const save = useCallback(() => {
    if (draft === null || saved === null) return
    const changed = changedLabels(saved.steps, draft.steps)
    if (changed.length === 0) return
    setBusy(true)
    setSaveFailed(false)
    saveLabels(draft.testScenarioId, changed)
      .then((fresh) => {
        // 서버가 돌려준 본문으로 갈아탄다 — 그 사이 저작 쪽에서 스텝이 바뀌었을 수 있고,
        // 로컬 편집본을 그대로 두면 화면이 없는 스텝에 라벨을 달고 있는 것처럼 보인다.
        setSaved(fresh)
        setDraft(fresh)
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof UnauthorizedError)) setSaveFailed(true)
      })
      .finally(() => setBusy(false))
  }, [draft, saved])

  if (draft === null) return <>{error && <p className="notice notice--critical">{t.admin.states.loadFailed}</p>}<p className="muted">{t.admin.states.loading}</p></>

  return (
    <>
      {saveFailed && <p className="notice notice--critical">{t.adminLabels.saveFailed}</p>}
      <h2 className="panel__title">{draft.title === '' ? t.adminLabels.untitled : draft.title}</h2>
      <StepLabelList steps={draft.steps} onChange={setLabel} />
      <div className="labels__actions">
        <button type="button" className="control control--action" disabled={busy || pending.length === 0} onClick={save}>
          {busy ? t.adminLabels.saving : t.adminLabels.save(format.count(pending.length))}
        </button>
        {pending.length > 0 && !busy && <span className="muted">{t.adminLabels.unsaved(format.count(pending.length))}</span>}
      </div>
    </>
  )
}
