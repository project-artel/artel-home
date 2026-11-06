import type { ReactNode } from 'react'
import type { TestCase } from '../../testCases/testCaseTypes'
import { useRunCases } from '../../testScenarios/useRunCases'
import { CaseRefsContext } from './caseRefs'

/** [gameBuildId] 버전의 TC 를 읽어 아래 본문 · 입력칸에 준다. */
export function CaseRefsProvider({
  projectId,
  gameBuildId,
  scope,
  onOpen,
  children,
}: {
  projectId: string
  gameBuildId: string | null
  scope: string
  onOpen?: (testCase: TestCase) => void
  children: ReactNode
}) {
  const cases = useRunCases(projectId, gameBuildId)
  return <CaseRefsContext.Provider value={{ projectId, gameBuildId, cases, scope, onOpen }}>{children}</CaseRefsContext.Provider>
}
