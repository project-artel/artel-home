import { createContext, useContext } from 'react'
import type { TestCase } from '../../testCases/testCaseTypes'

/**
 * 글 본문의 `[[tc:id]]` 가 가리키는 TC(ARTEL-1114). 글의 빌드 버전에 든 TC 를 읽어 둔 것이다 — 그래서 같은 TC 라도
 * 글 버전의 판정으로 보인다. [scope] 는 TC 고르기 창 위에 적는 범위 안내다. 없으면 TC 도구가 보이지 않는다.
 */
export type CaseRefs = {
  projectId: string
  cases: ReadonlyMap<string, TestCase>
  scope: string
  onOpen?: (testCase: TestCase) => void
}

export const CaseRefsContext = createContext<CaseRefs | null>(null)

export const useCaseRefs = () => useContext(CaseRefsContext)

export const caseRef = (caseId: string) => `[[tc:${caseId}]]`
