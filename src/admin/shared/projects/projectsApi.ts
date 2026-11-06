import { apiFetch, asRecord, asString, readJson } from '../adminApi'

export interface ProjectSummary {
  id: string
  name: string
  /** 로그인한 사람이 참여 중인 프로젝트인지. 개발자 등급에게만 false가 나온다. */
  mine: boolean
}

/** 한 번에 받아올 최대 개수. 서버의 `size` 상한이 100이라 그 위로는 올릴 수 없다. */
const PAGE_SIZE = 100

/**
 * Every project, for the picker. The admin screens always read across all
 * projects, so this asks for `scope=ALL` and then the caller's own projects
 * once more to fill [ProjectSummary.mine].
 *
 * The response's `myRole` is not used: under `scope=ALL` a project the caller
 * never joined also comes back as `MEMBER`, so it cannot tell real membership
 * apart. If the second call fails the list still comes back; the badge only
 * helps, and losing it must not empty the picker.
 */
export async function listProjects(signal?: AbortSignal): Promise<ProjectSummary[]> {
  const all = await fetchPage('ALL', signal)
  const mineIds = await fetchMineIds(signal)
  return all.map((project) => ({ ...project, mine: mineIds.has(project.id) }))
}

async function fetchMineIds(signal?: AbortSignal): Promise<Set<string>> {
  try {
    return new Set((await fetchPage('MINE', signal)).map((project) => project.id))
  } catch {
    return new Set()
  }
}

async function fetchPage(
  scope: 'MINE' | 'ALL',
  signal?: AbortSignal
): Promise<Array<Omit<ProjectSummary, 'mine'>>> {
  const response = await apiFetch(`/api/projects?page=0&size=${PAGE_SIZE}&scope=${scope}`, {
    signal,
  })
  const body = asRecord(await readJson(response))
  const items = Array.isArray(body.items) ? body.items : []

  return items.map((item) => {
    const project = asRecord(item)
    return {
      id: asString(project.id, 'project.id'),
      name: asString(project.name, 'project.name'),
    }
  })
}
