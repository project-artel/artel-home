import { useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { OpenRouterKeySection } from './OpenRouterKeySection'
import { BedrockKeySection } from './BedrockKeySection'
import { ClaudeKeySection } from './ClaudeKeySection'
import { CacheInvalidationSection } from './CacheInvalidationSection'
import { LlmModelsSection } from './LlmModelsSection'
import { TypesafeKeySection } from './TypesafeKeySection'
import { FeatureModelsSection } from './FeatureModelsSection'
import { TelemetrySection } from './TelemetrySection'
import './admin.css'
import { InfoHint } from '../../design-system/primitives/InfoHint'

/**
 * 관리자 설정. 자주 바꾸는 순서로 놓는다 — 기능별 모델, provider 키, 모델 목록, 캐시, 사용 통계.
 * 기능별 모델의 키 경고는 아래 키 카드들이 알려 주는 설정 여부를 받아서 판단한다.
 */
export default function SettingsPage() {
  const { t } = useI18n()
  const [announcement, setAnnouncement] = useState('')
  const [openRouterConfigured, setOpenRouterConfigured] = useState<boolean | null>(null)
  const [typesafeConfigured, setTypesafeConfigured] = useState<boolean | null>(null)
  const [claudeConfigured, setClaudeConfigured] = useState<boolean | null>(null)

  return (
    <main className="main adm-settings">
      <FeatureModelsSection
        openRouterKeyConfigured={openRouterConfigured}
        typesafeKeyConfigured={typesafeConfigured}
        claudeKeyConfigured={claudeConfigured}
        onSaved={setAnnouncement}
      />

      <section aria-labelledby="adm-keys-title">
        <div className="section__head">
          <h2 className="section__title" id="adm-keys-title">
            {t.adminSettings.keys.title}
            <InfoHint>{t.adminSettings.keys.hint}</InfoHint>
          </h2>
        </div>
        <div className="adm-key-grid">
          <OpenRouterKeySection onConfiguredChange={setOpenRouterConfigured} />
          <ClaudeKeySection onConfiguredChange={setClaudeConfigured} />
          <BedrockKeySection />
          <TypesafeKeySection onConfiguredChange={setTypesafeConfigured} />
        </div>
      </section>

      <LlmModelsSection />

      <CacheInvalidationSection />

      <TelemetrySection />

      <p className="adm-visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </main>
  )
}
