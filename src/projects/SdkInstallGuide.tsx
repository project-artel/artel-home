import { useEffect, useRef, useState } from 'react'
import { CopyButton } from './CopyButton'
import { useI18n } from '../i18n/useI18n'
import addPackageFromGitUrlShot from '../assets/sdk-guide/step1-add-package-from-git-url.png'
import gitUrlInputShot from '../assets/sdk-guide/step1-git-url-input.png'

/**
 * The git URL Unity's Package Manager installs the SDK from. It is a constant
 * of the product, not of this project, so it is not fetched: there is no
 * endpoint that returns it and inventing one would only add a way for the
 * guide to fail to load.
 */
const SDK_PACKAGE_URL = 'https://github.com/project-artel/artel-sdk.git'

/**
 * One screenshot of the Unity editor.
 *
 * `width` and `height` are the file's own pixels, not the size it renders at:
 * the browser only needs the ratio to reserve the box before the image
 * arrives, and the guide scrolls inside a dialog, where a late reflow would
 * move the step the reader is on.
 */
function GuideShot({
  alt,
  height,
  src,
  width,
}: {
  alt: string
  height: number
  src: string
  width: number
}) {
  return (
    <img alt={alt} className="guide-shot" height={height} loading="lazy" src={src} width={width} />
  )
}

/**
 * The three steps that turn an empty Unity project into a connected game.
 *
 * The last two are the sign-in: the SDK opens the browser, the browser approves
 * it, and the instance is registered by the first report. Nothing is copied out
 * of this screen any more, which is why the guide no longer needs to know which
 * instance it is being shown for.
 *
 * Only the install step carries screenshots, because the Package Manager menu
 * names alone do not say what the reader should be looking at. The sign-in
 * steps have none: the overlay is the SDK's own UI and a screenshot of it would
 * go stale on the SDK's release cycle, not this one's.
 *
 * It owns its own `aria-live` region because it is used inside a dialog that
 * has no panel-level one to borrow.
 */
export function SdkInstallGuide() {
  const [announcement, setAnnouncement] = useState('')
  const [stepIndex, setStepIndex] = useState(0)
  const stepRef = useRef<HTMLLIElement>(null)
  const { t } = useI18n()

  /**
   * Moving focus to the step is what makes the change perceivable without
   * sight: the button the reader just pressed stays put and says nothing about
   * what replaced the step behind it. Skipped on the first render, where
   * nothing has been replaced and the dialog owns the focus.
   */
  const started = useRef(false)
  useEffect(() => {
    if (!started.current) {
      started.current = true
      return
    }
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
    <p className="guide-copy">{t.projects.guide.step2}</p>,
    <p className="guide-copy">{t.projects.guide.step3}</p>,
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

      {/* The key is durable and has no re-issue endpoint, so it is worth saying
          plainly that closing this view does not lose it. */}
      <p className="guide-note">{t.projects.guide.note}</p>

      <p aria-live="polite" className="visually-hidden">{announcement}</p>
    </div>
  )
}
