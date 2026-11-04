import { useCallback, useEffect, useRef, useState } from 'react'
import { useProjectChange } from '../../live/useProjectChange'
import { questions, type Question } from './evaluationApi'

export function useOperatorQuestions(projectId: string) {
  const [state, setState] = useState<{ projectId: string; questions: Question[]; ready: boolean; failed: boolean }>({ projectId, questions: [], ready: false, failed: false })
  const generation = useRef(0)
  const invalidate = useCallback(() => { ++generation.current }, [])
  const load = useCallback(async () => {
    const requestGeneration = ++generation.current
    try {
      const result = await questions(projectId)
      if (requestGeneration === generation.current) setState({ projectId, questions: result, ready: true, failed: false })
    } catch {
      if (requestGeneration === generation.current) setState(current => ({ projectId, questions: current.projectId === projectId ? current.questions : [], ready: false, failed: true }))
    }
  }, [projectId])
  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => { if (active) void load() })
    const timer = window.setInterval(() => void load(), 10000)
    return () => { active = false; invalidate(); clearInterval(timer) }
  }, [load, invalidate])
  useProjectChange(projectId, ['QA_QUESTIONS', 'QA_RUNS'], () => void load())
  return { questions: state.projectId === projectId ? state.questions : [], ready: state.projectId === projectId && state.ready, failed: state.projectId === projectId && state.failed, reload: load }
}
