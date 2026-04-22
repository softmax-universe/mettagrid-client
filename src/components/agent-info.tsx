'use client'

import type { EpisodeMetadata, GridObject } from '../types'
import type { ObjectStateMap } from '../state'

export interface AgentInfoProps {
  object: GridObject | null
  metadata: EpisodeMetadata | null
  className?: string
}

export function AgentInfo ({ object, metadata, className = '' }: AgentInfoProps) {
  if (!object) return null

  const actionName = metadata?.action_names?.[object.action_id ?? 0] ?? String(object.action_id ?? '-')
  const teamIdx = object.collective_id !== undefined && object.collective_id >= 0
    ? object.collective_id
    : (object.group_id ?? 0)
  const collectiveName = metadata?.collective_names?.[teamIdx]
    ?? metadata?.group_names?.[object.group_id ?? 0]
    ?? `Team ${teamIdx}`
  const items = (object.inventory ?? [])
    .filter(([, count]) => count > 0)
    .map(([itemId, count]) => {
      const name = metadata?.item_names?.[itemId] ?? `item_${itemId}`
      return `${name}: ${count}`
    })

  return (
    <div className={`text-xs font-mono ${className}`} style={{ padding: 8, background: 'rgba(0,0,0,0.6)', color: '#ddd', borderRadius: 6 }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: '#fff' }}>
        Agent {object.agent_id} <span style={{ opacity: 0.6 }}>({collectiveName})</span>
      </div>
      <Row label="Location" value={`[${object.location[0]}, ${object.location[1]}]`} />
      <Row label="Action" value={`${actionName}${object.action_success ? ' ✓' : ' ✗'}`} />
      <Row label="Reward" value={`${(object.current_reward ?? 0).toFixed(2)} (total: ${(object.total_reward ?? 0).toFixed(2)})`} />
      {object.frozen && <Row label="Frozen" value={`${object.frozen_progress ?? 0} / ${object.frozen_time ?? 0}`} />}
      {items.length > 0 && <Row label="Inventory" value={items.join(', ')} />}
      {object.talk_text && <Row label="Talk" value={object.talk_text} />}
    </div>
  )
}

function Row ({ label, value }: { label: string, value: string }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
      <span style={{ color: '#888', minWidth: 60 }}>{label}</span>
      <span>{value}</span>
    </div>
  )
}
