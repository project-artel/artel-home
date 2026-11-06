import type { CSSProperties, ReactNode } from 'react'
import { coverHue, initialOf } from './projectCoverStyle'

/**
 * 프로젝트 카드 머리의 대표 그림 자리(ARTEL-1208). 지금은 서버에 이미지 칸이 없어서, id 로 정한 색 무늬와
 * 이름 첫 글자를 그린다. 같은 프로젝트는 늘 같은 색이다.
 */
export function ProjectCover({ id, name, children }: { id: string; name: string; children?: ReactNode }) {
  const style = { '--cover-hue': String(coverHue(id)) } as CSSProperties
  return (
    <span aria-hidden="true" className="project-cover" style={style}>
      <span className="project-cover-initial">{initialOf(name)}</span>
      {children}
    </span>
  )
}
