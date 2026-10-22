import { useI18n } from '../i18n/useI18n'

/**
 * editor 버전 표시. 게임 빌드 화면의 `Editor` 배지와 같은 것이다(ARTEL-1181) — 같은 version 의 build 행과 editor 행을
 * 라이브러리 · 테스트 런 · 판정 이력에서도 같은 모양으로 가른다.
 */
export function EditorBadge() {
  const { t } = useI18n()
  return <span className="badge editor-badge">{t.gameBuilds.list.editorBadge}</span>
}
