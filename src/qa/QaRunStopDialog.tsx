import { Link } from 'react-router-dom'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import type { QaStopNotice } from './qaStop'

/**
 * 모델 API 오류로 QA 가 멈췄을 때 런 화면 위에 띄우는 창(ARTEL-1372, 시안의 안 2). 뒤의 런 화면은 흐려지고,
 * 닫으면 그대로 로그를 볼 수 있다. 공용 [Dialog] 를 그대로 쓴다 — 키보드 · 초점 규칙이 그 안에 있다.
 *
 * 제공사 이름과 제공사가 보낸 원문은 보이지 않는다. 원문에는 회사 이름이 들어 있고, 사용자에게 필요한 것은 무엇이
 * 모자란지다. 원문은 Raw 탭의 오류 프레임에 그대로 남는다.
 */
export function QaRunStopDialog({
  notice,
  discarded,
  relaunchTo,
  onClose,
}: {
  notice: QaStopNotice
  /** 판정 없이 끝나 히스토리에 남지 않는 런인가. 설명 한 줄이 갈린다. */
  discarded: boolean
  /** 같은 테스트 런을 고른 채 QA 실행 화면으로 가는 주소. */
  relaunchTo: string
  onClose: () => void
}) {
  const { t } = useI18n()
  const copy = t.qa.run.stop

  return (
    <Dialog labelledBy="qa-stop-title" onClose={onClose} title={copy.dialogTitle}>
      <div className="qa-stop">
        <QaStopIllustration />
        <p className="qa-stop-cause">{copy.cause(notice.code)}</p>
        <p className="dialog-copy">
          {copy.notJudged} {discarded ? copy.discarded : copy.kept}
        </p>
        <div className="dialog-actions qa-stop-actions">
          <Link className="button button--primary" to={relaunchTo}>{copy.retryOtherModel}</Link>
          <Link className="button button--secondary" to="/account">{copy.llmKeySettings}</Link>
          <button className="button button--secondary" onClick={onClose} type="button">{copy.closeAndSeeLogs}</button>
        </div>
      </div>
    </Dialog>
  )
}

/**
 * 멈춘 실행을 말하는 그림. 아이소메트릭 큐브 하나가 한 모서리에서 조각이 떨어져 나간 모양이다 — Artel 로고의
 * 큐브와 같은 결을 쓰되 로고를 그대로 쓰지는 않는다. 색은 모두 테마 토큰이라 밝은 · 어두운 테마를 따라간다.
 */
function QaStopIllustration() {
  return (
    <svg aria-hidden="true" className="qa-stop-art" viewBox="0 0 160 132" width="160" height="132">
      <ellipse className="qa-stop-art-shadow" cx="80" cy="118" rx="46" ry="8" />
      {/* 큐브 몸체: 윗면 · 왼면 · 오른면 */}
      <path className="qa-stop-art-top" d="M80 18 L124 42 L80 66 L36 42 Z" />
      <path className="qa-stop-art-left" d="M36 42 L80 66 L80 112 L36 88 Z" />
      <path className="qa-stop-art-right" d="M80 66 L124 42 L124 70 L104 81 L104 101 L80 112 Z" />
      {/* 떨어져 나간 조각이 남긴 자리 */}
      <path className="qa-stop-art-hole" d="M104 81 L124 70 L124 88 L104 101 Z" />
      {/* 떨어져 나가는 조각 */}
      <g className="qa-stop-art-chip">
        <path className="qa-stop-art-chip-top" d="M128 84 L144 75 L152 80 L136 89 Z" />
        <path className="qa-stop-art-chip-side" d="M128 84 L136 89 L136 104 L128 99 Z" />
        <path className="qa-stop-art-chip-face" d="M136 89 L152 80 L152 95 L136 104 Z" />
      </g>
      {/* 끊긴 신호 */}
      <path className="qa-stop-art-spark" d="M58 6 L62 14 M70 2 L70 10 M82 6 L78 14" />
    </svg>
  )
}
