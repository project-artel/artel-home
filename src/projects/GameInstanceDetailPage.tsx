import { PanelEmpty, PanelMessage } from '../design-system/primitives/Feedback'
import { ButtonLink } from '../design-system/primitives/Button'
import { PageHeader } from '../design-system/primitives/Headers'
import { Badge } from '../design-system/primitives/Badge'
import { useEffect, useState } from 'react'
import { NotFoundPage } from '../NotFoundPage'
import { Link, useParams } from 'react-router-dom'
import { GameStreamView } from '../streaming/GameStreamView'
import { listGameInstances } from './gameApi'
import { useI18n } from '../i18n/useI18n'
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
 * Deliberately thin. QA runs are started and listed on the project page, where
 * both halves of a run — the game and the scenario — are picked together; this
 * page answers one question: is the SDK connected and rendering. The design
 * investment belongs in `GameStreamView`, which the QA Try route mounts
 * unchanged.
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
  const { t } = useI18n()

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
        <PanelEmpty>{t.projects.instanceDetail.loading}</PanelEmpty>
      </section>
    )
  }

  if (status === 'error') {
    return (
      <section className="page">
        <PanelMessage role="alert">
          <p>{t.projects.instanceDetail.loadFailed}</p>
          <ButtonLink variant="secondary" to={projectLink(projectId)}>
            {t.projects.shared.backToProject}
          </ButtonLink>
        </PanelMessage>
      </section>
    )
  }

  // `instance` is null only when the read failed or matched nothing, both of
  // which are already handled; the test is what narrows the type.
  if (status === 'missing' || instance === null) {
    return (
      <NotFoundPage
        back={{ to: projectLink(projectId), label: t.projects.shared.backToProject }}
        copy={t.projects.shared.missingCopy}
        title={t.projects.instanceDetail.notFoundTitle}
      />
    )
  }

  return (
    <section className="page" aria-labelledby="instance-title">
      <PageHeader
        title={instance.name}
        titleId="instance-title"
        leading={
          <Link className="back-link" to={projectLink(projectId)}>
            {t.projects.shared.backToProject}
          </Link>
        }
        subtitle={
          <>
            <Badge>{describePlatform(instance.platform)}</Badge>
            <span aria-hidden="true">·</span>
            <span className="mono">{instance.id}</span>
          </>
        }
      />

      <GameStreamView instanceId={instance.id} />
    </section>
  )
}
