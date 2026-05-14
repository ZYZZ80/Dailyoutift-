import { useEffect, useState } from 'react'
import { Sparkles, X, Check, AlertCircle } from 'lucide-react'
import { useGenerationJob, generationQueue } from '../lib/generationQueue'

interface Props {
  onJump: (origin: 'tryon' | 'today' | 'build') => void
}

const STEPS_BY_KIND: Record<string, string[]> = {
  'try-on': [
    'Analyzing your photos…',
    'Studying each garment…',
    'Mixing the look on you…',
    'Polishing details…',
    'Almost ready…',
  ],
  'outfit-preview': [
    'Picking the best pieces…',
    'Composing the outfit…',
    'Rendering the look…',
    'Final touches…',
  ],
  'outfit-build': [
    'Reading your selection…',
    'Building the look…',
    'Polishing details…',
    'Almost ready…',
  ],
}

export default function GenerationStatusBar({ onJump }: Props) {
  const job = useGenerationJob()
  const [stepIdx, setStepIdx] = useState(0)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [readyVisible, setReadyVisible] = useState(false)

  // Cycle progress steps + tick elapsed seconds
  useEffect(() => {
    if (!job || job.status !== 'running') {
      setStepIdx(0)
      setElapsedSec(0)
      return
    }
    const startedAt = job.startedAt ?? Date.now()
    const interval = setInterval(() => {
      const sec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      setElapsedSec(sec)
      const steps = STEPS_BY_KIND[job.kind] ?? STEPS_BY_KIND['try-on']
      setStepIdx(Math.min(Math.floor(sec / 6), steps.length - 1))
    }, 500)
    return () => clearInterval(interval)
  }, [job?.id, job?.status])

  // When status flips to done, slide in a "ready" banner that auto-dismisses
  useEffect(() => {
    if (job?.status === 'done') {
      setReadyVisible(true)
      const t = setTimeout(() => setReadyVisible(false), 8000)
      return () => clearTimeout(t)
    }
  }, [job?.id, job?.status])

  if (!job) return null

  const steps = STEPS_BY_KIND[job.kind] ?? STEPS_BY_KIND['try-on']
  const currentStep = steps[stepIdx]
  const isRunning = job.status === 'running'
  const isDone = job.status === 'done'
  const isError = job.status === 'error'

  if (!isRunning && !readyVisible && !isError) return null

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] safe-top w-[min(92vw,420px)] pointer-events-auto">
      {isRunning && (
        <div className="bg-white/95 backdrop-blur-md border border-gray-100 shadow-lg rounded-2xl px-4 py-3 flex items-center gap-3 animate-slide-down">
          <div className="relative w-9 h-9 flex-shrink-0">
            <div className="absolute inset-0 rounded-full bg-blush/20 animate-ping" />
            <div className="absolute inset-0 rounded-full bg-blush/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-blush" strokeWidth={2} />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-charcoal truncate">{job.label}</p>
            <p className="text-[11px] text-gray-400 truncate transition-opacity">{currentStep}</p>
            <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden relative">
              <div className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-blush/0 via-blush to-blush/0 rounded-full animate-progress-slide" />
            </div>
          </div>
          <span className="text-[10px] text-gray-300 font-mono tabular-nums flex-shrink-0">{elapsedSec}s</span>
        </div>
      )}

      {isDone && readyVisible && (
        <button
          onClick={() => { onJump(job.origin); setReadyVisible(false) }}
          className="w-full bg-charcoal text-white shadow-xl rounded-2xl px-4 py-3 flex items-center gap-3 animate-slide-down active:scale-[0.98] transition-transform"
        >
          <div className="w-9 h-9 bg-emerald-500/20 rounded-full flex items-center justify-center flex-shrink-0">
            <Check className="w-4 h-4 text-emerald-400" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-[13px] font-semibold">Your design is ready ✨</p>
            <p className="text-[11px] text-white/60 truncate">Tap to view</p>
          </div>
          <span
            onClick={(e) => { e.stopPropagation(); setReadyVisible(false); generationQueue.clear(job.id) }}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
            role="button"
          >
            <X className="w-4 h-4 text-white/60" />
          </span>
        </button>
      )}

      {isError && (
        <div className="bg-red-50 border border-red-100 shadow-lg rounded-2xl px-4 py-3 flex items-center gap-3 animate-slide-down">
          <div className="w-9 h-9 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-4 h-4 text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-red-600">Generation failed</p>
            <p className="text-[11px] text-red-400 truncate">{job.error}</p>
          </div>
          <button
            onClick={() => generationQueue.clear(job.id)}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-100 transition-colors"
          >
            <X className="w-4 h-4 text-red-400" />
          </button>
        </div>
      )}
    </div>
  )
}
