import { useActionBinding } from '../../projectAgent/bindings'
import { SETUP_SHOW_CLI_COMMANDS_ACTION, SETUP_SHOW_SDK_PACKAGE_ACTION } from '../../projectAgent/specs/setup'
import { SDK_PACKAGE_URL, projectCliCommands } from '../setupCommands'
import { SetupGuide } from '../SetupGuide'
import { useWorkspace } from './workspaceContext'

/** The setup guide with this project's id filled into every command. */
export function SetupSection() {
  const { projectId } = useWorkspace()

  // 안내 화면에는 누르는 버튼이 없어서, 강조는 각 panel 의 제목에 한다.
  useActionBinding(SETUP_SHOW_SDK_PACKAGE_ACTION, {
    target: () => document.getElementById('setup-sdk-title'),
    blocked: () => null,
    run: async () => ({ packageUrl: SDK_PACKAGE_URL }),
  })
  useActionBinding(SETUP_SHOW_CLI_COMMANDS_ACTION, {
    target: () => document.getElementById('setup-cli-title'),
    blocked: () => null,
    run: async () => ({ projectId, ...projectCliCommands(projectId) }),
  })

  return <SetupGuide projectId={projectId} />
}
