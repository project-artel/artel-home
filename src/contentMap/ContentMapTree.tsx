import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useI18n } from '../i18n/useI18n'
import { truncate } from '../knowledge/knowledgeLabels'
import { SceneChip } from '../testCases/SceneChip'
import {
  edgeSourceStyle,
  sameSelection,
  transitionKindStyle,
  type ContentMapSelection,
} from './contentMapTypes'
import {
  buildContentMapTree,
  expandTreePath,
  NOTHING_EXPANDED,
  rowKey,
  rowSelection,
  toggleTreeRow,
  treeKeyCommand,
  treePathTo,
  visibleTreeRows,
  type SceneEdgeEntry,
  type SceneTreeNode,
  type ScreenTransitionEntry,
  type ScreenTreeNode,
  type TreeRow,
} from './contentMapTree'
import { edgeTargetName, sceneKind, sceneTitle } from './sceneLabels'
import { screenIsNamed, screenLabel, screenTitle } from './screenLabels'
import type { ScreenMapIndex } from './screenInspection'
import type { ScreenMapModel } from './screenMapLayout'

/**
 * 그림을 고르는 두 번째 손, 그리고 유일한 키보드 경로.
 *
 * `ScreenMapCanvas` 는 포인터 전용이고 `aria-hidden` 이다. 그래서 씬·화면·씬 전이·화면 전이 네
 * 갈래를 키보드와 스크린 리더로 고르는 길은 여기뿐이고, 그 사실이 이 pane 이 캔버스 **왼쪽**에
 * 서는 이유다. 예전에는 같은 목록이 detail 아래에 묻혀 있었는데, 목록에서 무언가를 고르면 그
 * 결과가 스크롤 위쪽에서 바뀌어 아무 일도 일어나지 않은 것처럼 보였다.
 *
 * ## 그림에서 고른 것이 여기서도 보인다
 *
 * 선택이 캔버스에서 오면 세 가지를 한다: 그 줄이 든 가지를 펼치고, 밝히고, 스크롤해서 보인다.
 * 셋 중 하나라도 빠지면 pane 이 셋이 된 것 말고는 달라진 것이 없다 — 고른 것이 접힌 가지 안이나
 * 스크롤 밖에 있으면, 사용자에게는 그림만 반짝인 것으로 보인다.
 *
 * ## 포커스를 훔치지 않는다
 *
 * 캔버스를 클릭해서 온 선택은 스크롤만 시킨다. 포커스는 사용자가 tree 안에서 키를 눌렀을 때만
 * 옮긴다 — 그림을 만지는 동안 포커스가 옆 pane 으로 튀면 그다음 탭이 어디로 갈지 알 수 없다.
 */
export function ContentMapTree({
  index,
  model,
  onSelect,
  selection,
}: {
  index: ScreenMapIndex
  model: ScreenMapModel
  selection: ContentMapSelection | null
  onSelect: (selection: ContentMapSelection) => void
}) {
  const { t } = useI18n()
  const copy = t.contentMap.tree

  const tree = useMemo(() => buildContentMapTree(model, index), [index, model])
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(NOTHING_EXPANDED)
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const [lastSelection, setLastSelection] = useState(selection)

  const rowNodes = useRef(new Map<string, HTMLLIElement>())
  const registerRow = useCallback((key: string, node: HTMLLIElement | null) => {
    if (node === null) rowNodes.current.delete(key)
    else rowNodes.current.set(key, node)
  }, [])

  const selectedKey = selection === null ? null : rowKey(selection)

  /*
   * 선택이 바뀌면 그 줄이 든 가지를 펼치고, 탭이 그 줄로 들어오게 한다.
   *
   * effect 가 아니라 렌더 중에 맞춘다. effect 로 미루면 접힌 줄이 한 프레임 늦게 펼쳐져 그
   * 사이에 스크롤이 엉뚱한 자리로 가고, React 가 말하는 cascading render 가 그대로 생긴다.
   * 이것은 "prop 이 바뀔 때 state 를 맞추는" 관용구이고, 여기서 setState 는 렌더 결과를 버리고
   * 곧바로 다시 그리게 할 뿐 커밋을 한 번 더 만들지 않는다.
   *
   * 펼침은 더하기만 한다. 이미 다 펼쳐져 있으면 `expandTreePath` 가 같은 집합을 그대로
   * 돌려주므로 상태가 바뀌지 않고, 다시 그리지도 않는다.
   */
  if (selection !== lastSelection) {
    setLastSelection(selection)
    if (selection !== null) {
      setExpanded((previous) => expandTreePath(previous, treePathTo(index, selection)))
      setFocusedKey(rowKey(selection))
    }
  }

  const rows = useMemo(() => visibleTreeRows(tree, expanded), [expanded, tree])

  // 펼쳐진 뒤에 스크롤한다. `expanded` 가 딸려 있어야 접힌 가지가 열린 그 렌더에서 한 번 더
  // 돌고, 그때 비로소 줄이 실제로 있다. `nearest` 인 이유는 이미 보이는 줄을 굳이 움직이지
  // 않기 위해서다 — 넓은 화면에서는 아무 일도 일어나지 않는다.
  useEffect(() => {
    if (selectedKey === null) return
    rowNodes.current.get(selectedKey)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [expanded, selectedKey])

  const handleKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const command = treeKeyCommand(rows, focusedKey, event.key)
    if (command === null) return
    event.preventDefault()

    if (command.action === 'focus') {
      setFocusedKey(command.key)
      rowNodes.current.get(command.key)?.focus()
      return
    }
    if (command.action === 'select') {
      const row = rows.find((candidate) => candidate.key === command.key)
      if (row !== undefined) onSelect(rowSelection(row))
      return
    }
    // expand 와 collapse 는 지금 상태의 반대쪽이라는 것을 `treeKeyCommand` 가 이미 확인했다.
    setExpanded((previous) => toggleTreeRow(previous, command.key))
  }

  if (rows.length === 0) {
    return (
      <div className="cm-tree-panel">
        <h3 className="cm-tree-title">{copy.title}</h3>
        <p className="cm-inspector-hint">{copy.empty}</p>
      </div>
    )
  }

  return (
    <div className="cm-tree-panel">
      <h3 className="cm-tree-title" id="cm-tree-title">
        {copy.title}
      </h3>
      <p className="cm-tree-hint" id="cm-tree-hint">
        {copy.keyboardHint}
      </p>
      <ul
        aria-describedby="cm-tree-hint"
        aria-labelledby="cm-tree-title"
        className="cm-tree"
        onKeyDown={handleKeyDown}
        role="tree"
      >
        {rows.map((row) => {
          const selected = sameSelection(selection, rowSelection(row))
          return (
            <li
              aria-expanded={row.expandable ? row.expanded : undefined}
              aria-level={row.level}
              aria-posinset={row.position}
              aria-selected={selected}
              aria-setsize={row.setSize}
              className={`cm-tree-row cm-tree-row--${row.kind}${selected ? ' is-selected' : ''}`}
              key={row.key}
              onClick={() => onSelect(rowSelection(row))}
              ref={(node) => registerRow(row.key, node)}
              role="treeitem"
              style={{ paddingLeft: `calc(var(--space-2) + ${(row.level - 1) * 14}px)` }}
              tabIndex={row.key === focusedKey ? 0 : -1}
            >
              <Twisty
                expandable={row.expandable}
                expanded={row.expanded}
                onToggle={() => setExpanded((previous) => toggleTreeRow(previous, row.key))}
              />
              <RowBody row={row} />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * 펼침 상태를 말하는 삼각형.
 *
 * `DESIGN.md` 가 색만으로 말하는 것을 금지한다. 여기서 상태를 말하는 것은 **모양**이다 —
 * 오른쪽을 가리키면 접힘, 아래를 가리키면 펼침. 스크린 리더에는 `aria-expanded` 가 같은 것을
 * 말하므로 이 글자는 `aria-hidden` 이고, 자리만 차지하는 줄에도 같은 폭을 남겨 이름이 층마다
 * 어긋나지 않게 한다.
 */
function Twisty({
  expandable,
  expanded,
  onToggle,
}: {
  expandable: boolean
  expanded: boolean
  onToggle: () => void
}) {
  if (!expandable) return <span aria-hidden="true" className="cm-tree-twisty is-leaf" />

  return (
    <span
      aria-hidden="true"
      className="cm-tree-twisty"
      onClick={(event) => {
        // 삼각형은 펼치기만 한다. 막지 않으면 줄의 클릭까지 함께 일어나 펼치는 동작이
        // 고르는 동작을 겸하게 되고, 그러면 씬을 훑어보는 동안 detail 이 계속 바뀐다.
        event.stopPropagation()
        onToggle()
      }}
    >
      {expanded ? '▾' : '▸'}
    </span>
  )
}

function RowBody({ row }: { row: TreeRow }) {
  if (row.kind === 'scene') return <SceneRow scene={row.scene} />
  if (row.kind === 'screen') return <ScreenRow screen={row.screen} />
  if (row.kind === 'sceneEdge') return <SceneEdgeRow edge={row.edge} />
  return <ScreenTransitionRow transition={row.transition} />
}

function SceneRow({ scene }: { scene: SceneTreeNode }) {
  const { t } = useI18n()
  const node = scene.container.node
  const kind = sceneKind(node)
  const name = node.name.trim()

  return (
    <span className="cm-tree-body">
      <span className="cm-tree-label">
        {/* 이름은 chip 이 진다. 그 chip 의 색조가 캔버스의 컨테이너와 같은 값에서 나오므로,
            같은 씬을 두 pane 에서 알아보는 값이 그 하나다. 이름을 옆에 한 번 더 적으면 216px
            짜리 줄이 같은 글자를 두 번 싣는다. */}
        {name.length > 0 ? (
          <SceneChip className="cat-chip cm-tree-chip" scene={name} />
        ) : (
          <span className="cm-tree-name is-unnamed">{truncate(sceneTitle(t, node), 24)}</span>
        )}
      </span>
      <span className="cm-tree-meta">
        <span className={`cm-kind cm-kind--${kind}`}>{t.contentMap.graph.sceneKinds[kind]}</span>
        <span>{t.contentMap.screenMap.screenCount(scene.screens.length)}</span>
        {scene.sceneEdges.length > 0 && (
          <span>{t.contentMap.tree.sceneEdgeCount(scene.sceneEdges.length)}</span>
        )}
      </span>
    </span>
  )
}

function ScreenRow({ screen }: { screen: ScreenTreeNode }) {
  const { t } = useI18n()
  const copy = t.contentMap.inspector
  const named = screenIsNamed(screen.screen)

  return (
    <span className="cm-tree-body">
      <span className="cm-tree-label">
        <span className={`cm-tree-name${named ? '' : ' is-unnamed'}`}>
          {truncate(screenTitle(t, screen.screen), 20)}
        </span>
        {/* 이름 없는 줄끼리 구별되는 유일한 값. 이름이 있는 줄에는 붙지 않는다. */}
        {!named && <span className="mono cm-tree-id">{copy.screenIdShort(screen.screen.id)}</span>}
      </span>
      <span className="cm-tree-meta mono">{copy.observedCount(screen.screen.observedCount)}</span>
    </span>
  )
}

/**
 * 씬에서 나가는 전이 한 줄.
 *
 * 확인 여부가 여기서만 `verifiedAt` 이라는 진짜 칸에서 나온다. 그 사실을 글자로 적어 두지
 * 않으면 이 줄과 아래 화면 전이 줄이 같은 종류의 확인을 말하는 것처럼 읽힌다.
 */
function SceneEdgeRow({ edge }: { edge: SceneEdgeEntry }) {
  const { t } = useI18n()
  const copy = t.contentMap.inspector
  const { transition } = edge.placed.edge
  const style = edgeSourceStyle(transition.source)
  const verified = transition.verifiedAt !== null

  return (
    <span className="cm-tree-body">
      <span className="cm-tree-label">
        <span aria-hidden="true" className="cm-tree-arrow">
          →
        </span>
        <span className="cm-tree-name">
          {copy.transitionTo(truncate(edgeTargetName(t, edge.placed), 22))}
        </span>
      </span>
      <span className="cm-tree-meta">
        <span>
          {style === 'unknown' ? t.contentMap.graph.sources.unknown : t.contentMap.graph.sources[style]}
        </span>
        <span className={`sm-verified sm-verified--${verified ? 'yes' : 'no'}`}>
          {verified ? t.contentMap.tree.verified : t.contentMap.list.notVerified}
        </span>
      </span>
    </span>
  )
}

/**
 * 화면에서 나가는 전이 한 줄.
 *
 * 씬 경계를 넘는 전이도 출발 화면 밑에만 선다. 그래서 어느 씬으로 나가는지를 줄 안에서
 * 말한다 — 도착 씬 밑에 한 번 더 놓으면 전이 하나가 둘로 읽힌다.
 */
function ScreenTransitionRow({ transition }: { transition: ScreenTransitionEntry }) {
  const { t } = useI18n()
  const copy = t.contentMap.inspector
  const model = transition.placed.transition
  const style = transitionKindStyle(model.kind)
  const to = transition.crossesTo

  return (
    <span className="cm-tree-body">
      <span className="cm-tree-label">
        <span aria-hidden="true" className="cm-tree-arrow">
          →
        </span>
        <span className="cm-tree-name">
          {copy.transitionTo(
            truncate(
              transition.toScreen === null
                ? copy.screenUnknown
                : screenLabel(t, transition.toScreen),
              20,
            ),
          )}
        </span>
      </span>
      <span className="cm-tree-meta">
        <span>
          {style === 'unknown' ? copy.transitionKindUnknown(model.kind) : copy.transitionKinds[style]}
        </span>
        <span className="mono">{copy.observedCount(model.observedCount)}</span>
        {to !== null && (
          <span className="cm-tree-crossing">
            {t.contentMap.tree.crossesTo(truncate(sceneTitle(t, to.node), 18))}
          </span>
        )}
      </span>
    </span>
  )
}
