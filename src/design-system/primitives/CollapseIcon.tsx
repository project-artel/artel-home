/**
 * 접을 수 있는 pane 의 버튼에 들어가는 갈매기 하나.
 *
 * 앱 안에 접을 수 있는 pane 이 둘 이상이고, 그 버튼들이 서로 다른 모양이면 같은 동작이 자리마다
 * 다른 것처럼 보인다. 그래서 그림 하나를 여기에 두고 양쪽이 가져다 쓴다 — 프로젝트 작업공간의 왼쪽
 * rail(`ProjectNav`)과 content map 의 tree·inspector pane 이다.
 *
 * `direction` 은 상태가 아니라 **방향**이다. 화살표가 가리켜야 하는 것은 지금 접혀 있는지가 아니라
 * 누르면 pane 이 어느 쪽으로 움직이는지이고, 그 둘은 오른쪽 pane 에서 서로 반대가 된다 — 오른쪽
 * inspector 는 접히면서 오른쪽으로 물러나고 왼쪽 rail 은 접히면서 왼쪽으로 물러난다. 상태를 받는
 * 이름을 달면 호출자 한쪽이 반드시 뒤집어서 넘기게 되고, 그 뒤집기는 읽는 사람에게 실수로 보인다.
 *
 * `currentColor` 로 그리므로 버튼의 hover·focus·disabled 마다 색 규칙을 따로 쓸 필요가 없다.
 * `aria-hidden` 인 이유는 이 그림이 말하는 것을 버튼의 `aria-label` 이 이미 글로 말하기 때문이다.
 *
 * 크기는 `.collapse-icon` 이 준다. 원래 자리였던 `.nav-icon` 을 그대로 쓰면 primitive 가 왼쪽 rail
 * 의 class 로 크기를 받게 되고, 그 절을 정리하는 날 content map 의 아이콘이 함께 바뀐다.
 */
export function CollapseIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      aria-hidden="true"
      className="collapse-icon"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      viewBox="0 0 16 16"
    >
      <path d={direction === 'right' ? 'M6.2 3.5L10.5 8l-4.3 4.5' : 'M9.8 3.5L5.5 8l4.3 4.5'} />
    </svg>
  )
}
