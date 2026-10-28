# TC 영상 재생 진행도 검증 화면

2026-10-28 로컬 QA 6의 실제 저장 영상을 재생해 캡처했다. 평가 데이터는 수정하지 않았다.

| 파일 | 확인한 동작 |
| --- | --- |
| [01-tc5-start.png](01-tc5-start.png) | TC 5 선택 직후 상대 시간 0:00, 정지 |
| [02-tc5-playing.png](02-tc5-playing.png) | TC 구간 안에서 재생 진행 |
| [03-tc4-switch-reset.png](03-tc4-switch-reset.png) | 재생 중 TC 4로 전환 후 상대 시간 0:00, 정지 |
| [04-tc4-end.png](04-tc4-end.png) | TC 구간 끝에서 정지 |
| [05-tc4-next-segment.png](05-tc4-next-segment.png) | 두 번째 영상 구간으로 자동 전환하며 재생 지속 |
| [06-dark.png](06-dark.png) | 다크 테마의 controls |
| [07-mobile-dark.png](07-mobile-dark.png) | 390px 화면의 controls와 keyboard focus |

표시 시간은 재생 가능한 TC 영상 구간의 길이를 합한 값이다. 누락 구간은 재생 길이에 포함하지 않고 기존 안내로 표시한다.
