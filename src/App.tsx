import { useEffect, useState } from 'react'
import { Canvas } from './components/Canvas'
import { ExportDialog } from './components/ExportDialog'
import { HistoryPanel } from './components/HistoryPanel'
import { RotationControls } from './components/RotationControls'
import { Toolbar } from './components/Toolbar'
import { useImageEditor } from './hooks/useImageEditor'

const ZOOM_STEP = 1.25
const ZOOM_PRESETS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]

function formatZoom(z: number): string {
  return `${Math.round(z * 100)}%`
}

export default function App() {
  const {
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
  } = useImageEditor()

  const [exportOpen, setExportOpen] = useState(false)

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
          case '=':
          case '+':
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
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleUndo, handleRedo, setZoom])

  const onCropMode = () => {
    if (mode === 'cropping') exitCropMode()
    else enterCropMode()
  }

  const onRotateMode = () => {
    if (mode === 'rotating') exitRotateMode()
    else enterRotateMode()
  }

  return (
    <div className="flex flex-col h-screen">
      <Toolbar
        hasImage={!!image}
        mode={mode}
        isLoading={isLoading}
        canUndo={canUndo}
        canRedo={canRedo}
        onOpen={handleOpen}
        onCropMode={onCropMode}
        onRotateMode={onRotateMode}
        onExportOpen={() => setExportOpen(true)}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-900/50 border-b border-red-700 text-red-200 text-sm">
          <span className="flex-1">{error}</span>
          <button
            onClick={clearError}
            className="text-red-300 hover:text-white transition-colors"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 overflow-hidden">
          <Canvas
            image={image}
            mode={mode}
            zoom={zoom}
            onCropApply={handleCropApply}
            onCropCancel={exitCropMode}
            onZoomChange={setZoom}
          />

          {mode === 'rotating' && (
            <RotationControls
              onRotate={handleRotate}
              onCancel={exitRotateMode}
              isLoading={isLoading}
            />
          )}
        </div>

        <HistoryPanel
          history={history}
          currentIndex={historyIndex}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          isLoading={isLoading}
        />
      </div>

      {image && (
        <div className="px-4 py-1 bg-slate-900 border-t border-slate-700 text-xs text-slate-500 flex items-center gap-4">
          <span>
            {image.width} × {image.height} px
          </span>
          <span>{image.format.toUpperCase()}</span>

          <div className="flex-1" />

          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoom((z) => z / ZOOM_STEP)}
              className="toolbar-btn px-1.5 py-0.5 text-xs"
              title="Zoom out (Ctrl+-)"
              aria-label="Zoom out"
            >
              −
            </button>
            <select
              value={ZOOM_PRESETS.includes(zoom) ? zoom : ''}
              onChange={(e) => e.target.value && setZoom(Number(e.target.value))}
              className="bg-slate-800 border border-slate-600 text-slate-300 text-xs rounded px-1 py-0.5 w-20 text-center"
              aria-label="Zoom level"
              title="Zoom level"
            >
              {!ZOOM_PRESETS.includes(zoom) && <option value="">{formatZoom(zoom)}</option>}
              {ZOOM_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {formatZoom(p)}
                </option>
              ))}
            </select>
            <button
              onClick={() => setZoom((z) => z * ZOOM_STEP)}
              className="toolbar-btn px-1.5 py-0.5 text-xs"
              title="Zoom in (Ctrl+=)"
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              onClick={() => setZoom(1)}
              className="toolbar-btn px-1.5 py-0.5 text-xs text-slate-500"
              title="Reset zoom to 100% (Ctrl+0)"
              aria-label="Reset zoom"
            >
              1:1
            </button>
          </div>
        </div>
      )}

      <ExportDialog
        open={exportOpen}
        isLoading={isLoading}
        onExport={async (format, quality) => {
          await handleExport(format, quality)
          setExportOpen(false)
        }}
        onClose={() => setExportOpen(false)}
      />
    </div>
  )
}
