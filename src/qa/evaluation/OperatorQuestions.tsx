import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { useProjectChange } from '../../live/useProjectChange'
import * as api from './evaluationApi'
import { evaluationCopy } from './evaluationCopy'
import { ProjectApiError } from '../../projects/projectApi'
import './evaluation.css'

export function OperatorQuestions({ projectId }: { projectId: string }) {
  const { locale } = useI18n()
  const copy = evaluationCopy[locale === 'ko' ? 'ko' : 'en']
  const [questions, setQuestions] = useState<api.Question[]>([])
  const [subscribed, setSubscribed] = useState(false)
  const [message, setMessage] = useState('')
  const load = useCallback(() => {
    void api.questions(projectId).then(setQuestions).catch(() => setMessage(copy.error))
  }, [projectId, copy.error])
  useEffect(() => {
    let active = true
    void api.questions(projectId).then(result => { if (active) setQuestions(result) }).catch(() => { if (active) setMessage(copy.error) })
    void api.subscription(projectId).then(value => { if (active) setSubscribed(value) }).catch(() => { if (active) setMessage(copy.error) })
    return () => { active = false }
  }, [projectId, copy.error])
  useProjectChange(projectId, ['QA_QUESTIONS', 'QA_RUNS'], load)
  useEffect(() => { const timer = window.setInterval(load, 10000); return () => clearInterval(timer) }, [load])
  return <section className="qe-panel" aria-label={copy.questions}>
    <label><span><input type="checkbox" checked={subscribed} onChange={event => {
      const checked = event.target.checked
      const permission = checked && 'Notification' in window ? Notification.requestPermission() : Promise.resolve('denied')
      void permission.then(value => {
        if (checked && value !== 'granted') setMessage(copy.denied)
        return api.subscription(projectId, checked)
      }).then(setSubscribed).catch(() => setMessage(copy.error))
    }} /> {copy.subscribe}</span></label>
    {message && <p role="status">{message}</p>}
    {questions.filter(question => question.state === 'WAITING').map(question => <QuestionForm key={question.id} question={question} projectId={projectId} reload={load} />)}
  </section>
}

function QuestionForm({ question, projectId, reload }: { question: api.Question; projectId: string; reload: () => void }) {
  const { locale } = useI18n()
  const copy = evaluationCopy[locale === 'ko' ? 'ko' : 'en']
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <form className="qe-question" onSubmit={event => {
    event.preventDefault(); setBusy(true)
    void api.answer(projectId, question.id, answer).then(reload).catch(error => { setError(error instanceof ProjectApiError && error.status === 409 ? copy.answered : copy.error); reload() }).finally(() => setBusy(false))
  }}>
    <h3>{copy.questions} · QA #{question.qaTryId}</h3><p>{copy.waiting}</p><p>{question.question}</p>
    <label>{copy.answer}<textarea required maxLength={4000} value={answer} onChange={event => setAnswer(event.target.value)} /></label>
    <p className="qe-note">{copy.first}</p>
    <button className="button button--primary" type="submit" disabled={busy || !answer.trim()}>{copy.answer}</button>
    {error && <p role="alert">{error}</p>}
  </form>
}
