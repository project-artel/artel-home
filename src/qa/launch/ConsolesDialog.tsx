import { useId } from 'react'
import { Dialog } from '../../design-system/primitives/Dialog'
import { useI18n } from '../../i18n/useI18n'
import { GameBuildPanel } from '../../projects/GameBuildPanel'
import { GameInstancePanel } from '../../projects/GameInstancePanel'
import type { GameBuild, GameInstance } from '../../projects/gameTypes'

/**
 * 게임 콘솔 · 빌드 관리(ARTEL-1084). 옛 QA 화면 오른쪽에 있던 두 패널을 **그대로** 담는다 —
 * 새로고침 · 설치 안내 · 라이브 화면 링크 · 이름 편집 · 삭제 · 빌드 레이블/메모 편집이 하나도 빠지지 않게.
 * 다시 만들지 않는 것이 요점이다. 같은 기능이 두 벌이 되면 한쪽만 고쳐지는 날이 온다.
 */
export function ConsolesDialog({
  projectId,
  instances,
  builds,
  onClose,
  onRefresh,
  onRemoved,
  onSaved,
  onBuildSaved,
}: {
  projectId: string
  instances: GameInstance[]
  builds: GameBuild[]
  onClose: () => void
  onRefresh: () => Promise<void>
  onRemoved: (instanceId: string) => void
  onSaved: (instance: GameInstance) => void
  onBuildSaved: (build: GameBuild) => void
}) {
  const { t } = useI18n()
  const titleId = useId()
  return (
    <Dialog labelledBy={titleId} onClose={onClose} title={t.qa.launch.consoles.title}>
      <div className="ql-consoles">
        <GameInstancePanel instances={instances} onRefresh={onRefresh} onRemoved={onRemoved} onSaved={onSaved} projectId={projectId} />
        <GameBuildPanel builds={builds} onSaved={onBuildSaved} projectId={projectId} />
      </div>
    </Dialog>
  )
}
