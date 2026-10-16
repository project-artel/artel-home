import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
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
import { DocumentStepGlyph, KnowledgeTagGlyph, type DocumentStep } from './documentIcons'
import { toneOf } from './documentKnowledge'
import { formatBytes, formatDate, formatDateTime, formatElapsedSeconds } from './formatters'
import { useI18n } from '../i18n/useI18n'
import { tagLabel } from '../knowledge/knowledgeLabels'
import type { KnowledgeNode } from '../knowledge/knowledgeTypes'
import { DOCUMENT_ACCEPT, describeFileProblem, uploadDocument } from './uploadDocument'
import type { DocumentStreamState } from './useDocumentEvents'
import { useDocumentKnowledge, type DocumentKnowledgeState } from './useDocumentKnowledge'
import type { ProjectDocument } from './projectTypes'
import { sectionHref } from './workspace/sections'

type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading'; ratio: number | null }
  | { phase: 'failed'; message: string }

/** 카드로 펼쳐 보이는 knowledge 의 최대 수. 나머지는 지식 그래프에서 본다. */
const KNOWLEDGE_CARD_LIMIT = 8

const STEPS: DocumentStep[] = ['store', 'extract', 'knowledge', 'qa']

/**
 * 기획 문서 화면(ARTEL-1098). 왼쪽은 **지금의 기획서**(현재 버전 · 새 버전 업로드 · 거기서 나온
 * knowledge), 오른쪽은 **지난 판과 처리 방식**이다.
 *
 * 기획서는 프로젝트에 하나다. 다시 올리면 교체가 아니라 새 버전으로 쌓이고, 가장 큰 버전이 현재다
 * (`ProjectDocumentEntity`). 그래서 목록이 아니라 "현재 + 이력" 으로 그린다.
 *
 * 추출이 끝나면 그 결과를 이 화면에서 바로 보인다. 올린 사람이 묻는 것은 "제대로 들어갔나, 무엇이
 * 뽑혔나" 이고, 그 답을 지식 그래프로 가서 찾게 하면 이 화면은 업로드 버튼에 그친다.
 */
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
  const [announcement, setAnnouncement] = useState('')
  const [deleteState, setDeleteState] = useState<DocumentDeleteState>(idleDocumentDelete)
  const { t } = useI18n()
  const w = t.projects.documents.workbench
  // effect 가 아니라 "prop 이 바뀌면 state 를 맞춘다" (React 문서의 패턴)
  // 쪽이다: 여기서는 렌더 중 `useRef` 읽기/쓰기가 금지돼 있고, `useEffect`
  // 본문에서 바로 setState 를 부르면 렌더가 한 번 더 캐스케이드된다. 직전
  // `documents` *참조* 와 비교하는 것이 이 블록을 한 번만 돌게 만든다 —
  // `useProject.ts` 의 `applyDocumentStatus` 는 문서가 실제로 바뀔 때만 이
  // 배열을 새로 만들므로, 진짜 변화가 있을 때만 이 본문이 돌고 아래
  // `setPreviousDocuments` 가 그것을 마무리한다.
  const [previousDocuments, setPreviousDocuments] = useState(documents)

  const [current, ...history] = documents
  const knowledge = useDocumentKnowledge(projectId, current)

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
  const actions: DocumentActions = {
    deleteState,
    onDownload: (document) => void download(document),
    onRequestDelete: (documentId) => setDeleteState(requestDocumentDelete(documentId)),
    onCancelDelete: () => setDeleteState(cancelDocumentDelete()),
    onConfirmDelete: (document) => void confirmDelete(document),
  }

  return (
    <div className="dw">
      <div className="dw-bar">
        <span className="dw-bar-sub">{w.subtitle}</span>
        <span className="dw-spacer" />
        <DocumentStreamIndicator streamState={streamState} />
        {current !== undefined && (
          <label className={`button button--primary button--compact${uploading ? ' is-disabled' : ''}`} htmlFor="document-file">
            {w.uploadNewButton}
          </label>
        )}
      </div>

      <div className="dw-body">
        <div className="dw-main">
          {current === undefined ? (
            <>
              <DropZone disabled={uploading} hint={w.dropHint} large onFile={(file) => void start(file)} title={w.dropTitle} />
              <ol aria-label={w.stepsLabel} className="dw-steps">
                {STEPS.map((step, index) => (
                  <li className="dw-step" key={step}>
                    <span className="dw-step-head">
                      <span className={`dw-tile dw-tile--lg dw-step-tile--${step}`}>
                        <DocumentStepGlyph step={step} />
                      </span>
                      <span className="mono dw-step-num">{String(index + 1).padStart(2, '0')}</span>
                    </span>
                    <b>{w.steps[step].title}</b>
                    <span className="dw-step-body">{w.steps[step].body}</span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <>
              <CurrentDocument actions={actions} document={current} />
              <DropZone
                disabled={uploading}
                hint={w.dropNewHint(current.version + 1)}
                onFile={(file) => void start(file)}
                title={w.dropNewTitle}
              />
            </>
          )}

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

          <KnowledgePreview current={current} knowledge={knowledge} projectId={projectId} />
        </div>

        <aside className="dw-side">
          <section className="dw-side-section">
            <h2 className="dw-h2">{t.projects.documents.historyTitle}</h2>
            {history.length === 0 ? (
              <p className="dw-muted">{w.historyEmpty}</p>
            ) : (
              <ol className="dw-history">
                {history.map((document) => (
                  <li key={document.id}>
                    <HistoryLine actions={actions} document={document} />
                  </li>
                ))}
              </ol>
            )}
          </section>
          <DocumentDataNotice />
        </aside>
      </div>

      <p aria-live="polite" className="visually-hidden">{announcement}</p>
    </div>
  )
}

type DocumentActions = {
  deleteState: DocumentDeleteState
  onDownload: (document: ProjectDocument) => void
  onRequestDelete: (documentId: string) => void
  onCancelDelete: () => void
  onConfirmDelete: (document: ProjectDocument) => void
}

/**
 * 끌어다 놓기 자리. 파일 입력은 화면에 하나뿐이어서(`#document-file`) 위 막대의 "새 버전 업로드"
 * 라벨도 이 입력을 연다.
 */
function DropZone({
  title,
  hint,
  large = false,
  disabled,
  onFile,
}: {
  title: string
  hint: string
  large?: boolean
  disabled: boolean
  onFile: (file: File) => void
}) {
  const { t } = useI18n()
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const iconSize = large ? 44 : 22

  return (
    <div
      className={`dw-drop${large ? ' dw-drop--large' : ''}${dragging ? ' is-dragging' : ''}`}
      onDragLeave={() => setDragging(false)}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        const file = event.dataTransfer.files.item(0)
        if (file !== null) onFile(file)
      }}
    >
      <input
        accept={DOCUMENT_ACCEPT}
        className="visually-hidden"
        disabled={disabled}
        id="document-file"
        onChange={(event) => {
          const file = event.target.files?.item(0)
          if (file != null) onFile(file)
          // Allow re-picking the same file after a failure.
          event.target.value = ''
        }}
        ref={fileInput}
        type="file"
      />
      <span aria-hidden="true" className="dw-drop-icon">
        <svg fill="none" height={iconSize} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width={iconSize}>
          <path d="M14 3v4a1 1 0 0 0 1 1h4 M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z M12 11v6 M9.5 13.5l2.5 -2.5l2.5 2.5" />
        </svg>
      </span>
      <span className="dw-drop-text">
        <b>{title}</b>
        <span>{hint}</span>
      </span>
      <label className={`button ${large ? 'button--primary' : 'button--secondary'} button--compact`} htmlFor="document-file">
        {t.projects.documents.workbench.chooseFile}
      </label>
    </div>
  )
}

function CurrentDocument({ document, actions }: { document: ProjectDocument; actions: DocumentActions }) {
  const { t } = useI18n()
  const w = t.projects.documents.workbench
  const confirming = actions.deleteState.documentId === document.id
  const note = parseNote(document, t)

  return (
    <section aria-label={document.fileName} className="dw-current">
      <div className="dw-current-head">
        <span aria-hidden="true" className="dw-pdf mono">PDF</span>
        <span className="dw-current-name">
          <span className="dw-current-title">
            <span className="dw-ellipsis">{document.fileName}</span>
            <span className="mono dw-version">v{document.version}</span>
            <span className="badge badge--current">{t.projects.documents.current}</span>
          </span>
          {document.sizeBytes > 0 && <span className="dw-muted">{formatBytes(document.sizeBytes)}</span>}
        </span>
        {!confirming && (
          <span className="dw-actions">
            <button className="button button--secondary button--compact" onClick={() => actions.onDownload(document)} type="button">
              {t.projects.documents.download}
            </button>
            <button className="button button--danger-quiet button--compact" onClick={() => actions.onRequestDelete(document.id)} type="button">
              {t.projects.documents.delete}
            </button>
          </span>
        )}
      </div>
      {confirming && <DeleteConfirm actions={actions} document={document} />}
      <dl className="dw-current-facts">
        <div>
          <dt>{w.statusLabel}</dt>
          <dd>
            <ParseStatusBadge document={document} />
            {document.parseStatus === 'EXTRACTING' && !document.stale && <ExtractingElapsed since={document.uploadedAt} />}
            {document.parseStatus === 'EXTRACTED' && <span className="dw-fact-note">{w.extractedNote}</span>}
          </dd>
        </div>
        <div>
          <dt>{w.uploadedAtLabel}</dt>
          <dd>{formatDateTime(document.uploadedAt)}</dd>
        </div>
        <div>
          <dt>{w.uploadedByLabel}</dt>
          <dd>{document.uploadedBy?.displayName ?? w.unknownUploader}</dd>
        </div>
      </dl>
      {note !== null && !confirming && (
        <p className={`document-parse-note document-parse-note--${note.variant}`} role="status">{note.copy}</p>
      )}
    </section>
  )
}

function HistoryLine({ document, actions }: { document: ProjectDocument; actions: DocumentActions }) {
  const { t } = useI18n()
  const confirming = actions.deleteState.documentId === document.id
  const note = parseNote(document, t)
  const meta = [
    formatDate(document.uploadedAt),
    document.sizeBytes > 0 ? formatBytes(document.sizeBytes) : null,
    document.uploadedBy?.displayName ?? null,
  ].filter((part): part is string => part !== null)

  return (
    <div className="dw-history-line">
      <span aria-hidden="true" className={`dw-history-dot${document.parseStatus === 'FAILED' ? ' is-failed' : ''}`} />
      <span className="dw-history-body">
        <span className="dw-history-head">
          <b className="mono">v{document.version}</b>
          <ParseStatusBadge document={document} />
        </span>
        <span className="dw-muted dw-ellipsis">{meta.join(' · ')}</span>
        {note !== null && !confirming && <span className="dw-history-note">{note.copy}</span>}
        {confirming && <DeleteConfirm actions={actions} document={document} />}
      </span>
      {!confirming && (
        <span className="dw-history-actions">
          <button className="dw-text-button" onClick={() => actions.onDownload(document)} type="button">
            {t.projects.documents.download}
          </button>
          <button className="dw-text-button dw-text-button--danger" onClick={() => actions.onRequestDelete(document.id)} type="button">
            {t.projects.documents.delete}
          </button>
        </span>
      )}
    </div>
  )
}

function DeleteConfirm({ document, actions }: { document: ProjectDocument; actions: DocumentActions }) {
  const { t } = useI18n()
  const { deleteState } = actions
  return (
    <div className="document-confirm dw-confirm">
      {deleteState.error !== null && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          <span>{deleteState.error}</span>
        </div>
      )}
      <p className="document-confirm-copy">{t.projects.documents.deleteConfirmCopy}</p>
      <div className="document-confirm-actions">
        <button className="button button--secondary button--compact" disabled={deleteState.pending} onClick={actions.onCancelDelete} type="button">
          {t.projects.shared.cancel}
        </button>
        <button className="button button--danger button--compact" disabled={deleteState.pending} onClick={() => actions.onConfirmDelete(document)} type="button">
          {deleteState.pending ? t.projects.shared.deleting : t.projects.documents.deleteConfirm}
        </button>
      </div>
    </div>
  )
}

/** FAILED 이거나 EXTRACTING+stale 인 문서만. 지우고 다시 올리는 길은 이미 있는 삭제 버튼이다. */
function parseNote(document: ProjectDocument, t: ReturnType<typeof useI18n>['t']) {
  if (document.parseStatus === 'FAILED') return { variant: 'failed', copy: t.projects.documents.parseStatus.failedCopy }
  if (document.parseStatus === 'EXTRACTING' && document.stale) {
    return { variant: 'stale', copy: t.projects.documents.parseStatus.staleCopy }
  }
  return null
}

/**
 * 이 버전에서 나온 knowledge. 문서가 없으면 무엇이 생기는지 예시로, 추출 중이면 빈 카드로, 끝났으면
 * 실제 항목으로 같은 자리를 채운다 — 상태가 바뀌어도 화면 모양이 흔들리지 않게.
 */
function KnowledgePreview({
  projectId,
  current,
  knowledge,
}: {
  projectId: string
  current: ProjectDocument | undefined
  knowledge: DocumentKnowledgeState
}) {
  const { t } = useI18n()
  const w = t.projects.documents.workbench
  const graphLink = <Link to={sectionHref(projectId, 'knowledge')}>{w.viewInGraph}</Link>

  if (current === undefined) {
    return (
      <KnowledgeSection note={w.exampleNote} quiet title={w.exampleTitle}>
        <KnowledgeCards
          items={w.examples.map((example, index) => ({ id: String(index), tag: example.tag, summary: example.summary, anchors: [] }))}
        />
      </KnowledgeSection>
    )
  }

  const waiting = current.parseStatus === 'PENDING' || (current.parseStatus === 'EXTRACTING' && !current.stale)
  if (waiting) {
    return (
      <KnowledgeSection link={graphLink} note={w.knowledgeWaiting(current.version)} title={w.knowledgeTitle}>
        <div aria-hidden="true" className="dw-cards">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="dw-card" key={index}>
              <span className="dw-skel dw-tile" />
              <span className="dw-card-text">
                <span className="dw-skel" style={{ width: 40 }} />
                <span className="dw-skel" style={{ width: '92%' }} />
                <span className="dw-skel" style={{ width: '64%' }} />
              </span>
            </div>
          ))}
        </div>
      </KnowledgeSection>
    )
  }

  if (current.parseStatus !== 'EXTRACTED') {
    return (
      <KnowledgeSection title={w.knowledgeTitle}>
        <p className="dw-muted">{w.knowledgeFailed}</p>
      </KnowledgeSection>
    )
  }
  if (knowledge.status === 'error') {
    return (
      <KnowledgeSection link={graphLink} title={w.knowledgeTitle}>
        <p className="dw-muted">{w.knowledgeLoadFailed}</p>
      </KnowledgeSection>
    )
  }
  if (knowledge.status !== 'ready') {
    return <KnowledgeSection link={graphLink} title={w.knowledgeTitle}>{null}</KnowledgeSection>
  }

  const { items, truncated } = knowledge
  const counts = new Map<string, number>()
  for (const item of items) counts.set(item.tag, (counts.get(item.tag) ?? 0) + 1)
  const shown = items.slice(0, KNOWLEDGE_CARD_LIMIT)

  return (
    <KnowledgeSection link={graphLink} note={w.knowledgeCount(current.version, items.length)} title={w.knowledgeTitle}>
      {items.length === 0 ? (
        <p className="dw-muted">{truncated ? w.knowledgeTruncated : w.knowledgeNone}</p>
      ) : (
        <>
          <div className="dw-chips">
            {[...counts.entries()].map(([tag, count]) => (
              <span className={`dw-chip dw-tone--${toneOf(tag)}`} key={tag}>
                <KnowledgeTagGlyph size={14} tag={tag} />
                <span className="dw-chip-label">{tagLabel(t, tag)}</span>
                <b className="mono">{count}</b>
              </span>
            ))}
          </div>
          <KnowledgeCards items={shown} />
          {items.length > shown.length && (
            <Link className="dw-more" to={sectionHref(projectId, 'knowledge')}>{w.knowledgeMore(items.length - shown.length)}</Link>
          )}
          {truncated && <p className="dw-muted">{w.knowledgeTruncated}</p>}
        </>
      )}
    </KnowledgeSection>
  )
}

function KnowledgeSection({
  title,
  note,
  link,
  quiet = false,
  children,
}: {
  title: string
  note?: string
  link?: ReactNode
  quiet?: boolean
  children: ReactNode
}) {
  return (
    <section aria-label={title} className={`dw-knowledge${quiet ? ' is-quiet' : ''}`}>
      <div className="dw-knowledge-head">
        <h2 className="dw-h2">{title}</h2>
        {note !== undefined && <span className="dw-muted">{note}</span>}
        <span className="dw-spacer" />
        {link}
      </div>
      {children}
    </section>
  )
}

function KnowledgeCards({ items }: { items: Pick<KnowledgeNode, 'id' | 'tag' | 'summary' | 'anchors'>[] }) {
  const { t } = useI18n()
  return (
    <ul className="dw-cards">
      {items.map((item) => (
        <li className="dw-card" key={item.id}>
          <span className={`dw-tile dw-tone--${toneOf(item.tag)}`}>
            <KnowledgeTagGlyph tag={item.tag} />
          </span>
          <span className="dw-card-text">
            <span className={`dw-card-tag dw-tone-text--${toneOf(item.tag)}`}>{tagLabel(t, item.tag)}</span>
            <span className="dw-card-summary">{item.summary}</span>
            {item.anchors.length > 0 && (
              <span className="dw-card-anchors">
                {item.anchors.map((anchor) => (
                  <span className="mono" key={`${anchor.sceneName}#${anchor.screenId ?? ''}`}>{anchor.sceneName}</span>
                ))}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
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

/**
 * 문서가 어디로 가는지. 예전에는 "자세히 보기" 를 펼쳐야 보였는데, 이 화면은 오른쪽 열이 비어 있어
 * 처음부터 펼쳐 둔다 — 올리기 전에 읽어야 하는 글이다.
 */
function DocumentDataNotice() {
  const { t } = useI18n()
  const notice = t.projects.documents.dataNotice

  return (
    <section className="dw-side-section dw-notice">
      <h2 className="dw-h2">{t.projects.documents.workbench.noticeTitle}</h2>
      <p className="dw-muted">{notice.summary}</p>
      <ul>
        <li>{notice.storage}</li>
        <li>{notice.extraction}</li>
        <li>{notice.qaRuns}</li>
        <li>{notice.deletion}</li>
        <li>{notice.providerRetention}</li>
      </ul>
    </section>
  )
}
