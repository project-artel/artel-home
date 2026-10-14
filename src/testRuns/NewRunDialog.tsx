import { useId, useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import { ProjectApiError } from '../projects/projectApi'
import { versionName, type TestCaseVersionSummary, type VersionGroup } from '../testCases/testCaseVersions'
import { VersionTreeDialog } from '../testCases/VersionTreeDialog'
import { createTestRun, type TestRun } from './testRunApi'

/**
 * 새 TR(ARTEL-1049). 이름과 이 TR 이 따를 TC 버전을 고른다. 버전은 기본으로 테스트 런 화면에서 고른 칸이고, 바꾸려면
 * 라이브러리와 같은 버전 트리 모달을 연다. 이 버전의 TC 와 지도로 시나리오를 쓴다.
 */
export function NewRunDialog({
  groups,
  initialVersionId,
  onClose,
  onCreated,
  projectId,
  versions,
}: {
  groups: readonly VersionGroup[]
  /** 처음 고른 버전. null 은 버전 없음이다. */
  initialVersionId: string | null
  onClose: () => void
  onCreated: (run: TestRun) => void
  projectId: string
  versions: readonly TestCaseVersionSummary[]
}) {
  const { t } = useI18n()
  const r = t.scenarios.runList
  const titleId = useId()
  const nameId = useId()
  const [name, setName] = useState(r.newName)
  const [versionId, setVersionId] = useState<string | null>(initialVersionId)
  const [picking, setPicking] = useState(false)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const chosen = versions.find((version) => version.gameBuildId === versionId)
  const chosenLabel = versionId === null ? t.testCases.versions.unversioned : chosen !== undefined ? versionName(chosen) : versionId

  async function create() {
    if (name.trim().length === 0) {
      setFailure(r.newDialog.nameRequired)
      return
    }
    setPending(true)
    setFailure(null)
    try {
      const run = await createTestRun(
        projectId,
        versionId === null ? { name: name.trim(), unversioned: true } : { name: name.trim(), gameBuildId: versionId },
      )
      onCreated(run)
    } catch (error: unknown) {
      setFailure(error instanceof ProjectApiError && error.status === 409 ? r.moveEditor : r.createFailed)
      setPending(false)
    }
  }

  return (
    <>
      <Dialog labelledBy={titleId} onClose={onClose} title={r.newDialog.title}>
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void create()
          }}
        >
          <div className="field">
            <label className="field-label" htmlFor={nameId}>{r.newDialog.nameLabel}</label>
            <input
              autoFocus
              className="field-input"
              disabled={pending}
              id={nameId}
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </div>
          <div className="field nrd-field">
            <span className="field-label">{r.newDialog.versionLabel}</span>
            <div className="nrd-version">
              <strong>{chosenLabel}</strong>
              {chosen?.latest === true && <span className="tcl-version-latest">{t.testCases.versions.latest}</span>}
              <button className="button button--secondary button--compact" disabled={pending} onClick={() => setPicking(true)} type="button">
                {r.newDialog.changeVersion}
              </button>
            </div>
            <p className="field-hint">{r.newDialog.versionHint}</p>
          </div>
          {failure !== null && (
            <div className="inline-error" role="alert">
              <span aria-hidden="true">!</span>
              {failure}
            </div>
          )}
          <div className="dialog-actions">
            <button className="button button--secondary" disabled={pending} onClick={onClose} type="button">
              {r.cancel}
            </button>
            <button className="button button--primary" disabled={pending} type="submit">
              {pending ? r.creating : r.newDialog.confirm}
            </button>
          </div>
        </form>
      </Dialog>

      {picking && (
        <VersionTreeDialog
          allowNone
          confirmLabel={r.newDialog.pick}
          groups={groups}
          initialId={versionId}
          onClose={() => setPicking(false)}
          onConfirm={(gameBuildId) => {
            setVersionId(gameBuildId)
            setPicking(false)
          }}
          title={r.newDialog.versionLabel}
          versions={versions}
        />
      )}
    </>
  )
}
