import { DocumentPanel } from '../DocumentPanel'
import { useWorkspace } from './workspaceContext'

/** The planning documents, on their own. */
export function DocumentsSection() {
  const { applyNewDocument, documents, projectId } = useWorkspace()

  return (
    <div className="section-single">
      <DocumentPanel documents={documents} onUploaded={applyNewDocument} projectId={projectId} />
    </div>
  )
}
