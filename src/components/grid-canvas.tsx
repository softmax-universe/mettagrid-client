'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import type { EpisodeMetadata, GridObject } from '../types'
import { ATLAS_DATA_URL, SPRITE_MAP, TILE_SIZE as SPRITE_SIZE } from '../sprites/atlas-data'

const TEAM_COLORS: Record<string, string> = {
  clips: '#e74c3c', cogs: '#EFB850', cogs_green: '#2ecc71',
  cogs_blue: '#3498db', cogs_yellow: '#f1c40f',
}
const TEAM_FALLBACKS = ['#9b59b6', '#e67e22', '#1abc9c', '#2c3e50', '#e84393']
const GROUND_COLOR = '#1a1a2e'
const GROUND_ALT = '#16162a'
const TAU = Math.PI * 2
const ITEM_COLORS = ['#ef4444', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#f97316', '#06b6d4', '#ec4899']

export interface GridCanvasProps {
  objects: ReadonlyMap<number, GridObject>
  metadata: EpisodeMetadata | null
  selectedId?: number | null
  onSelectObject?: (id: number | null) => void
  cellSize?: number
  className?: string
  showAoE?: boolean
  aoERadius?: number
}

function teamColor (groupId: number, meta: EpisodeMetadata | null): string {
  const name = meta?.collective_names?.[groupId]
  if (name && TEAM_COLORS[name]) return TEAM_COLORS[name]
  return TEAM_FALLBACKS[groupId % TEAM_FALLBACKS.length]
}

function hexToRgb (hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// Resolve a type_name to sprite entries
function resolveSprites (typeName: string): { base?: typeof SPRITE_MAP[string], mask?: typeof SPRITE_MAP[string] } {
  // Agents
  if (typeName === 'agent') return { base: SPRITE_MAP['agent_agent'], mask: SPRITE_MAP['agent_agent_mask'] }

  // Objects: try exact, then prefix match
  const objKey = `obj_${typeName.replace(/\./g, '_')}`
  if (SPRITE_MAP[objKey]) return { base: SPRITE_MAP[objKey] }

  // Lookup: object_id -> slot index
  for (const key of Object.keys(SPRITE_MAP)) {
    if (key.startsWith('obj_') && typeName.includes(key.replace('obj_', '').split('_')[0])) {
      return { base: SPRITE_MAP[key] }
    }
  }

  return {}
}

function loadAtlasImage (): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = ATLAS_DATA_URL
  })
}

// Pre-tint agent mask with a team color onto an offscreen canvas
function tintMask (
  atlas: HTMLImageElement,
  mask: typeof SPRITE_MAP[string],
  color: string,
): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = SPRITE_SIZE
  c.height = SPRITE_SIZE
  const ctx = c.getContext('2d')!

  // Draw the mask
  ctx.drawImage(atlas, mask.x, mask.y, mask.w, mask.h, 0, 0, SPRITE_SIZE, SPRITE_SIZE)

  // Tint it with team color using multiply
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE)

  return c
}

export function GridCanvas ({
  objects,
  metadata,
  selectedId = null,
  onSelectObject,
  cellSize = 10,
  className = '',
  showAoE = true,
  aoERadius = 6,
}: GridCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const aoeCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const bgMetaRef = useRef<EpisodeMetadata | null>(null)
  const atlasRef = useRef<HTMLImageElement | null>(null)
  const tintCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map())
  const rafRef = useRef(0)

  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 })
  const [cameraVersion, setCameraVersion] = useState(0)
  const camera = cameraRef.current
  const dragRef = useRef<{ startX: number, startY: number, camX: number, camY: number, dragged?: boolean } | null>(null)

  const updateCamera = useCallback((updater: (c: typeof cameraRef.current) => typeof cameraRef.current) => {
    cameraRef.current = updater(cameraRef.current)
    setCameraVersion(v => v + 1)
  }, [])

  const mapW = metadata?.map_size[0] ?? 0
  const mapH = metadata?.map_size[1] ?? 0
  const worldW = mapW * cellSize
  const worldH = mapH * cellSize

  // Load atlas image
  useEffect(() => {
    loadAtlasImage().then(img => { atlasRef.current = img })
  }, [])

  // Count walls to know when to rebuild background
  let wallCount = 0
  for (const obj of objects.values()) {
    if (obj.type_name === 'wall' && obj.alive) wallCount++
  }
  const wallCountRef = useRef(0)

  // Build background (terrain + walls with sprites) -- rebuilds when walls first appear
  useEffect(() => {
    if (!mapW || !mapH || !atlasRef.current) return
    // Skip if nothing changed
    if (bgCanvasRef.current && wallCountRef.current === wallCount && bgMetaRef.current === metadata) return
    bgMetaRef.current = metadata
    wallCountRef.current = wallCount
    const atlas = atlasRef.current
    const wallSprite = SPRITE_MAP['obj_block']

    const bg = document.createElement('canvas')
    bg.width = mapW * cellSize
    bg.height = mapH * cellSize
    const ctx = bg.getContext('2d')!
    ctx.imageSmoothingEnabled = false

    // Dark ground
    ctx.fillStyle = GROUND_COLOR
    ctx.fillRect(0, 0, bg.width, bg.height)
    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        if ((x + y) % 2 === 0) {
          ctx.fillStyle = GROUND_ALT
          ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize)
        }
      }
    }

    // Walls as block sprites
    for (const obj of objects.values()) {
      if (obj.type_name === 'wall' && obj.alive && wallSprite) {
        ctx.drawImage(atlas, wallSprite.x, wallSprite.y, wallSprite.w, wallSprite.h,
          obj.location[0] * cellSize, obj.location[1] * cellSize, cellSize, cellSize)
      }
    }

    bgCanvasRef.current = bg

    if (wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect()
      const fitZoom = Math.min(rect.width / worldW, rect.height / worldH, 1)
      cameraRef.current = { x: (rect.width - worldW * fitZoom) / 2, y: (rect.height - worldH * fitZoom) / 2, zoom: fitZoom }
      setCameraVersion(v => v + 1)
    }
  }, [metadata, mapW, mapH, cellSize, worldW, worldH, wallCount])

  // AoE overlay
  useEffect(() => {
    if (!showAoE || !mapW || !mapH) { aoeCanvasRef.current = null; return }

    const junctions: { x: number, y: number, team: number }[] = []
    for (const obj of objects.values()) {
      if (!obj.alive || obj.type_name !== 'junction') continue
      if (obj.collective_id !== undefined && obj.collective_id >= 0) {
        junctions.push({ x: obj.location[0], y: obj.location[1], team: obj.collective_id })
      }
    }
    if (junctions.length === 0) { aoeCanvasRef.current = null; return }

    const aoe = document.createElement('canvas')
    aoe.width = mapW * cellSize
    aoe.height = mapH * cellSize
    const ctx = aoe.getContext('2d')!

    const influence = new Float32Array(mapW * mapH)
    const teamGrid = new Int8Array(mapW * mapH).fill(-1)

    for (const j of junctions) {
      const r = aoERadius
      for (let y = Math.max(0, j.y - r); y <= Math.min(mapH - 1, j.y + r); y++) {
        for (let x = Math.max(0, j.x - r); x <= Math.min(mapW - 1, j.x + r); x++) {
          const dist = Math.hypot(x - j.x, y - j.y)
          if (dist > r) continue
          const str = 1 - dist / r
          const idx = y * mapW + x
          if (str > influence[idx]) { influence[idx] = str; teamGrid[idx] = j.team }
        }
      }
    }

    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        const idx = y * mapW + x
        if (influence[idx] <= 0 || teamGrid[idx] < 0) continue
        const [r, g, b] = hexToRgb(teamColor(teamGrid[idx], metadata))
        ctx.fillStyle = `rgba(${r},${g},${b},${influence[idx] * 0.2})`
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize)
      }
    }

    aoeCanvasRef.current = aoe
  }, [objects, metadata, mapW, mapH, cellSize, showAoE, aoERadius])

  // Main render
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    const atlas = atlasRef.current
    if (!canvas || !wrap || !mapW || !mapH) return

    const rect = wrap.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio, 2)
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`

    const ctx = canvas.getContext('2d')!

    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, rect.width, rect.height)
      ctx.fillStyle = '#0a0a1a'
      ctx.fillRect(0, 0, rect.width, rect.height)

      ctx.save()
      ctx.translate(camera.x, camera.y)
      ctx.scale(camera.zoom, camera.zoom)

      if (bgCanvasRef.current) ctx.drawImage(bgCanvasRef.current, 0, 0)
      if (aoeCanvasRef.current) ctx.drawImage(aoeCanvasRef.current, 0, 0)

      if (!atlas) { ctx.restore(); return }

      const half = cellSize / 2
      const fontSize = Math.max(7, Math.round(cellSize * 0.5))

      // Buildings (sprites)
      for (const obj of objects.values()) {
        if (!obj.alive || obj.type_name === 'wall' || obj.is_agent) continue
        const px = obj.location[0] * cellSize
        const py = obj.location[1] * cellSize
        const { base } = resolveSprites(obj.type_name)
        if (!base) continue

        if (obj.type_name === 'junction' && obj.collective_id !== undefined && obj.collective_id >= 0) {
          const workingSprite = SPRITE_MAP['obj_junction_working']
          if (workingSprite) {
            ctx.drawImage(atlas, workingSprite.x, workingSprite.y, workingSprite.w, workingSprite.h,
              px, py, cellSize, cellSize)
          } else {
            ctx.drawImage(atlas, base.x, base.y, base.w, base.h, px, py, cellSize, cellSize)
          }
          const tc = teamColor(obj.collective_id, metadata)
          const [r, g, b] = hexToRgb(tc)
          ctx.fillStyle = `rgba(${r},${g},${b},0.3)`
          ctx.beginPath()
          ctx.arc(px + half, py + half, cellSize * 0.6, 0, TAU)
          ctx.fill()
        } else {
          ctx.drawImage(atlas, base.x, base.y, base.w, base.h, px, py, cellSize, cellSize)
        }
      }

      // Agents (sprites with team-tinted masks + labels)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'

      for (const obj of objects.values()) {
        if (!obj.is_agent || !obj.alive) continue
        const px = obj.location[0] * cellSize
        const py = obj.location[1] * cellSize

        // Resolve team: try collective_id first, fall back to group_id
        const teamIdx = obj.collective_id !== undefined && obj.collective_id >= 0
          ? obj.collective_id
          : (obj.group_id ?? 0)
        const tc = teamColor(teamIdx, metadata)
        const [tr, tg, tb] = hexToRgb(tc)

        // Subtle glow under agent
        ctx.fillStyle = `rgba(${tr},${tg},${tb},0.2)`
        ctx.beginPath()
        ctx.arc(px + half, py + half, cellSize * 0.65, 0, TAU)
        ctx.fill()

        // Base agent sprite
        ctx.globalAlpha = obj.frozen ? 0.4 : 1.0
        const agentSprite = SPRITE_MAP['agent_agent']
        if (agentSprite) {
          ctx.drawImage(atlas, agentSprite.x, agentSprite.y, agentSprite.w, agentSprite.h,
            px, py, cellSize, cellSize)
        }

        // Team-color tinted mask (composited over base sprite)
        const maskSprite = SPRITE_MAP['agent_agent_mask']
        if (maskSprite) {
          const cacheKey = `${maskSprite.name}_${tc}`
          let tinted = tintCacheRef.current.get(cacheKey)
          if (!tinted) {
            tinted = tintMask(atlas, maskSprite, tc)
            tintCacheRef.current.set(cacheKey, tinted)
          }
          ctx.globalAlpha = (obj.frozen ? 0.3 : 0.7)
          ctx.drawImage(tinted, 0, 0, SPRITE_SIZE, SPRITE_SIZE, px, py, cellSize, cellSize)
        }
        ctx.globalAlpha = 1.0

        // Frozen overlay
        if (obj.frozen) {
          const frozenSprite = SPRITE_MAP['frozen']
          if (frozenSprite) {
            ctx.globalAlpha = 0.5
            ctx.drawImage(atlas, frozenSprite.x, frozenSprite.y, frozenSprite.w, frozenSprite.h,
              px, py, cellSize, cellSize)
            ctx.globalAlpha = 1.0
          }
        }

        // Selection ring
        if (selectedId === obj.id) {
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(px + half, py + half, cellSize * 0.6, 0, TAU)
          ctx.stroke()
        }

        // Agent tag label (agent_id only, compact)
        const agentId = obj.agent_id ?? 0
        const labelText = String(agentId)

        ctx.font = `bold ${fontSize}px monospace`
        const tw = ctx.measureText(labelText).width
        const tagPad = 2
        const tagX = px + half - tw / 2 - tagPad
        const tagY = py - fontSize - 2
        const tagW = tw + tagPad * 2
        const tagH = fontSize + 2

        ctx.fillStyle = `rgba(${tr},${tg},${tb},0.85)`
        ctx.beginPath()
        ctx.roundRect(tagX, tagY, tagW, tagH, 2)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.fillText(labelText, px + half, py - 1)

        // Inventory: show count summary, not individual pips
        if (obj.inventory && obj.inventory.length > 0) {
          const totalItems = obj.inventory.reduce((sum, [, count]) => sum + count, 0)
          if (totalItems > 0) {
            const invLabel = String(totalItems)
            ctx.font = `${Math.max(6, fontSize - 1)}px monospace`
            const iw = ctx.measureText(invLabel).width
            ctx.fillStyle = 'rgba(0,0,0,0.6)'
            ctx.beginPath()
            ctx.roundRect(px + half - iw / 2 - 2, py + cellSize, iw + 4, fontSize, 2)
            ctx.fill()
            ctx.fillStyle = '#ccc'
            ctx.textBaseline = 'top'
            ctx.fillText(invLabel, px + half, py + cellSize + 1)
            ctx.textBaseline = 'bottom'
          }
        }
      }

      ctx.restore()
    })

    return () => cancelAnimationFrame(rafRef.current)
  }, [objects, metadata, selectedId, cellSize, mapW, mapH, cameraVersion])

  // Wheel zoom (non-passive native listener)
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = wrapRef.current?.getBoundingClientRect()
      if (!rect) return
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const f = e.deltaY < 0 ? 1.15 : 1 / 1.15
      updateCamera(c => {
        const nz = Math.max(0.1, Math.min(8, c.zoom * f))
        return { x: mx - (mx - c.x) * (nz / c.zoom), y: my - (my - c.y) * (nz / c.zoom), zoom: nz }
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [updateCamera])

  // Pointer interaction (pan + tap + pinch)
  const pointerCache = useRef<PointerEvent[]>([])
  const prevPinchDist = useRef(-1)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    canvasRef.current?.setPointerCapture(e.pointerId)
    pointerCache.current.push(e.nativeEvent)
    if (pointerCache.current.length === 1) {
      const c = cameraRef.current
      dragRef.current = { startX: e.clientX, startY: e.clientY, camX: c.x, camY: c.y }
    }
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const idx = pointerCache.current.findIndex(p => p.pointerId === e.pointerId)
    if (idx >= 0) pointerCache.current[idx] = e.nativeEvent
    if (pointerCache.current.length === 2) {
      const [p1, p2] = pointerCache.current
      const dist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY)
      if (prevPinchDist.current > 0) {
        const s = dist / prevPinchDist.current
        const rect = wrapRef.current?.getBoundingClientRect()
        if (rect) {
          const mx = (p1.clientX + p2.clientX) / 2 - rect.left
          const my = (p1.clientY + p2.clientY) / 2 - rect.top
          updateCamera(c => { const nz = Math.max(0.1, Math.min(8, c.zoom * s)); return { x: mx - (mx - c.x) * (nz / c.zoom), y: my - (my - c.y) * (nz / c.zoom), zoom: nz } })
        }
      }
      prevPinchDist.current = dist
      dragRef.current = null
      return
    }
    if (dragRef.current && pointerCache.current.length === 1) {
      const dx = e.clientX - dragRef.current.startX, dy = e.clientY - dragRef.current.startY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.dragged = true
      const d = dragRef.current
      updateCamera(() => ({ x: d.camX + dx, y: d.camY + dy, zoom: cameraRef.current.zoom }))
    }
  }, [updateCamera])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    pointerCache.current = pointerCache.current.filter(p => p.pointerId !== e.pointerId)
    prevPinchDist.current = -1
    if (dragRef.current && !dragRef.current.dragged && onSelectObject) {
      const rect = wrapRef.current?.getBoundingClientRect()
      const c = cameraRef.current
      if (rect) {
        const cx = Math.floor(((e.clientX - rect.left - c.x) / c.zoom) / cellSize)
        const cy = Math.floor(((e.clientY - rect.top - c.y) / c.zoom) / cellSize)
        let found: number | null = null
        for (const obj of objects.values()) {
          if (obj.alive && obj.location[0] === cx && obj.location[1] === cy) {
            if (obj.is_agent) { found = obj.id; break }
            if (found === null) found = obj.id
          }
        }
        onSelectObject(found)
      }
    }
    dragRef.current = null
  }, [cellSize, objects, onSelectObject])

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    pointerCache.current = pointerCache.current.filter(p => p.pointerId !== e.pointerId)
    prevPinchDist.current = -1
    dragRef.current = null
  }, [])

  const fitToView = useCallback(() => {
    if (!wrapRef.current || !worldW || !worldH) return
    const rect = wrapRef.current.getBoundingClientRect()
    const z = Math.min(rect.width / worldW, rect.height / worldH) * 0.95
    updateCamera(() => ({ x: (rect.width - worldW * z) / 2, y: (rect.height - worldH * z) / 2, zoom: z }))
  }, [worldW, worldH, updateCamera])

  const zoomIn = useCallback(() => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = rect.width / 2, my = rect.height / 2
    updateCamera(c => { const nz = Math.min(8, c.zoom * 1.4); return { x: mx - (mx - c.x) * (nz / c.zoom), y: my - (my - c.y) * (nz / c.zoom), zoom: nz } })
  }, [updateCamera])

  const zoomOut = useCallback(() => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = rect.width / 2, my = rect.height / 2
    updateCamera(c => { const nz = Math.max(0.1, c.zoom / 1.4); return { x: mx - (mx - c.x) * (nz / c.zoom), y: my - (my - c.y) * (nz / c.zoom), zoom: nz } })
  }, [updateCamera])

  return (
    <div ref={wrapRef} className={className}
      style={{ position: 'relative', overflow: 'hidden', background: '#0a0a1a', aspectRatio: '1', width: '100%' }}
      onContextMenu={e => e.preventDefault()}>
      <canvas ref={canvasRef}
        style={{ position: 'absolute', inset: 0, touchAction: 'none', cursor: 'grab' }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} />
      <div style={{ position: 'absolute', bottom: 8, right: 8, display: 'flex', gap: 4, fontFamily: 'monospace' }}>
        <ZBtn onClick={zoomOut} label="−" />
        <ZBtn onClick={fitToView} label="Fit" />
        <ZBtn onClick={zoomIn} label="+" />
      </div>
    </div>
  )
}

function ZBtn ({ onClick, label }: { onClick: () => void, label: string }) {
  return (
    <button onClick={onClick} style={{
      background: 'rgba(0,0,0,0.7)', color: '#bbb', border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontFamily: 'monospace',
      fontSize: 13, lineHeight: 1, minWidth: 32, textAlign: 'center',
    }}>{label}</button>
  )
}
