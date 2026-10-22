import { useSearchParams } from 'react-router-dom'
import { useActionBinding } from '../../projectAgent/bindings'
import { SETUP_SHOW_CLI_COMMANDS_ACTION, SETUP_SHOW_SDK_PACKAGE_ACTION } from '../../projectAgent/specs/setup'
import { SDK_PACKAGE_URL, projectCliCommands } from '../setupCommands'
import { SetupGuide } from '../SetupGuide'
import type { SetupGuideId } from '../setupGuides'
import { useWorkspace } from './workspaceContext'

/** The setup guide with this project's id filled into every command. */
export function SetupSection() {
  const { projectId } = useWorkspace()
  const [searchParams, setSearchParams] = useSearchParams()

  // 안내는 한 쪽씩 열린다(ARTEL-1208). agent 가 보여 줄 안내를 먼저 열고, 강조는 그 쪽 제목에 한다.
  function open(guide: SetupGuideId) {
    const next = new URLSearchParams(searchParams)
    next.set('guide', guide)
    setSearchParams(next, { replace: true })
  }

  useActionBinding(SETUP_SHOW_SDK_PACKAGE_ACTION, {
    target: () => document.getElementById('setup-sdk-title'),
    blocked: () => null,
    run: async () => {
      open('sdk')
      return { packageUrl: SDK_PACKAGE_URL }
    },
  })
  useActionBinding(SETUP_SHOW_CLI_COMMANDS_ACTION, {
    target: () => document.getElementById('setup-cli-title'),
    blocked: () => null,
    run: async () => {
      open('cli')
      return { projectId, ...projectCliCommands(projectId) }
    },
  })

  return <SetupGuide projectId={projectId} />
}
