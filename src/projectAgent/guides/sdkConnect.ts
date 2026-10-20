import type { Guide } from './index'

export const sdkConnect: Guide = {
  id: 'sdk-connect',
  title: 'Unity SDK 설치와 게임 연결',
  summary: 'Unity 게임에 ARTEL SDK 패키지를 설치하고, 게임 인스턴스를 프로젝트에 연결하는 방법.',
  body: `Unity 게임에 SDK 를 넣고 게임을 프로젝트에 연결하는 절차입니다. Unity 에디터와 사용자의 컴퓨터에서 하는 일이라 agent 가 대신할 수 없습니다. 화면 안내는 [/setup](/setup) 이나 프로젝트의 Setup 화면 \`/projects/<project id>/setup\` 에 있습니다.

1. Unity 에서 **Window → Package Manager** 를 열고 **Add package from git URL** 을 고릅니다.
2. 아래 주소를 붙여 넣습니다. \`?path=\` 는 빼면 안 됩니다. 패키지가 저장소 루트가 아니라 \`Packages/kr.artel.sdk\` 에 있어서, 빼면 Package Manager 가 주소를 거절합니다.

\`\`\`text
https://github.com/project-artel/artel-sdk.git?path=/Packages/kr.artel.sdk
\`\`\`

3. 게임을 실행합니다. 게임 화면 위에 Artel SDK 로그인 화면이 뜹니다. **로그인** 을 고르면 브라우저가 열립니다.
4. 브라우저에서 ARTEL 에 로그인합니다. 로그인하면 SDK 가 승인되고, 그 뒤에는 탭을 닫아도 됩니다. 이미 로그인되어 있으면 페이지가 열리자마자 승인됩니다.
5. 게임으로 돌아와 연결할 프로젝트를 고릅니다. 프로젝트가 하나뿐이면 SDK 가 자동으로 고릅니다.

연결되면 인스턴스가 자동으로 등록되고, 프로젝트의 Setup 화면 인스턴스 목록에 **연결됨** 으로 표시됩니다. 따로 보관할 키는 없습니다. SDK 가 그 컴퓨터의 로그인을 기억하고, 인스턴스는 첫 보고 때 만들어집니다.

주의할 점은 다음과 같습니다.
- 개발 빌드와 에디터에서만 SDK 가 붙습니다. 출시 빌드에는 SDK 가 없어서 게임을 조작할 수 없습니다.
- 인스턴스 목록이 비어 있으면 아직 SDK 가 들어간 빌드가 한 번도 등록되지 않은 것입니다.
- CLI 로 빌드를 실행하면 로그인된 상태로 열리고 인스턴스 id 가 출력됩니다: \`artel game start --build ./Build/Game.exe --project <project id>\` (안내 문서 \`cli-install\` 참고).
- AI 코딩 에이전트에게 설치를 맡기려면 artel-unity-sdk skill 을 씁니다 (안내 문서 \`skills-install\` 참고).`,
}
