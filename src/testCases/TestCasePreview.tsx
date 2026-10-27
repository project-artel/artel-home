import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { getTestCase } from './testCaseApi'
import type { TestCase } from './testCaseTypes'

/** 호버에서는 TC 내용만 읽으며 판정 이력을 요청하지 않는다. */
export function TestCasePreview({ projectId, caseId, gameBuildId }: {
  projectId: string
  caseId: string
  gameBuildId: string | null
}) {
  const { t } = useI18n()
  const labels = t.scenarios.tcModal
  const [testCase, setTestCase] = useState<TestCase | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    getTestCase(projectId, caseId, controller.signal, { gameBuildId })
      .then((result) => { if (!controller.signal.aborted) setTestCase(result) })
      .catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [projectId, caseId, gameBuildId])

  if (failed) return <p className="tc-hover-note" role="status">{labels.error}</p>
  if (testCase === null) return <p className="tc-hover-note" role="status">{labels.loading}</p>

  return <>
    <p className="tc-hover-step">{testCase.step || '—'}</p>
    <dl className="tc-hover-fields">
      <div>
        <dt>{labels.precondition}</dt>
        <dd>{testCase.precondition || '—'}</dd>
      </div>
      <div>
        <dt>{labels.expected}</dt>
        <dd>{testCase.expectedValue || '—'}</dd>
      </div>
    </dl>
  </>
}
