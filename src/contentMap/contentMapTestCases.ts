import { ProjectApiError } from '../projects/projectApi'
import type { ContentMapView } from './contentMapTypes'

/*
 * content map 에서 test case 를 만드는 버튼의 판정.
 *
 * 컴포넌트가 아니라 이 파일에 두는 이유는 버튼의 활성 여부, 비활성 이유, 오류 문구가 모두 같은
 * 판정을 읽어야 해서다. 순수 함수라 렌더 없이 테스트한다.
 */

/** 버튼을 못 누르는 이유. `ContentMapBody` 가 가르는 빈 상태 두 갈래와 같은 조건이다. */
export type GenerationBlock = 'notUploaded' | 'notIngested'

export function describeGenerationBlock(view: ContentMapView): GenerationBlock | null {
  if (view.contentMap === null) return 'notUploaded'
  if (view.contentMap.ingestedAt === null) return 'notIngested'
  return null
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
