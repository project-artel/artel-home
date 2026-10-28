import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import { useProjectChange } from '../../live/useProjectChange'
import * as api from './evaluationApi'
import { evaluationCopy } from './evaluationCopy'
import { ProjectApiError } from '../../projects/projectApi'
import './evaluation.css'

/**
 * 답을 기다리는 QA 질문. 작업공간 어느 화면이든 본문 위에 뜬다.
 * 알림 구독은 여기서 고르지 않는다 — QA run 을 시작할 때 그 프로젝트를 자동 구독한다(`questionNotificationOptIn.ts`).
 */
export function OperatorQuestions({ projectId }: { projectId: string }) {
  const { locale } = useI18n()
  const copy = evaluationCopy[locale === 'ko' ? 'ko' : 'en']
  const [questions, setQuestions] = useState<api.Question[]>([])
  const [message, setMessage] = useState('')
  const load = useCallback(() => {
    void api.questions(projectId).then(result => { setQuestions(result); setMessage('') }).catch(() => setMessage(copy.error))
  }, [projectId, copy.error])
  useEffect(() => {
    let active = true
    void api.questions(projectId).then(result => { if (active) setQuestions(result) }).catch(() => { if (active) setMessage(copy.error) })
    return () => { active = false }
  }, [projectId, copy.error])
  useProjectChange(projectId, ['QA_QUESTIONS', 'QA_RUNS'], load)
  useEffect(() => { const timer = window.setInterval(load, 10000); return () => clearInterval(timer) }, [load])
  const waiting = questions.filter(question => question.state === 'WAITING')
  if (waiting.length === 0 && !message) return null
  return <section className="qe-questions" aria-label={copy.questions}>
    {message && <p className="qe-status" role="status">{message}</p>}
    {waiting.map(question => <QuestionForm key={question.id} question={question} projectId={projectId} reload={load} />)}
  </section>
}

function QuestionForm({ question, projectId, reload }: { question: api.Question; projectId: string; reload: () => void }) {
  const { locale } = useI18n()
  const copy = evaluationCopy[locale === 'ko' ? 'ko' : 'en']
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const runLink = question.qaRunId ? `/projects/${encodeURIComponent(projectId)}/qa-history/${encodeURIComponent(question.qaRunId)}?scenario=${encodeURIComponent(question.qaTryId)}` : null
  return <form className="qe-question" onSubmit={event => {
    event.preventDefault(); setBusy(true)
    void api.answer(projectId, question.id, answer).then(reload).catch(error => { setError(error instanceof ProjectApiError && error.status === 409 ? copy.answered : copy.error); reload() }).finally(() => setBusy(false))
  }}>
    <div className="qe-question-head">
      <h3 className="qe-kicker">{copy.questions}</h3>
      {runLink
        ? <Link className="qe-chip" to={runLink}>{copy.qa} <b>#{question.qaTryId}</b></Link>
        : <span className="qe-chip">{copy.qa} <b>#{question.qaTryId}</b></span>}
      <span className="qe-status">{copy.waiting}</span>
    </div>
    <p className="qe-question-text">{question.question}</p>
    <label className="qe-field">{copy.answerLabel}<textarea className="field-input field-input--multiline" required maxLength={4000} value={answer} onChange={event => setAnswer(event.target.value)} /></label>
    <div className="qe-form-foot">
      <span className="qe-hint">{copy.first}</span>
      <button className="button button--primary button--compact" type="submit" disabled={busy || !answer.trim()}>{copy.answer}</button>
    </div>
    {error && <p className="qe-status" role="alert">{error}</p>}
  </form>
}
