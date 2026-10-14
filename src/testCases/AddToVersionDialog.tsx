import { useId, useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import { Picker } from './Picker'
import { versionName, type TestCaseVersionSummary } from './testCaseVersions'

/**
 * 고른 사용자 생성 케이스를 넣을 버전을 고른다(ARTEL-1032). 자동 생성 케이스는 서버가 건너뛰므로 몇 건이 실제로
 * 들어갈지는 [manualCount] 로 미리 말한다.
 */
export function AddToVersionDialog({
  initialVersionId,
  manualCount,
  onClose,
  onConfirm,
  versions,
}: {
  initialVersionId: string | null
  manualCount: number
  onClose: () => void
  onConfirm: (gameBuildId: string) => Promise<void>
  versions: readonly TestCaseVersionSummary[]
}) {
  const { t } = useI18n()
  const m = t.testCases.addToVersion
  const titleId = useId()
  const [versionId, setVersionId] = useState(
    versions.some((version) => version.gameBuildId === initialVersionId) ? (initialVersionId as string) : (versions[0]?.gameBuildId ?? ''),
  )
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  return (
    <Dialog labelledBy={titleId} onClose={onClose} title={m.title(manualCount)}>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault()
          setPending(true)
          setFailure(null)
          onConfirm(versionId).catch(() => {
            setFailure(m.failed)
            setPending(false)
          })
        }}
      >
        <p className="field-hint">{m.hint}</p>
        <div className="field">
          <Picker
            label={m.version}
            onChange={setVersionId}
            options={versions.map((version) => ({ value: version.gameBuildId, label: versionName(version) }))}
            value={versionId}
          />
        </div>
        {failure !== null && (
          <div className="inline-error" role="alert">
            <span aria-hidden="true">!</span>
            {failure}
          </div>
        )}
        <div className="dialog-actions">
          <button className="button button--secondary" disabled={pending} onClick={onClose} type="button">
            {m.cancel}
          </button>
          <button className="button button--primary" disabled={pending || versionId.length === 0} type="submit">
            {pending ? m.pending : m.confirm(manualCount)}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
