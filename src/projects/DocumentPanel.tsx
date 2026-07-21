import { useRef, useState } from 'react'
import { createDownloadTicket, ProjectApiError } from './projectApi'
import { formatBytes, formatDate } from './formatters'
import { DOCUMENT_ACCEPT, describeFileProblem, uploadDocument } from './uploadDocument'
import type { ProjectDocument } from './projectTypes'

type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading'; ratio: number | null }
  | { phase: 'failed'; message: string }

export function DocumentPanel({
  projectId,
  documents,
  onUploaded,
}: {
  projectId: string
  documents: ProjectDocument[]
  onUploaded: (document: ProjectDocument) => void
}) {
  const [upload, setUpload] = useState<UploadState>({ phase: 'idle' })
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const [current, ...history] = documents

  async function start(file: File) {
    const problem = describeFileProblem(file)
    if (problem !== null) {
      setPendingFile(null)
      setUpload({ phase: 'failed', message: problem })
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
      setAnnouncement(`Version ${document.version} uploaded.`)
      onUploaded(document)
    } catch (error: unknown) {
      const message =
        error instanceof ProjectApiError
          ? error.message
          : 'The upload did not finish. Please try again.'
      setUpload({ phase: 'failed', message })
    }
  }

  async function download(document: ProjectDocument) {
    try {
      const ticket = await createDownloadTicket(projectId, document.id)
      window.open(ticket.downloadUrl, '_blank', 'noopener,noreferrer')
    } catch {
      setUpload({ phase: 'failed', message: 'The download link could not be created.' })
    }
  }

  const uploading = upload.phase === 'uploading'

  return (
    <section className="panel" aria-labelledby="documents-title">
      <header className="panel-header">
        <h2 id="documents-title">Planning document</h2>
      </header>

      {current === undefined ? (
        <p className="panel-empty">No planning document has been uploaded yet.</p>
      ) : (
        <div className="document-current">
          <DocumentLine document={current} onDownload={download} isCurrent />
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
          {current === undefined ? 'Upload a document' : 'Upload a new version'}
        </label>
        <p className="upload-hint">PDF, up to 50 MB. Drag a file here or choose one.</p>
      </div>

      {uploading && (
        <div className="upload-progress">
          <div
            aria-label="Upload progress"
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
            {upload.ratio === null ? 'Uploading…' : `Uploading… ${Math.round(upload.ratio * 100)}%`}
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
              Retry
            </button>
          )}
        </div>
      )}

      <p aria-live="polite" className="visually-hidden">{announcement}</p>

      {history.length > 0 && (
        <div className="document-history">
          <h3 className="panel-subtitle">Earlier versions</h3>
          <ul className="document-list">
            {history.map((document) => (
              <li key={document.id}>
                <DocumentLine document={document} onDownload={download} isCurrent={false} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function DocumentLine({
  document,
  onDownload,
  isCurrent,
}: {
  document: ProjectDocument
  onDownload: (document: ProjectDocument) => void
  isCurrent: boolean
}) {
  return (
    <div className="document-line">
      <span className="document-meta">
        <span className="mono">v{document.version}</span>
        {isCurrent && <span className="badge badge--current">Current</span>}
        <span className="document-name">{document.fileName}</span>
        <span className="document-detail">
          {formatBytes(document.sizeBytes)} · {formatDate(document.uploadedAt)}
          {document.uploadedBy !== null && ` · ${document.uploadedBy.displayName}`}
        </span>
      </span>
      <button
        className="button button--secondary button--compact"
        onClick={() => onDownload(document)}
        type="button"
      >
        Download
      </button>
    </div>
  )
}
