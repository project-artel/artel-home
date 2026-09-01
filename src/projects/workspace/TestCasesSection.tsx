import { TestCaseLibrary } from '../../testCases/TestCaseLibrary'
import { useWorkspace } from './workspaceContext'

/**
 * 재사용 테스트 케이스를 모아 보고 고치는 자리.
 *
 * 목록은 [TestCaseLibrary] 가 직접 읽는다. workspace 의 다른 읽기와 함께 올리지 않는 것은
 * 케이스 전량이 프로젝트에서 가장 큰 목록인데 그것을 보는 화면이 여기 하나뿐이기 때문이다.
 * `builds` 는 이미 workspace 가 들고 있어 그대로 넘긴다 — 마지막으로 검증한 build 를 이름으로
 * 적기 위해 목록이 필요하고, 같은 것을 여기서 또 읽을 이유는 없다.
 */
export function TestCasesSection() {
  const { builds, projectId } = useWorkspace()

  return <TestCaseLibrary builds={builds} projectId={projectId} />
}
