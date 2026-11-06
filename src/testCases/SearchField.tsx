import { useId, useRef } from 'react'

/**
 * 라이브러리의 검색 칸(ARTEL-1022). 돋보기와 지우기 단추를 직접 그린다 — 브라우저마다 `type="search"` 의
 * 지우기 단추 모양과 자리가 달랐다. 칸에서 Escape 를 누르면 지운다.
 */
export function SearchField({
  clearLabel,
  label,
  onChange,
  placeholder,
  value,
}: {
  clearLabel: string
  label: string
  onChange: (value: string) => void
  placeholder: string
  value: string
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement | null>(null)
  return (
    <div className="sfield-wrap">
      <label className="field-label" htmlFor={inputId}>{label}</label>
      <div className="sfield">
        <svg aria-hidden="true" className="sfield-icon" viewBox="0 0 16 16">
          <circle cx="7" cy="7" fill="none" r="4.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
        </svg>
        <input
          className="sfield-input"
          id={inputId}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && value.length > 0) {
              event.preventDefault()
              onChange('')
            }
          }}
          placeholder={placeholder}
          ref={inputRef}
          type="text"
          value={value}
        />
        {value.length > 0 && (
          <button
            aria-label={clearLabel}
            className="sfield-clear"
            onClick={() => {
              onChange('')
              inputRef.current?.focus()
            }}
            title={clearLabel}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16">
              <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
