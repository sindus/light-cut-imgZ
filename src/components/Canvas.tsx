import { useCallback } from 'react'
import { CropOverlay } from './CropOverlay'
import type { CropRect, EditorMode, ImageMeta } from '../types'

interface CanvasProps {
  image: ImageMeta | null
  mode: EditorMode
  zoom: number
  onCropApply: (rect: CropRect) => void
  onCropCancel: () => void
  onZoomChange: (z: number | ((prev: number) => number)) => void
}

const ZOOM_STEP = 1.15

export function Canvas({
  image,
  mode,
  zoom,
  onCropApply,
  onCropCancel,
  onZoomChange,
}: CanvasProps) {
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!image) return
      e.preventDefault()
      const delta = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
      onZoomChange((prev) => prev * delta)
    },
    [image, onZoomChange],
  )

  if (!image) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-500">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          className="opacity-30"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        <p className="text-sm">Open an image to get started</p>
      </div>
    )
  }

  const displayWidth = Math.round(image.width * zoom)
  const displayHeight = Math.round(image.height * zoom)

  return (
    <div
      className="flex-1 overflow-auto flex items-start justify-start bg-slate-800/50"
      style={{ cursor: 'default' }}
      onWheel={handleWheel}
    >
      <div
        className="relative m-auto"
        style={{ width: displayWidth, height: displayHeight, flexShrink: 0 }}
      >
        <img
          src={image.preview}
          alt="Editing canvas"
          width={displayWidth}
          height={displayHeight}
          className="block"
          draggable={false}
          data-testid="canvas-image"
          style={{ imageRendering: zoom >= 3 ? 'pixelated' : 'auto' }}
        />
        {mode === 'cropping' && (
          <CropOverlay
            imageWidth={image.width}
            imageHeight={image.height}
            onApply={onCropApply}
            onCancel={onCropCancel}
          />
        )}
      </div>
    </div>
  )
}
