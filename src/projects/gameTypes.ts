/**
 * Game instances (one SDK installation) and game builds (one version the SDK
 * has reported), agreed with the orchestration server in ARTEL-75.
 *
 * The split between `GAME_PLATFORMS` and `UNAVAILABLE_PLATFORM_LABELS` follows
 * the same reasoning as the genre enum in `projectTypes.ts`: the submittable
 * `<select>` is generated from the closed list, so a value the server does not
 * accept can never be submitted. The unavailable list exists only so the picker
 * can say *why* the other engines are missing instead of silently omitting them.
 */
export const GAME_PLATFORMS = ['UNITY'] as const

export type GamePlatform = (typeof GAME_PLATFORMS)[number]

/** Unity is the only engine the SDK ships for, so it is also the only default. */
export const DEFAULT_GAME_PLATFORM: GamePlatform = 'UNITY'

export const PLATFORM_LABELS: Record<GamePlatform, string> = {
  UNITY: 'Unity',
}

/**
 * Rendered as disabled options with an explicit `(준비 중)` suffix. A bare
 * `disabled` attribute would be exactly the dead UI this codebase rejects
 * elsewhere; the suffix is what makes the option informative rather than broken.
 */
export const UNAVAILABLE_PLATFORM_LABELS: Record<string, string> = {
  UNREAL: 'Unreal Engine',
  GODOT: 'Godot',
}

/**
 * These mirror the project name/description limits so the two forms feel the
 * same. As everywhere else in this client, they exist to give immediate
 * feedback and the server stays the authority: never advertise a looser rule
 * than the server enforces, and if the two disagree the client is the bug.
 */
export const INSTANCE_NAME_MAX_LENGTH = 80
export const BUILD_LABEL_MAX_LENGTH = 80
export const BUILD_NOTES_MAX_LENGTH = 2000

export type GameInstance = {
  /** Opaque server-owned identifier. Never parsed, split, or used in arithmetic. */
  id: string
  projectId: string
  name: string
  /**
   * Kept as a plain string rather than `GamePlatform` because this is the
   * response side. If the server ever starts returning an engine this client
   * does not know about, showing the raw value is honest, whereas narrowing it
   * to the union would relabel that instance "Unity" — a real bug. The request
   * side stays closed; see `GameInstanceDraft`.
   */
  platform: string
  /**
   * A durable credential the developer types into the Unity editor once. There
   * is no rotation or re-issue endpoint, so this is re-readable rather than
   * show-once: it has to still be here after the SDK is reinstalled.
   */
  instanceKey: string
  /**
   * A snapshot from the last load, not a subscription. Nothing polls it, so
   * the UI must not read as a live indicator.
   */
  connected: boolean
  /** `''` when the instance has never connected; rendered as its own wording. */
  lastConnectedAt: string
  createdAt: string
  updatedAt: string
}

export type GameBuild = {
  id: string
  projectId: string
  /**
   * Observed from Unity's Player Settings when the SDK registered the build.
   * Never editable — no control anywhere may offer to change it, because the
   * next registration would overwrite whatever was typed.
   */
  version: string
  label: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

/** The request side is the closed union, so an unsupported engine cannot be sent. */
export type GameInstanceDraft = {
  name: string
  platform: GamePlatform
}

export type GameInstancePatch = {
  name: string
}

/**
 * Both fields are always sent. Per the ARTEL-75 contract `null` means untouched
 * and `''` clears a nullable string, so an emptied input clears the stored
 * value rather than leaving it behind.
 */
export type GameBuildPatch = {
  label: string
  notes: string
}

export function isGamePlatform(value: unknown): value is GamePlatform {
  return typeof value === 'string' && (GAME_PLATFORMS as readonly string[]).includes(value)
}

/** Falls back to the raw server value so an unknown engine is shown, not renamed. */
export function describePlatform(platform: string): string {
  return isGamePlatform(platform) ? PLATFORM_LABELS[platform] : platform
}
