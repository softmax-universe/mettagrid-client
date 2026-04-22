import { useRef, useCallback, useSyncExternalStore, useEffect, useState } from 'react'
import { MettagridClient } from '../client'
import type { ConnectionState, EpisodeMetadata, GridObject, MettagridClientOptions } from '../types'
import { ObjectStateMap } from '../state'

export interface UseMettagridReturn {
  connectionState: ConnectionState
  metadata: EpisodeMetadata | null
  currentStep: number
  displayStep: number
  objects: ReadonlyMap<number, GridObject>
  agents: GridObject[]
  client: MettagridClient

  subscribe: (fromStep?: number) => void
  requestHistory: (start: number, end: number) => void
  disconnect: () => void

  isPaused: boolean
  pause: () => void
  resume: () => void
  seekTo: (step: number) => void
  maxBufferedStep: number
  oldestBufferedStep: number
  speed: number
  setSpeed: (speed: number) => void
}

function notifySubscribers (
  versionRef: React.MutableRefObject<number>,
  subsRef: React.MutableRefObject<Set<() => void>>
) {
  versionRef.current++
  for (const cb of subsRef.current) cb()
}

export function useMettagrid (url: string, options?: MettagridClientOptions): UseMettagridReturn {
  const clientRef = useRef<MettagridClient | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const seekStateRef = useRef<ObjectStateMap | null>(null)
  const seekStepRef = useRef(-1)
  const [speed, setSpeed] = useState(1)

  if (!clientRef.current) {
    clientRef.current = new MettagridClient(url, options)
  }
  const client = clientRef.current

  const stateVersionRef = useRef(0)
  const subscribersRef = useRef(new Set<() => void>())

  const subscribeStore = useCallback((cb: () => void) => {
    subscribersRef.current.add(cb)
    return () => subscribersRef.current.delete(cb)
  }, [])

  const getSnapshot = useCallback(() => stateVersionRef.current, [])

  useEffect(() => {
    const unsubs: (() => void)[] = []
    let lastRenderTime = 0
    let pendingRender = false

    const scheduleRender = () => {
      if (pendingRender || seekStateRef.current) return
      const now = performance.now()
      // Target FPS based on speed: 0.5x=6fps, 1x=12fps, 2x=24fps, 5x=60fps, 10x=60fps
      const targetFps = Math.min(60, Math.max(4, speed * 12))
      const minInterval = 1000 / targetFps
      const elapsed = now - lastRenderTime

      if (elapsed >= minInterval) {
        lastRenderTime = now
        notifySubscribers(stateVersionRef, subscribersRef)
      } else {
        pendingRender = true
        setTimeout(() => {
          pendingRender = false
          lastRenderTime = performance.now()
          notifySubscribers(stateVersionRef, subscribersRef)
        }, minInterval - elapsed)
      }
    }

    unsubs.push(client.on('step', scheduleRender))

    unsubs.push(client.on('metadata', () => {
      notifySubscribers(stateVersionRef, subscribersRef)
    }))

    unsubs.push(client.on('episode-start', () => {
      seekStateRef.current = null
      seekStepRef.current = -1
      setIsPaused(false)
      notifySubscribers(stateVersionRef, subscribersRef)
    }))

    unsubs.push(client.on('connection-change', () => {
      notifySubscribers(stateVersionRef, subscribersRef)
    }))

    client.connect()

    return () => {
      unsubs.forEach(u => u())
      client.destroy()
    }
  }, [client, speed])

  useSyncExternalStore(subscribeStore, getSnapshot, getSnapshot)

  const isSeekActive = isPaused && seekStateRef.current !== null
  const activeState = isSeekActive ? seekStateRef.current! : client.state
  const displayStep = isSeekActive ? seekStepRef.current : client.currentStep

  const pause = useCallback(() => {
    setIsPaused(true)
    const snapshot = new ObjectStateMap()
    client.buffer.replayTo(client.currentStep, snapshot)
    seekStateRef.current = snapshot
    seekStepRef.current = client.currentStep
    notifySubscribers(stateVersionRef, subscribersRef)
  }, [client])

  const resume = useCallback(() => {
    setIsPaused(false)
    seekStateRef.current = null
    seekStepRef.current = -1
    notifySubscribers(stateVersionRef, subscribersRef)
  }, [])

  const seekTo = useCallback((step: number) => {
    // Auto-pause when seeking
    if (!isPaused) setIsPaused(true)

    const snapshot = new ObjectStateMap()
    client.buffer.replayTo(step, snapshot)
    seekStateRef.current = snapshot
    seekStepRef.current = step
    notifySubscribers(stateVersionRef, subscribersRef)
  }, [client, isPaused])

  return {
    connectionState: client.connectionState,
    metadata: client.metadata,
    currentStep: client.currentStep,
    displayStep,
    objects: activeState.objects,
    agents: activeState.agents(),
    client,

    subscribe: (fromStep?: number) => client.subscribe(fromStep),
    requestHistory: (start: number, end: number) => client.requestHistory(start, end),
    disconnect: () => client.disconnect(),

    isPaused,
    pause,
    resume,
    seekTo,
    maxBufferedStep: client.buffer.latestStep,
    oldestBufferedStep: client.buffer.oldestStep,
    speed,
    setSpeed,
  }
}
