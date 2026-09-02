/**
 * The inline delete confirmation on one document line in `DocumentPanel`.
 *
 * `documentId` names which line owns this state; every other line reads
 * itself as idle against it. Only one line can be in confirmation at a time,
 * so starting a second confirmation simply replaces this value and closes
 * whichever line had it before.
 */
export type DocumentDeleteState = {
  documentId: string | null
  pending: boolean
  error: string | null
}

export const idleDocumentDelete: DocumentDeleteState = {
  documentId: null,
  pending: false,
  error: null,
}

/**
 * Turns a line's delete button into its inline confirmation.
 *
 * Takes no dependency on the delete request itself — there is no way to call
 * it — so pressing the trigger button can never send a request on its own.
 * Only `runDocumentDelete`, wired to the confirmation's own button, does that.
 */
export function requestDocumentDelete(documentId: string): DocumentDeleteState {
  return { documentId, pending: false, error: null }
}

export function cancelDocumentDelete(): DocumentDeleteState {
  return idleDocumentDelete
}

/** Set right before the request goes out, so the line disables its controls. */
export function beginDocumentDelete(documentId: string): DocumentDeleteState {
  return { documentId, pending: true, error: null }
}

/**
 * Runs the confirmed delete request and reports the state the line should
 * fall back to.
 *
 * A failure keeps `documentId` set with `pending` false, so the confirmation
 * stays open with the error shown instead of reverting to the plain row. The
 * caller only removes the row from its list when `deleted` comes back `true`,
 * so a failed request leaves the list exactly as it was.
 */
export async function runDocumentDelete(options: {
  deleteDocument: (documentId: string) => Promise<void>
  documentId: string
  toErrorMessage: (error: unknown) => string
}): Promise<{ state: DocumentDeleteState; deleted: boolean }> {
  try {
    await options.deleteDocument(options.documentId)
    return { state: idleDocumentDelete, deleted: true }
  } catch (error: unknown) {
    return {
      state: { documentId: options.documentId, pending: false, error: options.toErrorMessage(error) },
      deleted: false,
    }
  }
}
