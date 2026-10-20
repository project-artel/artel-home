import type { ActionSpec, FieldSpec } from '../registry/types'

/* 테스트 케이스 라이브러리 페이지의 field 와 action 정의. 문구는 모델이 읽는다. */

export const TEST_CASES_SEARCH_FIELD: FieldSpec = {
  name: 'testCases.search',
  page: 'testCases',
  description: 'Free-text search over the test case list (a string; empty string clears it). Narrows the rows shown, not the data.',
}

export const TEST_CASES_VERSION_FIELD: FieldSpec = {
  name: 'testCases.version',
  page: 'testCases',
  description:
    'The game build version whose test cases the library shows. Value is a game build id; options lists each version with its name. Only offered when the project has versions.',
}

export const TEST_CASES_STATUS_FIELD: FieldSpec = {
  name: 'testCases.status',
  page: 'testCases',
  description:
    'Verification status filter of the list. Value is ALL, VERIFIED, FAILED, REGRESSION, DRAFT or BROKEN; options lists them.',
}

export const TEST_CASES_OPEN_GENERATE_ACTION: ActionSpec = {
  id: 'testCases.openGenerateDialog',
  page: 'testCases',
  risk: 'auto',
  description:
    'Open the "generate from content map" dialog, where the user picks a build. Use it when the user wants to look at which builds can generate test cases or to choose themselves. To generate directly, use testCases.generate or testCases.overwriteGenerated instead.',
  args: { type: 'object', properties: {} },
  summarize: () => 'Open the test case generation dialog',
}

export const TEST_CASES_GENERATE_ACTION: ActionSpec = {
  id: 'testCases.generate',
  page: 'testCases',
  risk: 'auto',
  description:
    'Generate test cases from the content map of one game build that has none yet, as the generate dialog does. Fails when the build has no read content map or already has generated test cases (then use testCases.overwriteGenerated). Whether manual test cases of the previous version are carried over follows the user\'s saved choice in the dialog. Returns the counts {created, carriedOver, ...}.',
  args: {
    type: 'object',
    properties: {
      gameBuildId: { type: 'string', description: 'Id of the game build to generate for. Take it from the testCases.version options.' },
    },
    required: ['gameBuildId'],
  },
  summarize: (args) => `Generate test cases for build ${typeof args.gameBuildId === 'string' ? args.gameBuildId : ''}`.trim(),
}

export const TEST_CASES_OVERWRITE_ACTION: ActionSpec = {
  id: 'testCases.overwriteGenerated',
  page: 'testCases',
  risk: 'approve',
  description:
    'Regenerate the test cases of a build that already has generated ones, overwriting them, as the overwrite confirmation of the generate dialog does. Verification results of cases that disappear are lost and edits to generated cases are replaced. Fails when the build has none generated yet (use testCases.generate). Returns the counts {created, updated, deleted, ...}.',
  args: {
    type: 'object',
    properties: {
      gameBuildId: { type: 'string', description: 'Id of the game build whose generated test cases are overwritten.' },
    },
    required: ['gameBuildId'],
  },
  summarize: (args) => `Overwrite the generated test cases of build ${typeof args.gameBuildId === 'string' ? args.gameBuildId : ''}`.trim(),
}

export const TEST_CASES_OPEN_NEW_ACTION: ActionSpec = {
  id: 'testCases.openNewCase',
  page: 'testCases',
  risk: 'auto',
  description:
    'Open the editor for a new, empty test case (the "new test case" button). The agent cannot fill the editor, so tell the user to write the case there. Use it when the user wants to add a test case by hand.',
  args: { type: 'object', properties: {} },
  summarize: () => 'Open the new test case editor',
}

export const TEST_CASES_OPEN_ACTION: ActionSpec = {
  id: 'testCases.open',
  page: 'testCases',
  risk: 'auto',
  description: 'Open the detail sheet of one test case so the user can read or edit it. Returns {opened: true, step}.',
  args: {
    type: 'object',
    properties: {
      testCaseId: { type: 'string', description: 'Id of the test case to open.' },
    },
    required: ['testCaseId'],
  },
  summarize: (args) => `Open test case ${typeof args.testCaseId === 'string' ? args.testCaseId : ''}`.trim(),
}

export const TEST_CASES_DELETE_ACTION: ActionSpec = {
  id: 'testCases.delete',
  page: 'testCases',
  risk: 'approve',
  description:
    'Permanently delete test cases, as the delete confirmations of the library do. Up to 500 ids per call. The cases leave every version and folder they belong to and cannot be restored. Returns {deleted: number}.',
  args: {
    type: 'object',
    properties: {
      testCaseIds: { type: 'array', items: { type: 'string' }, description: 'Ids of the test cases to delete.' },
    },
    required: ['testCaseIds'],
  },
  summarize: (args) => {
    const count = Array.isArray(args.testCaseIds) ? args.testCaseIds.length : 0
    return `Delete ${count} test case${count === 1 ? '' : 's'}`
  },
}

export const TEST_CASES_FIELDS: FieldSpec[] = [TEST_CASES_SEARCH_FIELD, TEST_CASES_VERSION_FIELD, TEST_CASES_STATUS_FIELD]
export const TEST_CASES_ACTIONS: ActionSpec[] = [
  TEST_CASES_OPEN_GENERATE_ACTION,
  TEST_CASES_GENERATE_ACTION,
  TEST_CASES_OVERWRITE_ACTION,
  TEST_CASES_OPEN_NEW_ACTION,
  TEST_CASES_OPEN_ACTION,
  TEST_CASES_DELETE_ACTION,
]
