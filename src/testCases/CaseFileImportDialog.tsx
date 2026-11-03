import { useId, useRef, useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import {
  CASE_FILE_ACCEPT,
  downloadImportTemplate,
  importCases,
  previewCaseImport,
  type CaseImportPreview,
  type CaseImportResult,
  type CaseImportStatus,
} from './caseFileApi'

type Read = { kind: 'idle' } | { kind: 'reading' } | { kind: 'read'; preview: CaseImportPreview } | { kind: 'failed'; message: string }

/** Tabler Icons(MIT) `file-spreadsheet`. 기획 문서 화면의 끌어 놓기 칸(`dw-drop`)과 같은 세트 · 같은 모양이다. */
const SPREADSHEET_PATH = 'M14 3v4a1 1 0 0 0 1 1h4 M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z M8 11h8v7h-8z M8 15h8 M11 11v7'

function SpreadsheetGlyph({ size }: { size: number }) {
  return (
    <span aria-hidden="true" className="dw-drop-icon">
      <svg fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width={size}>
        <path d={SPREADSHEET_PATH} />
      </svg>
    </span>
  )
}

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
  // 서버는 그대로인 줄을 목록에 싣지 않는다(개수만). 바뀌는 줄과 못 넣는 줄만 보고 확정한다.
  const rows = preview === null ? [] : [...preview.rows].sort((a, b) => RANK[a.status] - RANK[b.status] || a.line - b.line)

  return (
    <Dialog hint={m.hint} labelledBy={titleId} onClose={onClose} title={m.title(targetName)}>
      <div className="cfi">
        {/* 기획 문서 화면의 끌어 놓기 칸(`dw-drop`)을 그대로 쓴다. 파일을 고르기 전에는 크게, 고른 뒤에는 한 줄로. */}
        <div
          className={'dw-drop' + (file === null ? ' dw-drop--large' : '') + (dragging ? ' is-dragging' : '')}
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
          <SpreadsheetGlyph size={file === null ? 56 : 24} />
          <span className="dw-drop-text">
            {file === null ? (
              <>
                <b>{m.dropTitle}</b>
                <span>{m.dropHint}</span>
              </>
            ) : (
              <>
                <b className="cfi-file-name">{file.name}</b>
                {preview !== null && <span>{preview.format.toUpperCase()} · {m.rowCount(preview.counts.new + preview.counts.edit + preview.counts.same + preview.counts.rejected)}</span>}
              </>
            )}
          </span>
          <button
            className={`button ${file === null ? 'button--primary' : 'button--secondary'} button--compact`}
            disabled={pending}
            onClick={() => input.current?.click()}
            type="button"
          >
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

        {/* 처음 쓰는 사람을 위한 양식. 엑셀은 필터 · 종류 고르기 목록 · 작성법 시트가 든다. */}
        <p className="cfi-template">
          <span>{m.template}</span>
          {(['xlsx', 'csv'] as const).map((format) => (
            <button
              className="button button--secondary button--compact"
              disabled={pending}
              key={format}
              onClick={() => {
                downloadImportTemplate(projectId, format).catch(() => setFailure(m.templateFailed))
              }}
              type="button"
            >
              {format === 'xlsx' ? m.templateXlsx : m.templateCsv}
            </button>
          ))}
        </p>

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
