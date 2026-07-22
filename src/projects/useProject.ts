import { useCallback, useEffect, useState } from 'react'
import { listGameBuilds, listGameInstances } from './gameApi'
import { getProject, listDocuments, ProjectApiError } from './projectApi'
import type { GameBuild, GameInstance } from './gameTypes'
import type { ProjectDetail, ProjectDocument } from './projectTypes'

type ProjectState = {
  status: 'loading' | 'ready' | 'missing' | 'error'
  project: ProjectDetail | null
  documents: ProjectDocument[]
  instances: GameInstance[]
  builds: GameBuild[]
}

const loadingState: ProjectState = {
  status: 'loading',
  project: null,
  documents: [],
  instances: [],
  builds: [],
}

/**
 * All four reads are one `Promise.all` so the screen has exactly one status.
 * The alternative — a status per panel — would let the page render half-built
 * with three different spinners, and every panel would need its own retry that
 * the user has to find. One failure, one message, one Retry.
 */
function fetchProject(projectId: string, signal?: AbortSignal) {
  return Promise.all([
    getProject(projectId, signal),
    listDocuments(projectId, signal),
    listGameInstances(projectId, signal),
    listGameBuilds(projectId, signal),
  ])
}

function readyState([project, documents, instances, builds]: Awaited<
  ReturnType<typeof fetchProject>
>): ProjectState {
  return { status: 'ready', project, documents, instances, builds }
}

function failedState(error: unknown): ProjectState {
  return {
    ...loadingState,
    status: error instanceof ProjectApiError && error.isNotFound ? 'missing' : 'error',
  }
}

/**
 * Loads one project with its document history, its game instances, and its
 * reported builds.
 *
 * A `404` is modelled as its own `missing` status rather than a generic error:
 * it means the project was deleted or the user is not a member, so the screen
 * offers a way back instead of a retry that can never succeed.
 *
 * The caller mounts this per project id, so there is no in-place reset to do
 * when the id changes.
 */
export function useProject(projectId: string) {
  const [state, setState] = useState<ProjectState>(loadingState)

  useEffect(() => {
    const controller = new AbortController()

    fetchProject(projectId, controller.signal)
      .then((loaded) => setState(readyState(loaded)))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState(failedState(error))
      })

    return () => controller.abort()
  }, [projectId])

  const reload = useCallback(() => {
    setState(loadingState)
    fetchProject(projectId)
      .then((loaded) => setState(readyState(loaded)))
      .catch((error: unknown) => setState(failedState(error)))
  }, [projectId])

  /**
   * Re-reads the two lists a game launch changes.
   *
   * `connected` is whatever the server saw when the list was last fetched, and
   * nothing pushes a change — a game that connects after the page loaded keeps
   * reading as offline until someone asks again. Builds move on the same event:
   * a launch reporting a new version creates one. Refreshing only the instances
   * would answer "did it connect" while leaving "did the build appear" stale,
   * which is the more confusing half.
   *
   * `reload` would cover both by blanking the whole screen back to its loading
   * state — a heavy response to "did it connect yet". This leaves the project
   * and its documents alone and keeps the old rows on screen while in flight.
   *
   * A failure is deliberately not folded into the screen's status: the data on
   * screen is still valid, just older than the user hoped. The caller reports it.
   */
  const refreshGameState = useCallback(
    () =>
      Promise.all([listGameInstances(projectId), listGameBuilds(projectId)]).then(
        ([instances, builds]) => {
          setState((previous) => ({ ...previous, instances, builds }))
        },
      ),
    [projectId],
  )

  /** Applies a server response the caller already holds, avoiding a second fetch. */
  const applyProject = useCallback((project: ProjectDetail) => {
    setState((previous) => ({ ...previous, project }))
  }, [])

  const applyNewDocument = useCallback((document: ProjectDocument) => {
    setState((previous) => ({
      ...previous,
      project: previous.project ? { ...previous.project, document } : previous.project,
      documents: [document, ...previous.documents],
    }))
  }, [])

  /** Replaces one instance in place, so a rename never reorders the list under the user. */
  const applyInstance = useCallback((instance: GameInstance) => {
    setState((previous) => ({
      ...previous,
      instances: previous.instances.map((existing) =>
        existing.id === instance.id ? instance : existing,
      ),
    }))
  }, [])

  /**
   * Appended rather than prepended. The server's ordering is not part of the
   * contract, and appending is the reading that stays correct if it turns out
   * to be oldest-first; a reload is the authority either way. The user is
   * looking at the install guide in the dialog at this moment, not at the list.
   */
  const applyNewInstance = useCallback((instance: GameInstance) => {
    setState((previous) => ({ ...previous, instances: [...previous.instances, instance] }))
  }, [])

  const removeInstance = useCallback((instanceId: string) => {
    setState((previous) => ({
      ...previous,
      instances: previous.instances.filter((existing) => existing.id !== instanceId),
    }))
  }, [])

  const applyBuild = useCallback((build: GameBuild) => {
    setState((previous) => ({
      ...previous,
      builds: previous.builds.map((existing) => (existing.id === build.id ? build : existing)),
    }))
  }, [])

  return {
    ...state,
    reload,
    refreshGameState,
    applyProject,
    applyNewDocument,
    applyInstance,
    applyNewInstance,
    removeInstance,
    applyBuild,
  }
}
