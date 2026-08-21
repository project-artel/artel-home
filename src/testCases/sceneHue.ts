/**
 * 씬 이름 하나에 대응하는 결정적인 색상각.
 *
 * 라이브러리·플로우·콘텐츠 맵이 모두 같은 씬을 같은 색으로 그려야 눈으로
 * 화면 단위 묶기가 된다. `SceneChip.tsx` 가 아니라 별도 모듈인 이유는 그
 * 파일이 컴포넌트만 내보내야 fast refresh 가 동작하기 때문이다.
 */
export function sceneHue(scene: string): number {
  let hash = 0
  for (let index = 0; index < scene.length; index += 1) {
    hash = (hash * 31 + scene.charCodeAt(index)) % 360
  }
  return hash
}
