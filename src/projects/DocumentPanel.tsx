import { useEffect, useRef, useState } from 'react'
import { createDownloadTicket, deleteDocument, ProjectApiError } from './projectApi'
import { apiErrorMessage } from './apiErrorMessage'
import {
  beginDocumentDelete,
  cancelDocumentDelete,
  idleDocumentDelete,
  requestDocumentDelete,
  runDocumentDelete,
  type DocumentDeleteState,
} from './documentDeleteState'
import { formatBytes, formatDate, formatElapsedSeconds } from './formatters'
import { useI18n } from '../i18n/useI18n'
import { DOCUMENT_ACCEPT, describeFileProblem, uploadDocument } from './uploadDocument'
import type { DocumentStreamState } from './useDocumentEvents'
import type { ProjectDocument } from './projectTypes'

type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading'; ratio: number | null }
  | { phase: 'failed'; message: string }

export function DocumentPanel({
  projectId,
  documents,
  onDeleted,
  onUploaded,
  streamState,
}: {
  projectId: string
  documents: ProjectDocument[]
  onDeleted: (documentId: string) => void
  onUploaded: (document: ProjectDocument) => void
  streamState: DocumentStreamState
}) {
  const [upload, setUpload] = useState<UploadState>({ phase: 'idle' })
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [deleteState, setDeleteState] = useState<DocumentDeleteState>(idleDocumentDelete)
  const fileInput = useRef<HTMLInputElement>(null)
  const { t } = useI18n()
  // effect 가 아니라 "prop 이 바뀌면 state 를 맞춘다" (React 문서의 패턴)
  // 쪽이다: 여기서는 렌더 중 `useRef` 읽기/쓰기가 금지돼 있고, `useEffect`
  // 본문에서 바로 setState 를 부르면 렌더가 한 번 더 캐스케이드된다. 직전
  // `documents` *참조* 와 비교하는 것이 이 블록을 한 번만 돌게 만든다 —
  // `useProject.ts` 의 `applyDocumentStatus` 는 문서가 실제로 바뀔 때만 이
  // 배열을 새로 만들므로, 진짜 변화가 있을 때만 이 본문이 돌고 아래
  // `setPreviousDocuments` 가 그것을 마무리한다.
  const [previousDocuments, setPreviousDocuments] = useState(documents)

  const [current, ...history] = documents

  /*
   * `aria-live="polite"` 는 요약된 변화만 알린다. SSE 프레임 하나마다 알리지
   * 않는다 — DESIGN.md 가 명시하는 규칙이다. 종료 상태 두 가지(`EXTRACTED`
   * 또는 `FAILED`)로 바뀔 때만 말하고, `EXTRACTING` 이나 `stale` 플립은
   * 조용히 지나간다.
   */
  if (documents !== previousDocuments) {
    const previousStatusById = new Map(
      previousDocuments.map((document) => [document.id, document.parseStatus]),
    )
    let pendingAnnouncement: string | null = null

    for (const document of documents) {
      const previousStatus = previousStatusById.get(document.id)
      if (previousStatus === undefined || previousStatus === document.parseStatus) continue

      if (document.parseStatus === 'EXTRACTED') {
        pendingAnnouncement = t.projects.documents.parseStatus.extractedAnnouncement(document.version)
      } else if (document.parseStatus === 'FAILED') {
        pendingAnnouncement = t.projects.documents.parseStatus.failedAnnouncement(document.version)
      }
    }

    setPreviousDocuments(documents)
    if (pendingAnnouncement !== null) setAnnouncement(pendingAnnouncement)
  }

  async function start(file: File) {
    const problem = describeFileProblem(file)
    if (problem !== null) {
      setPendingFile(null)
      setUpload({ phase: 'failed', message: t.projects.documents.problems[problem] })
      return
    }

    // Keep the file so Retry does not make the user pick it again.
    setPendingFile(file)
    setUpload({ phase: 'uploading', ratio: 0 })

    try {
      const document = await uploadDocument({
        projectId,
        file,
        onProgress: ({ ratio }) => setUpload({ phase: 'uploading', ratio }),
      })
      setUpload({ phase: 'idle' })
      setPendingFile(null)
      setAnnouncement(t.projects.documents.uploadedAnnouncement(document.version))
      onUploaded(document)
    } catch (error: unknown) {
      const message =
        error instanceof ProjectApiError
          ? apiErrorMessage(error, t)
          : t.projects.documents.uploadFailed
      setUpload({ phase: 'failed', message })
    }
  }

  async function download(document: ProjectDocument) {
    try {
      const ticket = await createDownloadTicket(projectId, document.id)
      window.open(ticket.downloadUrl, '_blank', 'noopener,noreferrer')
    } catch {
      setUpload({ phase: 'failed', message: t.projects.documents.downloadFailed })
    }
  }

  function requestDelete(documentId: string) {
    setDeleteState(requestDocumentDelete(documentId))
  }

  function cancelDelete() {
    setDeleteState(cancelDocumentDelete())
  }

  async function confirmDelete(document: ProjectDocument) {
    setDeleteState(beginDocumentDelete(document.id))

    const { state, deleted } = await runDocumentDelete({
      deleteDocument: (documentId) => deleteDocument(projectId, documentId),
      documentId: document.id,
      toErrorMessage: (error) =>
        error instanceof ProjectApiError ? apiErrorMessage(error, t) : t.projects.documents.deleteFailed,
    })

    setDeleteState(state)
    if (deleted) {
      setAnnouncement(t.projects.documents.deletedAnnouncement(document.version))
      onDeleted(document.id)
    }
  }

  const uploading = upload.phase === 'uploading'

  return (
    <section className="panel" aria-labelledby="documents-title">
      <header className="panel-header panel-header--split">
        <h2 id="documents-title">{t.projects.documents.title}</h2>
        <DocumentStreamIndicator streamState={streamState} />
      </header>

      {current === undefined ? (
        <p className="panel-empty">{t.projects.documents.empty}</p>
      ) : (
        <div className="document-current">
          <DocumentLine
            deleteState={deleteState}
            document={current}
            isCurrent
            onCancelDelete={cancelDelete}
            onConfirmDelete={confirmDelete}
            onDownload={download}
            onRequestDelete={requestDelete}
          />
        </div>
      )}

      <div
        className={`upload-drop${dragging ? ' upload-drop--active' : ''}`}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          const file = event.dataTransfer.files.item(0)
          if (file !== null) void start(file)
        }}
      >
        <input
          accept={DOCUMENT_ACCEPT}
          className="visually-hidden"
          disabled={uploading}
          id="document-file"
          onChange={(event) => {
            const file = event.target.files?.item(0)
            if (file != null) void start(file)
            // Allow re-picking the same file after a failure.
            event.target.value = ''
          }}
          ref={fileInput}
          type="file"
        />
        <label className="button button--secondary" htmlFor="document-file">
          {current === undefined
            ? t.projects.documents.uploadFirst
            : t.projects.documents.uploadNew}
        </label>
        <p className="upload-hint">{t.projects.documents.hint}</p>
      </div>

      {uploading && (
        <div className="upload-progress">
          <div
            aria-label={t.projects.documents.progressLabel}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={upload.ratio === null ? undefined : Math.round(upload.ratio * 100)}
            className="progress-track"
            role="progressbar"
          >
            <span
              className="progress-fill"
              style={{ width: upload.ratio === null ? '100%' : `${upload.ratio * 100}%` }}
            />
          </div>
          <p className="upload-status">
            {upload.ratio === null
              ? t.projects.documents.uploading
              : t.projects.documents.uploadingPercent(Math.round(upload.ratio * 100))}
          </p>
        </div>
      )}

      {upload.phase === 'failed' && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          <span>{upload.message}</span>
          {pendingFile !== null && (
            <button
              className="button button--secondary button--compact"
              onClick={() => void start(pendingFile)}
              type="button"
            >
              {t.projects.shared.retry}
            </button>
          )}
        </div>
      )}

      <p aria-live="polite" className="visually-hidden">{announcement}</p>

      {history.length > 0 && (
        <div className="document-history">
          <h3 className="panel-subtitle">{t.projects.documents.historyTitle}</h3>
          <ul className="document-list">
            {history.map((document) => (
              <li key={document.id}>
                <DocumentLine
                  deleteState={deleteState}
                  document={document}
                  isCurrent={false}
                  onCancelDelete={cancelDelete}
                  onConfirmDelete={confirmDelete}
                  onDownload={download}
                  onRequestDelete={requestDelete}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function DocumentLine({
  deleteState,
  document,
  isCurrent,
  onCancelDelete,
  onConfirmDelete,
  onDownload,
  onRequestDelete,
}: {
  deleteState: DocumentDeleteState
  document: ProjectDocument
  isCurrent: boolean
  onCancelDelete: () => void
  onConfirmDelete: (document: ProjectDocument) => Promise<void>
  onDownload: (document: ProjectDocument) => void
  onRequestDelete: (documentId: string) => void
}) {
  const { t } = useI18n()
  const isThisDocument = deleteState.documentId === document.id
  const isStaleExtracting = document.parseStatus === 'EXTRACTING' && document.stale
  const parseNote =
    document.parseStatus === 'FAILED'
      ? { variant: 'failed', copy: t.projects.documents.parseStatus.failedCopy }
      : isStaleExtracting
        ? { variant: 'stale', copy: t.projects.documents.parseStatus.staleCopy }
        : null

  return (
    <div className="document-row">
      <div className="document-line">
        <span className="document-meta">
          <span className="mono">v{document.version}</span>
          {isCurrent && <span className="badge badge--current">{t.projects.documents.current}</span>}
          <ParseStatusBadge document={document} />
          {document.parseStatus === 'EXTRACTING' && !document.stale && (
            <ExtractingElapsed since={document.uploadedAt} />
          )}
          <span className="document-name">{document.fileName}</span>
          <span className="document-detail">
            {formatBytes(document.sizeBytes)} · {formatDate(document.uploadedAt)}
            {document.uploadedBy !== null && ` · ${document.uploadedBy.displayName}`}
          </span>
        </span>

        {isThisDocument ? (
          <div className="document-confirm">
            {deleteState.error !== null && (
              <div className="inline-error" role="alert">
                <span aria-hidden="true">!</span>
                <span>{deleteState.error}</span>
              </div>
            )}
            <p className="document-confirm-copy">{t.projects.documents.deleteConfirmCopy}</p>
            <div className="document-confirm-actions">
              <button
                className="button button--secondary button--compact"
                disabled={deleteState.pending}
                onClick={onCancelDelete}
                type="button"
              >
                {t.projects.shared.cancel}
              </button>
              <button
                className="button button--danger button--compact"
                disabled={deleteState.pending}
                onClick={() => void onConfirmDelete(document)}
                type="button"
              >
                {deleteState.pending ? t.projects.shared.deleting : t.projects.documents.deleteConfirm}
              </button>
            </div>
          </div>
        ) : (
          <span className="document-actions">
            <button
              className="button button--secondary button--compact"
              onClick={() => onDownload(document)}
              type="button"
            >
              {t.projects.documents.download}
            </button>
            <button
              className="button button--danger-quiet button--compact"
              onClick={() => onRequestDelete(document.id)}
              type="button"
            >
              {t.projects.documents.delete}
            </button>
          </span>
        )}
      </div>

      {/* FAILED 이거나 EXTRACTING+stale 인 문서만. 위 버튼이 그대로 지우고
          다시 올리는 길이라, 새 UI 를 만들지 않고 그 자리를 가리키기만 한다. */}
      {parseNote !== null && !isThisDocument && (
        <p className={`document-parse-note document-parse-note--${parseNote.variant}`} role="status">
          {parseNote.copy}
        </p>
      )}
    </div>
  )
}

/** 네 상태가 서로 구별돼 보이게 하는 자리. `stale` 은 EXTRACTING 을 덮어써 별도로 읽는다. */
function ParseStatusBadge({ document }: { document: ProjectDocument }) {
  const { t } = useI18n()
  const copy = t.projects.documents.parseStatus

  if (document.parseStatus === 'EXTRACTING' && document.stale) {
    return <span className="badge badge--offline">{copy.stale}</span>
  }
  if (document.parseStatus === 'EXTRACTING') {
    return <span className="badge badge--warning">{copy.extracting}</span>
  }
  if (document.parseStatus === 'EXTRACTED') {
    return <span className="badge badge--success">{copy.extracted}</span>
  }
  if (document.parseStatus === 'FAILED') {
    return <span className="badge badge--critical">{copy.failed}</span>
  }
  return <span className="badge">{copy.pending}</span>
}

/**
 * 진행률 막대는 없다 — 추출은 LLM 한 번이라 나눌 단위가 없다. `since` 는
 * 문서의 `uploadedAt` 이다: 서버는 문서가 등록되자마자 추출을 fire-and-forget
 * 으로 시작하므로, 이 화면이 가진 것 중 시작 시점에 가장 가까운 값이 업로드
 * 시각이다.
 */
function ExtractingElapsed({ since }: { since: string }) {
  const { t } = useI18n()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  const startedAt = new Date(since).getTime()
  if (Number.isNaN(startedAt)) return null

  const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  return (
    <span className="mono document-parse-elapsed">
      {t.projects.documents.parseStatus.elapsedLabel(formatElapsedSeconds(elapsedSeconds))}
    </span>
  )
}

function DocumentStreamIndicator({ streamState }: { streamState: DocumentStreamState }) {
  const { t } = useI18n()
  const copy = t.projects.documents.stream

  const label =
    streamState === 'live'
      ? copy.live
      : streamState === 'offline'
        ? copy.offline
        : streamState === 'degraded'
          ? copy.degraded
          : copy.connecting

  const dotModifier = streamState === 'live' ? ' status-dot--connected' : streamState === 'offline' ? '' : ' status-dot--warning'

  return (
    <span className="document-stream-status">
      <span aria-hidden="true" className={`status-dot${dotModifier}`} />
      {label}
    </span>
  )
}
