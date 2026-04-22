import type { GridObject, StepObject, StepData } from './types'

const GRID_OBJECT_DEFAULTS: Omit<GridObject, 'id'> = {
  alive: true,
  type_name: '',
  location: [0, 0],
  orientation: 0,
}

export class ObjectStateMap {
  private _objects = new Map<number, GridObject>()
  private _version = 0

  get version () { return this._version }
  get size () { return this._objects.size }

  get objects (): ReadonlyMap<number, GridObject> {
    return this._objects
  }

  get (id: number): GridObject | undefined {
    return this._objects.get(id)
  }

  agents (): GridObject[] {
    const result: GridObject[] = []
    for (const obj of this._objects.values()) {
      if (obj.is_agent && obj.alive) result.push(obj)
    }
    return result
  }

  walls (): GridObject[] {
    const result: GridObject[] = []
    for (const obj of this._objects.values()) {
      if (obj.type_name === 'wall' && obj.alive) result.push(obj)
    }
    return result
  }

  alive (): GridObject[] {
    const result: GridObject[] = []
    for (const obj of this._objects.values()) {
      if (obj.alive) result.push(obj)
    }
    return result
  }

  applyStep (step: StepData): void {
    for (const obj of step.objects) {
      this._mergeObject(obj)
    }
    this._version++
  }

  clear (): void {
    this._objects.clear()
    this._version++
  }

  objectAt (x: number, y: number): GridObject | undefined {
    for (const obj of this._objects.values()) {
      if (obj.alive && obj.location[0] === x && obj.location[1] === y) {
        return obj
      }
    }
    return undefined
  }

  agentAt (x: number, y: number): GridObject | undefined {
    for (const obj of this._objects.values()) {
      if (obj.is_agent && obj.alive && obj.location[0] === x && obj.location[1] === y) {
        return obj
      }
    }
    return undefined
  }

  private _mergeObject (update: StepObject): void {
    const existing = this._objects.get(update.id)
    if (existing) {
      for (const key of Object.keys(update) as (keyof StepObject)[]) {
        if (update[key] !== undefined) {
          ;(existing as unknown as Record<string, unknown>)[key] = update[key]
        }
      }
    } else {
      const obj: GridObject = {
        ...GRID_OBJECT_DEFAULTS,
        ...update,
      } as GridObject
      this._objects.set(update.id, obj)
    }
  }
}

export class StepBuffer {
  private _steps: StepData[] = []
  private _maxSize: number

  constructor (maxSize = 2000) {
    this._maxSize = maxSize
  }

  get length () { return this._steps.length }
  get latestStep () { return this._steps.length > 0 ? this._steps[this._steps.length - 1].step : -1 }
  get oldestStep () { return this._steps.length > 0 ? this._steps[0].step : -1 }

  append (step: StepData): void {
    this._steps.push(step)
    if (this._steps.length > this._maxSize) {
      this._steps.shift()
    }
  }

  getStep (step: number): StepData | undefined {
    if (this._steps.length === 0) return undefined
    const oldest = this._steps[0].step
    const idx = step - oldest
    if (idx < 0 || idx >= this._steps.length) return undefined
    return this._steps[idx]
  }

  getRange (start: number, end: number): StepData[] {
    if (this._steps.length === 0) return []
    const oldest = this._steps[0].step
    const startIdx = Math.max(0, start - oldest)
    const endIdx = Math.min(this._steps.length, end - oldest)
    if (startIdx >= endIdx) return []
    return this._steps.slice(startIdx, endIdx)
  }

  clear (): void {
    this._steps = []
  }

  replayTo (step: number, state: ObjectStateMap): void {
    state.clear()
    for (const s of this._steps) {
      if (s.step > step) break
      state.applyStep(s)
    }
  }
}
