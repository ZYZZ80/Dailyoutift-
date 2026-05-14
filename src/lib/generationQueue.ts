import { useState, useEffect } from 'react'

export type JobKind = 'try-on' | 'outfit-preview' | 'outfit-build'
export type JobOrigin = 'tryon' | 'today' | 'build'
export type JobStatus = 'running' | 'done' | 'error'

export interface GenerationJob {
  id: string
  kind: JobKind
  origin: JobOrigin
  label: string
  status: JobStatus
  startedAt: number
  result?: Record<string, string>
  error?: string
}

interface StartOptions {
  kind: JobKind
  origin: JobOrigin
  label: string
  runner: () => Promise<Record<string, string> | void>
}

type Listener = (job: GenerationJob | null) => void

class GenerationQueue {
  private current: GenerationJob | null = null
  private listeners = new Set<Listener>()

  private notify() {
    this.listeners.forEach((fn) => fn(this.current))
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    fn(this.current)
    return () => this.listeners.delete(fn)
  }

  async start(opts: StartOptions): Promise<void> {
    const job: GenerationJob = {
      id: crypto.randomUUID(),
      kind: opts.kind,
      origin: opts.origin,
      label: opts.label,
      status: 'running',
      startedAt: Date.now(),
    }
    this.current = job
    this.notify()
    try {
      const result = await opts.runner()
      if (this.current?.id === job.id) {
        this.current = { ...job, status: 'done', result: result ?? undefined }
        this.notify()
      }
    } catch (e) {
      if (this.current?.id === job.id) {
        this.current = {
          ...job,
          status: 'error',
          error: e instanceof Error ? e.message : String(e),
        }
        this.notify()
      }
    }
  }

  clear(id?: string) {
    if (!id || this.current?.id === id) {
      this.current = null
      this.notify()
    }
  }

  get(): GenerationJob | null {
    return this.current
  }
}

export const generationQueue = new GenerationQueue()

export function useGenerationJob(): GenerationJob | null {
  const [job, setJob] = useState<GenerationJob | null>(() => generationQueue.get())
  useEffect(() => generationQueue.subscribe(setJob), [])
  return job
}
