export const AXES = ['model', 'reasoningEffort', 'promptVersion', 'agentArch'] as const

export type Axis = (typeof AXES)[number]

/**
 * 축 조합 하나의 지식 집계.
 *
 * 세는 단위가 QA 집계와 다르다. 저쪽은 런을 세고 여기는 **content 버전**을 센다 — 한 항목을
 * 두 번 고치면 세 버전이고, 각 버전은 그것을 만든 런의 축에 귀속된다. 그래서 이 표의 "만든 것"이
 * QA 표의 런 수와 맞아떨어질 이유가 없다.
 */
export interface KnowledgeStatsCell extends KnowledgeStatsTotals {
  model: string | null
  reasoningEffort: string | null
  promptVersion: string | null
  agentArch: string | null
}

export interface KnowledgeStatsTotals {
  /** 이 축의 런들이 만든 content 버전 수. 항목 수가 아니다. */
  entryVersions: number
  /** 그중 아직 최신인 것. 나중 수정에 밀린 버전이 여기서 빠지는 것은 폐기와 다르다. */
  currentVersions: number
  /** 현재 삭제 상태인 것. */
  deletedVersions: number
  /**
   * 삭제하되 **만든 런과 다른 런이** 지운 것. 후속 런이 공짜 심판 노릇을 한 신호다.
   *
   * 지금은 수리와 폐기가 섞여 있다 — 지우고 다시 기록하는 경로가 살아 있어 수리 한 번이
   * DELETE + CREATE로 나가면 여기 잡힌다. 화면이 이것을 그냥 "폐기율"이라고 쓰면 지식을
   * 성실히 고치는 설정이 제일 나빠 보인다.
   */
  repudiatedVersions: number
  /** 이 버전들이 검색으로 나간 총 횟수. */
  retrievalTotal: number
  /** 그중 실제로 인용된 횟수. */
  citationTotal: number
  /**
   * 인용 여부를 **알 수 있었던** 횟수. 인용 보고 기능이 붙기 전 런은 여기 안 들어온다.
   * 인용률의 분모가 `retrievalTotal`이 아니라 이 값이어야 하는 이유다.
   */
  citationKnownTotal: number
}

export interface KnowledgeStats {
  /** 물어본 프로젝트. 전체 합산으로 부르면 null 이다. */
  projectId: string | null
  from: string
  to: string
  total: KnowledgeStatsTotals
  cells: KnowledgeStatsCell[]
  /** 조합 수가 상한을 넘어 `cells`가 잘렸는지. 서면 표의 합이 총계보다 작다. */
  truncated: boolean
  cellLimit: number
}
