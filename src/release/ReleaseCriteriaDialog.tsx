import { useEffect, useId, useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import {
  fetchBuildVerificationSummaries,
  fetchReleaseCriteria,
  resetReleaseCriteria,
  updateReleaseCriteria,
  type BuildVerificationSummary,
  type ReleaseCriteria,
  type ReleaseCriteriaState,
} from './releaseApi'
import { evaluateRelease, RELEASE_LEVELS, type GateKey, type ReleaseLevel } from './releaseModel'
import './release.css'

/** 기준마다 바꾸는 칸. 순서가 곧 화면 순서이고 [evaluateRelease] 의 순서와 같다. */
const FIELDS: { gate: GateKey; field: keyof ReleaseCriteria; unit: 'count' | 'percent'; kind: 'max' | 'min' }[] = [
  { gate: 'pending', field: 'maxPending', unit: 'count', kind: 'max' },
  { gate: 'regression', field: 'maxRegression', unit: 'count', kind: 'max' },
  { gate: 'passRate', field: 'minPassRate', unit: 'percent', kind: 'min' },
  { gate: 'blockers', field: 'maxOpenBlockers', unit: 'count', kind: 'max' },
  { gate: 'inconclusive', field: 'maxInconclusiveRate', unit: 'percent', kind: 'max' },
]
const MAX_COUNT = 100_000
const PAST = 5
const TONE: Record<ReleaseLevel, string> = { verifying: 'critical', candidate: 'warning', ready: 'success' }

type Loaded = { state: ReleaseCriteriaState; builds: BuildVerificationSummary[] }

/**
 * 출시 기준 창(ARTEL-1387). 대시보드 출시 준비 칸의 "출시 기준 바꾸기" 가 연다. 기준 다섯은 고정이고 숫자만 바꾼다.
 * 줄마다 지금 빌드 값과 충족 여부를 같이 보이고, 오른쪽에서 저장 전 숫자로 지금 빌드와 지난 빌드를 다시 판정한다 —
 * 숫자가 너무 느슨한지 빡빡한지 가늠하게. 바꾸기는 OWNER 만 한다. 저장하면 [onSaved] 로 대시보드가 다시 판정한다.
 */
export function ReleaseCriteriaDialog({
  projectId,
  canEdit,
  onClose,
  onSaved,
}: {
  projectId: string
  canEdit: boolean
  onClose: () => void
  onSaved: (criteria: ReleaseCriteria) => void
}) {
  const { t } = useI18n()
  const m = t.release
  const titleId = useId()
  const [loaded, setLoaded] = useState<Loaded | 'loading' | 'failed'>('loading')
  const [draft, setDraft] = useState<ReleaseCriteria | null>(null)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([fetchReleaseCriteria(projectId, controller.signal), fetchBuildVerificationSummaries(projectId, PAST, controller.signal)])
      .then(([state, builds]) => {
        setLoaded({ state, builds })
        setDraft(state.criteria)
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setLoaded('failed')
      })
    return () => controller.abort()
  }, [projectId])

  async function apply(action: () => Promise<ReleaseCriteriaState>) {
    setSaving(true)
    setFailed(false)
    try {
      const next = await action()
      onSaved(next.criteria)
      onClose()
    } catch {
      setFailed(true)
      setSaving(false)
    }
  }

  return (
    <Dialog hint={m.intro} labelledBy={titleId} onClose={onClose} title={m.title}>
      {loaded === 'failed' ? (
        <p className="inline-error">{m.loadFailed}</p>
      ) : loaded === 'loading' || draft === null ? (
        <CriteriaSkeleton />
      ) : (
        <Body
          apply={apply}
          builds={loaded.builds}
          canEdit={canEdit}
          draft={draft}
          failed={failed}
          onClose={onClose}
          projectId={projectId}
          saving={saving}
          setDraft={setDraft}
          state={loaded.state}
        />
      )}
    </Dialog>
  )
}

function Body({
  state,
  builds,
  draft,
  setDraft,
  canEdit,
  saving,
  failed,
  projectId,
  apply,
  onClose,
}: {
  state: ReleaseCriteriaState
  builds: BuildVerificationSummary[]
  draft: ReleaseCriteria
  setDraft: (next: ReleaseCriteria) => void
  canEdit: boolean
  saving: boolean
  failed: boolean
  projectId: string
  apply: (action: () => Promise<ReleaseCriteriaState>) => Promise<void>
  onClose: () => void
}) {
  const { t } = useI18n()
  const m = t.release
  const saved = state.criteria
  const changed = FIELDS.filter(({ field }) => draft[field] !== saved[field]).length
  const current = builds[0] ?? null
  const preview = current === null ? null : evaluateRelease(current, draft)
  const unit = (kind: 'count' | 'percent') => (kind === 'percent' ? '%' : m.countUnit)
  const set = (field: keyof ReleaseCriteria, value: number, percent: boolean) =>
    setDraft({ ...draft, [field]: Math.min(percent ? 100 : MAX_COUNT, Math.max(0, Math.round(value) || 0)) })

  return (
    <div className="rc-dialog">
      <div className="rc">
        <div className="rc-main">
          {!canEdit && <p className="rc-quiet">{m.ownerOnly}</p>}
          <div aria-hidden="true" className="rc-row rc-row--head">
            <span>{m.columns.criterion}</span>
            <span>{m.columns.number}</span>
            <span>{current ? m.columns.now(current.build.version) : ''}</span>
          </div>
          <ul className="rc-rows">
            {FIELDS.map(({ gate, field, unit: kind, kind: compare }, index) => {
              const gateText = m.gates[gate]
              const value = draft[field]
              const limit = kind === 'percent' ? 100 : MAX_COUNT
              const now = preview?.gates[index]
              return (
                <li className={value !== saved[field] ? 'rc-row is-dirty' : 'rc-row'} key={field}>
                  <div className="rc-name">
                    <span>
                      <b>{gateText.name}</b>
                      {value !== state.defaults[field] ? (
                        <span className="rc-chip">{m.changedFrom(`${state.defaults[field]}${unit(kind)}`)}</span>
                      ) : (
                        <span className="rc-default">{m.isDefault}</span>
                      )}
                    </span>
                    <span className="rc-rule">{gateText.rule}</span>
                  </div>
                  <div className="rc-number">
                    <span className="rc-stepper">
                      <button aria-label={m.decrease(gateText.name)} disabled={!canEdit || saving || value <= 0} onClick={() => set(field, value - 1, kind === 'percent')} type="button">
                        −
                      </button>
                      <input
                        aria-label={gateText.name}
                        disabled={!canEdit || saving}
                        inputMode="numeric"
                        max={limit}
                        min={0}
                        onChange={(event) => set(field, Number(event.target.value), kind === 'percent')}
                        type="number"
                        value={value}
                      />
                      <span className="rc-unit">{unit(kind)}</span>
                      <button aria-label={m.increase(gateText.name)} disabled={!canEdit || saving || value >= limit} onClick={() => set(field, value + 1, kind === 'percent')} type="button">
                        +
                      </button>
                    </span>
                    <b>{compare === 'max' ? m.atMost : m.atLeast}</b>
                  </div>
                  <div className="rc-now">
                    {now && (
                      <>
                        <span aria-label={now.met ? m.metLabel : m.missedLabel} className={now.met ? 'rc-mark is-met' : 'rc-mark'} role="img" />
                        <b className={now.met ? 'rc-ok' : 'rc-bad'}>
                          {now.value}
                          {unit(kind)}
                        </b>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        <aside aria-label={m.preview.title} className="rc-preview">
          <header className="rc-preview-head">
            <h3>{m.preview.title}</h3>
            <span>{m.preview.hint}</span>
          </header>
          {current === null || preview === null ? (
            <p className="rc-quiet">{m.preview.none}</p>
          ) : (
            <>
              <div className="rc-verdict">
                <span className="rc-verdict-build">
                  <span className="rc-version">{current.build.version}</span>
                  {m.preview.current(daysSince(current.build.createdAt))}
                </span>
                <span className="rc-verdict-level">
                  <b className={`rc-tone-${TONE[preview.level]}`}>{m.levels[preview.level]}</b>
                  {m.preview.met(preview.met, preview.gates.length)}
                </span>
                <Track level={preview.level} />
              </div>
              {builds.length > 1 && (
                <>
                  <div className="rc-past-head">
                    <b>{m.preview.past}</b>
                    <span>{m.preview.pastHint}</span>
                  </div>
                  <ul className="rc-past">
                    {builds.slice(1).map((build) => {
                      const verdict = evaluateRelease(build, draft)
                      return (
                        <li key={build.build.gameBuildId}>
                          <span className="rc-past-line">
                            <span className="rc-version">{build.build.version}</span>
                            <span className="rc-past-date">{shortDate(build.build.createdAt)}</span>
                            <b className={`rc-tone-${TONE[verdict.level]}`}>{m.levels[verdict.level]}</b>
                          </span>
                          <span aria-label={m.preview.met(verdict.met, verdict.gates.length)} className="rc-squares" role="img">
                            {verdict.gates.map((gate) => (
                              <i className={gate.met ? 'is-met' : undefined} key={gate.key} title={m.gates[gate.key].name} />
                            ))}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </>
          )}
          <dl className="rc-levels">
            {RELEASE_LEVELS.map((level) => (
              <div key={level}>
                <dt className={`rc-tone-${TONE[level]}`}>{m.levels[level]}</dt>
                <dd>{m.levelRules[level]}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>

      <footer className="rc-foot">
        <span aria-live="polite" className={changed > 0 ? 'rc-dirty' : 'rc-quiet'}>
          {changed > 0 ? m.unsaved(changed) : ''}
        </span>
        {failed && (
          <span className="inline-error" role="alert">
            {m.saveFailed}
          </span>
        )}
        <span className="rc-actions">
          {canEdit && (
            <button className="button button--secondary" disabled={saving || state.isDefault} onClick={() => void apply(() => resetReleaseCriteria(projectId))} type="button">
              {m.resetDefaults}
            </button>
          )}
          <button className="button button--secondary" disabled={saving} onClick={onClose} type="button">
            {canEdit ? m.cancel : m.close}
          </button>
          {canEdit && (
            <button className="button button--primary" disabled={saving || changed === 0} onClick={() => void apply(() => updateReleaseCriteria(projectId, draft))} type="button">
              {saving ? m.saving : m.save}
            </button>
          )}
        </span>
      </footer>
    </div>
  )
}

function Track({ level }: { level: ReleaseLevel }) {
  const { t } = useI18n()
  const at = RELEASE_LEVELS.indexOf(level)
  return (
    <ol className="rc-track">
      {RELEASE_LEVELS.map((step, index) => (
        <li aria-current={index === at ? 'step' : undefined} className={index <= at ? `is-on rc-tone-${TONE[level]}` : undefined} key={step}>
          <i aria-hidden="true" />
          <span>{t.release.levels[step]}</span>
        </li>
      ))}
    </ol>
  )
}

function CriteriaSkeleton() {
  return (
    <div aria-busy="true" className="rc-dialog rc--skeleton">
      {FIELDS.map(({ field }) => (
        <span aria-hidden="true" className="rc-row rc-row--skeleton" key={field}>
          <span className="skeleton-line" />
        </span>
      ))}
    </div>
  )
}

function daysSince(iso: string): number {
  const at = new Date(iso).getTime()
  return Number.isNaN(at) ? 1 : Math.max(1, Math.floor((Date.now() - at) / 86_400_000) + 1)
}

function shortDate(iso: string): string {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? '' : `${at.getMonth() + 1}/${at.getDate()}`
}
