import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { attempts, playback } from '../qa/evaluation/evaluationApi'
import { coverHue, initialOf } from './projectCoverStyle'

function RecordingFrame({ projectId }: { projectId: string }) {
  const slot = useRef<HTMLSpanElement>(null)
  const [source, setSource] = useState<string>()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    async function load() {
      const recent = await attempts(projectId, {}, signal)
      // 목록에서 프로젝트 하나가 녹화 이력 전체를 조회하지 않도록 한다.
      const tryIds = [...new Set(recent.map(item => item.qaTryId))].slice(0, 3)
      for (const tryId of tryIds) {
        if (signal.aborted) return
        const recording = await playback(projectId, tryId, signal)
        const segment = recording.segments.find(item => item.state === 'READY' && item.url)
        if (segment?.url && !signal.aborted) {
          setSource(segment.url)
          return
        }
      }
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect()
        void load().catch(() => { /* 녹화를 읽지 못하면 기본 표지를 유지한다. */ })
      }
    })
    if (slot.current) observer.observe(slot.current)
    return () => {
      observer.disconnect()
      controller.abort()
    }
  }, [projectId])

  return <span className="project-cover-frame" ref={slot}>
    {source && <video src={source} muted playsInline preload="auto" tabIndex={-1}
      style={{ opacity: visible ? 1 : 0 }}
      onLoadedMetadata={({ currentTarget }) => {
        if (Number.isFinite(currentTarget.duration) && currentTarget.duration > 0) {
          currentTarget.currentTime = Math.min(1, currentTarget.duration / 2)
        }
      }}
      onLoadedData={() => setVisible(true)} onError={() => setVisible(false)} />}
  </span>
}

export function ProjectCover({ id, name, children, showRecording = false }: { id: string; name: string; children?: ReactNode; showRecording?: boolean }) {
  const style = { '--cover-hue': String(coverHue(id)) } as CSSProperties
  return (
    <span aria-hidden="true" className="project-cover" style={style}>
      <span className="project-cover-initial">{initialOf(name)}</span>
      {showRecording && <RecordingFrame key={id} projectId={id} />}
      {children}
    </span>
  )
}
