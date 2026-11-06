/**
 * 프로젝트 목록 머리의 ARTEL 로고(ARTEL-1208). 화면을 열 때 한 번만: 육각 테두리가 그려지고, 몸이 차오르고,
 * 빨간 판이 빈자리로 미끄러져 들어와 맞물린 뒤 그대로 남는다. 움직임 줄이기 설정이면 완성된 로고만 보인다.
 *
 * 꼭짓점은 로고 원본(artel-logo-symbol, 1254px)에서 잰 값이다. 상단 바의 작은 마크와는 다른 그림이다.
 */
const BODY = '628,190 965,385 965,615 826,695 826,465 628,355 427,465 427,720 625,835 625,997 290,800 290,385'
const KEY = '679,835 965,672 965,815 679,985'

export function ArtelMarkIntro() {
  return (
    <div aria-hidden="true" className="mark-intro">
      <div className="mark-intro-glow" />
      <svg className="mark-intro-svg" viewBox="250 160 755 877">
        <polygon className="mark-intro-outline" pathLength={1} points={BODY} />
        <polygon className="mark-intro-body" points={BODY} />
        <polygon className="mark-intro-key" points={KEY} />
      </svg>
    </div>
  )
}
