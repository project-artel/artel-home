/** 움직임을 줄인 환경이면 튜토리얼의 타자 · 설치 · 확대 움직임을 건너뛰고 끝 모습을 바로 보인다. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
