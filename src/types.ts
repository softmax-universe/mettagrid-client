// Protocol types for mettagrid WebSocket streaming

// -- Server -> Client messages --

export interface ServerInfoMessage {
  type: 'server_info'
  version: number
  replay_format_version: number
}

export interface EpisodeMetadata {
  version: number
  num_agents: number
  max_steps: number
  map_size: [number, number]
  type_names: string[]
  action_names: string[]
  item_names: string[]
  animation_names: string[]
  collective_names: string[]
  capacity_names: string[]
  group_names?: string[]
  tags: Record<string, number>
  policy_env_interface?: Record<string, unknown>
  mg_config?: Record<string, unknown>
}

export interface MetadataMessage {
  type: 'metadata'
  data: EpisodeMetadata
}

export interface EpisodeStartMessage {
  type: 'episode_start'
  data: EpisodeMetadata
}

export interface StepData {
  step: number
  objects: StepObject[]
  episode_stats?: Record<string, unknown>
}

export interface StepMessage {
  type: 'step'
  data: StepData
}

export interface EpisodeEndMessage {
  type: 'episode_end'
  data: {
    infos: Record<string, unknown>
  }
}

export interface HistoryResponseMessage {
  type: 'history_response'
  start_step: number
  end_step: number
  available_start: number
  available_end: number
  steps: StepData[]
}

export interface ErrorMessage {
  type: 'error'
  code: string
  message: string
}

export interface PongMessage {
  type: 'pong'
}

export type ServerMessage =
  | ServerInfoMessage
  | MetadataMessage
  | EpisodeStartMessage
  | StepMessage
  | EpisodeEndMessage
  | HistoryResponseMessage
  | ErrorMessage
  | PongMessage

// -- Client -> Server messages --

export interface SubscribeRequest {
  type: 'subscribe'
  from_step?: number
}

export interface HistoryRequest {
  type: 'history'
  start_step?: number
  end_step?: number
}

export interface GetMetadataRequest {
  type: 'get_metadata'
}

export interface PingRequest {
  type: 'ping'
}

export type ClientMessage =
  | SubscribeRequest
  | HistoryRequest
  | GetMetadataRequest
  | PingRequest

// -- Object types --

export interface StepObject {
  id: number
  alive?: boolean
  type_name?: string
  location?: [number, number]
  orientation?: number
  inventory?: [number, number][]
  inventory_max?: number
  inventory_capacities?: [number, number][]
  color?: number
  tag_ids?: number[]

  // Agent fields
  is_agent?: boolean
  agent_id?: number
  action_id?: number
  action_param?: number
  action_success?: boolean
  animation_id?: number
  current_reward?: number
  total_reward?: number
  group_id?: number
  vibe_id?: number
  vibe?: number
  vision_size?: number
  talk_text?: string
  talk_remaining_steps?: number
  policy_infos?: Record<string, unknown>
  monologue_append?: string
  monologue_reset?: boolean
  frozen?: boolean
  frozen_progress?: number
  frozen_time?: number
  collective_id?: number

  // Converter fields
  input_resources?: [number, number][]
  output_resources?: [number, number][]
  output_limit?: number
  is_converting?: boolean
  conversion_duration?: number
  is_cooling_down?: boolean
  cooldown_duration?: number
}

export interface GridObject extends StepObject {
  id: number
  alive: boolean
  type_name: string
  location: [number, number]
  orientation: number
}

// -- Connection state --

export type ConnectionState = 'disconnected' | 'connecting' | 'connected'

// -- Events --

export interface MettagridEventMap {
  step: StepData
  metadata: EpisodeMetadata
  'episode-start': EpisodeMetadata
  'episode-end': Record<string, unknown>
  'connection-change': ConnectionState
  'history-response': HistoryResponseMessage
  error: ErrorMessage
}

// -- Options --

export interface MettagridClientOptions {
  autoSubscribe?: boolean
  subscribeFromStep?: number
  bufferSize?: number
  reconnect?: boolean
  reconnectInterval?: number
  reconnectMaxInterval?: number
  pingInterval?: number
}

export const DEFAULT_OPTIONS: Required<MettagridClientOptions> = {
  autoSubscribe: true,
  subscribeFromStep: 0,
  bufferSize: 2000,
  reconnect: true,
  reconnectInterval: 1000,
  reconnectMaxInterval: 30000,
  pingInterval: 15000,
}
