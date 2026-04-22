// React exports (hooks + components)
export { useMettagrid } from './hooks/use-mettagrid'
export type { UseMettagridReturn } from './hooks/use-mettagrid'

export { GridCanvas } from './components/grid-canvas'
export type { GridCanvasProps } from './components/grid-canvas'

export { AgentInfo } from './components/agent-info'
export type { AgentInfoProps } from './components/agent-info'

export { PlaybackBar } from './components/playback-bar'
export type { PlaybackBarProps } from './components/playback-bar'

// Re-export core types for convenience
export type {
  ConnectionState,
  EpisodeMetadata,
  GridObject,
  StepData,
  MettagridClientOptions,
} from './types'
