/** 0 부터 359 사이의 색상. id 문자열을 섞어 고른다. */
export function coverHue(id: string): number {
  let hash = 0
  for (const char of id) hash = (hash * 131 + char.charCodeAt(0) * 97) % 360
  // 짧은 숫자 id 끼리 색이 붙지 않게 한 번 더 벌린다.
  return (hash * 137) % 360
}

/** 이름의 첫 글자(대문자). 이름이 비면 `#`. */
export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0]
  return first === undefined ? '#' : first.toUpperCase()
}
