/*
 * 행 위에서 포인터가 실제로 움직였는지의 판정.
 *
 * `mouseenter` 와 `mousemove` 는 포인터가 가만히 있어도 온다. 레이아웃이 바뀌어 다른 행이 포인터
 * 아래로 들어오거나, 키보드 이동이 `scrollIntoView` 로 목록을 밀면 브라우저가 "포인터 아래의
 * 요소가 바뀌었다"며 같은 좌표로 이벤트를 다시 보낸다. 그 이벤트로 키보드 커서를 옮기면 커서가
 * 사용자 손을 벗어난다. 좌표가 바뀐 이벤트만 사용자의 움직임으로 본다.
 */

export type PointerPosition = { x: number; y: number }

/**
 * 기준 좌표가 없으면 움직임으로 치지 않는다. 키보드만 쓰는 사람의 포인터가 행 위에 멈춰 있을 때
 * 첫 가짜 이벤트가 커서를 옮기면 안 되기 때문이다. 호출한 쪽이 이 좌표를 기준으로 기록해 두면
 * 다음 이벤트부터 판정한다.
 */
export function hasPointerMoved(
  previous: PointerPosition | null,
  x: number,
  y: number,
): boolean {
  return previous !== null && (previous.x !== x || previous.y !== y)
}
