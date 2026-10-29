import { buildDisplayName } from './buildEnvironment'
import type { GameBuild } from './gameTypes'

/**
 * Helpers for telling the editor build apart from game versions (ARTEL-1016).
 *
 * The server keeps one editor-only build per project and puts it last in the
 * list. Nothing here relies on that order: the editor row is found by
 * `isEditor`, so a server that changes the order cannot make the editor build
 * the default.
 */

/** The builds that are game versions. The editor build is not one. */
export function versionBuilds(builds: GameBuild[]): GameBuild[] {
  return builds.filter((build) => !build.isEditor)
}

/**
 * The build a screen shows when the address names none, or names one that is
 * gone: the newest non-editor build, else the editor build, else `undefined`.
 * A requested id that exists always wins, the editor build included.
 *
 * Ties on `createdAt` keep the list order, so the choice stays stable between
 * renders.
 */
export function selectBuild(
  builds: GameBuild[],
  requestedId: string | null,
): GameBuild | undefined {
  const requested = builds.find((build) => build.id === requestedId)
  if (requested !== undefined) return requested

  let newest: GameBuild | undefined
  for (const build of versionBuilds(builds)) {
    if (newest === undefined || build.createdAt > newest.createdAt) newest = build
  }
  return newest ?? builds.find((build) => build.isEditor)
}

/**
 * Text of one `<option>` in a build picker. The editor build reads
 * `Editor · 1.4.0`: the version is secondary because it only says which Player
 * Settings value the editor last reported.
 */
export function buildOptionText(build: GameBuild, editorLabel: string): string {
  if (build.isEditor) return `${editorLabel} · ${build.version}`
  return buildDisplayName(build)
}
