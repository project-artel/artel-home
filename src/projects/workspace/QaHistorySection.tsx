import { useI18n } from '../../i18n/useI18n'
import { QaHistory } from '../../qa/history/QaHistory'
import { useWorkspace } from './workspaceContext'

/**
 * Every QA run this project has started.
 *
 * ARTEL-1100 부터 화면은 {@link QaHistory} 가 그린다 — 게임 버전 트리, 테스트 런 카드, 실행 타일.
 * 이 섹션은 작업공간의 보조 읽기(런 · 시도 · 모델)가 끝나기를 기다리고, 실패하면 다시 시도를 건다.
 */
export function QaHistorySection() {
  const { t } = useI18n()
  const { extrasStatus, reloadExtras } = useWorkspace()

  if (extrasStatus === 'loading') return <p className="panel-empty">{t.qa.panel.loading}</p>
  if (extrasStatus === 'failed') {
    return (
      <div className="inline-error" role="alert">
        <span aria-hidden="true">!</span>
        {t.qa.panel.loadFailed}
        <button className="button button--secondary button--compact" onClick={reloadExtras} type="button">
          {t.qa.panel.retry}
        </button>
      </div>
    )
  }
  return <QaHistory />
}
