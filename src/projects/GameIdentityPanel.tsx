import { useEffect, useState, type FormEvent } from 'react'
import { useI18n } from '../i18n/useI18n'
import { formatDateTime } from './formatters'
import { ProjectApiError } from './projectApi'
import {
  deleteGameIdentity, IDENTITY_KINDS, IDENTITY_ROLES, identityExpectedVersion,
  listGameIdentities, listGameIdentityHistory, putGameIdentity,
  type GameIdentity, type GameIdentityDeclaration,
} from './gameIdentityApi'
import './gameIdentities.css'

export function GameIdentityPanel({ projectId, buildId }: { projectId: string; buildId: string }) {
  const { t } = useI18n()
  const messages = t.gameIdentities
  const [reload, setReload] = useState(0)
  const [identities, setIdentities] = useState<GameIdentity[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [editor, setEditor] = useState<GameIdentity | 'new' | null>(null)
  const [historyName, setHistoryName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    listGameIdentities(projectId, buildId, controller.signal).then((entries) => {
      if (!controller.signal.aborted) { setIdentities(entries); setFailed(false) }
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true)
    })
    return () => controller.abort()
  }, [projectId, buildId, reload])

  function refresh() {
    setIdentities(null)
    setFailed(false)
    setReload((value) => value + 1)
  }

  async function mutate(action: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await action()
      setEditor(null)
      refresh()
    } catch (failure) {
      if (failure instanceof ProjectApiError && failure.status === 409) {
        setEditor(null)
        setError(messages.conflict)
        refresh()
      } else {
        setError(messages.saveFailed)
      }
    } finally {
      setBusy(false)
    }
  }

  function save(declaration: GameIdentityDeclaration) {
    if (identities === null) return
    if (editor === 'new' && identities.some((identity) => identity.name === declaration.name && !identity.deleted)) {
      setError(messages.alreadyExists)
      return
    }
    const expectedVersion = editor !== 'new' && editor !== null ? editor.version : identityExpectedVersion(identities, declaration.name)
    void mutate(() => putGameIdentity(projectId, { ...declaration, gameBuildId: buildId, expectedVersion }))
  }

  return (
    <section className="panel gi-panel" aria-labelledby="game-identities-title">
      <header className="gi-heading">
        <h3 id="game-identities-title">{messages.title}</h3>
        <button className="button button--secondary button--compact" type="button" disabled={busy || identities === null || editor !== null} onClick={() => { setEditor('new'); setError('') }}>{messages.add}</button>
      </header>
      <p className="gi-note">{messages.buildHint}</p>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {failed ? <div className="inline-error" role="alert">{messages.failed}<button className="button button--secondary button--compact" type="button" onClick={refresh}>{messages.retry}</button></div>
        : identities === null ? <p role="status">{messages.loading}</p>
          : identities.length === 0 ? <p className="panel-empty">{messages.empty}</p>
            : <ul className="gi-list">{identities.map((identity) => (
              <li key={identity.name} className="gi-item">
                <div className="gi-heading"><strong className="mono gi-name" translate="no">{identity.name}</strong><span className="badge">{identity.deleted ? messages.deleted : messages.active}</span></div>
                <p className="gi-note">{messages.source}: {identity.source} · {messages.version}: {identity.version}</p>
                <IdentityFields identity={identity} />
                <div className="form-actions">
                  <button className="button button--secondary button--compact" type="button" disabled={busy || editor !== null} onClick={() => { setEditor(identity); setError('') }}>{identity.deleted ? messages.restore : messages.edit}</button>
                  <button className="button button--secondary button--compact" type="button" onClick={() => setHistoryName(identity.name)}>{messages.history}</button>
                  {!identity.deleted && <button className="button button--secondary button--compact" type="button" disabled={busy || editor !== null} onClick={() => { if (window.confirm(messages.deleteConfirm(identity.name))) void mutate(() => deleteGameIdentity(projectId, identity)) }}>{messages.remove}</button>}
                </div>
              </li>
            ))}</ul>}
      {editor !== null && <IdentityForm key={editor === 'new' ? 'new' : editor.revisionId} identity={editor === 'new' ? null : editor} busy={busy} onSave={save} onCancel={() => { setEditor(null); setError('') }} />}
      {historyName !== null && <IdentityHistory key={`${historyName}/${reload}`} projectId={projectId} name={historyName} onClose={() => setHistoryName(null)} />}
    </section>
  )
}

function IdentityFields({ identity }: { identity: GameIdentityDeclaration }) {
  const { t } = useI18n()
  const messages = t.gameIdentities
  return <dl className="detail-fields gi-fields">
    <dt>{messages.kind}</dt><dd>{identity.kind}{identity.base !== null ? ` (${messages.base}: ${identity.base})` : ''}</dd>
    <dt>{messages.meaning}</dt><dd>{identity.meaning}</dd>
    <dt>{messages.changesWhen}</dt><dd>{identity.changesWhen}</dd>
    <dt>{messages.identifies}</dt><dd>{identity.identifies}</dd>
    <dt>{messages.role}</dt><dd>{identity.role}</dd>
  </dl>
}

function IdentityForm({ identity, busy, onSave, onCancel }: {
  identity: GameIdentity | null; busy: boolean; onSave: (identity: GameIdentityDeclaration) => void; onCancel: () => void
}) {
  const { t } = useI18n()
  const messages = t.gameIdentities
  const [kind, setKind] = useState<GameIdentityDeclaration['kind']>(identity?.kind ?? 'ordinal')
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const base = String(fields.get('base') ?? '')
    onSave({
      name: String(fields.get('name')).trim(), kind, base: kind === 'ordinal' && base !== '' ? Number(base) : null,
      meaning: String(fields.get('meaning')).trim(), changesWhen: String(fields.get('changesWhen')).trim(),
      identifies: String(fields.get('identifies')).trim(), role: String(fields.get('role')) as GameIdentityDeclaration['role'],
    })
  }
  return <form className="gi-form" onSubmit={submit} aria-label={identity === null ? messages.add : messages.edit}>
    <fieldset disabled={busy}>
      <legend>{identity === null ? messages.add : identity.deleted ? messages.restore : messages.edit}</legend>
      <div className="gi-form-grid">
        <label>{messages.name}<input name="name" required maxLength={200} pattern="[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+" defaultValue={identity?.name ?? ''} readOnly={identity !== null} autoFocus /></label>
        <label>{messages.kind}<select name="kind" value={kind} onChange={(event) => setKind(event.target.value as GameIdentityDeclaration['kind'])}>{IDENTITY_KINDS.map((value) => <option key={value}>{value}</option>)}</select></label>
        {kind === 'ordinal' && <label>{messages.base}<select name="base" defaultValue={identity?.base ?? ''}><option value="">{messages.noBase}</option><option value="0">0</option><option value="1">1</option></select></label>}
        <label>{messages.identifies}<input name="identifies" required maxLength={60} pattern="[a-z0-9]+(( |-)[a-z0-9]+)*" defaultValue={identity?.identifies ?? ''} /></label>
        <label>{messages.role}<select name="role" defaultValue={identity?.role ?? 'current'}>{IDENTITY_ROLES.map((value) => <option key={value}>{value}</option>)}</select></label>
        <div className="gi-form-wide"><label htmlFor="gi-meaning">{messages.meaning}</label><textarea id="gi-meaning" name="meaning" required maxLength={500} defaultValue={identity?.meaning ?? ''} /></div>
        <div className="gi-form-wide"><label htmlFor="gi-changes-when">{messages.changesWhen}</label><textarea id="gi-changes-when" name="changesWhen" required maxLength={500} defaultValue={identity?.changesWhen ?? ''} /></div>
      </div>
      <div className="form-actions"><button className="button" type="submit">{messages.save}</button><button className="button button--secondary" type="button" onClick={onCancel}>{messages.cancel}</button></div>
    </fieldset>
  </form>
}

function IdentityHistory({ projectId, name, onClose }: { projectId: string; name: string; onClose: () => void }) {
  const { t } = useI18n()
  const messages = t.gameIdentities
  const [entries, setEntries] = useState<GameIdentity[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    listGameIdentityHistory(projectId, name, controller.signal).then((identities) => {
      if (!controller.signal.aborted) { setEntries(identities); setFailed(false) }
    }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [projectId, name, reload])
  return <section className="gi-history" aria-label={`${messages.historyTitle}: ${name}`}>
    <header className="gi-heading"><h4>{messages.historyTitle} · <span className="mono">{name}</span></h4><button className="button button--secondary button--compact" type="button" onClick={onClose}>{messages.close}</button></header>
    <p className="gi-note">{messages.historyHint}</p>
    {failed ? <div className="inline-error" role="alert">{messages.historyFailed}<button className="button button--secondary button--compact" type="button" onClick={() => { setFailed(false); setReload((value) => value + 1) }}>{messages.retry}</button></div>
      : entries === null ? <p role="status">{messages.loading}</p>
        : entries.length === 0 ? <p>{messages.historyEmpty}</p>
          : <ol className="gi-list">{entries.map((identity) => <li className="gi-item" key={identity.revisionId}>
            <p>{messages.version} {identity.version} · {identity.source} · {identity.deleted ? messages.deleted : messages.active}</p>
            <dl className="detail-fields gi-fields">
              <dt>{messages.build}</dt><dd className="mono">{identity.gameBuildId}</dd>
              <dt>{messages.revision}</dt><dd className="mono">{identity.revisionId}</dd>
              <dt>{messages.createdAt}</dt><dd>{formatDateTime(identity.createdAt)}</dd>
              <dt>{messages.createdBy}</dt><dd className="mono">{identity.createdBy ?? '—'}</dd>
            </dl>
            <IdentityFields identity={identity} />
          </li>)}</ol>}
  </section>
}
