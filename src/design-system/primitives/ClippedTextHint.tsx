import { useEffect } from 'react'

function clippedControlLabel(element: HTMLElement, label: string, arrow = 0): string {
  const style = getComputedStyle(element)
  const context = document.createElement('canvas').getContext('2d')
  if (!context) return ''
  context.font = style.font || [style.fontWeight, style.fontSize, style.fontFamily].join(' ')
  const available = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
  return context.measureText(label).width + (style.appearance === 'none' ? 0 : arrow) > available ? label : ''
}

function clippedText(element: HTMLElement): string {
  if (element instanceof HTMLSelectElement && !element.multiple && element.size <= 1) {
    return clippedControlLabel(element, element.selectedOptions[0]?.label.trim() ?? '', 16)
  }
  if (element instanceof HTMLInputElement) {
    if (element.value || !element.placeholder || !['search', 'text'].includes(element.type)) return ''
    return clippedControlLabel(element, element.placeholder)
  }
  if (element.matches('button[aria-label], a[aria-label]') && !element.title &&
      !element.innerText.trim() && !element.closest('.info-hint')) {
    return element.getAttribute('aria-label')?.trim() ?? ''
  }
  const horizontal = element.scrollWidth > element.clientWidth
  const vertical = element.scrollHeight > element.clientHeight
  if (!horizontal && !vertical) return ''
  const style = getComputedStyle(element)
  if ((horizontal && style.textOverflow === 'ellipsis') || (vertical && Number(style.webkitLineClamp) > 0)) {
    return element.innerText.trim()
  }
  return ''
}

/** Re-evaluate truncation on entry so resized panes and virtualized rows use their current text. */
export function ClippedTextHint() {
  useEffect(() => {
    const bubble = document.createElement('div')
    bubble.className = 'info-hint__bubble clipped-text-hint'
    bubble.setAttribute('aria-hidden', 'true')
    bubble.popover = 'manual'
    let closeTimer = 0
    let trigger: HTMLElement | null = null
    let bounds: DOMRect | null = null
    const hide = () => {
      window.clearTimeout(closeTimer)
      bubble.remove()
      trigger = null
      bounds = null
    }
    const leave = () => {
      window.clearTimeout(closeTimer)
      closeTimer = window.setTimeout(hide, 150)
    }
    function show(event: Event) {
      const target = event.target
      if (!(target instanceof Element)) return
      window.clearTimeout(closeTimer)
      if (bubble.contains(target)) return
      if (target.closest('.tc-hover-trigger')) {
        hide()
        return
      }
      let element: Element | null = target
      while (element && element !== document.body) {
        if (element instanceof HTMLElement) {
          const text = clippedText(element)
          if (text) {
            if (element.closest('[title]')?.getAttribute('title') === text) {
              hide()
              return
            }
            bubble.textContent = text
            if (!bubble.isConnected) {
              document.body.append(bubble)
              bubble.showPopover?.()
            }
            const anchor = element.getBoundingClientRect()
            trigger = element
            bounds = anchor
            const box = bubble.getBoundingClientRect()
            bubble.style.left = Math.max(8, Math.min(anchor.left, innerWidth - box.width - 8)) + 'px'
            bubble.style.top = (anchor.bottom + box.height + 12 <= innerHeight
              ? anchor.bottom + 4 : Math.max(8, anchor.top - box.height - 4)) + 'px'
            return
          }
        }
        element = element.parentElement
      }
      if (bubble.isConnected) leave()
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') hide() }
    const scroll = () => {
      const rect = trigger?.getBoundingClientRect()
      if (bounds && rect && (rect.top !== bounds.top || rect.left !== bounds.left)) hide()
    }
    document.addEventListener('pointerover', show)
    document.addEventListener('pointerout', leave)
    document.addEventListener('focusin', show)
    document.addEventListener('focusout', leave)
    document.addEventListener('keydown', escape)
    document.addEventListener('pointerdown', hide)
    document.addEventListener('change', hide)
    document.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', hide)
    return () => {
      hide()
      document.removeEventListener('pointerover', show)
      document.removeEventListener('pointerout', leave)
      document.removeEventListener('focusin', show)
      document.removeEventListener('focusout', leave)
      document.removeEventListener('keydown', escape)
      document.removeEventListener('pointerdown', hide)
      document.removeEventListener('change', hide)
      document.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', hide)
    }
  }, [])
  return null
}
