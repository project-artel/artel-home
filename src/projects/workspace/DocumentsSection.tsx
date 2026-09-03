import { DocumentPanel } from '../DocumentPanel'
import { useDocumentEvents } from '../useDocumentEvents'
import { useWorkspace } from './workspaceContext'

/**
 * 기획 문서만 따로 보여 준다.
 *
 * 이 섹션이 mount 되어 있는 동안만 `/documents/events` (ARTEL-760) 를 구독한다
 * — 왼쪽 rail 의 다른 섹션으로 옮기면 연결이 닫힌다. ARTEL-761 이 요구하는
 * 대로 이 화면이 stream 의 수명을 갖는다.
 */
export function DocumentsSection() {
  const { applyDocumentStatus, applyNewDocument, applyRemovedDocument, documents, projectId } =
    useWorkspace()
  const streamState = useDocumentEvents(projectId, applyDocumentStatus)

  return (
    <div className="section-single">
      <DocumentPanel
        documents={documents}
        onDeleted={applyRemovedDocument}
        onUploaded={applyNewDocument}
        projectId={projectId}
        streamState={streamState}
      />
    </div>
  )
}
