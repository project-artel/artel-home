import { InlineError } from '../design-system/primitives/Feedback'
import { Button } from '../design-system/primitives/Button'
import { useEffect, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n/useI18n'
import { useProjectChange } from '../live/useProjectChange'
import { evaluationCopy } from '../qa/evaluation/evaluationCopy'
import { TestCaseIdentifiersContext } from './testCaseIdentifiers'
import { listTestCaseIdentifiers } from './testCaseIdentifiersApi'

const EMPTY = new Map<string, string>()
type Result = { projectId: string; numbers: ReadonlyMap<string, string>; failed: boolean }

export function TestCaseIdentifiersProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const { locale } = useI18n()
  const copy = evaluationCopy[locale === 'ko' ? 'ko' : 'en']
  const [result, setResult] = useState<Result | null>(null)
  const [revision, setRevision] = useState(0)
  useProjectChange(projectId, ['TEST_CASES'], () => setRevision(value => value + 1))
  useEffect(() => {
    const controller = new AbortController()
    void listTestCaseIdentifiers(projectId, controller.signal).then(numbers => {
      if (!controller.signal.aborted) setResult({ projectId, numbers, failed: false })
    }).catch(() => {
      if (!controller.signal.aborted) setResult(previous => ({ projectId, numbers: previous?.projectId === projectId ? previous.numbers : EMPTY, failed: true }))
    })
    return () => controller.abort()
  }, [projectId, revision])
  const current = result?.projectId === projectId ? result : null
  return <TestCaseIdentifiersContext.Provider value={{ projectId, numbers: current?.numbers ?? EMPTY }}>
    {children}
    {current?.failed && <InlineError className="tc-identifiers-status">
      <span className="tc-id">Test Case</span> {copy.error}
      <Button variant="secondary" size="compact" type="button" onClick={() => setRevision(value => value + 1)}>{copy.retry}</Button>
    </InlineError>}
  </TestCaseIdentifiersContext.Provider>
}
