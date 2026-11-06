import { detectLocale } from '../i18n/locale'
import { messages } from '../i18n/messages'

export type TasksCopy = (typeof messages)['en']['projectAgent']['tasks']

/**
 * 대화창 밖(tool handler, catalog 의 `summarize`)에서 쓰는 문구. React context 가 없으므로 저장된
 * locale 을 직접 읽는다. 저장소를 못 읽는 환경(테스트 등)에서는 영어로 돌아간다.
 */
export function tasksCopy(): TasksCopy {
  try {
    return messages[detectLocale()].projectAgent.tasks
  } catch {
    return messages.en.projectAgent.tasks
  }
}
