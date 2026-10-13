import { SetupGuide } from '../SetupGuide'
import { useWorkspace } from './workspaceContext'

/** The setup guide with this project's id filled into every command. */
export function SetupSection() {
  const { projectId } = useWorkspace()
  return <SetupGuide projectId={projectId} />
}
