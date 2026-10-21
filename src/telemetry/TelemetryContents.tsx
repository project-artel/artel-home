import { useI18n } from '../i18n/useI18n'
import './telemetry.css'

/** Collapsible list of every value the daily telemetry statistics carry and what they never carry. */
export function TelemetryContents() {
  const { t } = useI18n()
  const copy = t.telemetry
  return (
    <details className="telemetry-contents">
      <summary>{copy.showContents}</summary>
      <h3 className="telemetry-contents__title">{copy.sentTitle}</h3>
      {copy.groups.map((group) => (
        <div key={group.heading}>
          <p className="telemetry-contents__heading">{group.heading}</p>
          <ul>
            {group.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
      <h3 className="telemetry-contents__title">{copy.notSentTitle}</h3>
      <ul>
        {copy.notSent.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </details>
  )
}
