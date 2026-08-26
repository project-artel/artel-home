import { useI18n } from '../i18n/useI18n'
import { formatDateTime } from '../projects/formatters'
import {
  KNOWN_CAPABILITY_STATUSES,
  sumCapabilities,
  type ContentMapView,
} from './contentMapTypes'

/**
 * 빌드가 지금 어떤 상태인지, 숫자로.
 *
 * 그림 위에 놓이는 이유는 순서 때문이다. "씬이 몇 개고 그중 몇 개를 밟았나"
 * 는 그림을 보기 전에 답이 나와야 하고, 그림은 그 숫자가 왜 그런지를
 * 설명하는 자리다.
 */
export function ContentMapSummary({ view }: { view: ContentMapView }) {
  const { t } = useI18n()
  const copy = t.contentMap.summary
  const totals = sumCapabilities(view.scenes)
  const walked = view.scenes.filter((scene) => scene.walked).length
  const { verified, total } = view.verification

  return (
    <div className="cm-summary">
      <p className="cm-summary-line">
        <span>{copy.scenes(view.scenes.length)}</span>
        <span aria-hidden="true">·</span>
        <span>{copy.walked(walked)}</span>
        <span aria-hidden="true">·</span>
        <span>{copy.capabilities(totals.total)}</span>
        <span aria-hidden="true">·</span>
        <span>{copy.transitions(view.edges.length)}</span>
      </p>

      <div className="cm-summary-grid">
        <section className="cm-summary-block">
          <h3>{copy.capabilityTitle}</h3>
          <ul className="cm-status-list">
            {KNOWN_CAPABILITY_STATUSES.map((status) => (
              <li key={status}>
                {/* 점은 색이지만 이름이 바로 옆에 있다. 색만으로 상태를
                    전하지 않는다는 규칙이 요약 줄에도 그대로 적용된다. */}
                <span aria-hidden="true" className={`cm-status-dot cm-status-dot--${status}`} />
                <span className="cm-status-name">{copy.statuses[status]}</span>
                <span className="mono cm-status-count">{totals[status]}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="cm-summary-block">
          <h3>{copy.verificationTitle}</h3>
          {total === 0 ? (
            <p className="cm-summary-note">{copy.verificationNone}</p>
          ) : (
            <>
              <p className="cm-ratio-value mono">{copy.verificationRatio(verified, total)}</p>
              <div
                aria-label={copy.verificationLabel(verified, total)}
                aria-valuemax={total}
                aria-valuemin={0}
                aria-valuenow={verified}
                className="progress-track"
                role="progressbar"
              >
                <span className="progress-fill cm-ratio-fill" style={{ width: `${(verified / total) * 100}%` }} />
              </div>
            </>
          )}
        </section>

        <section className="cm-summary-block">
          <h3>{copy.gapsTitle}</h3>
          {view.gaps.length === 0 ? (
            <p className="cm-summary-note">{copy.noGaps}</p>
          ) : (
            <>
              <ul className="cm-gap-list">
                {view.gaps.map((gap) => (
                  <li key={gap.reason}>
                    {/* 사유 어휘가 아직 공개되지 않았다. 추측한 라벨은 없는
                        뜻을 만들어 내므로 서버가 쓴 문자열을 그대로 쓴다. */}
                    <code className="mono cm-gap-reason">{gap.reason}</code>
                    <span className="mono cm-gap-count">{gap.count}</span>
                  </li>
                ))}
              </ul>
              <p className="cm-summary-note">{copy.gapsNote}</p>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

/** 이 캡처가 무엇으로 만들어졌는지. 증거를 되짚을 때 필요한 값들이다. */
export function CaptureHeader({ view }: { view: ContentMapView }) {
  const { t } = useI18n()
  const copy = t.contentMap.header
  const header = view.contentMap
  if (header === null) return null

  return (
    <section className="panel cm-capture" aria-labelledby="cm-capture-title">
      <header className="panel-header">
        <h2 id="cm-capture-title">{copy.title}</h2>
      </header>
      <dl className="detail-fields">
        <dt>{copy.captureLabel}</dt>
        <dd className="mono">{header.capture || t.contentMap.header.unknown}</dd>

        <dt>{copy.schemaLabel}</dt>
        <dd className="mono">{header.schemaVersion || t.contentMap.header.unknown}</dd>

        <dt>{copy.unityLabel}</dt>
        <dd className="mono">{header.unity ?? copy.unknown}</dd>

        <dt>{copy.platformLabel}</dt>
        <dd className="mono">{header.platform ?? copy.unknown}</dd>

        <dt>{copy.sdkLabel}</dt>
        <dd className="mono">{header.sdkVersion ?? copy.unknown}</dd>

        <dt>{copy.ingestedAtLabel}</dt>
        <dd>{header.ingestedAt === null ? copy.notIngested : formatDateTime(header.ingestedAt)}</dd>

        <dt>{copy.digestLabel}</dt>
        <dd className="mono cm-digest">{header.evidenceDigest || copy.unknown}</dd>
      </dl>
    </section>
  )
}
