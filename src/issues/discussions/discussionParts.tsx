import { useI18n } from '../../i18n/useI18n'
import { DiscussionIcon } from './discussionIcons'
import type { Discussion, Person, Purpose } from './discussionTypes'

/** 이름 첫 글자 동그라미. 같은 사람은 늘 같은 색이 되도록 id 로 색을 고른다. */
export function Avatar({ person, size = 'md' }: { person: Pick<Person, 'id' | 'displayName'>; size?: 'sm' | 'md' }) {
  const tone = Number(BigInt(person.id) % 5n)
  return (
    <span aria-hidden="true" className={`dc-avatar dc-avatar--${size} dc-avatar--tone${tone}`}>
      {person.displayName.slice(0, 1)}
    </span>
  )
}

/** 글의 목적. 확인 요청은 답을 기다리는 글이라 눈에 띄게, 결정은 보라로 따로 둔다. */
export function PurposeTag({ purpose }: { purpose: Purpose }) {
  const { t } = useI18n()
  return <span className={`dc-purpose dc-purpose--${purpose.toLowerCase()}`}>{t.discussions.purposes[purpose]}</span>
}

/** 논의 중 · 논의 완료. 점과 글자를 같이 둔다 — 색만으로 상태를 말하지 않는다. */
export function StateTag({ state }: { state: Discussion['state'] }) {
  const { t } = useI18n()
  return (
    <span className={`dc-state dc-state--${state.toLowerCase()}`}>
      {state === 'CLOSED' ? <DiscussionIcon name="check" size={13} /> : <span aria-hidden="true" className="dc-state-dot" />}
      {state === 'OPEN' ? t.discussions.open : state === 'DRAFT' ? t.discussions.draft : t.discussions.closed}
    </span>
  )
}

export function PinnedMark() {
  const { t } = useI18n()
  return (
    <span className="dc-pinned" title={t.discussions.pinned}>
      <DiscussionIcon name="pin" size={13} />
      {t.discussions.pinned}
    </span>
  )
}
