import { useId, type ReactNode } from 'react'

/**
 * 좌우로 밀리는 켜기 · 끄기 토글. 글은 왼쪽, 손잡이는 오른쪽 끝이다.
 *
 * 속은 `role="switch"` 인 checkbox 라 키보드(Space)와 스크린 리더가 그대로 쓴다. 투명한 checkbox 를 손잡이 위에
 * 겹쳐 두어 손잡이를 눌러도, 글을 눌러도 바뀐다. `hint`(보통 `InfoHint`)는 label 밖에 두어 눌러도 바뀌지 않는다.
 */
export function Switch({
  checked,
  children,
  disabled = false,
  hint,
  onChange,
}: {
  checked: boolean
  children: ReactNode
  disabled?: boolean
  hint?: ReactNode
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className={'switch' + (disabled ? ' is-disabled' : '')}>
      <label className="switch-text" htmlFor={id}>
        {children}
      </label>
      {hint}
      <span className="switch-control">
        <input
          checked={checked}
          className="switch-input"
          disabled={disabled}
          id={id}
          onChange={(event) => onChange(event.target.checked)}
          role="switch"
          type="checkbox"
        />
        <span aria-hidden="true" className="switch-track" />
      </span>
    </div>
  )
}
