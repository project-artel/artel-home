/*
 * 시나리오 불러오기에 쓰는 아이콘(ARTEL-995). 그리지 않고 공개 아이콘 세트에서 그대로 가져왔다.
 * - PlaylistAddIcon: Tabler Icons `playlist-add` (MIT, https://tabler.io/icons)
 * - ClipboardListIcon: Lucide `clipboard-list` v1.56.0 (ISC, https://lucide.dev)
 * 둘 다 `currentColor` 선 아이콘이라 둘러싼 글자색을 따른다.
 */

type IconProps = { className?: string; size?: number }

export function PlaylistAddIcon({ className, size = 18 }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width={size}>
      <path d="M19 8h-14" />
      <path d="M5 12h9" />
      <path d="M11 16h-6" />
      <path d="M15 16h6" />
      <path d="M18 13v6" />
    </svg>
  )
}

export function ClipboardListIcon({ className, size = 18 }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width={size}>
      <rect height="4" rx="1" ry="1" width="8" x="8" y="2" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </svg>
  )
}
