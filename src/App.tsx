import { useState } from 'react'
import { Canvas } from './components/Canvas'
import { ExportDialog } from './components/ExportDialog'
import { RotationControls } from './components/RotationControls'
import { Toolbar } from './components/Toolbar'
import { useImageEditor } from './hooks/useImageEditor'

export default function App() {
  const {
    image,
    mode,
    isLoading,
    error,
    handleOpen,
    handleCropApply,
    handleRotate,
    handleExport,
    enterCropMode,
    exitCropMode,
    enterRotateMode,
    exitRotateMode,
    clearError,
  } = useImageEditor()

  const [exportOpen, setExportOpen] = useState(false)

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
        onOpen={handleOpen}
        onCropMode={onCropMode}
        onRotateMode={onRotateMode}
        onExportOpen={() => setExportOpen(true)}
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

      <Canvas image={image} mode={mode} onCropApply={handleCropApply} onCropCancel={exitCropMode} />

      {mode === 'rotating' && (
        <RotationControls onRotate={handleRotate} onCancel={exitRotateMode} isLoading={isLoading} />
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

      {image && (
        <div className="px-4 py-1 bg-slate-900 border-t border-slate-700 text-xs text-slate-500 flex gap-4">
          <span>
            {image.width} × {image.height} px
          </span>
          <span>{image.format.toUpperCase()}</span>
        </div>
      )}
    </div>
  )
}
