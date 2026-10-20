import { PLACEHOLDER } from '../projects/formatters'
import { buildOptionText } from '../projects/gameBuilds'
import type { GameBuild } from '../projects/gameTypes'

/*
 * 프로젝트의 developer macro 의 view model (ARTEL-1102).
 *
 * developer macro 는 게임 개발자의 코딩 에이전트가 MCP 로 등록한 macro 다. QA agent 가
 * build 의 `content_map` 에 저장한 macro(`macroTypes.ts`)와는 다른 자원이다 — build 가
 * 아니라 **프로젝트**에 속하고, 이름이 프로젝트 안에서 유일하며, 마지막으로 등록할 때
 * 기준으로 삼은 build 하나를 기록만 한다. QA 엔진은 build 와 상관없이 전부 받는다.
 *
 * 이 화면은 읽기만 한다. 쓰는 길은 MCP 뿐이다.
 *
 * 계약은 이 파일과 `developerMacroApi.ts` 두 곳에만 산다. 모양은
 * `artel-orchestration-server` 의 `developermacro/dto/DeveloperMacroDtos.kt` (ARTEL-1088)
 * 에서 확인한 것이다.
 */

/** 마지막으로 등록한 사람. 서버는 그 사용자를 지웠으면 이 객체를 `null` 로 보낸다. */
export type DeveloperMacroAuthor = {
  /** `app_user.id`. 다른 응답의 사용자 id 처럼 문자열이다. */
  id: string
  nickname: string
}

/** 목록 한 줄. `source` 는 상세에만 있다 — 한 건이 최대 20,000자다. */
export type DeveloperMacroSummary = {
  /** 진입점 `def` 의 이름. 프로젝트 안에서 유일하고, 상세 경로의 마지막 칸이 이 값이다. */
  name: string
  /**
   * 진입점 `def` 의 parameter 이름, 선언 순서대로. agent macro 와 달리 타입이 없다 —
   * 서버가 이름만 보낸다.
   */
  parameters: string[]
  /** 진입점 `def` 의 docstring. 서버 검사가 docstring 을 요구하므로 보통 비지 않는다. */
  docstring: string
  /**
   * 마지막 등록이 기준으로 삼은 build. `GameBuild.id` 와 같은 문자열 id 다.
   *
   * 읽지 못하면 `''` 이고, 그때 화면은 어느 build 와도 순서를 따지지 않는다.
   */
  gameBuildId: string
  /** 그 build 의 `version`. 작업공간의 build 목록에서 그 build 를 못 찾을 때 쓴다. */
  buildVersion: string
  /** 그 build 에 사람이 붙인 이름. 없으면 `null`. */
  buildLabel: string | null
  /** 정의가 실제로 바뀔 때만 오르는 번호. 처음 등록이 1 이다. 읽지 못하면 `null`. */
  version: number | null
  updatedAt: string
  updatedBy: DeveloperMacroAuthor | null
}

/** 목록 한 줄에 원문이 더해진 평평한 객체. */
export type DeveloperMacroDetail = DeveloperMacroSummary & {
  /** 저장된 원문 그대로. 들여쓰기가 문법의 일부라 깎지 않는다. */
  source: string
}

/**
 * macro 를 쓸 때 기준으로 삼은 build 가 고른 build 와 어떤 관계인가.
 *
 * - `same`: 같은 build
 * - `older` / `newer`: 고른 build 보다 먼저 / 나중에 올라온 build
 * - `different`: 다른 build 인데 순서를 정할 수 없다 — editor build 가 끼었거나, 그 build 를
 *   작업공간 목록에서 찾지 못했거나, 올라온 시각이 같거나 비었다
 */
export type WrittenBuildRelation = 'same' | 'older' | 'newer' | 'different'

/**
 * macro 를 쓸 때 기준으로 삼은 build 가 고른 build 의 앞인지 뒤인지.
 *
 * 순서는 `createdAt` 이다. `selectBuild` 가 "가장 최신 build" 를 고를 때 쓰는 기준과 같고,
 * 비교도 그쪽처럼 문자열로 한다 — 서버가 같은 ISO-8601 모양으로 주므로 사전 순서가 시간
 * 순서다. `version` 문자열로 정하지 않는 이유는 그것이 Unity 의 Player Settings 에서 온
 * 자유 문자열이라 `1.10.0` 과 `1.9.0` 의 순서조차 보장하지 않기 때문이다.
 *
 * editor build 는 game version 이 아니라서(`versionBuilds` 가 빼는 것과 같은 이유) 어느
 * 쪽에 끼어도 앞뒤를 말하지 않는다.
 */
export function relationToSelectedBuild(
  writtenBuildId: string,
  selectedBuild: GameBuild,
  builds: GameBuild[],
): WrittenBuildRelation {
  if (writtenBuildId === selectedBuild.id) return 'same'

  const writtenBuild = builds.find((build) => build.id === writtenBuildId)
  if (writtenBuild === undefined) return 'different'
  if (writtenBuild.isEditor || selectedBuild.isEditor) return 'different'

  const writtenAt = writtenBuild.createdAt
  const selectedAt = selectedBuild.createdAt
  if (writtenAt.length === 0 || selectedAt.length === 0 || writtenAt === selectedAt) {
    return 'different'
  }
  return writtenAt < selectedAt ? 'older' : 'newer'
}

/**
 * macro 를 쓸 때 기준으로 삼은 build 를 사람이 읽는 글로. build picker 의 `<option>` 과
 * 같은 글이다 — `0.1.0 · 첫 빌드`, editor build 면 `Editor · 0.1.0`.
 *
 * 작업공간 목록에서 그 build 를 찾으면 `buildOptionText` 를 그대로 쓴다. 못 찾으면 응답의
 * `buildVersion`·`buildLabel` 로 같은 모양을 만든다. 그때는 editor build 인지 알 수 없어
 * editor 표시를 붙이지 않는다.
 */
export function writtenBuildText(
  macro: Pick<DeveloperMacroSummary, 'gameBuildId' | 'buildVersion' | 'buildLabel'>,
  builds: GameBuild[],
  editorLabel: string,
): string {
  const writtenBuild = builds.find((build) => build.id === macro.gameBuildId)
  if (writtenBuild !== undefined) return buildOptionText(writtenBuild, editorLabel)

  const version = macro.buildVersion.trim()
  const label = macro.buildLabel?.trim() ?? ''
  if (version.length === 0) return label.length === 0 ? PLACEHOLDER : label
  return label.length === 0 ? version : `${version} · ${label}`
}
