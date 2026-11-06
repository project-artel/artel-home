import type { Guide } from './index'

export const createProject: Guide = {
  id: 'create-project',
  title: '프로젝트 만들기와 장르',
  summary: '새 프로젝트를 만드는 방법과 이름, 설명, 장르 항목의 의미.',
  body: `프로젝트는 한 게임의 빌드, QA 세션, 기획 문서를 한곳에 모읍니다. 프로젝트 목록 [/projects](/projects) 에서 만듭니다.

1. [/projects](/projects) 오른쪽 위의 **새 프로젝트** 를 누릅니다. 프로젝트가 하나도 없을 때는 빈 화면에도 같은 버튼이 있습니다.
2. 입력 항목을 채웁니다.
   - **이름**(필수, 80자까지)
   - **장르**: 액션(ACTION), RPG, 퍼즐(PUZZLE), 시뮬레이션(SIMULATION), 전략(STRATEGY), 스포츠(SPORTS), 슈팅(SHOOTER), 캐주얼(CASUAL), 기타(OTHER) 중 하나이고, 기본값은 기타입니다. 목록의 장르 badge 로 보입니다.
   - **설명**(2000자까지, 비워도 됩니다)
3. **프로젝트 만들기** 를 누르면 새 프로젝트 화면(\`/projects/<project id>\`)으로 이동합니다.

만든 뒤에는 프로젝트의 Settings 화면(\`/projects/<project id>/settings\`)에서 이름, 장르, 설명을 바꾸고 프로젝트를 삭제할 수 있습니다. 삭제는 소유자만 할 수 있고 되돌릴 수 없습니다.

다음 단계는 게임 연결(안내 문서 \`sdk-connect\`), 멤버 초대(안내 문서 \`invite-members\`), 기획 문서 업로드(프로젝트의 Documents 화면, PDF 최대 50 MB)입니다.`,
}
