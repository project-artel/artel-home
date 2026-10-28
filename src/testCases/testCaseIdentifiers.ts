import { createContext, useContext, useCallback } from 'react'
import { formatTestCaseId } from './testCaseId'

export type TestCaseIdentifiers = { projectId: string; numbers: ReadonlyMap<string, string> }
const EMPTY: TestCaseIdentifiers = { projectId: '', numbers: new Map() }
export const TestCaseIdentifiersContext = createContext<TestCaseIdentifiers>(EMPTY)

export function useTestCaseIdentifiers() { return useContext(TestCaseIdentifiersContext) }
export function useTestCaseLabel() {
  const { numbers } = useTestCaseIdentifiers()
  return useCallback((caseId: string | number) => {
    const number = numbers.get(String(caseId))
    return number === undefined ? 'TC-…' : formatTestCaseId(number)
  }, [numbers])
}
