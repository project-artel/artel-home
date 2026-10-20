import type { ActionSpec, FieldSpec } from '../registry/types'
import { tasksCopy } from '../tasksCopy'

/*
 * 화면 지도(content map) 페이지의 field 와 action 정의. catalog 와 페이지의 binding 이 같은 객체를
 * 가리키므로, 모델이 보는 설명과 페이지가 실제로 하는 일이 갈라질 수 없다.
 */

export const CONTENT_MAP_BUILD_FIELD: FieldSpec = {
  name: 'contentMap.build',
  page: 'contentMap',
  description:
    'The game build whose screen map is shown. Value is a build id; options lists every build with its label. Changing it switches the whole page, including which build the scan actions act on.',
}

export const CONTENT_MAP_SCAN_ACTION: ActionSpec = {
  id: 'contentMap.scan',
  page: 'contentMap',
  risk: 'auto',
  description:
    'Ask the connected running game to scan its screens for the selected build, which builds the screen map. Returns at once with {queued: true, buildId}: the scan takes minutes. Follow it with watch_job {kind: "content_map_scan", id: buildId}. Blocked when no game is connected or a scan was just requested.',
  args: { type: 'object', properties: {} },
  summarize: () => tasksCopy().summaries.scan,
}

export const CONTENT_MAP_SCAN_AND_GENERATE_ACTION: ActionSpec = {
  id: 'contentMap.scanAndGenerateTestCases',
  page: 'contentMap',
  risk: 'auto',
  description:
    'Scan like contentMap.scan and, once the scan documents are read, also generate test cases (TCs) for the build. Returns at once with {queued: true, buildId}; watch it with watch_job {kind: "content_map_scan", id: buildId}. Fails with the server message when the build already has TCs; use contentMap.overwriteTestCases in that case if the user wants them replaced.',
  args: { type: 'object', properties: {} },
  summarize: () => tasksCopy().summaries.scanAndGenerateTestCases,
}

export const CONTENT_MAP_OVERWRITE_ACTION: ActionSpec = {
  id: 'contentMap.overwriteTestCases',
  page: 'contentMap',
  risk: 'approve',
  description:
    'Regenerate the test cases of the selected build from its already-loaded screen map and replace the ones generated earlier. Destructive for hand-edited generated cases, so the user approves it. Runs synchronously and returns the counts {created, updated, deleted, broken, carriedOver}. Blocked until the build has an ingested screen map.',
  args: { type: 'object', properties: {} },
  summarize: () => tasksCopy().summaries.overwriteTestCases,
}

export const CONTENT_MAP_FIELDS: FieldSpec[] = [CONTENT_MAP_BUILD_FIELD]
export const CONTENT_MAP_ACTIONS: ActionSpec[] = [
  CONTENT_MAP_SCAN_ACTION,
  CONTENT_MAP_SCAN_AND_GENERATE_ACTION,
  CONTENT_MAP_OVERWRITE_ACTION,
]
