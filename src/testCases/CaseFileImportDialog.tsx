import { useId, useRef, useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import {
  CASE_FILE_ACCEPT,
  importCases,
  previewCaseImport,
  type CaseImportPreview,
  type CaseImportResult,
  type CaseImportStatus,
} from './caseFileApi'

type Read = { kind: 'idle' } | { kind: 'reading' } | { kind: 'read'; preview: CaseImportPreview } | { kind: 'failed'; message: string }

const ORDER: readonly CaseImportStatus[] = ['NEW', 'EDIT', 'SAME', 'REJECTED']
const RANK: Record<CaseImportStatus, number> = { EDIT: 0, NEW: 1, REJECTED: 2, SAME: 3 }

/**
 * 파일에서 TC 를 가져온다(ARTEL-1328). Excel · CSV 를 다 받고 형식은 서버가 내용으로 정한다.
 *
 * 파일을 고르면 먼저 미리 보기를 받는다 — 줄마다 새로 · 고침 · 그대로 · 못 넣음(이유)과 고칠 줄에서 바뀌는 칸. 사람이 보고
 * "N건 가져오기" 를 누르면 같은 파일을 다시 보내 새로 · 고침 줄만 넣는다. 못 넣는 줄은 그대로 보여 고쳐 다시 올리게 한다.
 */
export function CaseFileImportDialog({
  onClose,
  onImported,
  projectId,
  target,
  targetName,
}: {
  onClose: () => void
  onImported: (result: CaseImportResult) => void
  projectId: string
  /** 버전 id 또는 `unversioned`. */
  target: string
  targetName: string
}) {
  const { t } = useI18n()
  const m = t.testCases.caseFile
  const titleId = useId()
  const input = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [read, setRead] = useState<Read>({ kind: 'idle' })
  const [dragging, setDragging] = useState(false)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  function choose(next: File | undefined) {
    if (next === undefined) return
    setFile(next)
    setFailure(null)
    setRead({ kind: 'reading' })
    previewCaseImport(projectId, target, next).then(
      (preview) => setRead({ kind: 'read', preview }),
      (error: unknown) => setRead({ kind: 'failed', message: error instanceof Error && error.message.length > 0 ? error.message : m.readFailed }),
    )
  }

  const preview = read.kind === 'read' ? read.preview : null
  const toImport = preview === null ? 0 : preview.counts.new + preview.counts.edit
  // 볼 것(고침 · 새로 · 못 넣음)을 위로, 바뀌지 않는 줄은 아래로 모은다. 같은 처리 안에서는 파일 순서다.
  const rows = preview === null ? [] : [...preview.rows].sort((a, b) => RANK[a.status] - RANK[b.status] || a.line - b.line)

  return (
    <Dialog hint={m.hint} labelledBy={titleId} onClose={onClose} title={m.title(targetName)}>
      <div className="cfi">
        <div
          className={'cfi-drop' + (dragging ? ' is-dragging' : '')}
          onDragLeave={() => setDragging(false)}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes('Files')) return
            event.preventDefault()
            setDragging(true)
          }}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            choose(event.dataTransfer.files[0])
          }}
        >
          <div className="cfi-file">
            {file === null ? (
              <span className="cfi-file-hint">{m.dropHere}</span>
            ) : (
              <>
                <span className="cfi-file-name">{file.name}</span>
                {preview !== null && <span className="cfi-file-meta">{preview.format.toUpperCase()} · {m.rowCount(preview.rows.length)}</span>}
              </>
            )}
          </div>
          <button className="button button--secondary button--compact" disabled={pending} onClick={() => input.current?.click()} type="button">
            {file === null ? m.pick : m.pickAnother}
          </button>
          <input
            accept={CASE_FILE_ACCEPT}
            hidden
            onChange={(event) => {
              choose(event.target.files?.[0])
              event.target.value = ''
            }}
            ref={input}
            type="file"
          />
        </div>

        {read.kind === 'reading' && <p className="panel-empty" aria-busy="true">{m.reading}</p>}
        {read.kind === 'failed' && (
          <div className="inline-error" role="alert">
            <span aria-hidden="true">!</span>
            {read.message}
          </div>
        )}
        {preview !== null && (
          <>
            <div className="cfi-counts" aria-live="polite">
              {ORDER.filter((status) => preview.counts[countKey(status)] > 0).map((status) => (
                <span className={`cfi-pill cfi-pill--${status.toLowerCase()}`} key={status}>
                  {m.counts[status](preview.counts[countKey(status)])}
                </span>
              ))}
            </div>
            {toImport === 0 && preview.counts.rejected === 0 ? (
              <p className="panel-empty">{m.nothing}</p>
            ) : (
              <div className="cfi-table-wrap">
                <table className="cfi-table">
                  <thead>
                    <tr>
                      <th>{m.columns.status}</th>
                      <th>{m.columns.number}</th>
                      <th>{m.columns.scene}</th>
                      <th>{m.columns.step}</th>
                      <th>{m.columns.expected}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr className={row.status === 'SAME' ? 'is-same' : undefined} key={row.line}>
                        <td>
                          <span className={`cfi-tag cfi-tag--${row.status.toLowerCase()}`}>{m.status[row.status]}</span>
                        </td>
                        <td className="cfi-number">{row.caseNumber ?? ''}</td>
                        <td>{row.scene}</td>
                        <td>
                          {row.kind === 'EXCEPTION' && <span className="tct-origin tct-kind--exception">{m.exception}</span>}
                          {row.step}
                          {row.status === 'EDIT' && row.changes.length > 0 && (
                            <span className="cfi-changes">{m.changed(row.changes.join(' · '))}</span>
                          )}
                        </td>
                        <td className={row.status === 'REJECTED' ? 'cfi-reason' : undefined}>
                          {row.status === 'REJECTED' ? row.reason : row.expectedValue}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

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
          <button
            className="button button--primary"
            disabled={pending || file === null || toImport === 0}
            onClick={() => {
              if (file === null) return
              setPending(true)
              setFailure(null)
              importCases(projectId, target, file).then(onImported, (error: unknown) => {
                setFailure(error instanceof Error && error.message.length > 0 ? error.message : m.failed)
                setPending(false)
              })
            }}
            type="button"
          >
            {pending ? m.pending : m.confirm(toImport)}
          </button>
        </div>
      </div>
    </Dialog>
  )
}

function countKey(status: CaseImportStatus): 'new' | 'edit' | 'same' | 'rejected' {
  return status === 'NEW' ? 'new' : status === 'EDIT' ? 'edit' : status === 'SAME' ? 'same' : 'rejected'
}
