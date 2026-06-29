import { useCallback, useState } from 'react'
import {
  canvasResizeImage,
  closeAllTabs,
  closeOtherTabs,
  closeTab,
  cropImage,
  exportImage,
  flipImage,
  getExif,
  openImages,
  openImagesByPaths,
  redoImage,
  resizeImage,
  rotateImage,
  stripExif,
  undoImage,
} from '../lib/tauri'
import type { Anchor, ExifField } from '../lib/tauri'
import type { CropRect, EditorMode, ExportFormat, HistoryEntry, ImageMeta, Tab } from '../types'

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

interface ImageEditorState {
  tabs: Tab[]
  activeTabId: string | null
  image: ImageMeta | null
  mode: EditorMode
  zoom: number
  history: HistoryEntry[]
  historyIndex: number
  canUndo: boolean
  canRedo: boolean
  isLoading: boolean
  error: string | null
}

interface ImageEditorActions {
  loadExif: (tabId: string) => Promise<ExifField[]>
  handleStripExif: (tabId: string) => Promise<void>
  handleOpen: () => Promise<void>
  handleOpenByPaths: (paths: string[]) => Promise<void>
  handleCopyToClipboard: () => Promise<void>
  enterEyedropperMode: () => void
  exitEyedropperMode: () => void
  handleCropApply: (rect: CropRect) => Promise<void>
  handleFlip: (direction: 'horizontal' | 'vertical') => Promise<void>
  handleResize: (width: number, height: number) => Promise<void>
  handleCanvasResize: (width: number, height: number, anchor: Anchor, fill: [number, number, number, number]) => Promise<void>
  handleRotate: (degrees: number) => Promise<void>
  handleExport: (format: ExportFormat, quality?: number) => Promise<void>
  handleUndo: () => Promise<void>
  handleRedo: () => Promise<void>
  handleCloseTab: (id: string) => Promise<void>
  handleCloseOtherTabs: () => Promise<void>
  handleCloseAllTabs: () => Promise<void>
  setActiveTab: (id: string) => void
  enterCropMode: () => void
  exitCropMode: () => void
  enterRotateMode: () => void
  exitRotateMode: () => void
  setZoom: (z: number | ((prev: number) => number)) => void
  clearError: () => void
}

export function useImageEditor(): ImageEditorState & ImageEditorActions {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [mode, setMode] = useState<EditorMode>('idle')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null
  const image = activeTab?.image ?? null
  const zoom = activeTab?.zoom ?? 1
  const history = activeTab?.history ?? []
  const historyIndex = activeTab?.historyIndex ?? -1
  const canUndo = historyIndex > 0
  const canRedo = historyIndex < history.length - 1

  const updateTab = useCallback(
    (id: string, updater: (tab: Tab) => Tab) => {
      setTabs((prev) => prev.map((t) => (t.id === id ? updater(t) : t)))
    },
    [],
  )

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

  const createTabsFromOpened = useCallback((opened: { tabId: string; meta: ImageMeta }[]) => {
    if (opened.length === 0) return
    const newTabs: Tab[] = opened.map(({ tabId, meta }) => ({
      id: tabId,
      label: meta.filename ?? 'Image',
      image: meta,
      history: [{ label: 'Open' }],
      historyIndex: 0,
      zoom: 1,
    }))
    setTabs((prev) => [...prev, ...newTabs])
    setActiveTabId(newTabs[newTabs.length - 1].id)
    setMode('idle')
  }, [])

  const handleOpen = useCallback(async () => {
    await withLoading(async () => {
      const opened = await openImages()
      createTabsFromOpened(opened)
    })
  }, [withLoading, createTabsFromOpened])

  const handleOpenByPaths = useCallback(async (paths: string[]) => {
    await withLoading(async () => {
      const opened = await openImagesByPaths(paths)
      createTabsFromOpened(opened)
    })
  }, [withLoading, createTabsFromOpened])

  const handleCopyToClipboard = useCallback(async () => {
    if (!activeTabId) return
    const tab = tabs.find((t) => t.id === activeTabId)
    if (!tab?.image?.preview) return
    await withLoading(async () => {
      const response = await fetch(tab.image.preview)
      const blob = await response.blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    })
  }, [activeTabId, tabs, withLoading])

  const handleCropApply = useCallback(
    async (rect: CropRect) => {
      if (!activeTabId) return
      const id = activeTabId
      await withLoading(async () => {
        const result = await cropImage(id, rect)
        updateTab(id, (tab) => {
          const [nextHistory, nextIndex] = pushHistory(
            tab.history,
            tab.historyIndex,
            `Crop ${rect.width}×${rect.height}`,
          )
          return { ...tab, image: result, history: nextHistory, historyIndex: nextIndex }
        })
        setMode('idle')
      })
    },
    [withLoading, activeTabId, updateTab],
  )

  const handleFlip = useCallback(
    async (direction: 'horizontal' | 'vertical') => {
      if (!activeTabId) return
      const id = activeTabId
      await withLoading(async () => {
        const result = await flipImage(id, direction)
        const label = direction === 'horizontal' ? 'Flip horizontal' : 'Flip vertical'
        updateTab(id, (tab) => {
          const [nextHistory, nextIndex] = pushHistory(tab.history, tab.historyIndex, label)
          return { ...tab, image: result, history: nextHistory, historyIndex: nextIndex }
        })
      })
    },
    [withLoading, activeTabId, updateTab],
  )

  const handleResize = useCallback(
    async (width: number, height: number) => {
      if (!activeTabId) return
      const id = activeTabId
      await withLoading(async () => {
        const result = await resizeImage(id, width, height)
        updateTab(id, (tab) => {
          const [nextHistory, nextIndex] = pushHistory(
            tab.history,
            tab.historyIndex,
            `Resize ${width}×${height}`,
          )
          return { ...tab, image: result, history: nextHistory, historyIndex: nextIndex }
        })
      })
    },
    [withLoading, activeTabId, updateTab],
  )

  const handleCanvasResize = useCallback(
    async (width: number, height: number, anchor: Anchor, fill: [number, number, number, number]) => {
      if (!activeTabId) return
      const id = activeTabId
      await withLoading(async () => {
        const result = await canvasResizeImage(id, width, height, anchor, fill)
        updateTab(id, (tab) => {
          const [nextHistory, nextIndex] = pushHistory(
            tab.history,
            tab.historyIndex,
            `Canvas ${width}×${height}`,
          )
          return { ...tab, image: result, history: nextHistory, historyIndex: nextIndex }
        })
      })
    },
    [withLoading, activeTabId, updateTab],
  )

  const handleRotate = useCallback(
    async (degrees: number) => {
      if (!activeTabId) return
      const id = activeTabId
      await withLoading(async () => {
        const result = await rotateImage(id, degrees)
        const label =
          degrees === 90 ? 'Rotate +90°' : degrees === -90 ? 'Rotate −90°' : `Rotate ${degrees}°`
        updateTab(id, (tab) => {
          const [nextHistory, nextIndex] = pushHistory(tab.history, tab.historyIndex, label)
          return { ...tab, image: result, history: nextHistory, historyIndex: nextIndex }
        })
      })
    },
    [withLoading, activeTabId, updateTab],
  )

  const handleExport = useCallback(
    async (format: ExportFormat, quality?: number) => {
      if (!activeTabId) return
      const id = activeTabId
      await withLoading(async () => {
        await exportImage(id, format, quality)
      })
    },
    [withLoading, activeTabId],
  )

  const handleUndo = useCallback(async () => {
    if (!activeTabId || historyIndex <= 0) return
    const id = activeTabId
    await withLoading(async () => {
      const result = await undoImage(id)
      updateTab(id, (tab) => ({ ...tab, image: result, historyIndex: tab.historyIndex - 1 }))
      setMode('idle')
    })
  }, [withLoading, activeTabId, historyIndex, updateTab])

  const handleRedo = useCallback(async () => {
    if (!activeTabId || historyIndex >= history.length - 1) return
    const id = activeTabId
    await withLoading(async () => {
      const result = await redoImage(id)
      updateTab(id, (tab) => ({ ...tab, image: result, historyIndex: tab.historyIndex + 1 }))
      setMode('idle')
    })
  }, [withLoading, activeTabId, historyIndex, history.length, updateTab])

  const handleCloseTab = useCallback(
    async (id: string) => {
      await closeTab(id)
      setTabs((prev) => {
        const remaining = prev.filter((t) => t.id !== id)
        if (activeTabId === id) {
          const idx = prev.findIndex((t) => t.id === id)
          const next = remaining[Math.max(0, idx - 1)]?.id ?? remaining[0]?.id ?? null
          setActiveTabId(next)
          setMode('idle')
        }
        return remaining
      })
    },
    [activeTabId],
  )

  const handleCloseOtherTabs = useCallback(async () => {
    if (!activeTabId) return
    await closeOtherTabs(activeTabId)
    setTabs((prev) => prev.filter((t) => t.id === activeTabId))
  }, [activeTabId])

  const handleCloseAllTabs = useCallback(async () => {
    await closeAllTabs()
    setTabs([])
    setActiveTabId(null)
    setMode('idle')
  }, [])

  const setActiveTab = useCallback((id: string) => {
    setActiveTabId(id)
    setMode('idle')
  }, [])

  const setZoom = useCallback(
    (z: number | ((prev: number) => number)) => {
      if (!activeTabId) return
      const id = activeTabId
      updateTab(id, (tab) => {
        const next = typeof z === 'function' ? z(tab.zoom) : z
        return { ...tab, zoom: clampZoom(next) }
      })
    },
    [activeTabId, updateTab],
  )

  const loadExif = useCallback(async (tabId: string): Promise<ExifField[]> => {
    try {
      return await getExif(tabId)
    } catch {
      return []
    }
  }, [])

  const handleStripExif = useCallback(async (tabId: string) => {
    await withLoading(async () => {
      await stripExif(tabId)
    })
  }, [withLoading])

  const enterCropMode = useCallback(() => setMode('cropping'), [])
  const exitCropMode = useCallback(() => setMode('idle'), [])
  const enterRotateMode = useCallback(() => setMode('rotating'), [])
  const exitRotateMode = useCallback(() => setMode('idle'), [])
  const enterEyedropperMode = useCallback(() => setMode('eyedropper'), [])
  const exitEyedropperMode = useCallback(() => setMode('idle'), [])
  const clearError = useCallback(() => setError(null), [])

  return {
    loadExif,
    handleStripExif,
    handleOpenByPaths,
    handleCopyToClipboard,
    enterEyedropperMode,
    exitEyedropperMode,
    tabs,
    activeTabId,
    image,
    mode,
    zoom,
    history,
    historyIndex,
    canUndo,
    canRedo,
    isLoading,
    error,
    handleOpen,
    handleCropApply,
    handleFlip,
    handleResize,
    handleCanvasResize,
    handleRotate,
    handleExport,
    handleUndo,
    handleRedo,
    handleCloseTab,
    handleCloseOtherTabs,
    handleCloseAllTabs,
    setActiveTab,
    enterCropMode,
    exitCropMode,
    enterRotateMode,
    exitRotateMode,
    setZoom,
    clearError,
  }
}
