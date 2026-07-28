import { useState } from 'react'
import { CopyButton } from './CopyButton'
import { useI18n } from '../i18n/useI18n'
import addPackageFromGitUrlShot from '../assets/sdk-guide/step1-add-package-from-git-url.png'
import gitUrlInputShot from '../assets/sdk-guide/step1-git-url-input.png'
import createEmptyShot from '../assets/sdk-guide/step2-create-empty.png'
import addComponentShot from '../assets/sdk-guide/step3-add-component.png'
import inspectorShot from '../assets/sdk-guide/step3-inspector.png'
import artelPanelShot from '../assets/sdk-guide/step4-artel-panel.png'

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
 * The four steps that turn an issued instance key into a connected game.
 *
 * Shown in two places — inside the create dialog straight after the key is
 * issued, and again from the `설치 안내` action on any instance row — from one
 * component, so closing the dialog cannot strand anyone and the two copies can
 * never drift apart.
 *
 * Each step carries the screenshots for the editor state it describes, because
 * the Unity menu names alone do not say what the reader should be looking at.
 *
 * It owns its own `aria-live` region because it is used inside a dialog that
 * has no panel-level one to borrow.
 */
export function SdkInstallGuide({ instanceKey }: { instanceKey: string }) {
  const [announcement, setAnnouncement] = useState('')
  const { t } = useI18n()

  return (
    <div className="install-guide">
      <ol className="guide-list">
        <li className="guide-step">
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
        </li>

        <li className="guide-step">
          <p className="guide-copy">{t.projects.guide.step2}</p>
          <GuideShot alt={t.projects.guide.shot2Alt} height={860} src={createEmptyShot} width={1210} />
        </li>

        <li className="guide-step">
          <p className="guide-copy">
            {t.projects.guide.step3Before}
            <code className="mono">ArtelManager</code>
            {t.projects.guide.step3After}
          </p>
          <GuideShot
            alt={t.projects.guide.shot3SearchAlt}
            height={476}
            src={addComponentShot}
            width={910}
          />
          <GuideShot
            alt={t.projects.guide.shot3InspectorAlt}
            height={528}
            src={inspectorShot}
            width={618}
          />
        </li>

        <li className="guide-step">
          <p className="guide-copy">{t.projects.guide.step4}</p>
          <GuideShot alt={t.projects.guide.shot4Alt} height={274} src={artelPanelShot} width={442} />
          <div className="copy-line">
            <code className="mono copy-value">{instanceKey}</code>
            <CopyButton
              copiedMessage={t.projects.instances.keyCopied}
              label={t.projects.instances.copyKey}
              onResult={setAnnouncement}
              text={instanceKey}
            />
          </div>
        </li>
      </ol>

      {/* The key is durable and has no re-issue endpoint, so it is worth saying
          plainly that closing this view does not lose it. */}
      <p className="guide-note">{t.projects.guide.note}</p>

      <p aria-live="polite" className="visually-hidden">{announcement}</p>
    </div>
  )
}
