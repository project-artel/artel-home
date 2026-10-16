import { useEffect, useRef, useState } from 'react'
import { CopyButton } from './CopyButton'
import { CliCopyLine, SKILLS_INSTALL_COMMAND } from '../auth/CliInstallSteps'
import { useI18n } from '../i18n/useI18n'
import addPackageFromGitUrlShot from '../assets/sdk-guide/step1-add-package-from-git-url.png'
import gitUrlInputShot from '../assets/sdk-guide/step1-git-url-input.png'
import signInScreenShot from '../assets/sdk-guide/step2-sdk-sign-in-screen.png'
import browserSignInShot from '../assets/sdk-guide/step3-browser-sign-in.png'
import projectPickerShot from '../assets/sdk-guide/step4-sdk-project-picker.png'
import instanceConnectedShot from '../assets/sdk-guide/step4-instance-connected.png'

/**
 * The git URL Unity's Package Manager installs the SDK from. It is a constant
 * of the product, not of this project, so it is not fetched: there is no
 * endpoint that returns it and inventing one would only add a way for the
 * guide to fail to load.
 *
 * `?path=` is required, not decoration. The repository root holds the sample
 * project and the tooling as well, and the package itself is one folder down
 * at `Packages/kr.artel.sdk`; without the query Package Manager reads the root,
 * finds no `package.json`, and refuses the URL.
 */
const SDK_PACKAGE_URL = 'https://github.com/project-artel/artel-sdk.git?path=/Packages/kr.artel.sdk'

/**
 * One screenshot of the Unity editor.
 *
 * `width` and `height` are the file's own pixels, not the size it renders at:
 * the browser only needs the ratio to reserve the box before the image
 * arrives, and a late reflow would move the step the reader is on.
 *
 * `narrow` is for a capture taller than it is wide. At the column's full width
 * the browser sign-in card alone would be taller than the screen.
 */
function GuideShot({
  alt,
  height,
  narrow = false,
  src,
  width,
}: {
  alt: string
  height: number
  narrow?: boolean
  src: string
  width: number
}) {
  return (
    <img
      alt={alt}
      className={narrow ? 'guide-shot guide-shot--narrow' : 'guide-shot'}
      height={height}
      loading="lazy"
      src={src}
      width={width}
    />
  )
}

/**
 * The four steps that turn an empty Unity project into a connected game.
 *
 * The last three are the sign-in: the SDK's sign-in screen opens the browser,
 * signing in there approves the SDK, and picking a project back in the game
 * registers the instance. Nothing is copied out of this screen any more, which
 * is why the guide no longer needs to know which instance it is being shown for.
 *
 * Every step carries a screenshot. The sign-in screen and the project picker
 * are the SDK's own UI, so those two go stale on the SDK's release cycle rather
 * than this one's; they are still here because without them a first-time
 * reader has no way to tell which of the game's screens the step means.
 *
 * It owns its own `aria-live` region, so the setup page's SDK panel does not
 * need one of its own to borrow.
 */
export function SdkInstallGuide() {
  const [announcement, setAnnouncement] = useState('')
  const [stepIndex, setStepIndex] = useState(0)
  const stepRef = useRef<HTMLLIElement>(null)
  const { t } = useI18n()

  /**
   * Moving focus to the step is what makes the change perceivable without
   * sight: the button the reader just pressed stays put and says nothing about
   * what replaced the step behind it. Skipped while the step is the one
   * already shown, so opening the page does not pull focus or scroll to the
   * guide before the reader has asked for a step.
   */
  const focusedStep = useRef(stepIndex)
  useEffect(() => {
    if (focusedStep.current === stepIndex) return
    focusedStep.current = stepIndex
    stepRef.current?.focus()
  }, [stepIndex])

  const steps = [
    <>
      <p className="guide-copy">
        {/* The Unity menu names are the editor's own UI and stay in English. */}
        {t.projects.guide.step1Before}
        <strong>Window → Package Manager</strong>
        {t.projects.guide.step1Middle}
        <strong>Add package from git URL</strong>
        {t.projects.guide.step1After}
      </p>
      <div className="copy-line">
        <code className="mono copy-value">{SDK_PACKAGE_URL}</code>
        <CopyButton
          copiedMessage={t.projects.guide.packageUrlCopied}
          label={t.projects.guide.copyUrl}
          onResult={setAnnouncement}
          text={SDK_PACKAGE_URL}
        />
      </div>
      <GuideShot
        alt={t.projects.guide.shot1GitUrlMenuAlt}
        height={498}
        src={addPackageFromGitUrlShot}
        width={820}
      />
      <GuideShot
        alt={t.projects.guide.shot1GitUrlInputAlt}
        height={518}
        src={gitUrlInputShot}
        width={1090}
      />
    </>,
    <>
      <p className="guide-copy">{t.projects.guide.step2}</p>
      <GuideShot
        alt={t.projects.guide.shot2SignInScreenAlt}
        height={420}
        src={signInScreenShot}
        width={480}
      />
    </>,
    <>
      <p className="guide-copy">{t.projects.guide.step3}</p>
      <GuideShot
        alt={t.projects.guide.shot3BrowserSignInAlt}
        height={1264}
        narrow
        src={browserSignInShot}
        width={840}
      />
    </>,
    <>
      <p className="guide-copy">{t.projects.guide.step4}</p>
      <GuideShot
        alt={t.projects.guide.shot4ProjectPickerAlt}
        height={420}
        src={projectPickerShot}
        width={480}
      />
      <GuideShot
        alt={t.projects.guide.shot4InstanceConnectedAlt}
        height={454}
        src={instanceConnectedShot}
        width={1004}
      />
    </>,
  ]
  const isFirst = stepIndex === 0
  const isLast = stepIndex === steps.length - 1

  return (
    <div className="install-guide">
      <ol className="guide-list">
        {/* Only the current step is in the DOM, so `value` is what keeps the
            marker counting up instead of restarting at 1 every time. */}
        <li
          aria-label={t.projects.guide.stepPosition(stepIndex + 1, steps.length)}
          className="guide-step"
          ref={stepRef}
          tabIndex={-1}
          value={stepIndex + 1}
        >
          {steps[stepIndex]}
        </li>
      </ol>

      <div className="guide-nav">
        <button
          className="button button--secondary button--compact"
          disabled={isFirst}
          onClick={() => setStepIndex((current) => current - 1)}
          type="button"
        >
          {t.projects.guide.previousStep}
        </button>
        <p className="guide-position">
          {t.projects.guide.stepPosition(stepIndex + 1, steps.length)}
        </p>
        <button
          className="button button--secondary button--compact"
          disabled={isLast}
          onClick={() => setStepIndex((current) => current + 1)}
          type="button"
        >
          {t.projects.guide.nextStep}
        </button>
      </div>

      {/* Same command as the CLI install steps: one install covers the SDK
          setup (`artel-unity-sdk`) and the cheats (`artel-game-functions`). */}
      <div className="cli-install-guide guide-skills">
        <p className="guide-copy">{t.projects.guide.skillsIntro}</p>
        <CliCopyLine
          copiedMessage={t.projects.guide.skillsCopied}
          copyLabel={t.projects.guide.copySkills}
          onResult={setAnnouncement}
          text={SKILLS_INSTALL_COMMAND}
        />
      </div>

      {/* The key is durable and has no re-issue endpoint, so it is worth saying
          plainly that closing this view does not lose it. */}
      <p className="guide-note">{t.projects.guide.note}</p>

      <p aria-live="polite" className="visually-hidden">{announcement}</p>
    </div>
  )
}
