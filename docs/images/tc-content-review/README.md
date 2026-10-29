# TC 내용 문제 평가와 수정 후 재검증

사람 평가에 `TC 내용 문제`를 추가했다. Agent 원본 판정과 분리해 표시하고 TC 목록·편집 화면에는 내용 상태를 표시한다. 사유와 원본 검증 시도의 영상 화면으로 가는 링크는 상태가 사용 가능으로 바뀐 뒤에도 유지한다.

`수정 필요 → 실제 내용 수정 → 재검증 필요 → 수정 후 새 확정 검증 → 사용 가능`으로 전환한다. 재검증 버튼은 해당 TC 하나와 선택한 build로 테스트 런을 만들고 QA 실행 설정으로 이동한다. 게임 실행은 사용자가 확인한다.

지도에서 생성한 TC 편집은 선택한 gameBuildId를 전달해 해당 build의 snapshot만 수정한다. 다른 버전은 보존한다. 자세한 서버 계약과 한계는 [서버 문서](https://github.com/project-artel/artel-orchestration-server/pull/385)를 참고한다.

## 검증 결과

- home 전체 테스트 **1,561 PASS**, build(typecheck 포함), 변경 파일 ESLint, git diff --check 통과.
- 서버 관련 회귀 **64 PASS**, package, Flyway 버전 충돌 검사 통과. 계획 Fast/Medium/Heavy 및 양쪽 독립 pair review PASS.
- 테스트는 review/issue 이력의 새 decision 해석, 원본 판정 보존, source attempt/scenario 직접 링크, 상태 badge, 실제 내용 변경·no-op·과거 snapshot·철회·동시 편집/완료·build별 보존·agent 입력·권한을 확인한다.
- 브라우저는 **별도 로컬 검증용 프로젝트110147·TC110147**를 사용했다. 실제 사용자 프로젝트1의 TC·평가는 수정하지 않았다.
- UI에서 TC 내용 문제 평가와 이유 저장 → 수정 필요 → 사전조건·절차·기대결과 수정 저장 → 재검증 필요 → 해당 TC 하나가 선택된 QA 설정 진입을 확인했다.
- 완료 상태는 수정 이후 새 attempt의 실제 내부 start/report API에 **합성 PASSED 판정**을 보내 확인했다. **실제 게임 QA를 실행한 것이 아니다.** fixture의 게임은 연결돼 있지 않으며 실행 설정에서 자동으로 시작하지 않는다.
- fixture에는 녹화 영상이 없어 원본 attempt가 선택되는 링크 이동까지만 확인했다. 이번 변경은 기존 영상 플레이어·저장·보관기간을 바꾸지 않는다. 영상 실제 재생·S3 저장 E2E를 이번 검증으로 주장하지 않는다.
- 라이트·다크 및 390px 화면을 확인했다. 모바일 페이지 폭390px, 내용 상태 영역 약307px로 사유와 링크가 표시된다.
- 로컬 서버 적용 때 기존 DB에서 빠졌던 V142를 확인해 로컬에만 out-of-order로 V142·V147을 적용했다. 초기 시작 실패는 이전 JAR로 자동 복구됐으며 이후 새 JAR의 정상 시작을 확인했다. 제품 설정은 변경하지 않았다.

## 캡처

- [TC 내용 문제 평가](01-content-issue-review.png)
- [수정 필요·사유·원본 영상 링크](02-needs-revision.png)
- [원본 attempt 선택](03-source-attempt.png)
- [내용 수정 후 재검증 필요](04-needs-revalidation.png)
- [대상 TC가 선택된 QA 설정](05-revalidation-launch.png)
- [새 확정 판정 후 목록](06-ready-library.png)
- [사용 가능 상태와 사유 보존](07-ready-details.png)
- [다크 테마](08-dark-library.png)
- [모바일 목록 전환 중 캡처](09-mobile-details.png)
- [모바일 상태·사유·링크](10-mobile-ready.png)
