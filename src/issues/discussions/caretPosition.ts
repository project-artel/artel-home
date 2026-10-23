/**
 * 입력칸 안에서 [position] 번째 글자 자리의 좌표(입력칸 왼쪽 위 기준, 스크롤 반영). 같은 글꼴 · 패딩 · 줄바꿈을 가진
 * 보이지 않는 거울 요소에 글을 붙여 그 자리의 표시를 잰다 — 브라우저가 textarea 의 글자 위치를 직접 알려 주지 않는다.
 */
const COPIED = [
  'boxSizing', 'width', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontFamily', 'fontSize', 'fontWeight',
  'fontStyle', 'letterSpacing', 'lineHeight', 'textTransform', 'wordSpacing', 'tabSize',
] as const

export function caretPosition(textarea: HTMLTextAreaElement, position: number): { top: number; left: number; height: number } {
  const style = getComputedStyle(textarea)
  const mirror = document.createElement('div')
  for (const key of COPIED) mirror.style[key] = style[key]
  mirror.style.position = 'absolute'
  mirror.style.visibility = 'hidden'
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.overflowWrap = 'break-word'
  mirror.style.top = '0'
  mirror.style.left = '-9999px'
  mirror.textContent = textarea.value.slice(0, position)
  const marker = document.createElement('span')
  marker.textContent = textarea.value.slice(position) || '.'
  mirror.appendChild(marker)
  document.body.appendChild(mirror)
  const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.5
  const result = {
    top: marker.offsetTop - textarea.scrollTop,
    left: marker.offsetLeft - textarea.scrollLeft,
    height: lineHeight,
  }
  document.body.removeChild(mirror)
  return result
}
