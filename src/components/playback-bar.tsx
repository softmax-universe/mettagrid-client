'use client'

export interface PlaybackBarProps {
  currentStep: number
  displayStep: number
  maxStep: number
  isPaused: boolean
  onPause: () => void
  onResume: () => void
  onSeek: (step: number) => void
  speed?: number
  onSpeedChange?: (speed: number) => void
  connectionState?: string
  className?: string
}

const SPEEDS = [0.5, 1, 2, 5, 10]

export function PlaybackBar ({
  currentStep,
  displayStep,
  maxStep,
  isPaused,
  onPause,
  onResume,
  onSeek,
  speed = 1,
  onSpeedChange,
  connectionState = 'disconnected',
  className = '',
}: PlaybackBarProps) {
  const statusColor = connectionState === 'connected'
    ? '#2ecc71'
    : connectionState === 'connecting' ? '#f1c40f' : '#e74c3c'

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        background: 'rgba(0,0,0,0.6)',
        borderRadius: 6,
        fontSize: 11,
        fontFamily: 'monospace',
        color: '#ccc',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />

      <button
        onClick={isPaused ? onResume : onPause}
        title={isPaused ? 'Resume' : 'Pause'}
        style={btnStyle}
      >
        {isPaused ? '▶' : '⏸'}
      </button>

      <input
        type="range"
        min={0}
        max={Math.max(0, maxStep)}
        value={Math.max(0, displayStep)}
        onChange={(e) => onSeek(parseInt(e.target.value, 10))}
        disabled={maxStep <= 0}
        style={{ flex: 1, minWidth: 100, accentColor: '#3b82f6' }}
      />

      <span style={{ minWidth: 70, textAlign: 'right', fontSize: 10, opacity: 0.8 }}>
        {displayStep >= 0 ? displayStep : '-'}
        {isPaused && displayStep !== currentStep ? ` (${currentStep})` : ''}
        {' / '}{maxStep >= 0 ? maxStep : '-'}
      </span>

      {onSpeedChange && (
        <div style={{ display: 'flex', gap: 2 }}>
          {SPEEDS.map(s => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              title={`${s}x speed`}
              style={{
                ...btnStyle,
                background: speed === s ? 'rgba(59,130,246,0.6)' : 'rgba(255,255,255,0.06)',
                color: speed === s ? '#fff' : '#888',
                padding: '2px 6px',
                fontSize: 10,
                minWidth: 0,
                borderRadius: 3,
              }}
            >
              {s === 0.5 ? '½' : `${s}`}x
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.1)',
  border: 'none',
  color: '#ccc',
  padding: '2px 8px',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: 'monospace',
}
