import { useI18n } from '../../i18n/useI18n'

/** 앞뒤로 보일 쪽 수. 그 밖은 `…` 로 줄인다. */
const SPREAD = 2

/** 쪽 번호 넘기기. 쪽이 하나뿐이면 그리지 않는다. */
export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}) {
  const { t } = useI18n()
  const last = Math.max(1, Math.ceil(total / pageSize))
  if (last <= 1) return null
  const pages: (number | 'gap')[] = []
  for (let n = 1; n <= last; n++) {
    if (n === 1 || n === last || Math.abs(n - page) <= SPREAD) pages.push(n)
    else if (pages[pages.length - 1] !== 'gap') pages.push('gap')
  }
  return (
    <nav aria-label={t.discussions.pagination} className="dc-pagination">
      <button
        aria-label={t.discussions.previousPage}
        className="dc-page"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        type="button"
      >
        ‹
      </button>
      {pages.map((entry, index) =>
        entry === 'gap' ? (
          <span aria-hidden="true" className="dc-page-gap" key={`gap-${index}`}>
            …
          </span>
        ) : (
          <button
            aria-current={entry === page ? 'page' : undefined}
            className="dc-page"
            key={entry}
            onClick={() => onChange(entry)}
            type="button"
          >
            {entry}
          </button>
        ),
      )}
      <button
        aria-label={t.discussions.nextPage}
        className="dc-page"
        disabled={page >= last}
        onClick={() => onChange(page + 1)}
        type="button"
      >
        ›
      </button>
    </nav>
  )
}
