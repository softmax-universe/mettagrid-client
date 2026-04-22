import type {
  ConnectionState,
  EpisodeMetadata,
  MettagridClientOptions,
  MettagridEventMap,
  ServerMessage,
  StepData,
  ClientMessage,
  HistoryResponseMessage,
  ErrorMessage,
} from './types'
import { DEFAULT_OPTIONS } from './types'
import { ObjectStateMap, StepBuffer } from './state'

type EventCallback<K extends keyof MettagridEventMap> = (data: MettagridEventMap[K]) => void
type AnyCallback = (data: unknown) => void

export class MettagridClient {
  private _url: string
  private _opts: Required<MettagridClientOptions>
  private _ws: WebSocket | null = null
  private _connectionState: ConnectionState = 'disconnected'
  private _reconnectAttempt = 0
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private _pingTimer: ReturnType<typeof setInterval> | null = null
  private _listeners = new Map<string, Set<AnyCallback>>()

  private _metadata: EpisodeMetadata | null = null
  private _state = new ObjectStateMap()
  private _buffer = new StepBuffer()
  private _currentStep = -1
  private _serverVersion = 0
  private _replayFormatVersion = 0
  private _stateVersion = 0

  constructor (url: string, options?: MettagridClientOptions) {
    this._url = url
    this._opts = { ...DEFAULT_OPTIONS, ...options }
    this._buffer = new StepBuffer(this._opts.bufferSize)
  }

  // -- Public API --

  get url () { return this._url }
  get connectionState () { return this._connectionState }
  get metadata () { return this._metadata }
  get state () { return this._state }
  get buffer () { return this._buffer }
  get currentStep () { return this._currentStep }
  get stateVersion () { return this._stateVersion }

  connect (): void {
    if (this._ws && this._ws.readyState <= WebSocket.OPEN) return
    this._setConnectionState('connecting')
    this._ws = new WebSocket(this._url)
    this._ws.onopen = () => this._onOpen()
    this._ws.onmessage = (ev) => this._onMessage(ev)
    this._ws.onclose = () => this._onClose()
    this._ws.onerror = () => this._ws?.close()
  }

  disconnect (): void {
    this._stopReconnect()
    this._stopPing()
    if (this._ws) {
      this._ws.onclose = null
      this._ws.close()
      this._ws = null
    }
    this._setConnectionState('disconnected')
  }

  subscribe (fromStep?: number): void {
    this._send({ type: 'subscribe', from_step: fromStep ?? this._opts.subscribeFromStep })
  }

  requestHistory (startStep: number, endStep: number): void {
    this._send({ type: 'history', start_step: startStep, end_step: endStep })
  }

  requestMetadata (): void {
    this._send({ type: 'get_metadata' })
  }

  ping (): void {
    this._send({ type: 'ping' })
  }

  on<K extends keyof MettagridEventMap> (event: K, callback: EventCallback<K>): () => void {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set())
    this._listeners.get(event)!.add(callback as AnyCallback)
    return () => this._listeners.get(event)?.delete(callback as AnyCallback)
  }

  off<K extends keyof MettagridEventMap> (event: K, callback: EventCallback<K>): void {
    this._listeners.get(event)?.delete(callback as AnyCallback)
  }

  destroy (): void {
    this.disconnect()
    this._listeners.clear()
    this._state.clear()
    this._buffer.clear()
  }

  // -- Internal --

  private _emit<K extends keyof MettagridEventMap> (event: K, data: MettagridEventMap[K]): void {
    const cbs = this._listeners.get(event)
    if (cbs) for (const cb of cbs) cb(data)
  }

  private _send (msg: ClientMessage): void {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(msg))
    }
  }

  private _setConnectionState (state: ConnectionState): void {
    if (this._connectionState === state) return
    this._connectionState = state
    this._emit('connection-change', state)
  }

  private _onOpen (): void {
    this._setConnectionState('connected')
    this._reconnectAttempt = 0
    this._startPing()
    if (this._opts.autoSubscribe) {
      this.subscribe()
    }
  }

  private _onClose (): void {
    this._ws = null
    this._stopPing()
    this._setConnectionState('disconnected')
    if (this._opts.reconnect) {
      this._scheduleReconnect()
    }
  }

  private _onMessage (ev: MessageEvent): void {
    let msg: ServerMessage
    try {
      msg = JSON.parse(ev.data as string) as ServerMessage
    } catch {
      return
    }

    switch (msg.type) {
      case 'server_info':
        this._serverVersion = msg.version
        this._replayFormatVersion = msg.replay_format_version
        break

      case 'metadata':
        this._metadata = msg.data
        this._emit('metadata', msg.data)
        break

      case 'episode_start':
        this._metadata = msg.data
        this._state.clear()
        this._buffer.clear()
        this._currentStep = -1
        this._stateVersion++
        this._emit('episode-start', msg.data)
        this._emit('metadata', msg.data)
        break

      case 'step':
        this._state.applyStep(msg.data)
        this._buffer.append(msg.data)
        this._currentStep = msg.data.step
        this._stateVersion++
        this._emit('step', msg.data)
        break

      case 'episode_end':
        this._emit('episode-end', msg.data.infos)
        break

      case 'history_response':
        this._emit('history-response', msg as HistoryResponseMessage)
        break

      case 'error':
        this._emit('error', msg as ErrorMessage)
        break

      case 'pong':
        break
    }
  }

  private _scheduleReconnect (): void {
    this._stopReconnect()
    const delay = Math.min(
      this._opts.reconnectInterval * Math.pow(2, this._reconnectAttempt),
      this._opts.reconnectMaxInterval
    )
    this._reconnectAttempt++
    this._reconnectTimer = setTimeout(() => this.connect(), delay)
  }

  private _stopReconnect (): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
  }

  private _startPing (): void {
    this._stopPing()
    if (this._opts.pingInterval > 0) {
      this._pingTimer = setInterval(() => this.ping(), this._opts.pingInterval)
    }
  }

  private _stopPing (): void {
    if (this._pingTimer) {
      clearInterval(this._pingTimer)
      this._pingTimer = null
    }
  }
}
