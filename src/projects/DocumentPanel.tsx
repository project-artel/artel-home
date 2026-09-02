import { useRef, useState } from 'react'
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
import { formatBytes, formatDate } from './formatters'
import { useI18n } from '../i18n/useI18n'
import { DOCUMENT_ACCEPT, describeFileProblem, uploadDocument } from './uploadDocument'
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
}: {
  projectId: string
  documents: ProjectDocument[]
  onDeleted: (documentId: string) => void
  onUploaded: (document: ProjectDocument) => void
}) {
  const [upload, setUpload] = useState<UploadState>({ phase: 'idle' })
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [deleteState, setDeleteState] = useState<DocumentDeleteState>(idleDocumentDelete)
  const fileInput = useRef<HTMLInputElement>(null)
  const { t } = useI18n()

  const [current, ...history] = documents

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
      <header className="panel-header">
        <h2 id="documents-title">{t.projects.documents.title}</h2>
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

  return (
    <div className="document-line">
      <span className="document-meta">
        <span className="mono">v{document.version}</span>
        {isCurrent && <span className="badge badge--current">{t.projects.documents.current}</span>}
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
  )
}
