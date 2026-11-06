import { createUploadTicket, ProjectApiError, registerDocument } from './projectApi'
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_CONTENT_TYPE,
  DOCUMENT_MAX_BYTES,
  type ProjectDocument,
} from './projectTypes'

export type UploadProgress = {
  /** `0`–`1`, or `null` while the total size is still unknown. */
  ratio: number | null
}

/**
 * Machine-readable so this module stays free of user-facing text; the panel
 * maps each code through the active locale's dictionary.
 */
export type FileProblem = 'notPdf' | 'emptyFile' | 'tooLarge'

/**
 * Rejects a file the server would reject anyway, so the user hears about it
 * before waiting through an upload. The server's rules stay authoritative —
 * this is allowed to be stricter, never looser.
 */
export function describeFileProblem(file: File): FileProblem | null {
  const isPdf =
    file.type === DOCUMENT_CONTENT_TYPE || file.name.toLowerCase().endsWith('.pdf')

  if (!isPdf) return 'notPdf'
  if (file.size === 0) return 'emptyFile'
  if (file.size > DOCUMENT_MAX_BYTES) return 'tooLarge'
  return null
}

export { DOCUMENT_ACCEPT }

/**
 * Sends the bytes straight to object storage with the presigned URL.
 *
 * This is the one request in the app that must NOT go through `apiFetch` and
 * must NOT carry credentials: it leaves our origin, so the session cookie would
 * both leak cross-origin and break the upload signature.
 *
 * `XMLHttpRequest` rather than `fetch` because only it reports upload progress,
 * and a planning document is large enough that a silent multi-second wait reads
 * as a broken button.
 */
function putToStorage(
  file: File,
  uploadUrl: string,
  requiredHeaders: Record<string, string>,
  onProgress: (progress: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', uploadUrl)
    request.withCredentials = false

    for (const [header, value] of Object.entries(requiredHeaders)) {
      request.setRequestHeader(header, value)
    }

    request.upload.addEventListener('progress', (event) => {
      onProgress({ ratio: event.lengthComputable ? event.loaded / event.total : null })
    })

    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        resolve()
        return
      }
      reject(
        new ProjectApiError(
          request.status,
          'The file could not be uploaded to storage. Please try again.',
          'CLIENT_STORAGE_PUT_FAILED',
        ),
      )
    })

    request.addEventListener('error', () => {
      // A cross-origin failure surfaces here with no detail, and a missing CORS
      // rule on the bucket is the most likely cause. Say so rather than
      // pretending the file was at fault.
      reject(
        new ProjectApiError(
          0,
          'Storage could not be reached. The upload was not completed.',
          'CLIENT_STORAGE_UNREACHABLE',
        ),
      )
    })

    request.addEventListener('abort', () => {
      reject(new DOMException('Upload aborted', 'AbortError'))
    })

    signal?.addEventListener('abort', () => request.abort(), { once: true })

    request.send(file)
  })
}

/**
 * The full three-step upload: ticket, direct PUT, register.
 *
 * The document does not exist until the register call succeeds. If the session
 * expires between the PUT and the register, the bytes are already in storage
 * but no version is recorded — that object is unreferenced and the failure is
 * reported honestly rather than being presented as a success.
 */
export async function uploadDocument(options: {
  projectId: string
  file: File
  onProgress: (progress: UploadProgress) => void
  signal?: AbortSignal
}): Promise<ProjectDocument> {
  const { projectId, file, onProgress, signal } = options

  const ticket = await createUploadTicket(projectId, {
    fileName: file.name,
    contentType: DOCUMENT_CONTENT_TYPE,
    sizeBytes: file.size,
  })

  onProgress({ ratio: 0 })
  await putToStorage(file, ticket.uploadUrl, ticket.requiredHeaders, onProgress, signal)
  onProgress({ ratio: 1 })

  return registerDocument(projectId, ticket.objectKey)
}
