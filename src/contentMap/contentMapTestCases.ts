import type { ContentMapView } from './contentMapTypes'

/*
 * content map 의 지도 상태 판정과, 거기서 케이스 라이브러리로 가는 주소.
 *
 * TC 생성 버튼은 케이스 라이브러리로 옮겼다(ARTEL-1041). 여기 남은 것은 화면 지도가 빈 자리를 설명할 때 쓰는 판정과
 * 스캔 뒤 라이브러리로 가는 링크뿐이다. 순수 함수라 렌더 없이 테스트한다.
 */

/**
 * 지도가 아직 그려질 수 없는 이유. 세 갈래는 서로 다른 사실이다.
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

/** 폴더를 연 test case 라이브러리의 주소. 폴더를 모르면 폴더 없이 라이브러리만 연다. */
export function testCaseLibraryPath(projectId: string, folderId: string | null): string {
  const base = `/projects/${encodeURIComponent(projectId)}/test-cases`
  return folderId === null ? base : `${base}?folder=${encodeURIComponent(folderId)}`
}
