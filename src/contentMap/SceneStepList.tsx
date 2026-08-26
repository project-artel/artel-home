import { useI18n } from '../i18n/useI18n'
import {
  interactionStyle,
  stepCondition,
  stepStatusStyle,
  type ConditionNode,
  type ContentMapScene,
  type ContentMapStep,
} from './contentMapTypes'

/**
 * 고른 씬에서 무엇을 할 수 있는지, 그 조건까지.
 *
 * 요약 줄은 이 씬에 능력이 몇 개인지 말한다. 여기는 그중 무엇을 실제로
 * 할 수 있고 언제 할 수 있는지를 말한다. 개수만으로는 테스트 케이스를 쓸 수
 * 없다는 것이 이 화면이 생긴 이유다.
 *
 * ## 조건이 왜 줄마다 붙는가
 *
 * 실측한 GameClearScene 에서 `runnable` 인 여섯 단계는 `summary` 와
 * `inputKey` 와 `status` 가 전부 같다. 조건을 빼면 화면에는 서로 구분되지
 * 않는 똑같은 줄 여섯 개가 남고, 그 목록으로는 어느 줄을 테스트했는지도 알
 * 수 없다. 그 여섯을 가르는 것은 조건뿐이다.
 *
 * ## 접근성
 *
 * 그래프 SVG 는 `aria-hidden` 이라 이 목록이 그림의 대등한 대체물이다. 조건
 * 트리도 예외가 아니어서, 중첩은 들여쓰기가 아니라 중첩된 `ul` 과 "다음 셋을
 * 모두 만족해야 합니다" 같은 문장으로 말한다. 괄호와 여백은 눈에만 보인다.
 */
export function SceneStepList({ scene }: { scene: ContentMapScene }) {
  const { t } = useI18n()
  const copy = t.contentMap.steps
  const { steps } = scene

  // 응답에 `steps` 절이 없는 서버다. 0개라고 적으면 "이 씬에는 조작이 없다"와
  // "우리가 물어보지 않았다"가 한 문장으로 합쳐지므로, 아무 말도 하지 않는다.
  if (steps === null) return null

  return (
    <>
      <h3 className="cm-detail-subtitle" id="cm-step-list-heading">
        {copy.heading(steps.length)}
      </h3>

      {steps.length === 0 ? (
        <p className="cm-inspector-hint">{copy.none}</p>
      ) : (
        <ul className="cm-step-list" aria-labelledby="cm-step-list-heading" tabIndex={0}>
          {steps.map((step, index) => (
            // id 가 겹쳐도 접지 않기 때문에 키에 자리를 함께 넣는다. 서로
            // 구분되지 않는 줄이 여럿이라는 사실이 이 목록의 내용이다.
            <StepRow key={`${step.id}-${index}`} step={step} />
          ))}
        </ul>
      )}

      {/* 단계 수와 능력 수가 다른 이유. 적어 두지 않으면 읽는 사람은 화면이
          줄을 잃어버렸다고 결론 내린다. */}
      {scene.capabilities.notAStep > 0 && (
        <p className="cm-inspector-hint">{copy.notAStepNote(scene.capabilities.notAStep)}</p>
      )}
    </>
  )
}

function StepRow({ step }: { step: ContentMapStep }) {
  const { t } = useI18n()
  const copy = t.contentMap.steps
  const status = stepStatusStyle(step.status)
  const interaction = interactionStyle(step.interaction)

  // 서버가 쓴 철자를 그대로 쓴다. 모르는 값을 아는 이름으로 바꿔 부르면 화면이
  // 서버가 저장한 것에 대해 거짓말을 하게 된다.
  const statusName =
    status === 'unknown' ? copy.statusUnknown(step.status) : t.contentMap.summary.statuses[status]
  const interactionName =
    interaction === 'unknown'
      ? copy.interactionUnknown(step.interaction)
      : copy.interactions[interaction]

  return (
    <li className={`cm-step cm-step--${status}`}>
      <p className="cm-step-summary mono">
        {step.summary.trim().length > 0 ? step.summary : copy.untitled}
      </p>

      <p className="cm-step-meta">
        <span className={`cm-status-dot cm-status-dot--${status}`} aria-hidden="true" />
        <span className="cm-step-status">{statusName}</span>
        <span aria-hidden="true">·</span>
        <span>{interactionName}</span>
        {step.inputKey !== null && (
          <>
            <span aria-hidden="true">·</span>
            <span className="mono">{copy.inputKey(step.inputKey)}</span>
          </>
        )}
        {step.controlLabel !== null && (
          <>
            <span aria-hidden="true">·</span>
            <span>{copy.controlLabel(step.controlLabel)}</span>
          </>
        )}
      </p>

      {step.controlPath !== null && <p className="cm-step-path mono">{step.controlPath}</p>}

      <StepConditionBlock step={step} />
    </li>
  )
}

/**
 * 한 단계의 조건.
 *
 * 순서가 계약이다 — `givenText` 가 있으면 문장을 쓰고, 없을 때만 트리를
 * 그린다. 서버가 문장을 채우는 날(ARTEL-447) 이 파일을 고치지 않아도 조건
 * 줄이 트리에서 문장으로 바뀐다. 문장이 생겨도 트리는 접힌 채로 남는다 —
 * 문장은 트리를 옮긴 것이고, 옮긴 결과를 의심할 때 볼 원본이 필요하다.
 */
function StepConditionBlock({ step }: { step: ContentMapStep }) {
  const { t } = useI18n()
  const copy = t.contentMap.steps
  const condition = stepCondition(step)

  return (
    <div className="cm-cond-block">
      <p className="cm-cond-heading">{copy.conditionHeading}</p>

      {condition.form === 'none' && <p className="cm-cond-none">{copy.conditionNone}</p>}

      {condition.form === 'tree' && <ConditionTree node={condition.tree} />}

      {condition.form === 'sentence' && (
        <>
          <p className="cm-cond-sentence">{condition.text}</p>
          {condition.tree !== null && (
            <details className="cm-cond-raw">
              <summary>{copy.conditionRawToggle}</summary>
              <ConditionTree node={condition.tree} />
            </details>
          )}
        </>
      )}
    </div>
  )
}

/** 트리 한 그루. 마디 하나짜리 조건도 항목 하나짜리 목록으로 그린다. */
function ConditionTree({ node }: { node: ConditionNode }) {
  return (
    <ul className="cm-cond-tree">
      <ConditionItem node={node} />
    </ul>
  )
}

/**
 * 마디 하나.
 *
 * `always` 와 `unknown` 은 절대 같은 모양이 아니다. 앞은 "아무 때나 된다",
 * 뒤는 "우리가 못 읽었다"이고, 둘을 같은 회색 한 줄로 그리면 조건 없는 단계와
 * 조건을 모르는 단계가 화면에서 구분되지 않는다. 그 목록을 보고 쓴 테스트
 * 케이스는 정확히 반대로 동작한다.
 */
function ConditionItem({ node }: { node: ConditionNode }) {
  const { t } = useI18n()
  const copy = t.contentMap.steps

  if (node.kind === 'always') {
    return (
      <li className="cm-cond cm-cond--always">
        <p className="cm-cond-line">{copy.conditionAlways}</p>
      </li>
    )
  }

  if (node.kind === 'test') {
    return (
      <li className="cm-cond cm-cond--test">
        <p className="cm-cond-line">
          <span className="cm-cond-kind">{copy.conditionKinds.test}</span>
          {/* 좌변·연산자·우변을 가르는 것이 눈에는 여백이지만 귀에는 아무것도
              아니다. 연산자를 사람 문장으로 옮기는 것은 서버 몫이므로, 여기서는
              어느 자리인지만 소리로 붙인다. */}
          <span className="cm-cond-expression">
            <span className="visually-hidden">{copy.testLeft} </span>
            <span className="mono">{node.left}</span>
            <span className="visually-hidden"> {copy.testOperator} </span>
            <span className="mono cm-cond-operator">{node.operator}</span>
            <span className="visually-hidden"> {copy.testRight} </span>
            <span className="mono">{node.right}</span>
          </span>
        </p>
        <ConditionNote
          context={node.context}
          offset={node.offset}
          subjectLost={node.subjectLost}
        />
      </li>
    )
  }

  if (node.kind === 'gesture') {
    return (
      <li className="cm-cond cm-cond--gesture">
        <p className="cm-cond-line">
          <span className="cm-cond-kind">{copy.conditionKinds.gesture}</span>
          <span className="cm-cond-expression">
            <span className="visually-hidden">{copy.gestureInput} </span>
            <span className="mono">{node.input}</span>
          </span>
        </p>
        <ConditionNote context={null} offset={node.offset} subjectLost={null} />
      </li>
    )
  }

  if (node.kind === 'unknown') {
    return (
      <li className="cm-cond cm-cond--unknown">
        <p className="cm-cond-line">
          <span className="cm-cond-kind">{copy.conditionKinds.unknown}</span>
          <span className="mono">{copy.conditionReason(node.reason)}</span>
        </p>
        {node.unread !== null && (
          <p className="cm-cond-unread">
            <span className="cm-cond-note-label">{copy.conditionUnread}</span>
            <span className="mono cm-cond-unread-text">{node.unread}</span>
          </p>
        )}
      </li>
    )
  }

  // 서버가 정규화해서 주기로 한 어휘 밖의 값. 아는 갈래로 접지 않고, 서버가
  // 뭐라고 했는지와 우리가 그것을 모른다는 사실을 함께 적는다.
  if (node.kind === 'unrecognisedKind') {
    return (
      <li className="cm-cond cm-cond--unrecognised">
        <p className="cm-cond-line">
          <span className="cm-cond-kind">{copy.conditionKinds.unrecognised}</span>
          <span>{copy.conditionReportedKind(node.reportedKind)}</span>
        </p>
      </li>
    )
  }

  // 남은 것은 묶음뿐이다. 묶는 말이 글로 적혀 있어야 한다 — 들여쓰기와 괄호는
  // 눈에만 보이고, 스크린 리더에게 `every` 와 `either` 는 똑같이 목록 하나다.
  return (
    <li className="cm-cond cm-cond--group">
      <p className="cm-cond-join">
        {node.kind === 'every'
          ? copy.conditionEvery(node.parts.length)
          : copy.conditionEither(node.parts.length)}
      </p>
      <ul className="cm-cond-tree">
        {node.parts.map((part, index) => (
          <ConditionItem key={index} node={part} />
        ))}
      </ul>
    </li>
  )
}

/** 마디에 딸린 메타데이터. `subjectLost` 는 조건이 반쪽만 읽혔다는 표시다. */
function ConditionNote({
  context,
  offset,
  subjectLost,
}: {
  context: string | null
  offset: number
  subjectLost: string | null
}) {
  const { t } = useI18n()
  const copy = t.contentMap.steps

  return (
    <p className="cm-cond-note">
      {context !== null && <span>{copy.conditionContext(context)}</span>}
      {subjectLost !== null && (
        <span className="cm-cond-note-warn">{copy.conditionSubjectLost(subjectLost)}</span>
      )}
      <span className="mono">{copy.conditionOffset(offset)}</span>
    </p>
  )
}
