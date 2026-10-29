import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import { projectEvents } from '../../live/projectEvents'
import { evaluationCopy } from './evaluationCopy'
import { questions, subscribedProjects } from './evaluationApi'

export function QuestionNotifications({ userId }: { userId: string }) {
  const { locale } = useI18n()
  const navigate = useNavigate()
  const title = evaluationCopy[locale === 'ko' ? 'ko' : 'en'].notification
  useEffect(() => {
    const controller = new AbortController()
    const listeners = new Map<string, () => void>()
    const seenKey = `artel.qa-questions.v1.${userId}`
    const refresh = async (project: string) => {
      if (!('Notification' in window) || Notification.permission !== 'granted') return
      try {
        const pending = await questions(project, controller.signal)
        const show = () => {
          if (controller.signal.aborted) return
          let seen: string[] = []
          try { const stored: unknown = JSON.parse(localStorage.getItem(seenKey) ?? '[]'); if (Array.isArray(stored)) seen = stored.filter((value): value is string => typeof value === 'string') } catch { /* 저장소가 없으면 Notification tag로 중복 표시를 합친다. */ }
          for (const question of pending) {
            if (question.state !== 'WAITING' || seen.includes(question.id)) continue
            const notice = new Notification(title, { body: question.question, tag: `qa-question-${question.id}` })
            seen.push(question.id)
            notice.onclick = () => { window.focus(); navigate(`/projects/${encodeURIComponent(project)}/qa-history${question.qaRunId ? '/' + encodeURIComponent(question.qaRunId) : ''}`); notice.close() }
          }
          try { localStorage.setItem(seenKey, JSON.stringify(seen.slice(-200))) } catch { /* 저장소 접근이 막혀도 알림은 전달한다. */ }
        }
        if (navigator.locks) await navigator.locks.request(seenKey, show)
        else show()
      } catch { /* SSE 재연결과 주기 갱신에서 재시도한다. */ }
    }
    const sync = async () => {
      try {
        const projects = await subscribedProjects(controller.signal)
        if (controller.signal.aborted) return
        for (const [id, unsubscribe] of listeners) if (!projects.includes(id)) { unsubscribe(); listeners.delete(id) }
        for (const id of projects) {
          if (!listeners.has(id)) listeners.set(id, projectEvents.subscribe(id, { topics: ['QA_QUESTIONS'], onChange: () => void refresh(id) }))
          void refresh(id)
        }
      } catch { /* 다음 갱신에서 다시 구독한다. */ }
    }
    const changed = () => void sync()
    void sync()
    const timer = window.setInterval(changed, 30000)
    window.addEventListener('artel:qa-question-subscriptions', changed)
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener('artel:qa-question-subscriptions', changed); listeners.forEach(unsubscribe => unsubscribe()) }
  }, [navigate, title, userId])
  return null
}
