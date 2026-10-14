import { apiFetch } from '../auth/authApi'
import { asNullableString, asRecord, asString, jsonRequest, readJson, toApiError } from '../projects/projectApi'
import { parseTestCaseFolder, type TestCaseFolder } from './testCaseFolderApi'
import { asVerificationStatus, type TestCase, type VerificationStatus } from './testCaseTypes'

/*
 * 케이스 라이브러리의 버전 보기(ARTEL-1022).
 *
 * 케이스는 버전을 넘어 같은 id 이고, 버전마다 그 버전의 내용과 판정이 있다(서버 ARTEL-1018 · 1021).
 * 라이브러리는 고른 버전의 표를 그리고, 다른 버전과 비교하면 두 판정과 "한쪽에만 있음" 을 한 줄에 보인다.
 * 화면이 쓰는 판정 규칙은 여기 순수 함수로 둔다.
 */

export type TestCaseVersionSummary = {
  gameBuildId: string
  version: string
  label: string | null
  createdAt: string
  /** 프로젝트의 가장 최근 버전. 라이브러리가 기본으로 고르고 "현재 버전" 으로 표시한다. */
  latest: boolean
  total: number
  counts: Record<VerificationStatus, number>
  /** 넣은 버전 묶음. 없으면 null(ARTEL-1024). */
  groupId: string | null
  /** 목록에서 숨긴 버전. 숨긴 버전 보기에서만 그린다. */
  hidden: boolean
}

/** 버전과 같은 층의 묶음 하나(예: `1.X`). 묶음 안에 묶음은 없다(ARTEL-1024). */
export type VersionGroup = { id: string; name: string }

export type VersionLibrary = {
  versions: TestCaseVersionSummary[]
  groups: VersionGroup[]
  /** 어느 버전에도 몫이 없는 케이스 수 — "버전 없음" 줄. */
  unversionedTotal: number
}

/**
 * "버전 없음" 을 고른 주소의 `?version=` 값. 서버 경로도 같은 낱말이다
 * (`/test-case-versions/unversioned/cases`). build id 는 숫자라 겹치지 않는다.
 */
export const UNVERSIONED = 'unversioned'

/** build id 인가. "버전 없음" 처럼 build 가 아닌 선택은 폴더 수 · 폴더 항목을 버전으로 풀 수 없다. */
export const isBuildId = (value: string | null): value is string => value !== null && /^\d+$/.test(value)

/** `BOTH` · `ONLY_THIS`(비교 버전에 없음) · `ONLY_OTHER`(이 버전에 없음). 비교하지 않으면 늘 `BOTH`. */
export type VersionPresence = 'BOTH' | 'ONLY_THIS' | 'ONLY_OTHER'

export type VersionCaseRow = {
  testCase: TestCase
  origin: 'MAP' | 'MANUAL'
  /** 이 버전의 판정. 이 버전에 없는 케이스(`ONLY_OTHER`)면 null. */
  verificationStatus: VerificationStatus | null
  presence: VersionPresence
  /** 비교 버전의 판정. 비교하지 않거나 비교 버전에 없으면 null. */
  compareVerificationStatus: VerificationStatus | null
}

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

const STATUSES: VerificationStatus[] = ['VERIFIED', 'FAILED', 'REGRESSION', 'DRAFT', 'BROKEN']

export function parseVersionLibrary(data: unknown): VersionLibrary {
  const record = asRecord(data)
  return {
    versions: parseVersionList(data),
    groups: asArray(record?.groups)
      .map((raw): VersionGroup | null => {
        const group = asRecord(raw)
        const id = asString(group?.id)
        const name = asString(group?.name)
        return id.length > 0 && name.length > 0 ? { id, name } : null
      })
      .filter((group): group is VersionGroup => group !== null),
    unversionedTotal: typeof record?.unversionedTotal === 'number' ? record.unversionedTotal : 0,
  }
}

export function parseVersionList(data: unknown): TestCaseVersionSummary[] {
  return asArray(asRecord(data)?.items)
    .map((raw): TestCaseVersionSummary | null => {
      const record = asRecord(raw)
      const gameBuildId = asString(record?.gameBuildId)
      if (gameBuildId.length === 0) return null
      const counts = asRecord(record?.counts)
      return {
        gameBuildId,
        version: asString(record?.version),
        label: asNullableString(record?.label),
        createdAt: asString(record?.createdAt),
        latest: record?.latest === true,
        groupId: asNullableString(record?.groupId),
        hidden: record?.hidden === true,
        total: typeof record?.total === 'number' ? record.total : 0,
        counts: Object.fromEntries(
          STATUSES.map((status) => [status, typeof counts?.[status] === 'number' ? (counts[status] as number) : 0]),
        ) as Record<VerificationStatus, number>,
      }
    })
    .filter((item): item is TestCaseVersionSummary => item !== null)
}

const asPresence = (value: unknown): VersionPresence =>
  value === 'ONLY_THIS' || value === 'ONLY_OTHER' ? value : 'BOTH'

const asStatusOrNull = (value: unknown): VerificationStatus | null =>
  typeof value === 'string' && value.length > 0 ? asVerificationStatus(value) : null

export function parseVersionCases(data: unknown, projectId: string): VersionCaseRow[] {
  return asArray(asRecord(data)?.items)
    .map((raw): VersionCaseRow | null => {
      const record = asRecord(raw)
      const id = asString(record?.id)
      if (id.length === 0) return null
      const verificationStatus = asStatusOrNull(record?.verificationStatus)
      return {
        testCase: {
          id,
          projectId,
          scene: asString(record?.scene),
          step: asString(record?.step),
          precondition: asNullableString(record?.precondition),
          expectedValue: asString(record?.expectedValue),
          status: asNullableString(record?.status),
          // 이 버전에 없는 케이스도 표의 한 줄이라 상태 칸이 비면 안 된다. 화면은 presence 로 "없음" 을 따로 그린다.
          verificationStatus: verificationStatus ?? 'DRAFT',
          lastVerifiedBuildId: null,
          createdAt: asString(record?.createdAt),
          folderId: asNullableString(record?.folderId),
          evidenceGaps: [],
        },
        origin: record?.origin === 'MANUAL' ? 'MANUAL' : 'MAP',
        verificationStatus,
        presence: asPresence(record?.presence),
        compareVerificationStatus: asStatusOrNull(record?.compareVerificationStatus),
      }
    })
    .filter((row): row is VersionCaseRow => row !== null)
}

/** `GET /api/projects/{projectId}/test-case-versions` — 최신 버전부터, 묶음과 "버전 없음" 수를 함께. */
export async function listTestCaseVersions(projectId: string, signal?: AbortSignal): Promise<VersionLibrary> {
  const response = await apiFetch(versionsRoot(projectId), { signal })
  if (!response.ok) throw await toApiError(response)
  return parseVersionLibrary(await readJson(response))
}

const versionsRoot = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/test-case-versions`
const groupsRoot = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/test-case-version-groups`

async function expectOk(response: Response): Promise<void> {
  if (!response.ok) throw await toApiError(response)
}

function requireGroup(data: unknown): VersionGroup {
  const record = asRecord(data)
  const id = asString(record?.id)
  const name = asString(record?.name)
  if (id.length === 0 || name.length === 0) throw new Error('The server described the version group oddly.')
  return { id, name }
}

/** 같은 이름이 있으면 409. */
export async function createVersionGroup(projectId: string, name: string): Promise<VersionGroup> {
  const response = await apiFetch(groupsRoot(projectId), { method: 'POST', ...jsonRequest({ name }) })
  await expectOk(response)
  return requireGroup(await readJson(response))
}

export async function renameVersionGroup(projectId: string, groupId: string, name: string): Promise<VersionGroup> {
  const response = await apiFetch(`${groupsRoot(projectId)}/${encodeURIComponent(groupId)}`, {
    method: 'PUT',
    ...jsonRequest({ name }),
  })
  await expectOk(response)
  return requireGroup(await readJson(response))
}

/** 안의 버전은 묶음 없음으로 돌아간다. */
export async function deleteVersionGroup(projectId: string, groupId: string): Promise<void> {
  await expectOk(await apiFetch(`${groupsRoot(projectId)}/${encodeURIComponent(groupId)}`, { method: 'DELETE' }))
}

/** 버전을 묶음에 넣는다. [groupId] 가 null 이면 묶음에서 뺀다. */
export async function assignVersionGroup(projectId: string, gameBuildId: string, groupId: string | null): Promise<void> {
  await expectOk(
    await apiFetch(`${versionsRoot(projectId)}/${encodeURIComponent(gameBuildId)}/group`, {
      method: 'PUT',
      ...jsonRequest({ groupId }),
    }),
  )
}

export async function setVersionHidden(projectId: string, gameBuildId: string, hidden: boolean): Promise<void> {
  await expectOk(
    await apiFetch(`${versionsRoot(projectId)}/${encodeURIComponent(gameBuildId)}/hidden`, {
      method: 'PUT',
      ...jsonRequest({ hidden }),
    }),
  )
}

/** 버전의 케이스를 담은 폴더를 새로 만든다. 이름은 서버가 `"<버전> 사본"` 으로 짓는다. */
export async function copyVersionToFolder(projectId: string, gameBuildId: string): Promise<TestCaseFolder> {
  const response = await apiFetch(`${versionsRoot(projectId)}/${encodeURIComponent(gameBuildId)}/folder-copies`, {
    method: 'POST',
    ...jsonRequest({}),
  })
  await expectOk(response)
  const folder = parseTestCaseFolder(await readJson(response))
  if (folder === null) throw new Error('The server described the folder oddly.')
  return folder
}

/** `GET /api/projects/{projectId}/test-case-versions/{gameBuildId}/cases?compareTo=` */
export async function listVersionCases(
  projectId: string,
  gameBuildId: string,
  compareTo: string | null,
  signal?: AbortSignal,
): Promise<VersionCaseRow[]> {
  const query = compareTo === null ? '' : `?compareTo=${encodeURIComponent(compareTo)}`
  const response = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/test-case-versions/${encodeURIComponent(gameBuildId)}/cases${query}`,
    { signal },
  )
  if (!response.ok) throw await toApiError(response)
  return parseVersionCases(await readJson(response), projectId)
}

/** 사람이 붙인 이름이 있으면 그것, 없으면 SDK 가 보고한 version. */
export function versionName(summary: Pick<TestCaseVersionSummary, 'label' | 'version'>): string {
  return summary.label !== null && summary.label.trim().length > 0 ? summary.label : summary.version
}

/**
 * 주소의 `?version=` 이 없거나 없는 버전이면 가장 최근 버전. 버전이 하나도 없으면 null. `unversioned` 는 "버전 없음"
 * 이다(ARTEL-1024).
 */
export function resolveVersion(versions: readonly TestCaseVersionSummary[], requested: string | null): string | null {
  if (requested === UNVERSIONED && versions.length > 0) return UNVERSIONED
  if (requested !== null && versions.some((version) => version.gameBuildId === requested)) return requested
  return versions.find((version) => version.latest)?.gameBuildId ?? versions[0]?.gameBuildId ?? null
}

/** 비교할 버전: 주소의 `?compare=` 가 고른 버전과 다르고 목록에 있을 때만. */
export function resolveCompare(
  versions: readonly TestCaseVersionSummary[],
  selected: string | null,
  requested: string | null,
): string | null {
  if (requested === null || requested === selected || selected === UNVERSIONED) return null
  return versions.some((version) => version.gameBuildId === requested) ? requested : null
}

/** 한쪽 버전에만 있는 줄의 문구 종류. 둘 다 있으면 null. */
export type AbsenceNote = 'notInOlder' | 'removedInNewer'

/**
 * 한쪽에만 있는 케이스를 사람 말로 가른다. 어느 쪽이 옛 버전인지는 build 가 만들어진 순서로 정한다.
 * - 새 버전에만 있다 → "구버전에는 없는 케이스"
 * - 옛 버전에만 있다 → "해당 버전에서 삭제된 기능"
 */
export function absenceNote(
  presence: VersionPresence,
  selected: TestCaseVersionSummary | undefined,
  compare: TestCaseVersionSummary | undefined,
): AbsenceNote | null {
  if (presence === 'BOTH' || selected === undefined || compare === undefined) return null
  const selectedIsNewer = selected.createdAt.localeCompare(compare.createdAt) >= 0
  const onlyInNewer = presence === 'ONLY_THIS' ? selectedIsNewer : !selectedIsNewer
  return onlyInNewer ? 'notInOlder' : 'removedInNewer'
}

/** 회귀: 비교 버전에서는 통과였는데 이 버전에서는 실패했거나 다시 봐야 한다. */
export function isRegression(row: Pick<VersionCaseRow, 'verificationStatus' | 'compareVerificationStatus'>): boolean {
  return (
    row.compareVerificationStatus === 'VERIFIED' &&
    (row.verificationStatus === 'FAILED' || row.verificationStatus === 'REGRESSION')
  )
}

/** 버전 목록의 한 줄: 묶음(안에 버전들) 또는 묶음 없는 버전 하나. */
export type VersionEntry =
  | { kind: 'group'; group: VersionGroup; versions: TestCaseVersionSummary[] }
  | { kind: 'version'; version: TestCaseVersionSummary }

/**
 * 숨기지 않은 버전을 묶음과 함께 늘어놓는다(ARTEL-1024).
 *
 * 순서는 최근 것이 위다. 묶음은 안에 든 가장 최근 버전의 자리에 서고(그래서 `2.X` 가 `1.X` 위다), 빈 묶음은 맨 아래에
 * 이름순이다. 묶음 안의 버전도 최근 것이 위다. 숨긴 버전은 빼고, 따로 [hiddenVersions] 로 읽는다.
 */
export function arrangeVersions(
  versions: readonly TestCaseVersionSummary[],
  groups: readonly VersionGroup[],
): VersionEntry[] {
  const newestFirst = [...versions]
    .filter((version) => !version.hidden)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  const known = new Map(groups.map((group) => [group.id, group]))
  const members = new Map<string, TestCaseVersionSummary[]>()
  const entries: VersionEntry[] = []
  for (const version of newestFirst) {
    const group = version.groupId === null ? undefined : known.get(version.groupId)
    if (group === undefined) {
      entries.push({ kind: 'version', version })
      continue
    }
    const list = members.get(group.id)
    if (list === undefined) {
      const created = [version]
      members.set(group.id, created)
      entries.push({ kind: 'group', group, versions: created })
    } else {
      list.push(version)
    }
  }
  const empty = groups
    .filter((group) => !members.has(group.id))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((group): VersionEntry => ({ kind: 'group', group, versions: [] }))
  return [...entries, ...empty]
}

/** 숨긴 버전, 최근 것이 위. */
export function hiddenVersions(versions: readonly TestCaseVersionSummary[]): TestCaseVersionSummary[] {
  return versions.filter((version) => version.hidden).sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}
