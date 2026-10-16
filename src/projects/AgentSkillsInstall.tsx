import { useState } from 'react'
import { CliCopyLine } from '../auth/CliInstallSteps'
import { useI18n } from '../i18n/useI18n'

/** Installs the ARTEL agent skills into the current project; `-g` makes them global. */
export const SKILLS_INSTALL_COMMAND = 'npx skills add project-artel/artel-skills'
export const SKILLS_REPOSITORY_URL = 'https://github.com/project-artel/artel-skills'

/**
 * What the ARTEL agent skills are, the command that installs them, and a link
 * to their repository. It is separate from the CLI steps on purpose: the skills
 * cover the SDK, the CLI, the MCP server, and cheats, so they belong to none of
 * those sections. It owns its `aria-live` region for the copy result.
 */
export function AgentSkillsInstall() {
  const { t } = useI18n()
  const copy = t.projects.setup
  const [announcement, setAnnouncement] = useState('')

  return (
    <section aria-labelledby="setup-skills-title" className="panel setup-skills">
      <header className="panel-header">
        <h2 id="setup-skills-title">{copy.skillsTitle}</h2>
      </header>
      <div className="cli-install-guide">
        <p className="guide-copy">{copy.skillsIntro}</p>
        <CliCopyLine
          copiedMessage={copy.skillsCopied}
          copyLabel={copy.copySkills}
          onResult={setAnnouncement}
          text={SKILLS_INSTALL_COMMAND}
        />
        <p className="guide-copy">{copy.skillsInstallNote}</p>
        <p className="guide-copy">
          <a href={SKILLS_REPOSITORY_URL} rel="noreferrer" target="_blank">{copy.skillsRepo}</a>
        </p>
      </div>
      <p aria-live="polite" className="visually-hidden">{announcement}</p>
    </section>
  )
}
