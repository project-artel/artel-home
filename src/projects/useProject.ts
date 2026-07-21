import { useCallback, useEffect, useState } from 'react'
import { getProject, listDocuments, ProjectApiError } from './projectApi'
import type { ProjectDetail, ProjectDocument } from './projectTypes'

type ProjectState = {
  status: 'loading' | 'ready' | 'missing' | 'error'
  project: ProjectDetail | null
  documents: ProjectDocument[]
}

const loadingState: ProjectState = { status: 'loading', project: null, documents: [] }

function fetchProject(projectId: string, signal?: AbortSignal) {
  return Promise.all([getProject(projectId, signal), listDocuments(projectId, signal)])
}

/**
 * Loads one project and its document history together.
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
      .then(([project, documents]) => setState({ status: 'ready', project, documents }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({
          status: error instanceof ProjectApiError && error.isNotFound ? 'missing' : 'error',
          project: null,
          documents: [],
        })
      })

    return () => controller.abort()
  }, [projectId])

  const reload = useCallback(() => {
    setState(loadingState)
    fetchProject(projectId)
      .then(([project, documents]) => setState({ status: 'ready', project, documents }))
      .catch((error: unknown) => {
        setState({
          status: error instanceof ProjectApiError && error.isNotFound ? 'missing' : 'error',
          project: null,
          documents: [],
        })
      })
  }, [projectId])

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

  return { ...state, reload, applyProject, applyNewDocument }
}
