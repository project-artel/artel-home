import { useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import type { Messages } from '../i18n/messages'
import { truncate } from '../knowledge/knowledgeLabels'
import type { KnowledgeNode } from '../knowledge/knowledgeTypes'
import { formatDateTime } from '../projects/formatters'
import {
  KNOWN_CAPABILITY_STATUSES,
  capabilityOriginStyle,
  edgeSourceStyle,
  transitionKindStyle,
  verificationStyle,
  type ContentMapGap,
  type ContentMapScreen,
  type ContentMapSelection,
  type SceneCapability,
  type SceneThumbnail,
  type ScreenImage,
} from './contentMapTypes'
import { edgeTargetName, sceneKind, sceneTitle } from './sceneLabels'
import { screenLabel, screenTitle } from './screenLabels'
import { ConditionTree, SceneStepList } from './SceneStepList'
import { selectorTail, type ScreenDiscriminator } from './screenDiscriminator'
import {
  anchoredToScreen,
  readSceneEvidence,
  readScreenEvidence,
  type ScreenCapabilityUse,
  type SceneEvidence,
  type ScreenEvidence,
  type ScreenMapIndex,
  type ScreenTransitionDetail,
} from './screenInspection'
import type { SceneEdgeModel, ScreenMapModel, ScreenTransitionModel } from './screenMapLayout'

/**
 * 방금 고른 것 하나, 그리고 그것뿐.
 *
 * ## 왜 목록이 여기서 빠졌나
 *
 * 예전에는 이 패널이 detail 위에 얹은 채로 씬 목록과 전이 목록 둘을 아래에 달고 있었다. 그러면
 * 목록에서 한 줄을 고를 때마다 답이 **스크롤 위쪽**에서 바뀌고, 좁은 화면에서는 패널 자체가
 * 캔버스 아래로 내려가 화면 밖에 있었다. 고르는 곳과 답이 뜨는 곳이 같은 세로줄에 겹쳐 있으면
 * 무엇을 해도 아무 일도 일어나지 않은 것처럼 보인다.
 *
 * 지금 목록은 캔버스 왼쪽의 `ContentMapTree` 로 옮겼고, 이 패널에는 방금 고른 것만 남는다.
 * 여기 뜨는 것은 언제나 마지막으로 고른 바로 그것이다.
 *
 * ## 그림이 답하지 못하는 것을 답한다
 *
 * 그림은 "이 빌드가 어떻게 흘렀나"에 답한다. 상자 하나가 152 × 48 픽셀이라, 그 상자가 **무엇인지**
 * 는 답할 자리가 없다. 이 패널이 그 자리다: 캡처, 이 화면임을 판정하는 조건, 여기서 되는 조작,
 * 여기에 묶인 지식.
 *
 * ## 색 없이도 전부 갈린다
 *
 * `DESIGN.md` 가 색만으로 상태를 말하는 것을 금지한다. `origin` 과 `verification` 은 배지에 **글자가
 * 들어 있고**, `verification` 은 테두리 굵기와 점선으로 한 번 더 갈린다. 그림자는 없다.
 */
export function ContentMapInspector({
  model,
  index,
  gaps,
  knowledge,
  selection,
  onSelect,
  onClear,
}: {
  model: ScreenMapModel
  index: ScreenMapIndex
  gaps: readonly ContentMapGap[]
  knowledge: KnowledgeState
  selection: ContentMapSelection | null
  onSelect: (selection: ContentMapSelection) => void
  onClear: () => void
}) {
  const { t } = useI18n()
  const copy = t.contentMap.inspector

  return (
    <div className="cm-inspector">
      <section aria-labelledby="sm-inspector-title" className="cm-inspector-selection">
        <header className="cm-inspector-header">
          <h3 id="sm-inspector-title">{copy.title}</h3>
          {selection !== null && (
            <button
              className="button button--secondary button--compact"
              onClick={onClear}
              type="button"
            >
              {copy.clear}
            </button>
          )}
        </header>

        <SelectionDetail
          gaps={gaps}
          index={index}
          knowledge={knowledge}
          model={model}
          onSelect={onSelect}
          selection={selection}
        />
      </section>
    </div>
  )
}

/**
 * 지식 그래프는 콘텐츠 맵과 다른 조회에서 온다.
 *
 * 세 상태를 그대로 들고 다니는 이유: 실패를 빈 목록으로 접으면 화면이 "이 화면에 묶인 지식이
 * 없다"고 말하게 되는데, 그것은 사실이 아니라 우리가 못 읽은 것이다.
 */
export type KnowledgeState = {
  status: 'loading' | 'ready' | 'error'
  nodes: readonly KnowledgeNode[]
}

function SelectionDetail({
  selection,
  model,
  index,
  gaps,
  knowledge,
  onSelect,
}: {
  selection: ContentMapSelection | null
  model: ScreenMapModel
  index: ScreenMapIndex
  gaps: readonly ContentMapGap[]
  knowledge: KnowledgeState
  onSelect: (selection: ContentMapSelection) => void
}) {
  const { t } = useI18n()
  const copy = t.contentMap.inspector

  if (selection === null) return <p className="cm-inspector-hint">{copy.selectHint}</p>

  if (selection.kind === 'screen') {
    const evidence = readScreenEvidence(index, selection.id)
    if (evidence === null) return <p className="cm-inspector-hint">{copy.missing}</p>
    return <ScreenDetail evidence={evidence} knowledge={knowledge} onSelect={onSelect} />
  }

  if (selection.kind === 'scene') {
    const evidence = readSceneEvidence(index, selection.id)
    if (evidence === null) return <p className="cm-inspector-hint">{copy.missing}</p>
    return <SceneDetail evidence={evidence} gaps={gaps} index={index} onSelect={onSelect} />
  }

  if (selection.kind === 'sceneEdge') {
    const placed = model.sceneEdges.find((candidate) => candidate.id === selection.id)
    if (placed === undefined) return <p className="cm-inspector-hint">{copy.missing}</p>
    return <SceneEdgeDetail index={index} onSelect={onSelect} placed={placed} />
  }

  const placed = model.screenTransitions.find((candidate) => candidate.id === selection.id)
  if (placed === undefined) return <p className="cm-inspector-hint">{copy.missing}</p>
  return <ScreenTransitionDetailPanel index={index} onSelect={onSelect} placed={placed} />
}

/**
 * 목록의 화면 한 줄.
 *
 * 이름 없는 화면이 보통이라, 한 씬의 화면 스물아홉 개가 전부 "이름 없는 screen" 한 줄로 서면
 * 목록이 무엇도 가르지 못한다. 그래서 이름이 없는 줄에만 id 를 붙인다 — 이름을 지어내지 않으면서
 * 줄끼리 구별되게 하는 값은 그것뿐이고, 무엇이 정말로 이 화면을 가르는지는 detail 의
 * discriminator 가 답한다.
 */
function ScreenButton({
  screen,
  selected = false,
  width,
  onSelect,
}: {
  screen: ContentMapScreen
  selected?: boolean
  width: number
  onSelect: (selection: ContentMapSelection) => void
}) {
  const { t } = useI18n()
  const copy = t.contentMap.inspector
  const named = (screen.name?.trim() ?? '').length > 0

  return (
    <button
      aria-current={selected ? 'true' : undefined}
      className={`sm-screen-button${selected ? ' is-selected' : ''}`}
      onClick={() => onSelect({ kind: 'screen', id: screen.id })}
      type="button"
    >
      <span className={`sm-screen-button-name${named ? '' : ' is-unnamed'}`}>
        {truncate(screenTitle(t, screen), width)}
      </span>
      {!named && <span className="mono sm-screen-button-id">{copy.screenIdShort(screen.id)}</span>}
      <span className="mono sm-screen-button-meta">{copy.observedCount(screen.observedCount)}</span>
    </button>
  )
}

function ScreenDetail({
  evidence,
  knowledge,
  onSelect,
}: {
  evidence: ScreenEvidence
  knowledge: KnowledgeState
  onSelect: (selection: ContentMapSelection) => void
}) {
  const { t } = useI18n()
  const copy = t.contentMap.inspector
  // 한 번만 좁혀 두고 아래에서 계속 쓴다. `evidence.container` 를 매번 다시 읽으면 콜백 안에서
  // 좁힘이 풀려 non-null 단언을 뿌리게 된다.
  const { screen, container } = evidence
  const named = (screen.name?.trim() ?? '').length > 0

  return (
    <div className="cm-detail">
      <p className="cm-detail-eyebrow">{copy.screenTitle}</p>
      <p className={`cm-detail-name${named ? '' : ' is-unnamed'}`}>{screenTitle(t, screen)}</p>
      {/* 이름이 없다는 것은 결손이 아니라 보통이다. 그 사실과, 그러면 무엇이 이 화면을 가르는지를
          함께 말해 두지 않으면 사용자는 화면이 뭔가 놓쳤다고 읽는다. */}
      {!named && <p className="cm-detail-note">{copy.unnamedNote}</p>}

      <dl className="cm-detail-fields">
        <dt>{copy.screenIdLabel}</dt>
        <dd className="mono">{screen.id}</dd>
        <dt>{copy.sceneLabel}</dt>
        <dd>
          {container === null ? (
            copy.sceneUnknown
          ) : (
            <button
              className="cm-detail-link"
              onClick={() => onSelect({ kind: 'scene', id: container.id })}
              type="button"
            >
              {sceneTitle(t, container.node)}
            </button>
          )}
        </dd>
        <dt>{copy.observedLabel}</dt>
        <dd className="mono">{copy.observedCount(screen.observedCount)}</dd>
        <dt>{copy.firstSeenLabel}</dt>
        <dd className="mono">{screen.firstSeenQaRunId ?? copy.firstSeenNone}</dd>
      </dl>

      <h4 className="cm-detail-subtitle">{copy.captureHeading}</h4>
      <ScreenCapture image={screen.image} title={screenTitle(t, screen)} />

      <h4 className="cm-detail-subtitle">{copy.discriminatorHeading}</h4>
      <DiscriminatorView discriminator={evidence.discriminator} />

      <h4 className="cm-detail-subtitle">{copy.capabilitiesHeading}</h4>
      <p className="cm-detail-note">{copy.capabilitiesNote}</p>
      {evidence.capabilities.length === 0 ? (
        <p className="cm-inspector-hint">{copy.capabilitiesNone}</p>
      ) : (
        <ul className="sm-capability-list">
          {evidence.capabilities.map((use) => (
            <CapabilityRow key={use.id} use={use} />
          ))}
        </ul>
      )}
      {/* 빠진 줄이 있다는 사실을 적어 두지 않으면, 씬 요약의 capability 개수와 이 목록의 길이를
          맞춰 보던 사람이 화면이 몇 줄을 잃었다고 읽는다. */}
      {evidence.notAStepCount > 0 && (
        <p className="cm-detail-note">{copy.capabilitiesNotAStep(evidence.notAStepCount)}</p>
      )}

      <h4 className="cm-detail-subtitle">{copy.knowledgeHeading}</h4>
      <AnchoredKnowledge knowledge={knowledge} screenId={screen.id} />

      <h4 className="cm-detail-subtitle">
        {copy.screenTransitionsHeading(evidence.outgoing.length)}
      </h4>
      {evidence.outgoing.length === 0 ? (
        <p className="cm-inspector-hint">{copy.screenTransitionsNone}</p>
      ) : (
        <ul className="cm-transition-list">
          {evidence.outgoing.map((detail) => (
            <li key={detail.id}>
              <OutgoingTransition detail={detail} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      )}
      <p className="cm-detail-note">{copy.incomingCount(evidence.incomingCount)}</p>
    </div>
  )
}

/**
 * 화면 캡처, 또는 아직 없다는 사실.
 *
 * **없음이 지금의 정상 상태다.** 살아 있는 빌드의 화면은 전부 캡처가 없다 — 관측은 화면을 남기지만
 * 그 그림을 올리는 경로가 아직 없기 때문이다. 그래서 오류로도, 영영 끝나지 않는 로딩으로도 그리지
 * 않는다. 자리표시만 두면 사용자는 기다려야 하는 줄 알고, 오류로 그리면 고쳐야 하는 줄 안다.
 *
 * 세 번째 상태가 하나 더 있다. 주소가 서명된 단기 주소라 만료되면 이미지가 깨지는데, 그것은
 * 서버가 모르는 사실이라 `onError` 로만 알 수 있다. 깨진 이미지 아이콘을 그대로 두면 사용자는
 * 캡처가 실패했다고 잘못 읽는다.
 */
function ScreenCapture({ image, title }: { image: ScreenImage | null; title: string }) {
  const { t } = useI18n()
  const copy = t.contentMap.inspector
  const [broken, setBroken] = useState(false)

  if (image === null) {
    return (
      <div className="sm-capture-empty">
        <p className="sm-capture-empty-title">{copy.captureNone}</p>
        <p className="cm-inspector-hint">{copy.captureNoneCopy}</p>
      </div>
    )
  }

  if (broken) return <p className="cm-inspector-hint">{copy.captureBroken}</p>

  return (
    <figure className="cm-thumb">
      <img alt={title} className="cm-thumb-image" onError={() => setBroken(true)} src={image.url} />
      {image.capturedAt !== null && (
        <figcaption className="cm-thumb-size mono">
          {copy.captureAt(formatDateTime(image.capturedAt))}
        </figcaption>
      )}
    </figure>
  )
}

/**
 * 씬 대표 이미지, 또는 만들지 못한 이유.
 *
 * 화면 캡처(`ScreenCapture`)와 갈래 수가 다르다. 이쪽은 서버가 실패 코드를 주므로 "신고하지
 * 않음"과 "찍으려다 실패함"이 갈리고, 화면 쪽은 그 칸이 없어 갈리지 않는다. 두 사실에 대해
 * 사용자가 할 일이 다르므로 여기서는 합치지 않는다 — 앞은 기다릴 일이고 뒤는 고칠 일이다.
 */
function SceneThumbnailView({
  thumbnail,
  title,
}: {
  thumbnail: SceneThumbnail | null
  title: string
}) {
  const { t } = useI18n()
  const copy = t.contentMap.list
  const [broken, setBroken] = useState(false)

  if (thumbnail === null) return <p className="cm-inspector-hint">{copy.thumbnailNone}</p>
  if (thumbnail.state === 'unavailable') {
    return <p className="cm-inspector-hint">{copy.thumbnailUnavailable(thumbnail.reason)}</p>
  }
  if (broken) return <p className="cm-inspector-hint">{copy.thumbnailBroken}</p>

  return (
    <figure className="cm-thumb">
      <img
        alt={title}
        className="cm-thumb-image"
        onError={() => setBroken(true)}
        src={thumbnail.url}
      />
      {thumbnail.width !== null && thumbnail.height !== null && (
        <figcaption className="cm-thumb-size mono">
          {copy.thumbnailSize(thumbnail.width, thumbnail.height)}
        </figcaption>
      )}
    </figure>
  )
}

/**
 * 이 화면임을 판정하는 조건.
 *
 * 아는 모양이면 selector 와 켜짐/꺼짐의 목록으로, 하나라도 어긋나면 원문 그대로. 중간이 없는
 * 이유는 `screenDiscriminator.ts` 에 적혀 있다 — 반쯤 읽은 것을 다 읽은 것처럼 그리면, 조건 셋이
 * 걸린 화면이 둘짜리로 읽힌다.
 */
function DiscriminatorView({ discriminator }: { discriminator: ScreenDiscriminator }) {
  const { t } = useI18n()
  const copy = t.contentMap.inspector

  if (discriminator.form === 'none') {
    return <p className="cm-inspector-hint">{copy.discriminatorNone}</p>
  }

  if (discriminator.form === 'raw') {
    return (
      <>
        <p className="cm-detail-note">{copy.discriminatorRawNote}</p>
        <p className="sm-discriminator-raw mono">{discriminator.text}</p>
      </>
    )
  }

  return (
    <>
      <p className="cm-detail-note">{copy.discriminatorEvery(discriminator.clauses.length)}</p>
      <ul className="sm-clause-list">
        {discriminator.clauses.map((clause) => (
          <li className={clause.active ? 'is-active' : 'is-inactive'} key={clause.selector}>
            {/* 글자가 상태를 말하고 기호는 반복이다. 기호만 두면 흑백에서 두 줄이 같아진다. */}
            <span className="sm-clause-state">
              {clause.active ? copy.clauseActive : copy.clauseInactive}
            </span>
            <span className="sm-clause-selector mono" title={clause.selector}>
              <span className="sm-clause-head">{clause.selector.slice(0, clause.selector.length - selectorTail(clause.selector).length)}</span>
              <span className="sm-clause-tail">{selectorTail(clause.selector)}</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

/** capability 하나와 두 배지. */
function CapabilityRow({ use }: { use: ScreenCapabilityUse }) {
  const { t } = useI18n()
  const copy = t.contentMap.inspector
  const summary = use.summary.trim()
  const used = use.transitionCount > 0

  return (
    <li className={`sm-capability${used ? ' is-used' : ''}`}>
      <p className="sm-capability-summary">{summary.length > 0 ? summary : copy.capabilityUntitled}</p>
      <p className="sm-capability-badges">
        {use.capability === null ? (
          <span className="cm-inspector-hint">{copy.capabilityMissing}</span>
        ) : (
          <>
            <OriginBadge capability={use.capability} />
            <VerificationBadge verification={use.capability.verification} />
            <span className="sm-capability-status">
              {statusName(t, use.capability.status)}
            </span>
          </>
        )}
      </p>
      {/* 관측된 부분과 유도한 부분이 여기서 갈린다. 이 줄이 없으면 씬의 목록 전체가
          "이 화면에서 되는 것"으로 읽힌다. */}
      <p className={`sm-capability-use${used ? ' is-used' : ''}`}>
        {used ? copy.capabilityUsedHere(use.transitionCount) : copy.capabilityNotUsedHere}
      </p>
    </li>
  )
}

/** 서버 어휘를 아는 이름으로 바꾸되, 모르는 값은 서버 철자 그대로 남긴다. */
function statusName(t: Messages, status: string): string {
  const known = STATUS_KEYS.get(status)
  return known === undefined
    ? t.contentMap.steps.statusUnknown(status)
    : t.contentMap.summary.statuses[known]
}

/*
 * 서버는 상태를 kebab-case 로 보내고 요약 줄은 camelCase 키로 센다. `stepStatusStyle` 은
 * `not-a-step` 을 모르는 값으로 떨어뜨리므로 — 단계 목록에는 그 상태가 오지 않기 때문이다 —
 * capability 목록은 네 상태를 전부 아는 이 표를 따로 쓴다.
 */
const STATUS_KEYS = new Map<string, (typeof KNOWN_CAPABILITY_STATUSES)[number]>([
  ['runnable', 'runnable'],
  ['needs-probe', 'needsProbe'],
  ['not-a-step', 'notAStep'],
  ['unreachable-precondition', 'unreachablePrecondition'],
])

function OriginBadge({ capability }: { capability: SceneCapability }) {
  const { t } = useI18n()
  const copy = t.contentMap.inspector
  const style = capabilityOriginStyle(capability.origin)
  const name = style === 'unknown' ? copy.originUnknown(capability.origin) : copy.origins[style]

  return (
    <span className={`sm-badge sm-badge--origin sm-badge--origin-${style}`}>
      <span className="sm-badge-label">{copy.originLabel}</span>
      {name}
    </span>
  )
}

/**
 * 확인 상태.
 *
 * 셋을 절대 같은 모양으로 그리지 않는다. `unverified` 는 아직 안 해 본 것이고 `contradicted` 는
 * 해 봤는데 아니었던 것이다 — 앞은 커버리지 구멍이고 뒤는 결함이다. 글자와 테두리 두 채널로
 * 갈라 두면 색을 빼고 읽어도 셋이 남는다.
 */
function VerificationBadge({ verification }: { verification: string }) {
  const { t } = useI18n()
  const copy = t.contentMap.inspector
  const style = verificationStyle(verification)
  const name = style === 'unknown' ? copy.verificationUnknown(verification) : copy.verifications[style]

  return (
    <span className={`sm-badge sm-badge--verification sm-badge--${style}`}>
      <span className="sm-badge-label">{copy.verificationLabel}</span>
      {name}
    </span>
  )
}

function AnchoredKnowledge({
  knowledge,
  screenId,
}: {
  knowledge: KnowledgeState
  screenId: string
}) {
  const { t } = useI18n()
  const copy = t.contentMap.inspector

  if (knowledge.status === 'loading') return <p className="cm-inspector-hint">{copy.knowledgeLoading}</p>
  // 못 읽은 것을 "없다"로 접지 않는다. 둘은 사용자가 할 일이 다른 사실이다.
  if (knowledge.status === 'error') return <p className="cm-inspector-hint">{copy.knowledgeFailed}</p>

  const anchored = anchoredToScreen(knowledge.nodes, screenId)
  if (anchored.length === 0) return <p className="cm-inspector-hint">{copy.knowledgeNone}</p>

  return (
    <ul className="sm-knowledge-list">
      {anchored.map((node) => (
        <li key={node.id}>
          <span className={`kg-tag kg-tag--${node.tag}`}>{node.tag}</span>
          <span className="sm-knowledge-summary">{node.summary}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * 이 화면에서 나가는 전이 한 줄.
 *
 * "확인됐나"는 전이 자체에 없는 칸이다. 그 전이를 일으킨 capability 의 `verification` 이 이
 * 화면에서 답할 수 있는 유일한 확인이고, 자동 전이에는 그 capability 자체가 없다 — 타이머나
 * 로딩 완료처럼 테스트 케이스가 지시할 수 없는 것이다. 그 둘을 같은 배지로 그리면 "확인 안 됨"과
 * "확인할 것이 없음"이 한 줄로 보인다.
 */
function OutgoingTransition({
  detail,
  onSelect,
}: {
  detail: ScreenTransitionDetail
  onSelect: (selection: ContentMapSelection) => void
}) {
  const { t } = useI18n()
  const copy = t.contentMap.inspector
  const { transition } = detail
  const style = transitionKindStyle(transition.kind)
  const kindName = style === 'unknown' ? copy.transitionKindUnknown(transition.kind) : copy.transitionKinds[style]

  return (
    <button
      className={`cm-transition cm-transition--${style}`}
      onClick={() => onSelect({ kind: 'screenTransition', id: detail.id })}
      type="button"
    >
      <span className="cm-transition-target">
        {copy.transitionTo(
          detail.to === null ? copy.screenUnknown : truncate(screenLabel(t, detail.to), 36),
        )}
      </span>
      <span className="cm-transition-meta">
        <span>{kindName}</span>
        <span aria-hidden="true">·</span>
        <span className="mono">{copy.observedCount(transition.observedCount)}</span>
        {transition.crossesScene && (
          <>
            <span aria-hidden="true">·</span>
            <span>{copy.crossesScene}</span>
          </>
        )}
      </span>
      <span className="cm-transition-meta">
        {detail.capability === null ? (
          <span>
            {transition.capabilityId === null
              ? copy.transitionNoCapability
              : copy.transitionCapabilityGone}
          </span>
        ) : (
          <VerificationBadge verification={detail.capability.verification} />
        )}
      </span>
    </button>
  )
}

function SceneDetail({
  evidence,
  gaps,
  index,
  onSelect,
}: {
  evidence: SceneEvidence
  gaps: readonly ContentMapGap[]
  index: ScreenMapIndex
  onSelect: (selection: ContentMapSelection) => void
}) {
  const { t } = useI18n()
  const copy = t.contentMap.inspector
  const { container, scene } = evidence
  const kind = sceneKind(container.node)

  return (
    <div className="cm-detail">
      <p className="cm-detail-eyebrow">{copy.sceneTitle}</p>
      <p className="cm-detail-name">{sceneTitle(t, container.node)}</p>
      <p className={`cm-kind cm-kind--${kind}`}>{t.contentMap.graph.sceneKinds[kind]}</p>

      {scene === null ? (
        <p className="cm-detail-note">
          {container.node.missingFromResponse
            ? t.contentMap.list.unmappedCopy
            : t.contentMap.list.nameOnly}
        </p>
      ) : (
        <>
          <dl className="cm-detail-fields">
            <dt>{t.contentMap.list.sceneIdLabel}</dt>
            <dd className="mono">{scene.id}</dd>
          </dl>

          <h4 className="cm-detail-subtitle">{t.contentMap.list.thumbnailHeading}</h4>
          <SceneThumbnailView thumbnail={scene.thumbnail} title={sceneTitle(t, container.node)} />

          <h4 className="cm-detail-subtitle">{t.contentMap.list.capabilitiesHeading}</h4>
          {scene.capabilities.total === 0 ? (
            <p className="cm-inspector-hint">{t.contentMap.list.noCapabilities}</p>
          ) : (
            <ul className="cm-capability-list">
              {KNOWN_CAPABILITY_STATUSES.filter((status) => scene.capabilities[status] > 0).map(
                (status) => (
                  <li key={status}>
                    <span aria-hidden="true" className={`cm-status-dot cm-status-dot--${status}`} />
                    <span>{t.contentMap.summary.statuses[status]}</span>
                    <span className="mono cm-capability-count">{scene.capabilities[status]}</span>
                  </li>
                ),
              )}
            </ul>
          )}

          {/* 개수 바로 다음에 온다. "capability 6개"를 읽은 다음 묻게 되는 것이 "그래서 무엇을
              할 수 있나"이고, 그 답이 여기 있다. */}
          <SceneStepList scene={scene} />
        </>
      )}

      <h4 className="cm-detail-subtitle">{copy.sceneScreensHeading(evidence.screens.length)}</h4>
      {evidence.screens.length === 0 ? (
        <p className="cm-inspector-hint">{copy.sceneScreensNone}</p>
      ) : (
        <ul className="sm-screen-list">
          {evidence.screens.map((screen) => (
            <li key={screen.id}>
              <ScreenButton onSelect={onSelect} screen={screen} width={26} />
            </li>
          ))}
        </ul>
      )}

      <h4 className="cm-detail-subtitle">{copy.sceneEdgesHeading(evidence.outgoing.length)}</h4>
      {evidence.outgoing.length === 0 ? (
        <p className="cm-inspector-hint">{copy.sceneEdgesNone}</p>
      ) : (
        <ul className="cm-transition-list">
          {evidence.outgoing.map((placed) => (
            <li key={placed.id}>
              <SceneEdgeButton
                label={copy.transitionTo(truncate(edgeTargetName(t, placed), 32))}
                onSelect={onSelect}
                placed={placed}
              />
            </li>
          ))}
        </ul>
      )}
      {/* 들어오는 것도 목록이다. "이 씬에 어떻게 닿는가"는 커버리지를 읽을 때 나가는 길만큼
          자주 묻는 질문이고, 세기만 하면 그 답을 따라갈 수 없다. */}
      <h4 className="cm-detail-subtitle">{copy.sceneEdgesIncomingHeading(evidence.incoming.length)}</h4>
      {evidence.incoming.length === 0 ? (
        <p className="cm-inspector-hint">{copy.sceneEdgesNoneIncoming}</p>
      ) : (
        <ul className="cm-transition-list">
          {evidence.incoming.map((placed) => (
            <li key={placed.id}>
              <SceneEdgeButton
                label={copy.transitionFrom(truncate(sceneNodeName(t, index, placed.edge.from), 32))}
                onSelect={onSelect}
                placed={placed}
              />
            </li>
          ))}
        </ul>
      )}

      <h4 className="cm-detail-subtitle">{copy.gapsHeading}</h4>
      {/* 지도 전체의 집계다. 씬별로 가른 값이 응답에 없으므로 씬의 것인 척하지 않는다. */}
      <p className="cm-detail-note">{copy.gapsNote}</p>
      {gaps.length === 0 ? (
        <p className="cm-inspector-hint">{copy.gapsNone}</p>
      ) : (
        <ul className="cm-gap-list">
          {gaps.map((gap) => (
            <li key={gap.reason}>
              <span className="cm-gap-reason mono">{gap.reason}</span>
              <span className="cm-gap-count">{gap.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * 씬 전이 한 줄. 확인 여부는 여기서만 `verifiedAt` 이라는 진짜 칸에서 나온다.
 *
 * 라벨을 밖에서 받는 이유: 같은 전이가 나가는 목록에서는 목적지로, 들어오는 목록에서는
 * 출발지로 읽혀야 한다. 방향을 안에서 정하면 두 목록 중 하나가 반드시 거꾸로 선다.
 */
function SceneEdgeButton({
  label,
  placed,
  onSelect,
}: {
  label: string
  placed: SceneEdgeModel
  onSelect: (selection: ContentMapSelection) => void
}) {
  const { t } = useI18n()
  const { transition } = placed.edge
  const style = edgeSourceStyle(transition.source)
  const sourceName =
    style === 'unknown'
      ? transition.source.length > 0
        ? transition.source
        : t.contentMap.graph.sources.unknown
      : t.contentMap.graph.sources[style]

  return (
    <button
      className={`cm-transition cm-transition--${style}`}
      onClick={() => onSelect({ kind: 'sceneEdge', id: placed.id })}
      type="button"
    >
      <span className="cm-transition-target">{label}</span>
      <span className="cm-transition-meta">
        <span>{sourceName}</span>
        <span aria-hidden="true">·</span>
        <span className={`sm-verified sm-verified--${transition.verifiedAt === null ? 'no' : 'yes'}`}>
          {transition.verifiedAt === null
            ? t.contentMap.list.notVerified
            : t.contentMap.list.verifiedAt(formatDateTime(transition.verifiedAt))}
        </span>
      </span>
    </button>
  )
}

/** 노드 id 로 씬 이름을. 그림에 없는 id 는 그 사실 자체를 이름 자리에 적는다. */
function sceneNodeName(t: Messages, index: ScreenMapIndex, nodeId: string): string {
  const container = index.containerById.get(nodeId)
  return container === undefined
    ? t.contentMap.inspector.sceneUnknown
    : sceneTitle(t, container.node)
}

function SceneEdgeDetail({
  placed,
  index,
  onSelect,
}: {
  placed: SceneEdgeModel
  index: ScreenMapIndex
  onSelect: (selection: ContentMapSelection) => void
}) {
  const { t } = useI18n()
  const copy = t.contentMap.inspector
  const { transition } = placed.edge
  const from = index.containerById.get(placed.edge.from)

  return (
    <div className="cm-detail">
      <p className="cm-detail-eyebrow">{copy.sceneEdgeTitle}</p>
      <p className="cm-detail-name">
        {copy.edgePair(
          from === undefined ? copy.sceneUnknown : sceneTitle(t, from.node),
          edgeTargetName(t, placed),
        )}
      </p>

      <dl className="cm-detail-fields">
        <dt>{copy.edgeSourceLabel}</dt>
        <dd>{transition.source.length > 0 ? transition.source : t.contentMap.graph.sources.unknown}</dd>
        <dt>{copy.verificationLabel}</dt>
        <dd className={`sm-verified sm-verified--${transition.verifiedAt === null ? 'no' : 'yes'}`}>
          {transition.verifiedAt === null
            ? t.contentMap.list.notVerified
            : t.contentMap.list.verifiedAt(formatDateTime(transition.verifiedAt))}
        </dd>
        <dt>{copy.capabilityIdLabel}</dt>
        <dd className="mono">{transition.capabilityId ?? t.contentMap.list.noCapabilityLink}</dd>
      </dl>

      {from !== undefined && (
        <button
          className="cm-detail-link"
          onClick={() => onSelect({ kind: 'scene', id: from.id })}
          type="button"
        >
          {copy.openScene(sceneTitle(t, from.node))}
        </button>
      )}

      {/* 그림은 조건을 한 줄로 접는다. 여기가 접지 않은 것을 늘 두는 자리다. */}
      {transition.given !== null && (
        <div className="cm-transition-condition">
          <ConditionTree node={transition.given} />
        </div>
      )}
    </div>
  )
}

function ScreenTransitionDetailPanel({
  placed,
  index,
  onSelect,
}: {
  placed: ScreenTransitionModel
  index: ScreenMapIndex
  onSelect: (selection: ContentMapSelection) => void
}) {
  const { t } = useI18n()
  const copy = t.contentMap.inspector
  const { transition } = placed
  const from = index.screenById.get(transition.fromScreenId)
  const to = index.screenById.get(transition.toScreenId)
  const capability =
    transition.capabilityId === null
      ? null
      : (index.capabilityById.get(transition.capabilityId) ?? null)
  const style = transitionKindStyle(transition.kind)

  return (
    <div className="cm-detail">
      <p className="cm-detail-eyebrow">{copy.screenTransitionTitle}</p>
      <p className="cm-detail-name">
        {copy.edgePair(
          from === undefined ? copy.screenUnknown : screenLabel(t, from),
          to === undefined ? copy.screenUnknown : screenLabel(t, to),
        )}
      </p>

      <dl className="cm-detail-fields">
        <dt>{copy.transitionKindLabel}</dt>
        <dd>{style === 'unknown' ? copy.transitionKindUnknown(transition.kind) : copy.transitionKinds[style]}</dd>
        <dt>{copy.observedLabel}</dt>
        <dd className="mono">{copy.observedCount(transition.observedCount)}</dd>
        <dt>{copy.crossesSceneLabel}</dt>
        <dd>{transition.crossesScene ? copy.crossesSceneYes : copy.crossesSceneNo}</dd>
      </dl>

      <h4 className="cm-detail-subtitle">{copy.transitionCapabilityHeading}</h4>
      {capability === null ? (
        <p className="cm-inspector-hint">
          {transition.capabilityId === null
            ? copy.transitionNoCapabilityCopy
            : copy.transitionCapabilityGone}
        </p>
      ) : (
        <ul className="sm-capability-list">
          <CapabilityRow
            use={{ id: capability.id, capability, summary: capability.summary, transitionCount: 1 }}
          />
        </ul>
      )}

      <div className="sm-detail-jump">
        {from !== undefined && (
          <button
            className="cm-detail-link"
            onClick={() => onSelect({ kind: 'screen', id: from.id })}
            type="button"
          >
            {copy.openScreen(screenLabel(t, from))}
          </button>
        )}
        {to !== undefined && (
          <button
            className="cm-detail-link"
            onClick={() => onSelect({ kind: 'screen', id: to.id })}
            type="button"
          >
            {copy.openScreen(screenLabel(t, to))}
          </button>
        )}
      </div>
    </div>
  )
}
