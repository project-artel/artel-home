import { useState } from 'react'
import { CopyButton } from './CopyButton'

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

  return (
    <div className="install-guide">
      <ol className="guide-list">
        <li className="guide-step">
          <p className="guide-copy">
            In Unity, open <strong>Window → Package Manager</strong> and choose{' '}
            <strong>Add package from git URL</strong>.
          </p>
          <div className="copy-line">
            <code className="mono copy-value">{SDK_PACKAGE_URL}</code>
            <CopyButton
              copiedMessage="Package URL copied."
              label="Copy URL"
              onResult={setAnnouncement}
              text={SDK_PACKAGE_URL}
            />
          </div>
        </li>

        <li className="guide-step">
          <p className="guide-copy">Create an empty GameObject in the scene.</p>
        </li>

        <li className="guide-step">
          <p className="guide-copy">
            Add the <code className="mono">ArtelManager</code> component to it.
          </p>
        </li>

        <li className="guide-step">
          <p className="guide-copy">
            Run the game and paste this instance key into the Artel window.
          </p>
          <div className="copy-line">
            <code className="mono copy-value">{instanceKey}</code>
            <CopyButton
              copiedMessage="Key copied."
              label="Copy key"
              onResult={setAnnouncement}
              text={instanceKey}
            />
          </div>
        </li>
      </ol>

      {/* The key is durable and has no re-issue endpoint, so it is worth saying
          plainly that closing this view does not lose it. */}
      <p className="guide-note">
        This key stays available on the instance row, so you can come back to it
        after reinstalling the SDK.
      </p>

      <p aria-live="polite" className="visually-hidden">{announcement}</p>
    </div>
  )
}
