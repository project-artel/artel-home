import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CliCopyLine, CliInstallSteps, CLI_README_URL } from '../../auth/CliInstallSteps'
import { useI18n } from '../../i18n/useI18n'

/**
 * How to drive this project from a terminal or CI. The install and sign-in
 * block is shared with the account page's CLI token panel; the commands below
 * it carry this project's real id.
 */
export function CliRunPanel({ projectId }: { projectId: string }) {
  const { t } = useI18n()
  const copy = t.projects.workspace.cliRun
  const install = t.account.cliTokens.install
  const [announcement, setAnnouncement] = useState('')

  return (
    <section className="panel cli-run-panel" aria-labelledby="cli-run-title">
      <header className="panel-header">
        <h2 id="cli-run-title">{copy.title}</h2>
      </header>
      <p className="section-intro">{copy.intro}</p>

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
        <h3 className="guide-copy cli-install-title">{copy.commandsTitle}</h3>
        <p className="guide-copy">{copy.commandsIntro}</p>
        <CliCopyLine
          copiedMessage={copy.startCopied}
          copyLabel={copy.copyStart}
          onResult={setAnnouncement}
          text={`artel game start --build ./Build/Game.exe --project ${projectId}`}
        />
        <CliCopyLine
          copiedMessage={copy.listCopied}
          copyLabel={copy.copyList}
          onResult={setAnnouncement}
          text={`artel game list --project ${projectId}`}
        />
        <CliCopyLine
          copiedMessage={copy.qaRunCopied}
          copyLabel={copy.copyQaRun}
          onResult={setAnnouncement}
          text="artel qa run --test-run <test run id> --instance <instance id>"
        />
        <p className="guide-copy">
          <a href={CLI_README_URL} rel="noreferrer" target="_blank">{install.readme}</a>
        </p>
      </div>

      <p aria-live="polite" className="visually-hidden">{announcement}</p>
    </section>
  )
}
