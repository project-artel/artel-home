import { useId, type ReactNode } from 'react'
import { CopyButton } from '../projects/CopyButton'
import { useI18n } from '../i18n/useI18n'

export const CLI_INSTALL_COMMAND = 'npm install -g @project-artel/cli@alpha'
export const CLI_LOGIN_COMMAND = 'artel auth login'
export const CLI_AGENT_GUIDE_URL = 'https://artel.kr/cli.md'
export const CLI_README_URL = 'https://github.com/project-artel/artel-cli#readme'

/**
 * One command with the button that copies it. Wraps on narrow widths because
 * `.copy-value` breaks anywhere.
 */
export function CliCopyLine({
  copiedMessage,
  copyLabel,
  onResult,
  text,
}: {
  copiedMessage: string
  copyLabel: string
  onResult: (message: string) => void
  text: string
}) {
  return (
    <div className="copy-line">
      <code className="mono copy-value">{text}</code>
      <CopyButton
        copiedMessage={copiedMessage}
        label={copyLabel}
        onResult={onResult}
        text={text}
      />
    </div>
  )
}

/**
 * The install command, the AI agent prompt, and the sign-in command. The
 * install command is a constant: the `@alpha` tag is required, so it is not
 * fetched from the server.
 *
 * Copy results go to `onResult`; the host panel owns the one `aria-live`
 * region. `children` render at the end of the group for sentences that only
 * make sense in that panel.
 */
export function CliInstallSteps({
  children,
  onResult,
}: {
  children?: ReactNode
  onResult: (message: string) => void
}) {
  const { t } = useI18n()
  const copy = t.account.cliTokens.install
  const titleId = useId()
  const agentPrompt = copy.agentPrompt(CLI_AGENT_GUIDE_URL)

  return (
    <div aria-labelledby={titleId} className="cli-install-guide" role="group">
      <h3 className="guide-copy cli-install-title" id={titleId}>{copy.title}</h3>
      <p className="guide-copy">{copy.requirement}</p>
      <CliCopyLine
        copiedMessage={copy.installCopied}
        copyLabel={copy.copyInstall}
        onResult={onResult}
        text={CLI_INSTALL_COMMAND}
      />
      <p className="guide-copy">{copy.agentIntro}</p>
      <CliCopyLine
        copiedMessage={copy.agentPromptCopied}
        copyLabel={copy.copyAgentPrompt}
        onResult={onResult}
        text={agentPrompt}
      />
      <p className="guide-copy">{copy.signIn}</p>
      <CliCopyLine
        copiedMessage={copy.loginCopied}
        copyLabel={copy.copyLogin}
        onResult={onResult}
        text={CLI_LOGIN_COMMAND}
      />
      {children}
    </div>
  )
}
