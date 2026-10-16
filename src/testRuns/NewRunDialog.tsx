import { useId, useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import { ProjectApiError } from '../projects/projectApi'
import { versionName, type TestCaseVersionSummary, type VersionGroup } from '../testCases/testCaseVersions'
import { VersionTreeDialog } from '../testCases/VersionTreeDialog'
import { createTestRun, type TestRun } from './testRunApi'
import type { RunFolder } from './testRunFolders'
import { InfoHint } from '../design-system/primitives/InfoHint'

/**
 * 새 TR(ARTEL-1049). 이름과 이 TR 이 따를 빌드 버전을 고른다. 버전은 기본으로 테스트 런 화면에서 고른 칸이고, 바꾸려면
 * 라이브러리와 같은 버전 트리 모달을 연다. 이 버전의 TC 와 지도로 시나리오를 쓴다.
 */
export function NewRunDialog({
  folder,
  groups,
  initialVersionId,
  onClose,
  onCreated,
  projectId,
  versions,
}: {
  /** 화면에서 고른 폴더. 버전을 바꾸지 않으면 그 폴더 안에 만든다. */
  folder: RunFolder | null
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
  // 폴더는 그 버전 안에만 있다. 버전을 다른 것으로 바꾸면 폴더 밖, 그 버전 바로 아래에 만든다.
  const inFolder = folder !== null && (folder.gameBuildId ?? null) === versionId ? folder : null
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
        inFolder !== null
          ? { name: name.trim(), folderId: inFolder.id }
          : versionId === null
            ? { name: name.trim(), unversioned: true }
            : { name: name.trim(), gameBuildId: versionId },
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
            <span className="field-label">{r.newDialog.versionLabel}<InfoHint>{r.newDialog.versionHint}</InfoHint></span>
            <div className="nrd-version">
              <strong>{chosenLabel}</strong>
              {chosen?.latest === true && <span className="tcl-version-latest">{t.testCases.versions.latest}</span>}
              <button className="button button--secondary button--compact" disabled={pending} onClick={() => setPicking(true)} type="button">
                {r.newDialog.changeVersion}
              </button>
            </div>
            {inFolder !== null && <p className="field-hint">{r.newDialog.inFolder(inFolder.name)}</p>}
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
