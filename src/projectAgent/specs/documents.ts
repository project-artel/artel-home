import type { ActionSpec, FieldSpec } from '../registry/types'

/* 기획 문서 페이지의 action 정의. 문구는 모델이 읽는다. */

export const DOCUMENTS_OPEN_UPLOAD_ACTION: ActionSpec = {
  id: 'documents.openUpload',
  page: 'documents',
  risk: 'auto',
  description:
    'Point the user at the upload control of the planning documents page and focus it. The agent cannot choose a file itself, so this does not upload anything: it returns {needsUser: ...} and you must tell the user to pick the file in the dialog. Use it when the user wants to upload a new document version.',
  args: { type: 'object', properties: {} },
  summarize: () => 'Show the document upload control',
}

export const DOCUMENTS_RETRY_UPLOAD_ACTION: ActionSpec = {
  id: 'documents.retryUpload',
  page: 'documents',
  risk: 'auto',
  description:
    'Retry the last document upload that failed, with the same file the user already picked (the Retry button next to the upload error). Blocked when no upload has failed. Returns {version} of the uploaded document.',
  args: { type: 'object', properties: {} },
  summarize: () => 'Retry the failed document upload',
}

export const DOCUMENTS_DELETE_ACTION: ActionSpec = {
  id: 'documents.delete',
  page: 'documents',
  risk: 'approve',
  description:
    'Permanently delete one uploaded planning document version, as the page does after its delete confirmation. Use it when the user asks to remove a document, for example one whose extraction failed. Content map scans and generated test cases built from it are not undone. Returns {deleted: true, documentId}.',
  args: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Id of the document to delete, as listed on the page.' },
    },
    required: ['documentId'],
  },
  summarize: (args) => `Delete the document ${typeof args.documentId === 'string' ? args.documentId : ''}`.trim(),
}

export const DOCUMENTS_ACTIONS: ActionSpec[] = [
  DOCUMENTS_OPEN_UPLOAD_ACTION,
  DOCUMENTS_RETRY_UPLOAD_ACTION,
  DOCUMENTS_DELETE_ACTION,
]
export const DOCUMENTS_FIELDS: FieldSpec[] = []
