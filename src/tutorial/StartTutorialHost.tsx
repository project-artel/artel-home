import { useCallback, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { markTutorialSeen } from '../auth/authApi'
import { useAuth } from '../auth/useAuth'
import { useI18n } from '../i18n/useI18n'
import { enterTutorialMode, exitTutorialMode } from './mock/tutorialMode'
import { TUTORIAL_SKIP_PARAM } from './startTutorialSteps'
import { TutorialCoach } from './TutorialCoach'

/** 프로젝트 밖에서 시작할 때 쓰는 예시 프로젝트 번호. 목데이터만 이 번호를 안다. */
const EXAMPLE_PROJECT_ID = '900001'

type Open = { firstRun: boolean; returnTo: string; base: string; entered: boolean }

/**
 * 시작 튜토리얼을 언제 열고, 어떻게 들어가고 나오는지(ARTEL-1461).
 *
 * - 서버가 아직 본 적 없다고 하는 계정이면 로그인 뒤 처음 들어올 때 시작 카드를 띄운다. "나중에"면 다음에 다시 뜬다.
 * - 시작하면 목데이터 모드로 들어간다. 열어 둔 프로젝트가 있으면 그 프로젝트 화면 안에서, 없으면 예시 프로젝트로 간다.
 * - 끝까지 보거나 도중에 닫으면 서버에 본 것으로 적고, 시작 전 주소로 새로 들어가 실제 화면으로 돌아온다.
 * - 위쪽의 "튜토리얼"로 언제든 다시 본다. 다시 볼 때는 시작 카드 없이 바로 들어가고, 아무 단계로나 갈 수 있다.
 */
export function StartTutorialHost() {
  const auth = useAuth()
  const { t, locale } = useI18n()
  const location = useLocation()
  // 튜토리얼에서 새 탭으로 연 안내 화면에서는 다시 띄우지 않는다.
  const owed = auth.status === 'authenticated' && auth.user.startTutorialPending
    && !new URLSearchParams(location.search).has(TUTORIAL_SKIP_PARAM)
  const [open, setOpen] = useState<Open | null>(() => (owed ? place(true, location.pathname) : null))
  const [phase, setPhase] = useState<'intro' | 'play' | 'done'>('intro')
  const [recorded, setRecorded] = useState(!owed)

  const enter = useCallback((target: Open) => {
    if (auth.status !== 'authenticated') return
    enterTutorialMode({
      projectId: target.base.split('/').pop() ?? EXAMPLE_PROJECT_ID,
      realProject: !target.base.endsWith(`/${EXAMPLE_PROJECT_ID}`),
      locale: locale === 'en' ? 'en' : 'ko',
      user: {
        id: auth.user.id,
        displayName: auth.user.displayName,
        email: auth.user.email,
        nickname: auth.user.nickname,
        userTag: auth.user.userTag,
      },
    })
    setOpen({ ...target, entered: true })
    setPhase('play')
  }, [auth, locale])

  const close = useCallback(async () => {
    if (open === null) return
    if (!open.entered) {
      setOpen(null)
      return
    }
    // 목데이터 모드를 먼저 끈다. 켜 둔 채 적으면 목데이터가 받아 버린다.
    exitTutorialMode()
    if (!recorded) {
      setRecorded(true)
      // 적지 못해도 튜토리얼은 닫힌다. 다음에 들어올 때 한 번 더 뜨는 것이 최악이다. 다만 아래의 새로 들어가기가
      // 요청을 끊지 않게 잠깐 기다린다.
      await Promise.race([
        markTutorialSeen().catch(() => undefined),
        new Promise((resolve) => window.setTimeout(resolve, 1500)),
      ])
    }
    // 목데이터를 읽어 둔 화면이 남지 않게 시작 전 주소로 새로 들어간다.
    window.location.assign(open.returnTo)
  }, [open, recorded])

  return (
    <>
      <button
        className="top-bar-link top-bar-link--button"
        disabled={open !== null}
        onClick={() => enter(place(false, location.pathname))}
        title={t.tutorial.shell.openTitle}
        type="button"
      >
        {t.tutorial.shell.open}
      </button>
      {open !== null && (
        <TutorialCoach
          base={open.base}
          firstRun={open.firstRun}
          onClose={() => void close()}
          onPhase={setPhase}
          onStart={() => enter(open)}
          phase={phase}
        />
      )}
    </>
  )
}

/** 열어 둔 프로젝트가 있으면 그 안에서, 없으면 예시 프로젝트에서 한다. */
function place(firstRun: boolean, pathname: string): Open {
  const projectId = /^\/projects\/(\d+)/.exec(pathname)?.[1] ?? EXAMPLE_PROJECT_ID
  return { firstRun, returnTo: window.location.href, base: `/projects/${projectId}`, entered: false }
}
