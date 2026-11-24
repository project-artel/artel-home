import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { prefersReducedMotion } from './motion'
import type { UnityStage } from './startTutorialSteps'

/** 설치 안내의 "URL 복사"가 복사하는 주소와 같다. */
const SDK_URL = 'https://github.com/project-artel/artel-sdk.git?path=/Packages/kr.artel.sdk'

const TYPE_MS = 9
const INSTALL_MS = 1000

/**
 * 1단계의 가상 Unity 화면(ARTEL-1461). 실제 Unity 를 띄울 수 없으니, Package Manager 로 SDK 를 넣고 게임을 켜 로그인하는
 * 자리를 같은 모양으로 그려 직접 눌러 보게 한다.
 *
 * 이 화면은 `stage` 하나로 그려지고, 부르는 쪽이 단계마다 새로 그린다(`key={stage}`). 빛나는 자리를 누르면
 * `onAdvance` 가 다음 단계로 넘기고, 넘어간 단계가 그 사이의 움직임(주소가 쳐지는 것, 설치되는 것)을 스스로 보여 준다.
 */
export function UnityScene({ stage, onAdvance }: { stage: UnityStage; onAdvance: () => void }) {
  const { t } = useI18n()
  const m = t.tutorial.unity
  const label = t.tutorial.player.unityLabel
  const tag = t.tutorial.steps.connect
  const typed = useTyped(stage === 'add' ? SDK_URL : '', stage === 'add')
  const install = useInstall(stage === 'play')

  const managerOpen = stage === 'plus' || stage === 'git' || stage === 'add' || (stage === 'play' && install !== 'done')
  const ready = stage !== 'add' || typed.length === SDK_URL.length

  return (
    <div className="tut-unity" aria-label={label} role="group">
      <div className="tut-unity-top">
        <span className="tut-unity-name">Starlight Garden · Unity 6</span>
        <Target
          active={stage === 'play' && install === 'done'}
          className={'tut-unity-play' + (stage === 'login' || stage === 'browser' ? ' is-on' : '')}
          onClick={onAdvance}
          tag={tag.play.tag}
        >
          ▶
        </Target>
        <span className="tut-unity-pbtn" aria-hidden="true">❚❚</span>
        <span className="tut-unity-pbtn" aria-hidden="true">▶❚</span>
        <span className="tut-unity-label">{label}</span>
      </div>
      <div className="tut-unity-body">
        <div className="tut-unity-hierarchy" aria-hidden="true">
          <b>Hierarchy</b>
          <span>▾ Garden</span>
          <span>Main Camera</span>
          <span>Canvas</span>
          <span>GardenManager</span>
          <span>EventSystem</span>
        </div>
        <div className="tut-unity-game">
          <span className="tut-unity-tab">Game</span>
          <span className="tut-unity-title" aria-hidden="true">STARLIGHT GARDEN</span>
          {stage === 'login' && (
            <div className="tut-unity-sdk">
              <b>ARTEL SDK</b>
              <span>{m.sdkBody}</span>
              <Target active className="tut-unity-login" onClick={onAdvance} tag={tag.login.tag}>
                {m.login}
              </Target>
              <span className="tut-unity-later">{m.later}</span>
            </div>
          )}
        </div>
      </div>

      {managerOpen && (
        <div className="tut-unity-pm">
          <div className="tut-unity-pm-title">
            <i /><i /><i />
            <span>Package Manager</span>
          </div>
          <div className="tut-unity-pm-bar">
            <Target active={stage === 'plus'} className="tut-unity-plus" onClick={onAdvance} tag={tag.plus.tag}>
              + ▾
            </Target>
            <span>Packages: In Project ▾</span>
            {stage === 'git' && (
              <div className="tut-unity-menu">
                <span>Add package from disk...</span>
                <span>Add package from tarball...</span>
                <Target active className="tut-unity-git" onClick={onAdvance} tag={tag.git.tag}>
                  Add package from git URL...
                </Target>
                <span>Add package by name...</span>
              </div>
            )}
          </div>
          {stage === 'add' && (
            <div className="tut-unity-url">
              <span>Add package from git URL</span>
              <div>
                <span className="tut-unity-input">{typed}</span>
                <Target active={ready} className="tut-unity-add" onClick={onAdvance} tag={tag.add.tag}>
                  Add
                </Target>
              </div>
            </div>
          )}
          <div className="tut-unity-list">
            {stage === 'play' && install === 'installed' && (
              <div className="is-new"><span>ARTEL SDK</span><span>0.4.0</span></div>
            )}
            <div><span>Input System</span><span>1.11.2</span></div>
            <div><span>TextMeshPro</span><span>3.2.0</span></div>
            <div><span>Universal RP</span><span>17.0.3</span></div>
            <div><span>Unity UI</span><span>2.0.0</span></div>
          </div>
          {stage === 'play' && (
            <div className="tut-unity-status" aria-live="polite">
              {install === 'resolving' ? m.installing : m.installed}
            </div>
          )}
        </div>
      )}

      {stage === 'browser' && (
        <div className="tut-unity-browser tut-is-target" data-tag={tag.browser.tag}>
          <div className="tut-unity-browser-bar"><i /><i /><i /><span>{m.browserBar}</span></div>
          <div className="tut-unity-browser-body">
            <span className="tut-unity-ok" aria-hidden="true">✓</span>
            <b>{m.approvedTitle}</b>
            <span>{m.approvedBody}</span>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * 가상 Unity 안의 누를 자리. 지금 단계의 자리만 빛나고 눌리며, 나머지는 그림이다.
 */
function Target({
  active,
  children,
  className,
  onClick,
  tag,
}: {
  active: boolean
  children: React.ReactNode
  className: string
  onClick: () => void
  tag: string
}) {
  return (
    <button
      aria-label={active ? tag : undefined}
      className={className + (active ? ' tut-is-target' : '')}
      data-tag={active ? tag : undefined}
      disabled={!active}
      onClick={onClick}
      tabIndex={active ? 0 : -1}
      type="button"
    >
      {children}
    </button>
  )
}

/**
 * 복사한 주소를 붙여 넣는 모습. 장면은 단계마다 새로 그려지므로(`key={stage}`) 처음 값만 정하면 된다. 움직임을 줄인
 * 환경에서는 한 번에 채운다.
 */
function useTyped(text: string, running: boolean): string {
  const [count, setCount] = useState(() => (running && prefersReducedMotion() ? text.length : 0))
  useEffect(() => {
    if (!running || count >= text.length) return undefined
    const timer = window.setTimeout(() => setCount((now) => now + 1), TYPE_MS)
    return () => window.clearTimeout(timer)
  }, [count, running, text.length])
  return text.slice(0, count)
}

/** Add 를 누른 뒤 설치되고 창이 닫히는 순서. 닫힌 뒤에 Play 가 빛난다. */
function useInstall(running: boolean): 'resolving' | 'installed' | 'done' {
  const [phase, setPhase] = useState<'resolving' | 'installed' | 'done'>(() =>
    running && prefersReducedMotion() ? 'done' : 'resolving',
  )
  useEffect(() => {
    if (!running || phase === 'done') return undefined
    const timer = window.setTimeout(() => setPhase((now) => (now === 'resolving' ? 'installed' : 'done')), INSTALL_MS)
    return () => window.clearTimeout(timer)
  }, [phase, running])
  return phase
}
