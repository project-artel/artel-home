import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CliCopyLine, CliInstallSteps, CLI_README_URL } from '../auth/CliInstallSteps'
import { InfoHint } from '../design-system/primitives/InfoHint'
import { useI18n } from '../i18n/useI18n'
import { AgentSkillsInstall } from './AgentSkillsInstall'
import { SdkInstallGuide } from './SdkInstallGuide'

/** Stands in for the id on the global page, in the same form as the other placeholders. */
const PROJECT_ID_PLACEHOLDER = '<project id>'
const PROJECT_LIST_COMMAND = 'artel project list'

/**
 * Everything needed to connect a game and drive it from a terminal: the Unity
 * SDK steps beside the CLI steps.
 *
 * The same content renders at `/setup` and as a project section. With a
 * `projectId` the commands carry that project's real id; without one they carry
 * a placeholder and the command that lists the ids.
 */
export function SetupGuide({ projectId }: { projectId?: string }) {
  const { t } = useI18n()
  const copy = t.projects.setup

  return (
    <>
      <div className="section-columns">
        <section className="panel" aria-labelledby="setup-sdk-title">
          <header className="panel-header">
            <h2 id="setup-sdk-title">
              {copy.sdkTitle}
              <InfoHint>{copy.sdkIntro}</InfoHint>
            </h2>
          </header>
          <SdkInstallGuide />
        </section>

        <CliSetupPanel projectId={projectId} />
      </div>
      <AgentSkillsInstall />
    </>
  )
}

/**
 * The install and sign-in block shared with the account page, then the
 * commands that use them. The panel owns the one `aria-live` region every copy
 * button in it reports to.
 */
function CliSetupPanel({ projectId }: { projectId?: string }) {
  const { t } = useI18n()
  const copy = t.projects.setup
  const [announcement, setAnnouncement] = useState('')
  const id = projectId ?? PROJECT_ID_PLACEHOLDER

  return (
    <section className="panel" aria-labelledby="setup-cli-title">
      <header className="panel-header">
        <h2 id="setup-cli-title">
          {copy.cliTitle}
          <InfoHint>{copy.cliIntro}</InfoHint>
        </h2>
      </header>

      <CliInstallSteps onResult={setAnnouncement}>
        <p className="guide-copy">
          {copy.ciBefore}
          <Link to="/account">{copy.ciLink}</Link>
          {copy.ciAfter}
          <code className="mono">ARTEL_TOKEN</code>
          {copy.ciEnd}
        </p>
      </CliInstallSteps>

      <div className="cli-install-guide">
        <h3 className="guide-copy cli-install-title">
          {projectId === undefined ? copy.commandsTitle : copy.projectCommandsTitle}
        </h3>
        {projectId === undefined && (
          <>
            <p className="guide-copy">
              {copy.projectIdBefore}
              <code className="mono">{PROJECT_ID_PLACEHOLDER}</code>
              {copy.projectIdAfter}
            </p>
            <CliCopyLine
              copiedMessage={copy.projectListCopied}
              copyLabel={copy.copyProjectList}
              onResult={setAnnouncement}
              text={PROJECT_LIST_COMMAND}
            />
          </>
        )}
        <CliCopyLine
          copiedMessage={copy.startCopied}
          copyLabel={copy.copyStart}
          onResult={setAnnouncement}
          text={`artel game start --build ./Build/Game.exe --project ${id}`}
        />
        <CliCopyLine
          copiedMessage={copy.listCopied}
          copyLabel={copy.copyList}
          onResult={setAnnouncement}
          text={`artel game list --project ${id}`}
        />
        <CliCopyLine
          copiedMessage={copy.qaRunCopied}
          copyLabel={copy.copyQaRun}
          onResult={setAnnouncement}
          text="artel qa run --test-run <test run id> --instance <instance id>"
        />
        <p className="guide-copy">{copy.commandsNote}</p>
        <p className="guide-copy">
          <a href={CLI_README_URL} rel="noreferrer" target="_blank">
            {t.account.cliTokens.install.readme}
          </a>
        </p>
      </div>

      <p aria-live="polite" className="visually-hidden">{announcement}</p>
    </section>
  )
}
