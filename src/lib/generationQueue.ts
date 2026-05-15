/**
 * Background generation queue.
 *
 * A tiny pub/sub singleton that holds the state of any in-flight AI generation
 * (try-on, outfit preview, etc.) so it survives across page navigation. Pages
 * subscribe via `useGenerationJob()`. When a job finishes, listeners fire and
 * the global status bar shows a "Done" notification.
 */
import { useEffect, useState } from 'react'
import { saveGenerationJobCloud } from './cloud'

export type JobKind = 'try-on' | 'outfit-preview' | 'outfit-build'

export interface GenerationJob {
  id: string
  kind: JobKind
  /** Page tab to deep-link to when the user taps the notification */
  origin: 'tryon' | 'today' | 'build'
  /** Short human label shown in the status bar */
  label: string
  /** Started timestamp ms — used to show elapsed time */
  startedAt: number
  status: 'running' | 'done' | 'error'
  result?: { imageBase64: string; description?: string }
  error?: string
  /** Optional metadata the originating page wants to remember (e.g. inputs) */
  meta?: Record<string, unknown>
}

type Listener = (job: GenerationJob | null) => void

class GenerationQueueImpl {
  private current: GenerationJob | null = null
  private listeners = new Set<Listener>()
  private retryRunner: (() => Promise<{ imageBase64: string; description?: string }>) | null = null
  private retryOptions: Omit<Parameters<GenerationQueueImpl['start']>[0], 'runner'> | null = null

  get(): GenerationJob | null {
    return this.current
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    fn(this.current)
    return () => { this.listeners.delete(fn) }
  }

  private emit() {
    for (const fn of this.listeners) fn(this.current)
  }

  /**
   * Start a new job. If one is already running, it's replaced (UI should
   * prevent this case, but we don't want to deadlock).
   */
  start(opts: {
    kind: JobKind
    origin: GenerationJob['origin']
    label: string
    runner: () => Promise<{ imageBase64: string; description?: string }>
    meta?: Record<string, unknown>
    userId?: string
  }): string {
    const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const startedAt = Date.now()
    this.current = {
      id,
      kind: opts.kind,
      origin: opts.origin,
      label: opts.label,
      startedAt,
      status: 'running',
      meta: opts.meta,
    }
    this.retryRunner = opts.runner
    this.retryOptions = { kind: opts.kind, origin: opts.origin, label: opts.label, meta: opts.meta, userId: opts.userId }
    this.emit()

    if (opts.userId) {
      saveGenerationJobCloud({
        id,
        userId: opts.userId,
        kind: opts.kind,
        origin: opts.origin,
        label: opts.label,
        status: 'running',
        metadata: opts.meta,
        startedAt: new Date(startedAt).toISOString(),
      }).catch(() => {})
    }

    opts.runner()
      .then((res) => {
        if (!this.current || this.current.id !== id) return
        this.current = { ...this.current, status: 'done', result: res }
        this.emit()
        if (opts.userId) {
          saveGenerationJobCloud({
            id,
            userId: opts.userId,
            kind: opts.kind,
            origin: opts.origin,
            label: opts.label,
            status: 'done',
            resultRef: res.imageBase64.startsWith('data:') ? undefined : res.imageBase64,
            metadata: opts.meta,
            startedAt: new Date(startedAt).toISOString(),
            completedAt: new Date().toISOString(),
          }).catch(() => {})
        }
      })
      .catch((e: unknown) => {
        if (!this.current || this.current.id !== id) return
        const msg = e instanceof Error ? e.message : String(e)
        this.current = { ...this.current, status: 'error', error: msg }
        this.emit()
        if (opts.userId) {
          saveGenerationJobCloud({
            id,
            userId: opts.userId,
            kind: opts.kind,
            origin: opts.origin,
            label: opts.label,
            status: 'error',
            error: msg.substring(0, 500),
            metadata: opts.meta,
            startedAt: new Date(startedAt).toISOString(),
            completedAt: new Date().toISOString(),
          }).catch(() => {})
        }
      })

    return id
  }

  retry(id?: string): string | null {
    if (id && this.current?.id !== id) return null
    if (!this.retryRunner || !this.retryOptions) return null
    return this.start({ ...this.retryOptions, runner: this.retryRunner })
  }

  /** Clear current finished/errored job (call after the user has consumed the result) */
  clear(id?: string): void {
    if (id && this.current?.id !== id) return
    this.current = null
    this.emit()
  }
}

export const generationQueue = new GenerationQueueImpl()

/** React hook that returns the current job (or null) */
export function useGenerationJob(): GenerationJob | null {
  const [job, setJob] = useState<GenerationJob | null>(generationQueue.get())
  useEffect(() => generationQueue.subscribe(setJob), [])
  return job
}
