import { useEffect } from 'react'
import { useI18n } from '../i18n/useI18n'
import { useTestCaseLabel } from './testCaseIdentifiers'
import { TestCaseDetails } from './TestCaseDetails'

export function TestCaseModal({ projectId, caseId, onClose, gameBuildId = null }: {
  projectId: string
  caseId: number
  onClose: () => void
  gameBuildId?: string | null
}) {
  const { t } = useI18n()
  const caseLabel = useTestCaseLabel()
  const label = caseLabel(caseId)
  useEffect(() => {
    function onKey(event: KeyboardEvent) { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="tc-modal-scrim" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="tc-modal" role="dialog" aria-modal="true" aria-label={label}>
        <div className="tc-modal-head">
          <span className="st-tc-badge">{label}</span>
          <button className="tc-modal-close" aria-label={t.scenarios.tcModal.close} onClick={onClose} type="button">✕</button>
        </div>
        <TestCaseDetails key={projectId + ':' + caseId + ':' + gameBuildId} projectId={projectId} caseId={String(caseId)} gameBuildId={gameBuildId} />
      </div>
    </div>
  )
}
