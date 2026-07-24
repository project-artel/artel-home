import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { GameStreamView } from '../streaming/GameStreamView'
import { listGameInstances } from './gameApi'
import { ProjectApiError } from './projectApi'
import { describePlatform, type GameInstance } from './gameTypes'

/**
 * Keyed by the instance id so opening another instance remounts rather than
 * pointing the existing socket and peer connection at a different game.
 */
export function GameInstanceDetailRoute() {
  const { instanceId = '', projectId = '' } = useParams()
  return <GameInstanceDetailPage instanceId={instanceId} key={instanceId} projectId={projectId} />
}

function projectLink(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}`
}

type PageStatus = 'loading' | 'ready' | 'missing' | 'error'

/**
 * One game instance's live screen.
 *
 * Deliberately thin. The QA screen will sit *alongside* this route rather than
 * grow out of it — scenarios today have no run to watch, so whatever that
 * screen becomes will be built on something that does not exist yet, and this
 * page pretending to be its prototype would only be in the way. It answers one
 * question: is the SDK connected and rendering. The design investment belongs
 * in `GameStreamView`, which the QA screen mounts unchanged.
 *
 * The instance key stays on the project page. This screen is about what the
 * game is doing, and repeating a durable credential on a second surface is not
 * identity.
 */
function GameInstanceDetailPage({
  instanceId,
  projectId,
}: {
  instanceId: string
  projectId: string
}) {
  const [status, setStatus] = useState<PageStatus>('loading')
  const [instance, setInstance] = useState<GameInstance | null>(null)

  /*
   * There is no endpoint that reads a single instance — the contract exposes
   * create, list, rename, and delete — so the row is found in the project's
   * list. A list the user is not a member of comes back as a 404, which is the
   * same answer as a deleted instance and gets the same screen.
   */
  useEffect(() => {
    const controller = new AbortController()

    listGameInstances(projectId, controller.signal)
      .then((instances) => {
        const found = instances.find((candidate) => candidate.id === instanceId) ?? null
        setInstance(found)
        setStatus(found === null ? 'missing' : 'ready')
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setStatus(error instanceof ProjectApiError && error.isNotFound ? 'missing' : 'error')
      })

    return () => controller.abort()
  }, [instanceId, projectId])

  if (status === 'loading') {
    return (
      <section className="page" aria-busy="true">
        <p className="panel-empty">Loading instance…</p>
      </section>
    )
  }

  if (status === 'error') {
    return (
      <section className="page">
        <div className="panel-message" role="alert">
          <p>This instance could not be loaded.</p>
          <Link className="button button--secondary" to={projectLink(projectId)}>
            Back to the project
          </Link>
        </div>
      </section>
    )
  }

  // `instance` is null only when the read failed or matched nothing, both of
  // which are already handled; the test is what narrows the type.
  if (status === 'missing' || instance === null) {
    return (
      <section className="page">
        <div className="panel-message">
          <h1>Instance not found</h1>
          <p className="panel-message-copy">
            It may have been deleted, or you may not have access to it.
          </p>
          <Link className="button button--secondary" to={projectLink(projectId)}>
            Back to the project
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="page" aria-labelledby="instance-title">
      <header className="page-header">
        <div>
          <Link className="back-link" to={projectLink(projectId)}>Back to the project</Link>
          <h1 id="instance-title">{instance.name}</h1>
          <p className="page-subtitle">
            <span className="badge">{describePlatform(instance.platform)}</span>
            <span aria-hidden="true">·</span>
            <span className="mono">{instance.id}</span>
          </p>
        </div>
      </header>

      <GameStreamView instanceId={instance.id} />
    </section>
  )
}
