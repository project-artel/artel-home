import { ProjectApiError } from '../projects/projectApi'
import type { ContentMapView } from './contentMapTypes'

/*
 * content map 에서 test case 를 만드는 버튼의 판정.
 *
 * 컴포넌트가 아니라 이 파일에 두는 이유는 버튼의 활성 여부, 비활성 이유, 오류 문구가 모두 같은
 * 판정을 읽어야 해서다. 순수 함수라 렌더 없이 테스트한다.
 */

/**
 * 버튼을 못 누르는 이유. 세 갈래는 서로 다른 사실이다.
 *
 * - `notUploaded`: `contentMap` 이 없다. 이 빌드에 문서가 한 번도 등록되지 않았다.
 * - `noDocuments`: `contentMap` 행은 있지만 올라온 문서가 하나도 없다(관측만으로 선 지도 등).
 * - `notIngested`: 문서는 올라왔는데 아직 적재되지 않았다.
 */
export type GenerationBlock = 'notUploaded' | 'noDocuments' | 'notIngested'

/**
 * `ingestedAt === null` 만으로는 "문서가 올라왔지만 안 읽힘" 과 "문서가 없음" 을 가르지 못한다.
 * 서버는 적재되지 않은 문서를 `pendingDocuments` 에 싣고(등록됐지만 아직 앉지 못한 문서),
 * `ingestedAt` 은 앉은 문서에서 유도하므로, 둘 다 비었으면 문서가 하나도 없다.
 */
export function describeGenerationBlock(view: ContentMapView): GenerationBlock | null {
  if (view.contentMap === null) return 'notUploaded'
  if (view.contentMap.ingestedAt !== null) return null
  return view.pendingDocuments.length === 0 ? 'noDocuments' : 'notIngested'
}

/** 서버가 주는 실패 중 문구가 갈리는 둘과 나머지. */
export type GenerationFailure = 'notIngested' | 'buildMissing' | 'other'

export function classifyGenerationFailure(error: unknown): GenerationFailure {
  if (error instanceof ProjectApiError) {
    if (error.status === 409) return 'notIngested'
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
