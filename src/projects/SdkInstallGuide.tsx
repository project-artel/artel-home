import { useState } from 'react'
import { CopyButton } from './CopyButton'
import { useI18n } from '../i18n/useI18n'

/**
 * The git URL Unity's Package Manager installs the SDK from. It is a constant
 * of the product, not of this project, so it is not fetched: there is no
 * endpoint that returns it and inventing one would only add a way for the
 * guide to fail to load.
 */
const SDK_PACKAGE_URL = 'https://github.com/project-artel/artel-sdk.git'

/**
 * The four steps that turn an issued instance key into a connected game.
 *
 * Shown in two places — inside the create dialog straight after the key is
 * issued, and again from the `설치 안내` action on any instance row — from one
 * component, so closing the dialog cannot strand anyone and the two copies can
 * never drift apart.
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
        </li>

        <li className="guide-step">
          <p className="guide-copy">{t.projects.guide.step2}</p>
        </li>

        <li className="guide-step">
          <p className="guide-copy">
            {t.projects.guide.step3Before}
            <code className="mono">ArtelManager</code>
            {t.projects.guide.step3After}
          </p>
        </li>

        <li className="guide-step">
          <p className="guide-copy">{t.projects.guide.step4}</p>
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
