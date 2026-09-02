import { DocumentPanel } from '../DocumentPanel'
import { useWorkspace } from './workspaceContext'

/** The planning documents, on their own. */
export function DocumentsSection() {
  const { applyNewDocument, applyRemovedDocument, documents, projectId } = useWorkspace()

  return (
    <div className="section-single">
      <DocumentPanel
        documents={documents}
        onDeleted={applyRemovedDocument}
        onUploaded={applyNewDocument}
        projectId={projectId}
      />
    </div>
  )
}
