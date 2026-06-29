import { listen } from '@tauri-apps/api/event'
import { useEffect, useRef, useState } from 'react'
import { AboutDialog } from './components/AboutDialog'
import { Canvas } from './components/Canvas'
import { CanvasResizeDialog } from './components/CanvasResizeDialog'
import { CropControls } from './components/CropControls'
import { EyedropperControls } from './components/EyedropperControls'
import { ExifPanel } from './components/ExifPanel'
import { ExportDialog } from './components/ExportDialog'
import { FlipControls } from './components/FlipControls'
import { HistoryPanel } from './components/HistoryPanel'
import { PrefsDialog } from './components/PrefsDialog'
import { ResizeDialog } from './components/ResizeDialog'
import { RotationControls } from './components/RotationControls'
import { TabBar } from './components/TabBar'
import { Toolbar } from './components/Toolbar'
import { ZoomSelect } from './components/ZoomSelect'
import type { CropRect } from './types'
import { useImageEditor } from './hooks/useImageEditor'
import type { ExifField } from './lib/tauri'
import { loadPrefs, savePrefs, type Prefs } from './lib/prefs'
import { addRecentFile, getRecentFiles } from './lib/recentFiles'

const ZOOM_STEP = 1.25
const ZOOM_PRESETS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]

export default function App() {
  const {
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
    isLoading,
    error,
    zoom,
    history,
    historyIndex,
    canUndo,
    canRedo,
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
  } = useImageEditor()

  const [exportOpen, setExportOpen] = useState(false)
  const [resizeOpen, setResizeOpen] = useState(false)
  const [canvasResizeOpen, setCanvasResizeOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [aboutVersion, setAboutVersion] = useState('')
  const [showExif, setShowExif] = useState(false)
  const [exifFields, setExifFields] = useState<ExifField[]>([])
  const [exifLoading, setExifLoading] = useState(false)
  const [showGrid, setShowGrid] = useState(false)
  const [showHistory, setShowHistory] = useState(true)
  const [showFlipBar, setShowFlipBar] = useState(false)
  const [cropRect, setCropRect] = useState<CropRect>({ x: 0, y: 0, width: 0, height: 0 })
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs())
  const [recentFiles, setRecentFiles] = useState<string[]>(() => getRecentFiles())
  const [pickedColor, setPickedColor] = useState<{ r: number; g: number; b: number; a: number } | null>(null)
  const [pickedColorResult, setPickedColorResult] = useState<{ r: number; g: number; b: number; a: number } | null>(null)

  const activeTabIdRef = useRef(activeTabId)
  useEffect(() => {
    activeTabIdRef.current = activeTabId
  }, [activeTabId])

  // Tauri menu / native events + drag-drop
  useEffect(() => {
    const unlistenAbout = listen<string>('show-about', (event) => {
      setAboutVersion(event.payload)
      setAboutOpen(true)
    })
    const unlistenOpen = listen('menu-open', () => handleOpen())
    const unlistenCloseTab = listen('menu-close-tab', () => {
      const id = activeTabIdRef.current
      if (id) handleCloseTab(id)
    })
    const unlistenCloseOthers = listen('menu-close-others', () => handleCloseOtherTabs())
    const unlistenCloseAll = listen('menu-close-all', () => handleCloseAllTabs())
    const unlistenUndo = listen('menu-undo', () => handleUndo())
    const unlistenRedo = listen('menu-redo', () => handleRedo())
    const unlistenToggleHistory = listen('menu-toggle-history', () => setShowHistory((s) => !s))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unlistenDrop = listen('tauri://drag-drop', (event: any) => {
      const paths: string[] = event.payload?.paths ?? event.payload ?? []
      if (Array.isArray(paths) && paths.length > 0) handleOpenByPaths(paths)
    })

    return () => {
      unlistenAbout.then((fn) => fn())
      unlistenOpen.then((fn) => fn())
      unlistenCloseTab.then((fn) => fn())
      unlistenCloseOthers.then((fn) => fn())
      unlistenCloseAll.then((fn) => fn())
      unlistenUndo.then((fn) => fn())
      unlistenRedo.then((fn) => fn())
      unlistenToggleHistory.then((fn) => fn())
      unlistenDrop.then((fn) => fn())
    }
  }, [handleOpen, handleCloseTab, handleCloseOtherTabs, handleCloseAllTabs, handleUndo, handleRedo, handleOpenByPaths])

  // Track recent files from newly opened tabs
  useEffect(() => {
    tabs.forEach((t) => { if (t.image.path) addRecentFile(t.image.path) })
    setRecentFiles(getRecentFiles())
  }, [tabs])

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey) {
        switch (e.key) {
          case 'z':
            e.preventDefault()
            if (e.shiftKey) handleRedo()
            else handleUndo()
            break
          case 'y':
            e.preventDefault()
            handleRedo()
            break
          case '=': case '+':
            e.preventDefault()
            setZoom((z) => z * ZOOM_STEP)
            break
          case '-':
            e.preventDefault()
            setZoom((z) => z / ZOOM_STEP)
            break
          case '0':
            e.preventDefault()
            setZoom(1)
            break
          case 'c':
            if (!e.shiftKey) { e.preventDefault(); handleCopyToClipboard() }
            break
        }
      } else if (e.key === 'Escape' && mode === 'eyedropper') {
        exitEyedropperMode()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleUndo, handleRedo, setZoom, handleCopyToClipboard, mode, exitEyedropperMode])

  // Load EXIF when panel opens or tab changes
  useEffect(() => {
    if (!showExif || !activeTabId) { if (!activeTabId) setExifFields([]); return }
    setExifLoading(true)
    loadExif(activeTabId).then((fields) => { setExifFields(fields); setExifLoading(false) })
  }, [showExif, activeTabId, loadExif])

  useEffect(() => { if (mode !== 'eyedropper') setPickedColor(null) }, [mode])

  const handleColorPickConfirm = (color: { r: number; g: number; b: number; a: number }) => {
    setPickedColorResult(color)
    exitEyedropperMode()
  }

  const onCropMode = () => {
    if (mode === 'cropping') { exitCropMode() } else { setShowFlipBar(false); enterCropMode() }
  }
  const onRotateMode = () => {
    if (mode === 'rotating') { exitRotateMode() } else { setShowFlipBar(false); enterRotateMode() }
  }
  const onEyedropperMode = () => {
    if (mode === 'eyedropper') {
      exitEyedropperMode()
    } else {
      setShowFlipBar(false)
      setPickedColorResult(null)
      enterEyedropperMode()
    }
  }
  const onFlipOpen = () => {
    if (mode === 'cropping') exitCropMode()
    else if (mode === 'rotating') exitRotateMode()
    else if (mode === 'eyedropper') exitEyedropperMode()
    setShowFlipBar((b) => !b)
  }

  const pickedHex = pickedColor
    ? `#${[pickedColor.r, pickedColor.g, pickedColor.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
    : null

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left sidebar */}
      <Toolbar
        hasImage={!!image}
        mode={mode}
        isLoading={isLoading}
        showFlipBar={showFlipBar}
        onCropMode={onCropMode}
        onRotateMode={onRotateMode}
        onFlipOpen={onFlipOpen}
        onResizeOpen={() => setResizeOpen(true)}
        onCanvasResizeOpen={() => setCanvasResizeOpen(true)}
        onExportOpen={() => setExportOpen(true)}
        showExif={showExif}
        onToggleExif={() => setShowExif((p) => !p)}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid((g) => !g)}
        onCopy={handleCopyToClipboard}
        onEyedropperMode={onEyedropperMode}
        onPrefsOpen={() => setPrefsOpen(true)}
      />

      {/* Center + right column */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onSelect={setActiveTab}
          onClose={handleCloseTab}
        />

        {error && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-900/50 border-b border-red-700 text-red-200 text-sm">
            <span className="flex-1">{error}</span>
            <button onClick={clearError} className="text-red-300 hover:text-white transition-colors" aria-label="Dismiss error">✕</button>
          </div>
        )}

        {/* Contextual bars */}
        {mode === 'cropping' && (
          <CropControls
            cropRect={cropRect}
            isLoading={isLoading}
            onApply={() => handleCropApply(cropRect)}
            onCancel={exitCropMode}
          />
        )}
        {mode === 'rotating' && (
          <RotationControls
            onRotate={handleRotate}
            onCancel={exitRotateMode}
            isLoading={isLoading}
          />
        )}
        {(mode === 'eyedropper' || pickedColorResult) && (
          <EyedropperControls
            color={mode === 'eyedropper' ? pickedColor : pickedColorResult}
            onClose={() => { exitEyedropperMode(); setPickedColorResult(null) }}
          />
        )}
        {showFlipBar && (
          <FlipControls
            isLoading={isLoading}
            onFlipH={() => handleFlip('horizontal')}
            onFlipV={() => handleFlip('vertical')}
            onClose={() => setShowFlipBar(false)}
          />
        )}

        {/* Main content row */}
        <div className="flex flex-1 overflow-hidden">
          <Canvas
            image={image}
            mode={mode}
            zoom={zoom}
            showGrid={showGrid}
            gridSize={prefs.gridSize}
            recentFiles={recentFiles}
            onCropApply={handleCropApply}
            onCropCancel={exitCropMode}
            onCropRectChange={setCropRect}
            onZoomChange={setZoom}
            onOpen={handleOpen}
            onOpenByPaths={handleOpenByPaths}
            onColorPick={setPickedColor}
            onColorPickConfirm={handleColorPickConfirm}
          />

          {showHistory && (
            <HistoryPanel
              history={history}
              currentIndex={historyIndex}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={handleUndo}
              onRedo={handleRedo}
              isLoading={isLoading}
            />
          )}

          {showExif && image && (
            <ExifPanel
              tabId={activeTabId}
              fields={exifFields}
              isLoading={exifLoading}
              onStrip={() => activeTabId ? handleStripExif(activeTabId) : Promise.resolve()}
            />
          )}
        </div>

        {/* Status bar */}
        {image && (
          <div className="px-4 py-1 bg-slate-900 border-t border-slate-700 text-xs text-slate-500 flex items-center gap-4 shrink-0">
            <span>{image.width} × {image.height} px</span>
            <span>{image.format.toUpperCase()}</span>

            {mode === 'eyedropper' && pickedColor && pickedHex && (
              <div className="flex items-center gap-1.5">
                <div className="w-3.5 h-3.5 rounded-sm border border-slate-600" style={{ background: pickedHex }} />
                <span className="text-slate-300 font-mono">{pickedHex.toUpperCase()}</span>
                <span className="text-slate-600">rgb({pickedColor.r}, {pickedColor.g}, {pickedColor.b})</span>
              </div>
            )}

            <div className="flex-1" />

            <div className="flex items-center gap-1">
              <button onClick={() => setZoom((z) => z / ZOOM_STEP)} className="toolbar-btn px-1.5 py-0.5 text-xs" title="Zoom out (Ctrl+-)" aria-label="Zoom out">−</button>
              <ZoomSelect zoom={zoom} presets={ZOOM_PRESETS} onChange={setZoom} />
              <button onClick={() => setZoom((z) => z * ZOOM_STEP)} className="toolbar-btn px-1.5 py-0.5 text-xs" title="Zoom in (Ctrl+=)" aria-label="Zoom in">+</button>
              <button onClick={() => setZoom(1)} className="toolbar-btn px-1.5 py-0.5 text-xs text-slate-500" title="Reset zoom (Ctrl+0)" aria-label="Reset zoom">1:1</button>
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <ExportDialog
        open={exportOpen}
        isLoading={isLoading}
        defaultFormat={prefs.defaultExportFormat}
        defaultQuality={prefs.defaultJpegQuality}
        onExport={async (format, quality) => { await handleExport(format, quality); setExportOpen(false) }}
        onClose={() => setExportOpen(false)}
      />
      <CanvasResizeDialog
        open={canvasResizeOpen}
        originalWidth={image?.width ?? 0}
        originalHeight={image?.height ?? 0}
        isLoading={isLoading}
        onResize={async (w, h, anchor, fill) => { await handleCanvasResize(w, h, anchor, fill); setCanvasResizeOpen(false) }}
        onClose={() => setCanvasResizeOpen(false)}
      />
      <ResizeDialog
        open={resizeOpen}
        originalWidth={image?.width ?? 0}
        originalHeight={image?.height ?? 0}
        isLoading={isLoading}
        onResize={async (w, h) => { await handleResize(w, h); setResizeOpen(false) }}
        onClose={() => setResizeOpen(false)}
      />
      <AboutDialog open={aboutOpen} version={aboutVersion} onClose={() => setAboutOpen(false)} />
      <PrefsDialog
        open={prefsOpen}
        prefs={prefs}
        onSave={(p) => { savePrefs(p); setPrefs(p); setPrefsOpen(false) }}
        onClose={() => setPrefsOpen(false)}
      />
    </div>
  )
}
