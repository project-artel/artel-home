import { useI18n } from '../i18n/useI18n'
import type { ScreenMapModel } from './screenMapLayout'

/**
 * 범례.
 *
 * 캔버스가 `aria-hidden` 이므로 그림의 어휘를 글로 적는 곳은 여기뿐이다. 각 줄은 그림에 쓰인
 * 바로 그 모양을 작게 다시 그리고 옆에 이름을 쓴다 — 색 이름을 부르지 않는다는 것이 요점이다.
 * 색을 못 보는 사람에게도, 흑백으로 인쇄한 종이에서도 같은 문장이 남아야 한다.
 *
 * 세지 않은 것은 그리지 않는다. 이 빌드에 화면 전이가 하나도 없으면 그 줄들은 나타나지 않는다 —
 * 쓰이지 않은 어휘를 설명하면 사용자가 그림에서 없는 것을 찾는다.
 */
export function ScreenMapLegend({ model }: { model: ScreenMapModel }) {
  const { t } = useI18n()
  const copy = t.contentMap.screenMap.legend

  const verified = model.sceneEdges.filter(
    ({ edge }) => edge.transition.verifiedAt !== null,
  ).length
  const unverified = model.sceneEdges.length - verified
  const crossing = model.screenTransitions.filter(
    ({ transition }) => transition.crossesScene,
  ).length

  return (
    <dl className="sm-legend">
      <div className="sm-legend-row">
        <dt>
          <LinkSample kind="verified" />
        </dt>
        <dd>{copy.verified(verified)}</dd>
      </div>
      <div className="sm-legend-row">
        <dt>
          <LinkSample kind="unverified" />
        </dt>
        {/* 이 화면이 존재하는 이유. 개수를 앞세워야 구멍이 몇 개인지가 먼저 읽힌다. */}
        <dd>{copy.unverified(unverified)}</dd>
      </div>
      {model.screenTransitions.length > 0 && (
        <>
          <div className="sm-legend-row">
            <dt>
              <LinkSample kind="screen" />
            </dt>
            <dd>{copy.screenTransition(model.screenTransitions.length - crossing)}</dd>
          </div>
          <div className="sm-legend-row">
            <dt>
              <LinkSample kind="crossing" />
            </dt>
            <dd>{copy.crossing(crossing)}</dd>
          </div>
        </>
      )}
      <div className="sm-legend-row">
        <dt>
          <ContainerSample walked />
        </dt>
        <dd>{copy.walked}</dd>
      </div>
      <div className="sm-legend-row">
        <dt>
          <ContainerSample walked={false} />
        </dt>
        <dd>{copy.notWalked}</dd>
      </div>
    </dl>
  )
}

/**
 * 그림에 쓰인 선을 그대로 축소한 것. 클래스가 같으므로 CSS 규칙이 바뀌면 여기도 함께 바뀐다.
 *
 * 화살촉은 `<marker>` 를 참조하지 않고 직접 그린다. marker 의 id 는 문서 전체에서 찾는 값이라,
 * 참조해 두면 이 범례가 캔버스가 떠 있을 때만 완전해진다 — 빈 상태에서 범례만 남는 날 화살표가
 * 소리 없이 사라진다.
 */
function LinkSample({ kind }: { kind: 'verified' | 'unverified' | 'screen' | 'crossing' }) {
  const scene = kind === 'verified' || kind === 'unverified'

  return (
    <svg aria-hidden="true" className="sm-legend-sample" viewBox="0 0 44 14">
      <g
        className={[
          'sm-link',
          scene ? 'sm-link--scene' : 'sm-link--screen',
          kind === 'verified' && 'is-verified',
          kind === 'unverified' && 'is-unverified',
          kind === 'crossing' && 'is-crossing',
        ]
          .filter((part): part is string => typeof part === 'string')
          .join(' ')}
      >
        {kind === 'crossing' && (
          // 경계 대신 세로 막대 하나. casing 이 그것을 뚫고 지나가는 것이 이 줄의 전부다.
          <line className="sm-legend-boundary" x1="22" x2="22" y1="1" y2="13" />
        )}
        {kind === 'crossing' && <path className="sm-link-casing" d="M 3 7 L 32 7" />}
        <path className="sm-link-line" d="M 3 7 L 32 7" />
        {kind === 'verified' && <path className="sm-legend-head is-filled" d="M 32 3 L 40 7 L 32 11 z" />}
        {kind === 'unverified' && <path className="sm-legend-head" d="M 32.6 3.6 L 39.4 7 L 32.6 10.4 z" />}
        {!scene && <path className="sm-legend-head is-open" d="M 33 4 L 38 7 L 33 10" />}
      </g>
    </svg>
  )
}

/** 컨테이너 테두리. 밟은 씬은 실선, 아직 안 밟은 씬은 점선이다. */
function ContainerSample({ walked }: { walked: boolean }) {
  return (
    <svg aria-hidden="true" className="sm-legend-sample" viewBox="0 0 44 14">
      <g className={`sm-container sm-container--${walked ? 'walked' : 'notWalked'}`}>
        <rect className="sm-container-frame" height="12" rx="3" width="38" x="3" y="1" />
      </g>
    </svg>
  )
}
