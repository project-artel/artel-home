# Document data handling notice (ARTEL-973)

## Goal

Tell a user, before they upload a planning document, where the file is stored,
which outside service reads it, and what deleting it removes.

## Facts the notice states

Each line was checked against the code on 2026-10-13.

- Storage: the browser uploads the PDF to S3-compatible storage through a
  presigned URL. `ProjectDocumentService.createDownloadTicket` calls
  `requireAccessible`, so only project members get a download link.
- Summary: `DocumentKnowledgeExtractionService` hands a presigned GET URL to the
  agent-server `/extract` endpoint. The agent-server extracts the text with
  pdfplumber and sends it to the LLM in `DEFAULT_MODEL`. `build_chat_model`
  routes a `bedrock/` model to AWS Bedrock and every other model to OpenRouter.
- QA runs: the QA agent reads knowledge through `knowledge_read_tools.py`, so
  only what it reads reaches the LLM provider.
- Deletion: `ProjectDocumentService.delete` removes the S3 object and the
  `project_document` row, but `softDeleteForDocument` only marks the knowledge
  rows as deleted.

The notice names no S3 region. The default server config uses
`ap-northeast-2`, while the self-host compose file uses MinIO with `us-east-1`.

## Change

- `src/i18n/messages/projects.ts`: `documents.dataNotice` in English and Korean.
- `src/projects/DocumentPanel.tsx`: `DocumentDataNotice` below the upload area.
  The summary line is always visible; the five items sit in a `<details>`.
- `src/App.css`: `.document-data-notice`, using the same summary sizing as
  `.qa-log-payload` so the toggle keeps a 32px target.

## Out of scope

- Terms of service and a privacy policy. They are legal documents a person has
  to approve.
- Making knowledge deletion a hard delete. If that changes, the deletion line
  in the notice changes with it.

## Validation

- `npx tsc -b`, `npx eslint` on the changed files, `npm test` (526 pass).
- Screen capture of the documents screen in light and dark themes, with the API
  answered by Playwright route mocks.
