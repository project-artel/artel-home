import { ProjectApiError } from '../projects/projectApi'
import type { ContentMapView } from './contentMapTypes'

/*
 * content map 에서 test case 를 만드는 버튼의 판정.
 *
 * 컴포넌트가 아니라 이 파일에 두는 이유는 버튼의 활성 여부, 비활성 이유, 오류 문구가 모두 같은
 * 판정을 읽어야 해서다. 순수 함수라 렌더 없이 테스트한다.
 */

/**
 * 버튼을 못 누르는 이유. 네 갈래는 서로 다른 사실이다.
 *
 * - `editorBuild`: 고른 build 가 editor 다. editor 는 게임 버전이 아니라서 TC 를 따라가게 하지 않는다
 *   (ARTEL-1036). 지도가 있어도 막는다.
 * - `notUploaded`: `contentMap` 이 없다. 이 빌드에 문서가 한 번도 등록되지 않았다.
 * - `noDocuments`: `contentMap` 행은 있지만 올라온 문서가 하나도 없다(관측만으로 선 지도 등).
 * - `notIngested`: 문서는 올라왔는데 아직 적재되지 않았다.
 */
export type GenerationBlock = 'editorBuild' | 'notUploaded' | 'noDocuments' | 'notIngested'

/**
 * `ingestedAt === null` 만으로는 "문서가 올라왔지만 안 읽힘" 과 "문서가 없음" 을 가르지 못한다.
 * 서버는 적재되지 않은 문서를 `pendingDocuments` 에 싣고(등록됐지만 아직 앉지 못한 문서),
 * `ingestedAt` 은 앉은 문서에서 유도하므로, 둘 다 비었으면 문서가 하나도 없다.
 */
export function describeGenerationBlock(view: ContentMapView, isEditor = false): GenerationBlock | null {
  if (isEditor) return 'editorBuild'
  if (view.contentMap === null) return 'notUploaded'
  if (view.contentMap.ingestedAt !== null) return null
  return view.pendingDocuments.length === 0 ? 'noDocuments' : 'notIngested'
}

/** 서버가 주는 실패 중 문구가 갈리는 셋과 나머지. */
export type GenerationFailure = 'editorBuild' | 'notIngested' | 'buildMissing' | 'other'

/** editor build 를 거절할 때 서버가 싣는 code. 409 의 다른 이유와 이것으로 가른다. */
export const EDITOR_BUILD_CODE = 'EDITOR_BUILD_HAS_NO_TEST_CASES'

export function classifyGenerationFailure(error: unknown): GenerationFailure {
  if (error instanceof ProjectApiError) {
    if (error.status === 409) return error.code === EDITOR_BUILD_CODE ? 'editorBuild' : 'notIngested'
    if (error.status === 404) return 'buildMissing'
  }
  return 'other'
}

/** 폴더를 연 test case 라이브러리의 주소. 폴더를 모르면 폴더 없이 라이브러리만 연다. */
export function testCaseLibraryPath(projectId: string, folderId: string | null): string {
  const base = `/projects/${encodeURIComponent(projectId)}/test-cases`
  return folderId === null ? base : `${base}?folder=${encodeURIComponent(folderId)}`
}

/** 막힌 이유가 있거나 이미 생성 중이면 누를 수 없다. */
export function isGenerateDisabled(block: GenerationBlock | null, isRunning: boolean): boolean {
  return block !== null || isRunning
}
