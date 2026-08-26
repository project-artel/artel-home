import { readJson } from '../projects/projectApi'
import { apiFetch } from '../auth/authApi'
import { contentMapPath } from './contentMapApi'

/** 서버가 스캔을 받아들였다는 사실. 완료가 아니다. */
export interface ScanRequested {
  /** 서버가 고른 인스턴스. 화면이 고른 것과 다를 수 있다. */
  gameInstanceId: string
  gameInstanceName: string
  /** 지금은 늘 `REQUESTED` 다. 이후 상태는 조회의 `lastScan` 에서 움직인다. */
  state: string
  requestedAt: string | null
}

/**
 * 붙어 있는 게임 인스턴스에 근거 스캔을 시킨다.
 *
 * 사람은 파일을 고르지 않는다. 이 호출이 실행 중인 게임에게 "지금 콘텐츠를 훑어서
 * 근거 문서를 올려라"라고 시키고, SDK 가 스스로 업로드하고, 서버가 그것을 적재한다.
 *
 * **202 는 "보냈다"가 아니라 "보낼 줄에 세웠다"까지만 뜻한다.** 서버는 액션을 띄우고
 * 곧바로 답한다 — 스캔이 끝났는지, 문서가 앉았는지는 이 응답에 없다. 화면은 조회를
 * 다시 불러 `lastScan.state` 와 `contentMap.ingestedAt` 이 움직이는 것으로 완료를 안다.
 *
 * **인스턴스를 보내지 않는다.** 서버가 이 빌드를 마지막으로 등록한 인스턴스들 중 세션이
 * 살아 있는 것을 직접 고른다(`game_instance.last_game_build_id`). 화면이 고른 값을 실어
 * 보내면 서버가 무시하는 값을 사용자에게 고르게 하는 셈이 된다 — 그래서 응답이 돌려주는
 * `gameInstanceName` 을 그대로 보여 주는 쪽이 정직하다.
 *
 * 붙어 있는 게임이 없으면 **409** 다. 404(빌드 없음·프로젝트 불일치)와 갈라져 있어야
 * 화면이 "게임을 켜라"와 "이 빌드가 없다"를 다른 말로 할 수 있다.
 */
export async function requestEvidenceScan(options: {
  projectId: string
  gameBuildId: string
}): Promise<ScanRequested> {
  const response = await apiFetch(
    contentMapPath(options.projectId, options.gameBuildId, '/scan'),
    { method: 'POST' },
  )
  const record = (await readJson(response)) as Record<string, unknown> | null
  return {
    gameInstanceId: String(record?.gameInstanceId ?? ''),
    gameInstanceName: String(record?.gameInstanceName ?? ''),
    state: String(record?.state ?? 'REQUESTED'),
    requestedAt: typeof record?.requestedAt === 'string' ? record.requestedAt : null,
  }
}
