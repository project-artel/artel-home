import { createContext } from 'react'

/**
 * 이 런의 계획에 나온 매크로 이름들(`developer:` 를 뗀 것). 글 안에 그 이름이 그대로 적혀 있으면(영문 지침, 옛 판정 글)
 * `PeText` 가 매크로 블록으로 그린다. `QaPeFlow` 가 채운다.
 */
export const PeMacroNames = createContext<ReadonlySet<string>>(new Set())
