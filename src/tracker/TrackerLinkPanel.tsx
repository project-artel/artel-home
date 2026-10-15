import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { InfoHint } from '../design-system/primitives/InfoHint'
import { ISSUE_SEVERITIES, type IssueSeverity } from '../issues/issueTypes'
import type { Messages } from '../i18n/messages'
import { useI18n } from '../i18n/useI18n'
import { apiErrorMessage } from '../projects/apiErrorMessage'
import { ProjectApiError } from '../projects/projectApi'
import { useWorkspace } from '../projects/workspace/workspaceContext'
import {
  deleteTrackerLink,
  getTrackerAuthorizeUrl,
  getTrackerInstallUrl,
  listTrackerInstallations,
  listTrackerRepositories,
  selectTrackerInstallation,
  updateTrackerLink,
} from './trackerApi'
import {
  DEFAULT_AUTO_SYNC_SEVERITIES,
  type TrackerInstallation,
  type TrackerLink,
  type TrackerRepository,
} from './trackerTypes'

/** The only provider this build implements. Every call below still threads it as data, not a literal. */
const PROVIDER = 'GITHUB' as const

/** The server's code for an authorization that is missing or older than its 10-minute window. */
const AUTHORIZATION_REQUIRED_CODE = 'tracker_authorization_required'

/**
 * The server's code for an installation that is not in the list it read at
 * authorization. Only a stale picker sends one, and authorizing again
 * refreshes the list.
 */
const INSTALLATION_NOT_VERIFIED_CODE = 'tracker_installation_not_verified'

/** A failed installation request: the text to show, and whether authorizing again would fix it. */
type InstallationFailure = { message: string; authorizationRequired: boolean }

function installationFailure(
  error: unknown,
  t: Messages,
  fallback: string = t.tracker.panel.installationsFailed,
): InstallationFailure {
  if (!(error instanceof ProjectApiError)) return { message: fallback, authorizationRequired: false }

  if (error.code === AUTHORIZATION_REQUIRED_CODE) {
    return { message: t.tracker.panel.authorizationExpired, authorizationRequired: true }
  }
  if (error.code === INSTALLATION_NOT_VERIFIED_CODE) {
    return { message: t.tracker.panel.selectInstallationFailed, authorizationRequired: true }
  }
  return { message: apiErrorMessage(error, t), authorizationRequired: false }
}

/**
 * A repository's identity for both the list `key` and "which row is
 * connecting right now" — `repository` alone collides across two
 * organizations installed on the same App (e.g. two `docs` repos).
 */
function repoKey(repository: TrackerRepository): string {
  return `${repository.workspace}/${repository.repository}`
}

/**
 * Connect the project to a repository, pick when defects export automatically,
 * and see or change that connection.
 *
 * Three states, derived from `trackerLink` alone (never a separate flag that
 * could drift from it): no connection, installed but no repository chosen,
 * and connected. Only an owner can change anything; a member sees the same
 * three states with every write action removed.
 *
 * A fourth screen, the installation picker, replaces those three for an owner
 * who lands from GitHub authorization with `?tracker=choose`.
 */
export function TrackerLinkPanel() {
  const { applyTrackerLink, extrasStatus, project, projectId, reloadExtras, trackerLink } =
    useWorkspace()
  const { t } = useI18n()
  const isOwner = project.myRole === 'OWNER'

  const [searchParams, setSearchParams] = useSearchParams()
  // Read once, at mount, via the lazy initializer rather than an effect:
  // there is exactly one moment this matters (the redirect landing), and
  // capturing it this way means the effect below never needs to call this
  // component's own `setState` synchronously — it only strips the URL and
  // kicks off `reloadExtras`, both of which are fine to do directly in an
  // effect body; only a local `setState` call there is not.
  const [initialTrackerFlag] = useState(() => searchParams.get('tracker'))
  const [announcement, setAnnouncement] = useState('')
  // Cancel and a successful connection both close the installation picker. A
  // reload does not reopen it: the flag is gone from the URL by then.
  const [pickerClosed, setPickerClosed] = useState(false)

  const [connecting, setConnecting] = useState(false)
  const [connectFailure, setConnectFailure] = useState<string | null>(null)

  type InstallationLoad =
    | { token: number; status: 'ready'; installations: TrackerInstallation[] }
    | { token: number; status: 'error'; failure: InstallationFailure }
  const [installationLoad, setInstallationLoad] = useState<InstallationLoad | null>(null)
  const [installationReloadToken, setInstallationReloadToken] = useState(0)
  const [selectingInstallation, setSelectingInstallation] = useState<string | null>(null)
  const [installationSelectFailure, setInstallationSelectFailure] = useState<InstallationFailure | null>(null)
  const [installingElsewhere, setInstallingElsewhere] = useState(false)

  type RepoLoad =
    | { token: number; status: 'ready'; repositories: TrackerRepository[] }
    | { token: number; status: 'error'; message: string }
  const [repoLoad, setRepoLoad] = useState<RepoLoad | null>(null)
  const [repoReloadToken, setRepoReloadToken] = useState(0)
  const [connectingRepo, setConnectingRepo] = useState<string | null>(null)
  const [repoConnectFailure, setRepoConnectFailure] = useState<string | null>(null)

  const [savingSeverities, setSavingSeverities] = useState(false)
  const [severityFailure, setSeverityFailure] = useState<string | null>(null)

  const [disconnecting, setDisconnecting] = useState(false)
  const [disconnectFailure, setDisconnectFailure] = useState<string | null>(null)

  // The GitHub App install flow returns here carrying `?tracker=connected` or
  // `?tracker=failed` (see the plan's note on where "home" resolves to), and
  // GitHub authorization returns with `?tracker=choose`.
  // Strip it immediately so a reload cannot repeat the notice, and — only on
  // success — re-read the workspace's tracker state, since the layout's own
  // load happened before the redirect.
  useEffect(() => {
    if (
      initialTrackerFlag !== 'connected' &&
      initialTrackerFlag !== 'failed' &&
      initialTrackerFlag !== 'choose'
    ) {
      return
    }

    const next = new URLSearchParams(searchParams)
    next.delete('tracker')
    setSearchParams(next, { replace: true })

    if (initialTrackerFlag === 'connected') reloadExtras()
    // Runs once for the flag this component mounted with; `searchParams`
    // changes on every navigation, and re-running this for that reason alone
    // would re-strip an already-stripped param.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTrackerFlag])

  const installFailedNotice = initialTrackerFlag === 'failed'

  // A member who opens the `choose` address sees the ordinary panel.
  const showInstallationPicker = isOwner && initialTrackerFlag === 'choose' && !pickerClosed

  const showRepositoryPicker =
    !showInstallationPicker && trackerLink !== null && trackerLink.repository === null

  // `repoLoad`'s `token` decides whether it belongs to the request in
  // flight; a mismatch (including `repoLoad === null`, the initial state)
  // reads as "loading" without ever calling `setState` synchronously in this
  // effect — only inside the `.then`/`.catch` below, once the server answers.
  const repositoriesLoading = repoLoad === null || repoLoad.token !== repoReloadToken

  useEffect(() => {
    if (!isOwner || !showRepositoryPicker) return

    const controller = new AbortController()
    const token = repoReloadToken

    listTrackerRepositories(projectId, PROVIDER, controller.signal)
      .then((repositories) => setRepoLoad({ token, status: 'ready', repositories }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setRepoLoad({
          token,
          status: 'error',
          message: error instanceof ProjectApiError ? apiErrorMessage(error, t) : t.tracker.panel.repositoriesFailed,
        })
      })

    return () => controller.abort()
  }, [isOwner, showRepositoryPicker, projectId, t, repoReloadToken])

  // Same token scheme as `repoLoad` above, for the installation list.
  const installationsLoading = installationLoad === null || installationLoad.token !== installationReloadToken

  useEffect(() => {
    if (!showInstallationPicker) return

    const controller = new AbortController()
    const token = installationReloadToken

    listTrackerInstallations(projectId, PROVIDER, controller.signal)
      .then((installations) => setInstallationLoad({ token, status: 'ready', installations }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setInstallationLoad({
          token,
          status: 'error',
          failure: installationFailure(error, t),
        })
      })

    return () => controller.abort()
  }, [showInstallationPicker, projectId, t, installationReloadToken])

  /** Sends the owner to GitHub authorization, which lists the accounts the App is installed on. */
  async function startAuthorization() {
    setConnecting(true)
    setConnectFailure(null)
    try {
      const url = await getTrackerAuthorizeUrl(projectId, PROVIDER)
      window.location.assign(url)
    } catch (error: unknown) {
      setConnectFailure(
        error instanceof ProjectApiError ? apiErrorMessage(error, t) : t.tracker.panel.connectFailed,
      )
      setConnecting(false)
    }
  }

  /** Sends the owner to GitHub to install the App on an account that is not in the list yet. */
  async function installOnAnotherAccount() {
    setInstallingElsewhere(true)
    setInstallationSelectFailure(null)
    try {
      const url = await getTrackerInstallUrl(projectId, PROVIDER)
      window.location.assign(url)
    } catch (error: unknown) {
      setInstallationSelectFailure(installationFailure(error, t, t.tracker.panel.connectFailed))
      setInstallingElsewhere(false)
    }
  }

  async function selectInstallation(installation: TrackerInstallation) {
    setSelectingInstallation(installation.installationId)
    setInstallationSelectFailure(null)
    try {
      const link = await selectTrackerInstallation(projectId, PROVIDER, installation.installationId)
      applyTrackerLink(link)
      setPickerClosed(true)
      setAnnouncement(t.tracker.panel.accountConnected(installation.account))
    } catch (error: unknown) {
      setInstallationSelectFailure(installationFailure(error, t, t.tracker.panel.selectInstallationFailed))
    } finally {
      setSelectingInstallation(null)
    }
  }

  async function connectRepository(repository: TrackerRepository) {
    setConnectingRepo(repoKey(repository))
    setRepoConnectFailure(null)
    try {
      const link = await updateTrackerLink(projectId, {
        provider: PROVIDER,
        workspace: repository.workspace,
        repository: repository.repository,
        autoSyncSeverities: DEFAULT_AUTO_SYNC_SEVERITIES,
      })
      applyTrackerLink(link)
      setAnnouncement(t.tracker.panel.connectedTo(`${repository.workspace}/${repository.repository}`))
    } catch (error: unknown) {
      setRepoConnectFailure(
        error instanceof ProjectApiError ? apiErrorMessage(error, t) : t.tracker.panel.connectRepositoryFailed,
      )
    } finally {
      setConnectingRepo(null)
    }
  }

  function toggleSeverity(severity: IssueSeverity) {
    if (trackerLink === null || trackerLink.workspace === null || trackerLink.repository === null) return

    const next = trackerLink.autoSyncSeverities.includes(severity)
      ? trackerLink.autoSyncSeverities.filter((item) => item !== severity)
      : [...trackerLink.autoSyncSeverities, severity]

    setSavingSeverities(true)
    setSeverityFailure(null)
    updateTrackerLink(projectId, {
      provider: trackerLink.provider,
      workspace: trackerLink.workspace,
      repository: trackerLink.repository,
      autoSyncSeverities: next,
    })
      .then(applyTrackerLink)
      .catch((error: unknown) =>
        setSeverityFailure(
          error instanceof ProjectApiError ? apiErrorMessage(error, t) : t.tracker.panel.severitySaveFailed,
        ),
      )
      .finally(() => setSavingSeverities(false))
  }

  async function disconnect() {
    setDisconnecting(true)
    setDisconnectFailure(null)
    try {
      await deleteTrackerLink(projectId)
      applyTrackerLink(null)
      setAnnouncement(t.tracker.panel.disconnectedAnnouncement)
    } catch (error: unknown) {
      setDisconnectFailure(
        error instanceof ProjectApiError ? apiErrorMessage(error, t) : t.tracker.panel.disconnectFailed,
      )
    } finally {
      setDisconnecting(false)
    }
  }

  // `trackerLink` lives in the same `useWorkspaceExtras` bundle as `runs`,
  // `tries`, etc. (Step 2 of the plan) — its initial value is `null` before
  // that five-way `Promise.all` settles, exactly like `openIssues` starts as
  // `[]`. `DashboardSection` already guards its own extras-derived values with
  // `extrasStatus === 'ready'`; this panel does the same, so an owner with an
  // already-connected repository never sees a flash of "Connect to GitHub"
  // while the project's own (separately-loaded, usually faster) `project`
  // has already rendered this section.
  if (extrasStatus !== 'ready') {
    return (
      <section className="panel" aria-labelledby="tracker-title">
        <header className="panel-header">
          <h2 id="tracker-title">{t.tracker.panel.title}</h2>
        </header>
        {extrasStatus === 'loading' ? (
          <p className="panel-empty" aria-busy="true">{t.tracker.panel.loading}</p>
        ) : (
          <div className="panel-message" role="alert">
            <p className="panel-message-copy">{t.tracker.panel.loadFailed}</p>
            <button className="button button--secondary button--compact" onClick={reloadExtras} type="button">
              {t.projects.shared.retry}
            </button>
          </div>
        )}
      </section>
    )
  }

  return (
    <section className="panel" aria-labelledby="tracker-title">
      <header className="panel-header">
        <h2 id="tracker-title">
          {t.tracker.panel.title}
          <InfoHint>{t.tracker.panel.subtitle}</InfoHint>
        </h2>
      </header>

      {installFailedNotice && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          {t.tracker.panel.installFailedAnnouncement}
        </div>
      )}

      {showInstallationPicker && (
        <InstallationPicker
          connectFailure={connectFailure}
          connecting={connecting}
          installations={installationLoad?.status === 'ready' ? installationLoad.installations : null}
          installingElsewhere={installingElsewhere}
          loading={installationsLoading}
          loadFailure={installationLoad?.status === 'error' ? installationLoad.failure : null}
          onCancel={() => setPickerClosed(true)}
          onInstallElsewhere={() => void installOnAnotherAccount()}
          onReauthorize={() => void startAuthorization()}
          onRetry={() => setInstallationReloadToken((token) => token + 1)}
          onSelect={(installation) => void selectInstallation(installation)}
          selectFailure={installationSelectFailure}
          selectingInstallation={selectingInstallation}
        />
      )}

      {!showInstallationPicker && trackerLink === null && (
        <NotConnected
          connectFailure={connectFailure}
          connecting={connecting}
          isOwner={isOwner}
          onConnect={() => void startAuthorization()}
        />
      )}

      {showRepositoryPicker && (
        <RepositoryPicker
          changeAccountFailure={connectFailure}
          changingAccount={connecting}
          connectingRepo={connectingRepo}
          isOwner={isOwner}
          loading={repositoriesLoading}
          loadFailure={repoLoad?.status === 'error' ? repoLoad.message : null}
          onChangeAccount={() => void startAuthorization()}
          onConnect={(repository) => void connectRepository(repository)}
          onRetry={() => setRepoReloadToken((token) => token + 1)}
          repoConnectFailure={repoConnectFailure}
          repositories={repoLoad?.status === 'ready' ? repoLoad.repositories : null}
        />
      )}

      {!showInstallationPicker && trackerLink !== null && trackerLink.repository !== null && (
        <Connected
          changeAccountFailure={connectFailure}
          changingAccount={connecting}
          disconnectFailure={disconnectFailure}
          disconnecting={disconnecting}
          isOwner={isOwner}
          onChangeAccount={() => void startAuthorization()}
          onDisconnect={() => void disconnect()}
          onToggleSeverity={toggleSeverity}
          savingSeverities={savingSeverities}
          severityFailure={severityFailure}
          trackerLink={trackerLink}
        />
      )}

      <p aria-live="polite" className="visually-hidden">
        {announcement.length > 0
          ? announcement
          : initialTrackerFlag === 'connected'
            ? t.tracker.panel.installedAnnouncement
            : ''}
      </p>
    </section>
  )
}

function NotConnected({
  connectFailure,
  connecting,
  isOwner,
  onConnect,
}: {
  connectFailure: string | null
  connecting: boolean
  isOwner: boolean
  onConnect: () => void
}) {
  const { t } = useI18n()

  if (!isOwner) {
    return <p className="panel-empty">{t.tracker.panel.notConnected}</p>
  }

  return (
    <div className="panel-empty-block">
      <p className="panel-empty">{t.tracker.panel.notConnected}</p>
      {connectFailure !== null && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          {connectFailure}
        </div>
      )}
      <button
        className="button button--primary button--compact"
        disabled={connecting}
        onClick={onConnect}
        type="button"
      >
        {connecting ? t.tracker.panel.connecting : t.tracker.panel.connect}
      </button>
    </div>
  )
}

function RepositoryPicker({
  changeAccountFailure,
  changingAccount,
  connectingRepo,
  isOwner,
  loading,
  loadFailure,
  onChangeAccount,
  onConnect,
  onRetry,
  repoConnectFailure,
  repositories,
}: {
  changeAccountFailure: string | null
  changingAccount: boolean
  connectingRepo: string | null
  isOwner: boolean
  loading: boolean
  loadFailure: string | null
  onChangeAccount: () => void
  onConnect: (repository: TrackerRepository) => void
  onRetry: () => void
  repoConnectFailure: string | null
  repositories: TrackerRepository[] | null
}) {
  const { t } = useI18n()

  if (!isOwner) {
    return <p className="panel-empty">{t.tracker.panel.awaitingOwner}</p>
  }

  return (
    <div>
      <p className="section-intro">{t.tracker.panel.chooseRepositoryCopy}</p>

      {repoConnectFailure !== null && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          {repoConnectFailure}
        </div>
      )}

      {loading ? (
        <p className="panel-empty" aria-busy="true">{t.tracker.panel.repositoriesLoading}</p>
      ) : loadFailure !== null ? (
        <div className="panel-message" role="alert">
          <p className="panel-message-copy">{loadFailure}</p>
          <button className="button button--secondary button--compact" onClick={onRetry} type="button">
            {t.projects.shared.retry}
          </button>
        </div>
      ) : repositories !== null && repositories.length === 0 ? (
        <p className="panel-empty">{t.tracker.panel.repositoriesEmpty}</p>
      ) : (
        <ul className="tracker-repo-list">
          {(repositories ?? []).map((repository) => (
            <li className="tracker-repo-row" key={repoKey(repository)}>
              <span className="tracker-repo-name">
                {repository.workspace}/{repository.repository}
              </span>
              {repository.private && <span className="badge">{t.tracker.panel.private}</span>}
              <button
                className="button button--secondary button--compact"
                disabled={connectingRepo !== null}
                onClick={() => onConnect(repository)}
                type="button"
              >
                {connectingRepo === repoKey(repository)
                  ? t.tracker.panel.connecting
                  : t.tracker.panel.connectRepository}
              </button>
            </li>
          ))}
        </ul>
      )}

      <ChangeAccountFailure failure={changeAccountFailure} />
      <div className="tracker-actions">
        <ChangeAccountButton changing={changingAccount} onChangeAccount={onChangeAccount} />
      </div>
    </div>
  )
}

/** Starts GitHub authorization again, so the owner can pick a different installed account. */
function ChangeAccountButton({ changing, onChangeAccount }: { changing: boolean; onChangeAccount: () => void }) {
  const { t } = useI18n()

  return (
    <button
      className="button button--secondary button--compact"
      disabled={changing}
      onClick={onChangeAccount}
      type="button"
    >
      {changing ? t.tracker.panel.connecting : t.tracker.panel.changeAccount}
    </button>
  )
}

/** Kept apart from the button so the error never lands inside an action row. */
function ChangeAccountFailure({ failure }: { failure: string | null }) {
  if (failure === null) return null

  return (
    <div className="inline-error" role="alert">
      <span aria-hidden="true">!</span>
      {failure}
    </div>
  )
}

function InstallationPicker({
  connectFailure,
  connecting,
  installations,
  installingElsewhere,
  loading,
  loadFailure,
  onCancel,
  onInstallElsewhere,
  onReauthorize,
  onRetry,
  onSelect,
  selectFailure,
  selectingInstallation,
}: {
  connectFailure: string | null
  connecting: boolean
  installations: TrackerInstallation[] | null
  installingElsewhere: boolean
  loading: boolean
  loadFailure: InstallationFailure | null
  onCancel: () => void
  onInstallElsewhere: () => void
  onReauthorize: () => void
  onRetry: () => void
  onSelect: (installation: TrackerInstallation) => void
  selectFailure: InstallationFailure | null
  selectingInstallation: string | null
}) {
  const { t } = useI18n()
  // `connecting` covers "다시 승인": the page is about to leave for GitHub.
  const busy = selectingInstallation !== null || installingElsewhere || connecting

  // A failed select that authorizing again would fix hides the stale list, so
  // the row that just failed cannot be clicked a second time.
  const needsReauthorization = selectFailure?.authorizationRequired === true

  const reauthorizeButton = (
    <button
      className="button button--primary button--compact"
      disabled={busy}
      onClick={onReauthorize}
      type="button"
    >
      {connecting ? t.tracker.panel.connecting : t.tracker.panel.reauthorize}
    </button>
  )

  const installElsewhereButton = (
    <button
      className="button button--secondary button--compact"
      disabled={busy}
      onClick={onInstallElsewhere}
      type="button"
    >
      {installingElsewhere ? t.tracker.panel.connecting : t.tracker.panel.installOnAnotherAccount}
    </button>
  )

  return (
    <div>
      <p className="section-intro">{t.tracker.panel.chooseInstallationCopy}</p>

      {connectFailure !== null && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          {connectFailure}
        </div>
      )}

      {selectFailure !== null && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          {selectFailure.message}
        </div>
      )}

      {loading ? (
        <p className="panel-empty" aria-busy="true">{t.tracker.panel.installationsLoading}</p>
      ) : loadFailure !== null ? (
        <div className="panel-message" role="alert">
          <p className="panel-message-copy">{loadFailure.message}</p>
          {loadFailure.authorizationRequired ? (
            reauthorizeButton
          ) : (
            <button className="button button--secondary button--compact" onClick={onRetry} type="button">
              {t.projects.shared.retry}
            </button>
          )}
        </div>
      ) : needsReauthorization ? null : installations !== null && installations.length === 0 ? (
        <p className="panel-empty">{t.tracker.panel.installationsEmpty}</p>
      ) : (
        <ul className="tracker-repo-list">
          {(installations ?? []).map((installation) => (
            <li className="tracker-repo-row" key={installation.installationId}>
              <span className="tracker-repo-name">{installation.account}</span>
              <span className="badge">{t.tracker.panel.accountTypeLabels[installation.accountType]}</span>
              <button
                className="button button--secondary button--compact"
                disabled={busy}
                onClick={() => onSelect(installation)}
                type="button"
              >
                {selectingInstallation === installation.installationId
                  ? t.tracker.panel.connecting
                  : t.tracker.panel.useInstallation}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="tracker-actions">
        {needsReauthorization && reauthorizeButton}
        {!loading && loadFailure === null && !needsReauthorization && installElsewhereButton}
        <button
          className="button button--secondary button--compact"
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          {t.projects.shared.cancel}
        </button>
      </div>
    </div>
  )
}

function Connected({
  changeAccountFailure,
  changingAccount,
  disconnectFailure,
  disconnecting,
  isOwner,
  onChangeAccount,
  onDisconnect,
  onToggleSeverity,
  savingSeverities,
  severityFailure,
  trackerLink,
}: {
  changeAccountFailure: string | null
  changingAccount: boolean
  disconnectFailure: string | null
  disconnecting: boolean
  isOwner: boolean
  onChangeAccount: () => void
  onDisconnect: () => void
  onToggleSeverity: (severity: IssueSeverity) => void
  savingSeverities: boolean
  severityFailure: string | null
  trackerLink: TrackerLink
}) {
  const { t } = useI18n()
  const repositoryLabel = `${trackerLink.workspace}/${trackerLink.repository}`

  return (
    <div className="tracker-connected">
      <p className="tracker-link-meta">
        {t.tracker.panel.connectedTo(repositoryLabel)}
        {trackerLink.htmlUrl !== null && (
          <>
            {' · '}
            <a href={trackerLink.htmlUrl} rel="noopener noreferrer" target="_blank">
              {t.tracker.panel.viewRepository}
            </a>
          </>
        )}
      </p>

      <p className="panel-subtitle">
        {t.tracker.panel.autoSyncTitle}
        <InfoHint>{t.tracker.panel.autoSyncHint}</InfoHint>
      </p>

      {severityFailure !== null && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          {severityFailure}
        </div>
      )}

      {isOwner ? (
        <div className="tracker-severity-list">
          {ISSUE_SEVERITIES.map((severity) => (
            <label className="tracker-severity-option" key={severity}>
              <input
                checked={trackerLink.autoSyncSeverities.includes(severity)}
                disabled={savingSeverities}
                onChange={() => onToggleSeverity(severity)}
                type="checkbox"
              />
              <span>{t.issues.severityLabels[severity]}</span>
            </label>
          ))}
        </div>
      ) : trackerLink.autoSyncSeverities.length === 0 ? (
        <p className="panel-empty">{t.tracker.panel.noAutoSyncSeverities}</p>
      ) : (
        <div className="tracker-severity-list">
          {trackerLink.autoSyncSeverities.map((severity) => (
            <span className="severity-tag" key={severity}>
              {t.issues.severityLabels[severity]}
            </span>
          ))}
        </div>
      )}

      {isOwner && (
        <>
          {disconnectFailure !== null && (
            <div className="inline-error" role="alert">
              <span aria-hidden="true">!</span>
              {disconnectFailure}
            </div>
          )}
          <ChangeAccountFailure failure={changeAccountFailure} />
          <p className="panel-note">{t.tracker.panel.disconnectNote}</p>
          <div className="tracker-actions">
            <ChangeAccountButton changing={changingAccount} onChangeAccount={onChangeAccount} />
            <button
              className="button button--secondary button--compact"
              disabled={disconnecting}
              onClick={onDisconnect}
              type="button"
            >
              {disconnecting ? t.tracker.panel.disconnecting : t.tracker.panel.disconnect}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
