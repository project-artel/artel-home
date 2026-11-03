import { useContext } from 'react'
import { buildDisplayName } from './buildEnvironment'
import { WorkspaceContext } from './workspace/workspaceContext'

export function useBuildDisplayName() {
  const workspace = useContext(WorkspaceContext)
  return (gameBuildId: string | null | undefined, version: string, label?: string | null) => {
    const build = workspace?.builds.find((candidate) => candidate.id === gameBuildId)
    return buildDisplayName({ version, label, isEditor: build?.isEditor })
  }
}
