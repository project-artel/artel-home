import { useCallback, useEffect, useRef, useState } from 'react'
import { controlUrl } from './api'
import { InputQueue, parseControlReply } from './control'
import type { GameInput } from './types'

export function useControl(sessionId: string, onInterrupted: () => void, enabled = true) {
  const [ready, setReady] = useState(false)
  const queue = useRef<InputQueue | null>(null)
  const release = useRef<() => void>(() => undefined)
  const interrupted = useRef(onInterrupted)
  useEffect(() => { interrupted.current = onInterrupted }, [onInterrupted])
  useEffect(() => {
    if (!enabled) return
    let ended = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    const socket = new WebSocket(controlUrl(sessionId))
    function close(notify: boolean) {
      if (ended) return
      ended = true
      clearTimeout(timeout)
      inputQueue.stop()
      setReady(false)
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'RELEASE' }))
      socket.close()
      if (notify) interrupted.current()
    }
    const inputQueue = new InputQueue((command) => {
      if (socket.readyState !== WebSocket.OPEN) { close(true); return }
      socket.send(JSON.stringify(command))
      timeout = setTimeout(() => close(true), 3000)
    }, () => close(true))
    queue.current = inputQueue
    release.current = () => close(false)
    timeout = setTimeout(() => close(true), 10_000)
    socket.addEventListener('message', (event) => {
      if (ended || typeof event.data !== 'string') return
      const reply = parseControlReply(event.data)
      if (reply === null || reply.type === 'ERROR') { close(true); return }
      if (reply.type === 'READY') { clearTimeout(timeout); inputQueue.start(); setReady(true) }
      else { clearTimeout(timeout); inputQueue.acknowledge(reply.sequence) }
    })
    socket.addEventListener('close', () => close(true))
    socket.addEventListener('error', () => close(true))
    const renew = setInterval(() => {
      if (!ended && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'RENEW' }))
    }, 2000)
    const loseFocus = () => close(true)
    const visibility = () => { if (document.visibilityState !== 'visible') close(true) }
    window.addEventListener('blur', loseFocus)
    window.addEventListener('pagehide', loseFocus)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      close(false)
      clearInterval(renew)
      window.removeEventListener('blur', loseFocus)
      window.removeEventListener('pagehide', loseFocus)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [sessionId, enabled])
  const send = useCallback((input: GameInput) => queue.current?.send(input) ?? false, [])
  const stop = useCallback(() => release.current(), [])
  return { ready, send, stop }
}
