import { Fragment, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import addPackageFromGitUrlShot from '../assets/sdk-guide/step1-add-package-from-git-url.png'
import gitUrlInputShot from '../assets/sdk-guide/step1-git-url-input.png'
import signInScreenShot from '../assets/sdk-guide/step2-sdk-sign-in-screen.png'
import browserSignInShot from '../assets/sdk-guide/step3-browser-sign-in.png'
import projectPickerShot from '../assets/sdk-guide/step4-sdk-project-picker.png'
import instanceConnectedShot from '../assets/sdk-guide/step4-instance-connected.png'
import {
  CLI_AGENT_GUIDE_URL,
  CLI_INSTALL_COMMAND,
  CLI_LOGIN_COMMAND,
  CLI_README_URL,
  CliCopyLine,
} from '../auth/CliInstallSteps'
import { useI18n } from '../i18n/useI18n'
import '../layouts/screens.css'
import {
  PROJECT_ID_PLACEHOLDER,
  PROJECT_LIST_COMMAND,
  QA_RUN_COMMAND,
  SDK_PACKAGE_URL,
  gameListCommand,
  gameStartCommand,
} from './setupCommands'
import { SETUP_GUIDES, setupGuideFrom, SKILLS_INSTALL_COMMAND, SKILLS_REPOSITORY_URL } from './setupGuides'

/**
 * Everything needed to connect a game and drive it from a terminal.
 *
 * 왼쪽에서 고른 안내 하나만 연다(ARTEL-1208): Unity SDK · CLI · Agent skills. 나눈 만큼 자리가 넓어서 단계마다
 * 설명을 자세히 쓰고 그림을 크게 둔다. 설명은 agent 안내 문서(`sdk-connect` · `cli-install` · `cli-run-qa` ·
 * `skills-install`)와 같은 내용이다. 고른 안내는 `?guide=` 라 주소로 바로 열 수 있다.
 *
 * The same content renders at `/setup` and as a project section. With a
 * `projectId` the commands carry that project's real id; without one they carry
 * a placeholder and the command that lists the ids.
 */
export function SetupGuide({ projectId }: { projectId?: string }) {
  const { t } = useI18n()
  const copy = t.projects.setupPages
  const [searchParams, setSearchParams] = useSearchParams()
  const guide = setupGuideFrom(searchParams.get('guide'))
  const [announcement, setAnnouncement] = useState('')

  return (
    <div className="setup-guide">
      <nav aria-label={copy.navLabel} className="setup-guide-nav">
        {SETUP_GUIDES.map((one, index) => (
          <button
            aria-current={guide === one ? 'page' : undefined}
            className="setup-guide-link"
            key={one}
            onClick={() => {
              const next = new URLSearchParams(searchParams)
              next.set('guide', one)
              setSearchParams(next, { replace: true })
            }}
            type="button"
          >
            <span aria-hidden="true" className="setup-guide-index">
              {index + 1}
            </span>
            <span className="setup-guide-name">{copy.nav[one].title}</span>
            <span className="setup-guide-sub">{copy.nav[one].sub}</span>
          </button>
        ))}
      </nav>

      <div className="setup-guide-page">
        {guide === 'sdk' && <SdkGuide onResult={setAnnouncement} projectId={projectId} />}
        {guide === 'cli' && <CliGuide onResult={setAnnouncement} projectId={projectId} />}
        {guide === 'skills' && <SkillsGuide onResult={setAnnouncement} />}
      </div>

      <p aria-live="polite" className="visually-hidden">
        {announcement}
      </p>
    </div>
  )
}

/** `code` 와 **굵게** 만 아는 작은 글 꾸미개. 안내 문장 안의 명령 · 메뉴 이름을 그 모양으로 보인다. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith('`') && part.endsWith('`') ? (
          <code className="mono" key={index}>
            {part.slice(1, -1)}
          </code>
        ) : part.startsWith('**') && part.endsWith('**') ? (
          <strong key={index}>{part.slice(2, -2)}</strong>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  )
}

function Paragraphs({ lines }: { lines: readonly string[] }) {
  return (
    <>
      {lines.map((line) => (
        <p className="setup-copy" key={line}>
          <Rich text={line} />
        </p>
      ))}
    </>
  )
}

function Bullets({ lines }: { lines: readonly string[] }) {
  return (
    <ul className="setup-list">
      {lines.map((line) => (
        <li key={line}>
          <Rich text={line} />
        </li>
      ))}
    </ul>
  )
}

function Intro({ id, title, hint, lead, children }: { id: string; title: string; hint: string; lead: string; children?: ReactNode }) {
  return (
    <section aria-labelledby={id} className="panel setup-intro">
      <header className="panel-header panel-header--split">
        <h2 id={id}>{title}</h2>
        <span className="settings-hint">{hint}</span>
      </header>
      <p className="setup-lead">
        <Rich text={lead} />
      </p>
      {children}
    </section>
  )
}

/** 단계 하나: 왼쪽 설명, 오른쪽 그림. 그림이 없는 단계는 설명이 칸 전체를 쓴다. */
function Step({ index, title, children, shots }: { index: number; title: string; children: ReactNode; shots?: ReactNode }) {
  return (
    <section className={`panel setup-step${shots === undefined ? ' setup-step--text' : ''}`}>
      <div className="setup-step-text">
        <span aria-hidden="true" className="setup-step-index">
          {index}
        </span>
        <h3>{title}</h3>
        {children}
      </div>
      {shots !== undefined && <div className="setup-step-shots">{shots}</div>}
    </section>
  )
}

/** `width` 와 `height` 는 파일 자체의 px 다. 그림이 오기 전에 자리를 잡아 읽던 단계가 밀리지 않게 한다. */
function Shot({ alt, height, src, width, narrow = false }: { alt: string; height: number; src: string; width: number; narrow?: boolean }) {
  return (
    <img
      alt={alt}
      className={`setup-shot${narrow ? ' setup-shot--narrow' : ''}`}
      height={height}
      loading="lazy"
      src={src}
      width={width}
    />
  )
}

function SdkGuide({ projectId, onResult }: { projectId?: string; onResult: (message: string) => void }) {
  const { t } = useI18n()
  const copy = t.projects.setupPages.sdk
  const shots = t.projects.guide

  return (
    <>
      <Intro hint={copy.hint} id="setup-sdk-title" lead={copy.lead} title={copy.title}>
        <dl className="setup-facts">
          <div>
            <dt>{copy.needLabel}</dt>
            <dd>{copy.need}</dd>
          </div>
          <div>
            <dt>{copy.targetLabel}</dt>
            <dd>{projectId === undefined ? copy.targetAny : copy.targetProject(projectId)}</dd>
          </div>
          <div>
            <dt>{copy.notLabel}</dt>
            <dd>
              <Rich text={copy.not} />
            </dd>
          </div>
        </dl>
      </Intro>

      <Step
        index={1}
        shots={
          <>
            <Shot alt={shots.shot1GitUrlMenuAlt} height={498} src={addPackageFromGitUrlShot} width={820} />
            <Shot alt={shots.shot1GitUrlInputAlt} height={518} src={gitUrlInputShot} width={1090} />
          </>
        }
        title={copy.step1Title}
      >
        <Paragraphs lines={copy.step1} />
        <CliCopyLine copiedMessage={shots.packageUrlCopied} copyLabel={shots.copyUrl} onResult={onResult} text={SDK_PACKAGE_URL} />
      </Step>

      <Step index={2} shots={<Shot alt={shots.shot2SignInScreenAlt} height={420} src={signInScreenShot} width={480} />} title={copy.step2Title}>
        <Paragraphs lines={copy.step2} />
      </Step>

      <Step
        index={3}
        shots={<Shot alt={shots.shot3BrowserSignInAlt} height={1264} narrow src={browserSignInShot} width={840} />}
        title={copy.step3Title}
      >
        <Paragraphs lines={copy.step3} />
      </Step>

      <Step
        index={4}
        shots={
          <>
            <Shot alt={shots.shot4ProjectPickerAlt} height={420} src={projectPickerShot} width={480} />
            <Shot alt={shots.shot4InstanceConnectedAlt} height={454} src={instanceConnectedShot} width={1004} />
          </>
        }
        title={copy.step4Title}
      >
        <Paragraphs lines={copy.step4} />
      </Step>

      <section aria-labelledby="setup-sdk-notes" className="panel">
        <header className="panel-header">
          <h2 id="setup-sdk-notes">{copy.notesTitle}</h2>
        </header>
        <div className="setup-panel-body">
          <Bullets lines={copy.notes} />
        </div>
      </section>
    </>
  )
}

function CliGuide({ projectId, onResult }: { projectId?: string; onResult: (message: string) => void }) {
  const { t } = useI18n()
  const copy = t.projects.setupPages.cli
  const setup = t.projects.setup
  const install = t.account.cliTokens.install
  const id = projectId ?? PROJECT_ID_PLACEHOLDER

  return (
    <>
      <Intro hint={copy.hint} id="setup-cli-title" lead={copy.lead} title={copy.title} />

      <Step index={1} title={copy.installTitle}>
        <Paragraphs lines={copy.install} />
        <CliCopyLine copiedMessage={install.installCopied} copyLabel={install.copyInstall} onResult={onResult} text={CLI_INSTALL_COMMAND} />
        <CliCopyLine copiedMessage={copy.versionCopied} copyLabel={copy.copyVersion} onResult={onResult} text="artel --version" />
        <Paragraphs lines={copy.installAgent} />
        <CliCopyLine
          copiedMessage={install.agentPromptCopied}
          copyLabel={install.copyAgentPrompt}
          onResult={onResult}
          text={install.agentPrompt(CLI_AGENT_GUIDE_URL)}
        />
      </Step>

      <Step index={2} title={copy.loginTitle}>
        <CliCopyLine copiedMessage={install.loginCopied} copyLabel={install.copyLogin} onResult={onResult} text={CLI_LOGIN_COMMAND} />
        <Paragraphs lines={copy.login} />
        <Bullets lines={copy.loginMore} />
      </Step>

      <Step index={3} title={copy.runTitle}>
        {projectId === undefined && (
          <>
            <p className="setup-copy">
              <code className="mono">{PROJECT_ID_PLACEHOLDER}</code>
              {setup.projectIdAfter}
            </p>
            <CliCopyLine copiedMessage={setup.projectListCopied} copyLabel={setup.copyProjectList} onResult={onResult} text={PROJECT_LIST_COMMAND} />
          </>
        )}
        <CliCopyLine copiedMessage={setup.startCopied} copyLabel={setup.copyStart} onResult={onResult} text={gameStartCommand(id)} />
        <CliCopyLine copiedMessage={setup.listCopied} copyLabel={setup.copyList} onResult={onResult} text={gameListCommand(id)} />
        <Paragraphs lines={copy.run} />
      </Step>

      <Step index={4} title={copy.qaTitle}>
        <CliCopyLine copiedMessage={setup.qaRunCopied} copyLabel={setup.copyQaRun} onResult={onResult} text={QA_RUN_COMMAND} />
        <Paragraphs lines={copy.qa} />
        <div className="screen-table-wrap">
          <table className="screen-table setup-flags">
            <thead>
              <tr>
                <th scope="col">{copy.flagColumn}</th>
                <th scope="col">{copy.valueColumn}</th>
              </tr>
            </thead>
            <tbody>
              {copy.flags.map(([flag, value]) => (
                <tr key={flag}>
                  <td>
                    <code className="mono">{flag}</code>
                  </td>
                  <td className="screen-table-wrap-text">
                    <Rich text={value} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paragraphs lines={copy.qaMore} />
      </Step>

      <section aria-labelledby="setup-cli-ci" className="panel">
        <header className="panel-header">
          <h2 id="setup-cli-ci">{copy.ciTitle}</h2>
        </header>
        <div className="setup-panel-body">
          <Paragraphs lines={copy.ci} />
          <p className="setup-copy">
            <Link to="/account">{copy.ciLink}</Link>
            {' · '}
            <a href={CLI_README_URL} rel="noreferrer" target="_blank">
              {install.readme}
            </a>
          </p>
        </div>
      </section>

      <section aria-labelledby="setup-cli-notes" className="panel">
        <header className="panel-header">
          <h2 id="setup-cli-notes">{copy.notesTitle}</h2>
        </header>
        <div className="setup-panel-body">
          <Bullets lines={copy.notes} />
        </div>
      </section>
    </>
  )
}

function SkillsGuide({ onResult }: { onResult: (message: string) => void }) {
  const { t } = useI18n()
  const copy = t.projects.setupPages.skills
  const setup = t.projects.setup

  return (
    <>
      <Intro hint={copy.hint} id="setup-skills-title" lead={copy.lead} title={copy.title} />

      <Step index={1} title={copy.installTitle}>
        <Paragraphs lines={copy.install} />
        <CliCopyLine copiedMessage={setup.skillsCopied} copyLabel={setup.copySkills} onResult={onResult} text={SKILLS_INSTALL_COMMAND} />
        <Bullets lines={copy.options} />
      </Step>

      <section aria-labelledby="setup-skills-list" className="panel">
        <header className="panel-header panel-header--split">
          <h2 id="setup-skills-list">{copy.listTitle}</h2>
          <a href={SKILLS_REPOSITORY_URL} rel="noreferrer" target="_blank">
            {setup.skillsRepo}
          </a>
        </header>
        <div className="screen-table-wrap">
          <table className="screen-table">
            <thead>
              <tr>
                <th scope="col">{copy.skillColumn}</th>
                <th scope="col">{copy.doesColumn}</th>
                <th scope="col">{copy.askColumn}</th>
              </tr>
            </thead>
            <tbody>
              {copy.rows.map(([skill, does, ask]) => (
                <tr key={skill}>
                  <td>
                    <Rich text={skill} />
                  </td>
                  <td className="screen-table-wrap-text">{does}</td>
                  <td className="screen-table-wrap-text detail-empty">{ask}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
