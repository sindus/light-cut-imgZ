import { useCallback, useState } from 'react'
import { cropImage, exportImage, openImage, redoImage, rotateImage, undoImage } from '../lib/tauri'
import type { CropRect, EditorMode, ExportFormat, HistoryEntry, ImageMeta } from '../types'

interface ImageEditorState {
  image: ImageMeta | null
  mode: EditorMode
  isLoading: boolean
  error: string | null
  zoom: number
  history: HistoryEntry[]
  historyIndex: number
  canUndo: boolean
  canRedo: boolean
}

interface ImageEditorActions {
  handleOpen: () => Promise<void>
  handleCropApply: (rect: CropRect) => Promise<void>
  handleRotate: (degrees: number) => Promise<void>
  handleExport: (format: ExportFormat, quality?: number) => Promise<void>
  handleUndo: () => Promise<void>
  handleRedo: () => Promise<void>
  enterCropMode: () => void
  exitCropMode: () => void
  enterRotateMode: () => void
  exitRotateMode: () => void
  setZoom: (z: number | ((prev: number) => number)) => void
  clearError: () => void
}

const ZOOM_MIN = 0.05
const ZOOM_MAX = 8.0

function clampZoom(z: number) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z))
}

function pushHistory(
  entries: HistoryEntry[],
  index: number,
  label: string,
): [HistoryEntry[], number] {
  const next = [...entries.slice(0, index + 1), { label }]
  return [next, next.length - 1]
}

export function useImageEditor(): ImageEditorState & ImageEditorActions {
  const [image, setImage] = useState<ImageMeta | null>(null)
  const [mode, setMode] = useState<EditorMode>('idle')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zoom, _setZoom] = useState(1.0)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  const setZoom = useCallback((z: number | ((prev: number) => number)) => {
    _setZoom((prev) => {
      const next = typeof z === 'function' ? z(prev) : z
      return clampZoom(next)
    })
  }, [])

  const withLoading = useCallback(async (fn: () => Promise<void>) => {
    setIsLoading(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleOpen = useCallback(async () => {
    await withLoading(async () => {
      const result = await openImage()
      if (result) {
        setImage(result)
        setMode('idle')
        setHistory([{ label: 'Open' }])
        setHistoryIndex(0)
      }
    })
  }, [withLoading])

  const handleCropApply = useCallback(
    async (rect: CropRect) => {
      await withLoading(async () => {
        const result = await cropImage(rect)
        setImage(result)
        setMode('idle')
        setHistory((h) => {
          const [next, idx] = pushHistory(h, historyIndex, `Crop ${rect.width}×${rect.height}`)
          setHistoryIndex(idx)
          return next
        })
      })
    },
    [withLoading, historyIndex],
  )

  const handleRotate = useCallback(
    async (degrees: number) => {
      await withLoading(async () => {
        const result = await rotateImage(degrees)
        setImage(result)
        setMode('idle')
        const label =
          degrees === 90 ? 'Rotate +90°' : degrees === -90 ? 'Rotate −90°' : `Rotate ${degrees}°`
        setHistory((h) => {
          const [next, idx] = pushHistory(h, historyIndex, label)
          setHistoryIndex(idx)
          return next
        })
      })
    },
    [withLoading, historyIndex],
  )

  const handleExport = useCallback(
    async (format: ExportFormat, quality?: number) => {
      await withLoading(async () => {
        await exportImage(format, quality)
      })
    },
    [withLoading],
  )

  const handleUndo = useCallback(async () => {
    if (historyIndex <= 0) return
    await withLoading(async () => {
      const result = await undoImage()
      setImage(result)
      setMode('idle')
      setHistoryIndex((i) => i - 1)
    })
  }, [withLoading, historyIndex])

  const handleRedo = useCallback(async () => {
    if (historyIndex >= history.length - 1) return
    await withLoading(async () => {
      const result = await redoImage()
      setImage(result)
      setMode('idle')
      setHistoryIndex((i) => i + 1)
    })
  }, [withLoading, historyIndex, history.length])

  const enterCropMode = useCallback(() => setMode('cropping'), [])
  const exitCropMode = useCallback(() => setMode('idle'), [])
  const enterRotateMode = useCallback(() => setMode('rotating'), [])
  const exitRotateMode = useCallback(() => setMode('idle'), [])
  const clearError = useCallback(() => setError(null), [])

  const canUndo = historyIndex > 0
  const canRedo = historyIndex < history.length - 1

  return {
    image,
    mode,
    isLoading,
    error,
    zoom,
    history,
    historyIndex,
    canUndo,
    canRedo,
    handleOpen,
    handleCropApply,
    handleRotate,
    handleExport,
    handleUndo,
    handleRedo,
    enterCropMode,
    exitCropMode,
    enterRotateMode,
    exitRotateMode,
    setZoom,
    clearError,
  }
}
