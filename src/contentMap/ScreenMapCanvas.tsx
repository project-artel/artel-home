import { useMemo, type CSSProperties } from 'react'
import { useI18n } from '../i18n/useI18n'
import { truncate } from '../knowledge/knowledgeLabels'
import { sceneHue } from '../testCases/sceneHue'
import { conditionSummary } from './conditionSummary'
import {
  sameSelection,
  transitionKindStyle,
  type ContentMapSelection,
} from './contentMapTypes'
import { sceneKind, sceneTitle } from './sceneLabels'
import type {
  PlacedContainer,
  PlacedSceneEdge,
  PlacedScreen,
  PlacedScreenTransition,
  ScreenMapLayout,
} from './screenMapLayout'

/**
 * 중첩 다이어그램.
 *
 * 기존 `SceneGraphCanvas` 와 같은 이유로 포인터 전용이고 `aria-hidden` 이다. 씬과 화면 수십 개가
 * 전부 포커스를 받으면 페이지의 나머지에 닿기 전에 탭을 수십 번 눌러야 하고, 스크린 리더가
 * `<path>` 에 대해 할 말은 없다. `DESIGN.md` 가 시각 주석에 요구하는 대등한 대체물은 인스펙터이고,
 * 그것은 ARTEL-598 이다.
 *
 * ## 색을 빼고 읽어도 전부 갈린다
 *
 * | 무엇 | 채널 |
 * |---|---|
 * | 검증된 씬 전이 | 실선 + 속 찬 화살촉 |
 * | 아직 못 가본 씬 전이 | 점선 + 속 빈 화살촉 |
 * | 씬 전이 vs 화면 전이 | 굵기와 화살촉 모양 |
 * | 씬 경계를 넘는 화면 전이 | 선 밑에 깔린 배경색 casing |
 * | 밟은 씬 / 안 밟은 씬 | 컨테이너 테두리의 실선 / 점선 |
 *
 * casing 은 장식이 아니다. 없으면 선이 컨테이너 테두리와 만나는 자리에서 거기서 끊긴 것인지
 * 지나간 것인지 읽히지 않는다. 이 그림에서 경계를 넘는다는 사실이 가장 중요한 선에 그 모호함을
 * 남길 수 없다.
 */

type CanvasProps = {
  layout: ScreenMapLayout
  selection: ContentMapSelection | null
  onSelect: (selection: ContentMapSelection) => void
}

/** 씬 이름 라벨의 폭 예산, 라틴 문자 기준. 한글로는 절반쯤이다. */
const SCENE_NAME_WIDTH = 18

/** 화면 이름 라벨의 폭 예산. */
const SCREEN_NAME_WIDTH = 14

/**
 * `discriminator` 한 줄의 폭 예산. 원문은 인스펙터가 전부 보인다.
 *
 * 이 값은 **뒤에서부터** 남긴다. 앞은 어느 화면이든 `[{"selector":"` 로 똑같이 시작하고,
 * 두 화면을 실제로 가르는 것은 셀렉터의 끝마디와 `active` 값이다. 앞에서 자르면 한 씬의 세
 * 화면이 모두 같은 글자를 달고 서서, 왜 셋인지를 말해야 할 줄이 아무 말도 하지 않는다.
 */
const DISCRIMINATOR_WIDTH = 26

/** 선 위 라벨의 폭 예산. */
const EDGE_LABEL_WIDTH = 24

/**
 * 선 라벨을 늘 펼쳐 두는 선 수의 상한.
 *
 * 넘으면 글자들이 서로 겹쳐 어느 것이 어느 선의 것인지 못 읽는다. 그때는 고른 것과 포인터가
 * 얹힌 것만 보인다 — 감추는 것이 아니라 묻는 순서를 바꾸는 것이다.
 */
const EDGE_LABEL_LIMIT = 14

export function ScreenMapCanvas({ layout, selection, onSelect }: CanvasProps) {
  // 고른 것이 닿는 요소들. 나머지를 지우지 않고 조용하게만 두는 이유는, 주변이 있어야 고른
  // 것이 무엇을 뜻하는지 읽히기 때문이다.
  const related = useMemo(() => relatedIds(layout, selection), [layout, selection])
  const labelled = layout.sceneEdges.length + layout.screenTransitions.length <= EDGE_LABEL_LIMIT

  return (
    <svg
      aria-hidden="true"
      className="sm-canvas"
      preserveAspectRatio="xMidYMid meet"
      viewBox={layout.viewBox}
    >
      <defs>
        {/*
          화살촉은 `userSpaceOnUse` 다. 기본값인 `strokeWidth` 로 두면 씬 전이와 화면 전이의
          굵기 차이가 화살촉 크기까지 밀어, 굵기 하나가 두 가지를 말하게 된다.
        */}
        <marker
          className="sm-arrow sm-arrow--verified"
          id="sm-arrow-verified"
          markerHeight="9"
          markerUnits="userSpaceOnUse"
          markerWidth="9"
          orient="auto-start-reverse"
          refX="8"
          refY="4.5"
          viewBox="0 0 9 9"
        >
          <path d="M 0 0 L 9 4.5 L 0 9 z" />
        </marker>
        {/* 속이 빈 화살촉. 실선/점선과 함께, 색 없이도 두 번 갈린다. */}
        <marker
          className="sm-arrow sm-arrow--unverified"
          id="sm-arrow-unverified"
          markerHeight="9"
          markerUnits="userSpaceOnUse"
          markerWidth="9"
          orient="auto-start-reverse"
          refX="8"
          refY="4.5"
          viewBox="0 0 9 9"
        >
          <path d="M 0.8 0.9 L 8 4.5 L 0.8 8.1 z" />
        </marker>
        {/* 얇은 갈매기. 삼각형과 한눈에 갈려 화면 전이가 씬 전이로 읽히지 않는다. */}
        <marker
          className="sm-arrow sm-arrow--screen"
          id="sm-arrow-screen"
          markerHeight="8"
          markerUnits="userSpaceOnUse"
          markerWidth="8"
          orient="auto-start-reverse"
          refX="6.6"
          refY="4"
          viewBox="0 0 8 8"
        >
          <path d="M 0.8 0.8 L 6.6 4 L 0.8 7.2" />
        </marker>
      </defs>

      <g className="sm-scene-edges">
        {layout.sceneEdges.map((placed) => (
          <SceneEdgeMark
            dimmed={related !== null && !related.has(placed.id)}
            key={placed.id}
            labelled={labelled}
            onSelect={() => onSelect({ kind: 'sceneEdge', id: placed.id })}
            placed={placed}
            selected={sameSelection(selection, { kind: 'sceneEdge', id: placed.id })}
          />
        ))}
      </g>

      <g className="sm-containers">
        {layout.containers.map((container) => (
          <ContainerMark
            container={container}
            dimmed={related !== null && !related.has(container.id)}
            key={container.id}
            onSelect={() => onSelect({ kind: 'scene', id: container.id })}
            selected={sameSelection(selection, { kind: 'scene', id: container.id })}
          />
        ))}
      </g>

      {/*
        컨테이너 위에 그린다. 밑에 그리면 경계를 넘는 선이 컨테이너 안쪽 구간에서 배경에
        덮여, 이 그림이 보여 주려는 그 하나가 보이지 않는다.
      */}
      <g className="sm-screen-transitions">
        {layout.screenTransitions.map((placed) => (
          <ScreenTransitionMark
            dimmed={related !== null && !related.has(placed.id)}
            key={placed.id}
            labelled={labelled}
            onSelect={() => onSelect({ kind: 'screenTransition', id: placed.id })}
            placed={placed}
            selected={sameSelection(selection, { kind: 'screenTransition', id: placed.id })}
          />
        ))}
      </g>

      <g className="sm-screens">
        {layout.containers.flatMap((container) =>
          container.screens.map((placed) => (
            <ScreenMark
              dimmed={related !== null && !related.has(placed.screen.id)}
              key={placed.screen.id}
              onSelect={() => onSelect({ kind: 'screen', id: placed.screen.id })}
              placed={placed}
              selected={sameSelection(selection, { kind: 'screen', id: placed.screen.id })}
            />
          )),
        )}
      </g>
    </svg>
  )
}

/**
 * 고른 것이 닿는 요소들의 id. 아무것도 고르지 않았으면 `null` 이다.
 *
 * 빈 `Set` 이 아니라 `null` 인 것은 두 상태가 다르기 때문이다. 아무것도 안 골랐으면 전부
 * 또렷하고, 아무것도 안 닿는 것을 골랐으면 그것 하나만 또렷하다.
 */
function relatedIds(layout: ScreenMapLayout, selection: ContentMapSelection | null): Set<string> | null {
  if (selection === null) return null

  const touched = new Set<string>([selection.id])
  const containerOfScreen = new Map<string, string>()
  for (const container of layout.containers) {
    for (const placed of container.screens) containerOfScreen.set(placed.screen.id, container.id)
  }

  if (selection.kind === 'scene') {
    const container = layout.containers.find((candidate) => candidate.id === selection.id)
    for (const placed of container?.screens ?? []) touched.add(placed.screen.id)
    for (const placed of layout.sceneEdges) {
      if (placed.edge.from !== selection.id && placed.edge.to !== selection.id) continue
      touched.add(placed.id)
      touched.add(placed.edge.from)
      touched.add(placed.edge.to)
    }
    // 이 씬의 화면에 붙은 전이도 함께 밝힌다. 씬을 골랐는데 그 안의 선이 흐려지면 컨테이너가
    // 비어 보인다.
    for (const placed of layout.screenTransitions) {
      const from = containerOfScreen.get(placed.transition.fromScreenId)
      const to = containerOfScreen.get(placed.transition.toScreenId)
      if (from !== selection.id && to !== selection.id) continue
      touched.add(placed.id)
      touched.add(placed.transition.fromScreenId)
      touched.add(placed.transition.toScreenId)
    }
    return touched
  }

  if (selection.kind === 'screen') {
    const container = containerOfScreen.get(selection.id)
    if (container !== undefined) touched.add(container)
    for (const placed of layout.screenTransitions) {
      const { fromScreenId, toScreenId } = placed.transition
      if (fromScreenId !== selection.id && toScreenId !== selection.id) continue
      touched.add(placed.id)
      touched.add(fromScreenId)
      touched.add(toScreenId)
      for (const id of [fromScreenId, toScreenId]) {
        const owner = containerOfScreen.get(id)
        if (owner !== undefined) touched.add(owner)
      }
    }
    return touched
  }

  if (selection.kind === 'sceneEdge') {
    const placed = layout.sceneEdges.find((candidate) => candidate.id === selection.id)
    if (placed !== undefined) {
      touched.add(placed.edge.from)
      touched.add(placed.edge.to)
    }
    return touched
  }

  const placed = layout.screenTransitions.find((candidate) => candidate.id === selection.id)
  if (placed !== undefined) {
    for (const id of [placed.transition.fromScreenId, placed.transition.toScreenId]) {
      touched.add(id)
      const owner = containerOfScreen.get(id)
      if (owner !== undefined) touched.add(owner)
    }
  }
  return touched
}

/**
 * 긴 글의 **끝**을 남기고 앞을 줄인다.
 *
 * `truncate` 는 반대로 앞을 남긴다. 요약이나 이름에는 그쪽이 맞지만 `discriminator` 에는
 * 틀리다 — 어느 화면이든 같은 접두사로 시작하므로, 앞만 남기면 한 씬의 세 화면이 전부 같은
 * 글자를 달고 선다.
 */
function keepTail(text: string, limit: number): string {
  return text.length <= limit ? text : `…${text.slice(text.length - limit + 1)}`
}

function classes(...parts: (string | false | null)[]): string {
  return parts.filter((part): part is string => typeof part === 'string').join(' ')
}

/**
 * 씬 컨테이너 하나.
 *
 * 머리글에 이름과 화면 수가 있고, 화면이 0 개인 씬은 몸통에 그 사실을 한 줄로 쓴다. 빈 몸통을
 * 그냥 두면 "아직 QA 런이 없다"가 "이 씬은 그리다 만 것 같다"로 읽힌다.
 */
function ContainerMark({
  container,
  selected,
  dimmed,
  onSelect,
}: {
  container: PlacedContainer
  selected: boolean
  dimmed: boolean
  onSelect: () => void
}) {
  const { t } = useI18n()
  const copy = t.contentMap.screenMap
  const kind = sceneKind(container.node)
  const empty = container.screens.length === 0

  return (
    <g
      className={classes(
        'sm-container',
        `sm-container--${kind}`,
        selected && 'is-selected',
        dimmed && 'is-dimmed',
      )}
      onClick={onSelect}
      style={{ '--cat-hue': String(sceneHue(container.node.name)) } as CSSProperties}
      transform={`translate(${container.x} ${container.y})`}
    >
      <rect className="sm-container-frame" height={container.height} rx="6" width={container.width} />
      <rect className="sm-container-head" height={26} rx="5" width={container.width} />
      <text className="sm-container-name" x={12} y={19}>
        {truncate(sceneTitle(t, container.node), SCENE_NAME_WIDTH)}
      </text>
      {/* 0 은 적지 않는다. 몸통이 이미 그 사실을 문장으로 말하고, 여기 숫자를 더 놓으면
          좁은 컨테이너에서 씬 이름과 겹친다. */}
      {!empty && (
        <text className="sm-container-count mono" textAnchor="end" x={container.width - 12} y={19}>
          {copy.screenCount(container.screens.length)}
        </text>
      )}
      {empty && (
        <text className="sm-container-empty" x={container.width / 2} y={container.height - 22} textAnchor="middle">
          {copy.noScreens}
        </text>
      )}
    </g>
  )
}

/**
 * 화면 하나.
 *
 * 두 줄이다. 위는 이름, 아래는 `discriminator` — 이름은 표시용이고 화면을 실제로 가르는 것은
 * 아래쪽이라, 이름이 같아 보이는 두 화면이 왜 둘인지 그림에서 바로 읽혀야 한다.
 */
function ScreenMark({
  placed,
  selected,
  dimmed,
  onSelect,
}: {
  placed: PlacedScreen
  selected: boolean
  dimmed: boolean
  onSelect: () => void
}) {
  const { t } = useI18n()
  const copy = t.contentMap.screenMap
  const { screen } = placed
  const name = screen.name?.trim() ?? ''

  return (
    <g
      className={classes('sm-screen', selected && 'is-selected', dimmed && 'is-dimmed')}
      onClick={onSelect}
      transform={`translate(${placed.x} ${placed.y})`}
    >
      <rect className="sm-screen-frame" height={placed.height} rx="4" width={placed.width} />
      <text
        className={classes('sm-screen-name', name.length === 0 && 'is-unnamed')}
        x={9}
        y={18}
      >
        {truncate(name.length > 0 ? name : copy.unnamedScreen, SCREEN_NAME_WIDTH)}
      </text>
      <text className="sm-screen-observed mono" textAnchor="end" x={placed.width - 9} y={18}>
        {copy.observed(screen.observedCount)}
      </text>
      <text className="sm-screen-discriminator mono" x={9} y={35}>
        {keepTail(screen.discriminator, DISCRIMINATOR_WIDTH)}
      </text>
    </g>
  )
}

/**
 * 씬 전이 하나.
 *
 * `verifiedAt` 이 null 인 것이 이 화면 전체가 존재하는 이유다 — 아직 아무도 안 가 본 길이고,
 * 그것이 커버리지 구멍이다. 그래서 실선/점선과 속 찬/빈 화살촉 두 채널로 말한다. 색 하나로만
 * 갈랐다면 흑백으로 인쇄한 순간 그 사실이 사라진다.
 */
function SceneEdgeMark({
  placed,
  selected,
  dimmed,
  labelled,
  onSelect,
}: {
  placed: PlacedSceneEdge
  selected: boolean
  dimmed: boolean
  labelled: boolean
  onSelect: () => void
}) {
  const { t } = useI18n()
  const { transition } = placed.edge
  const verified = transition.verifiedAt !== null
  // 조건이 없는 전이는 라벨 자체가 없다. 빈 자리를 그리면 "조건 없음"과 "조건을 못 읽음"이
  // 같은 모양이 된다 — 그 둘을 가르는 것은 인스펙터의 문장이고, 그림은 아예 말하지 않는 쪽을
  // 고른다.
  const label = transition.given === null ? '' : conditionSummary(t, transition.given)

  return (
    <g
      className={classes(
        'sm-link sm-link--scene',
        verified ? 'is-verified' : 'is-unverified',
        selected && 'is-selected',
        dimmed && 'is-dimmed',
      )}
      onClick={onSelect}
    >
      {/* 선 자체는 1.9px 이라 포인터로 집기 어렵다. 넓고 투명한 사본이 히트 영역이 된다. */}
      <path className="sm-link-hit" d={placed.path} />
      <path
        className="sm-link-line"
        d={placed.path}
        markerEnd={`url(#sm-arrow-${verified ? 'verified' : 'unverified'})`}
      />
      <EdgeLabel labelled={labelled} placed={placed} selected={selected} text={label} />
    </g>
  )
}

/**
 * 화면 전이 하나.
 *
 * 씬 경계를 넘는 전이에는 선 밑에 배경색 casing 을 깐다. 컨테이너 테두리를 뚫고 지나가는
 * 것이 눈에 보여야 하기 때문이고, 그것이 이 선과 씬 안에서만 도는 선을 가르는 사실이다.
 */
function ScreenTransitionMark({
  placed,
  selected,
  dimmed,
  labelled,
  onSelect,
}: {
  placed: PlacedScreenTransition
  selected: boolean
  dimmed: boolean
  labelled: boolean
  onSelect: () => void
}) {
  const { transition } = placed
  const crossing = transition.crossesScene || placed.crossesContainer

  return (
    <g
      className={classes(
        'sm-link sm-link--screen',
        `sm-link--${transitionKindStyle(transition.kind)}`,
        crossing && 'is-crossing',
        selected && 'is-selected',
        dimmed && 'is-dimmed',
      )}
      onClick={onSelect}
    >
      {crossing && <path className="sm-link-casing" d={placed.path} />}
      <path className="sm-link-hit" d={placed.path} />
      <path className="sm-link-line" d={placed.path} markerEnd="url(#sm-arrow-screen)" />
      <EdgeLabel
        labelled={labelled}
        placed={placed}
        selected={selected}
        text={transition.capabilitySummary ?? ''}
      />
    </g>
  )
}

/**
 * 선 위의 한 줄.
 *
 * 늘 보이지 않을 때는 CSS 가 hover 로 되살린다. hover 를 React 상태로 들면 포인터가 지나갈
 * 때마다 그림 전체가 다시 그려지고, 씬이 수십 개인 빌드에서 그 비용이 곧바로 보인다.
 */
function EdgeLabel({
  placed,
  selected,
  labelled,
  text,
}: {
  placed: { midX: number; midY: number }
  selected: boolean
  labelled: boolean
  text: string
}) {
  const trimmed = text.trim()
  // 할 말이 없으면 자리도 만들지 않는다. 빈 라벨을 그리면 "조건 없음"과 "조건을 못 읽음"이
  // 같은 빈칸으로 보인다.
  if (trimmed.length === 0) return null

  return (
    <text
      className={classes('sm-link-label', !labelled && !selected && 'is-quiet')}
      textAnchor="middle"
      x={placed.midX}
      y={placed.midY - 8}
    >
      {truncate(trimmed, EDGE_LABEL_WIDTH)}
    </text>
  )
}
