import { CropOverlay } from './CropOverlay'
import type { CropRect, EditorMode, ImageMeta } from '../types'

interface CanvasProps {
  image: ImageMeta | null
  mode: EditorMode
  onCropApply: (rect: CropRect) => void
  onCropCancel: () => void
}

export function Canvas({ image, mode, onCropApply, onCropCancel }: CanvasProps) {
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

  return (
    <div className="flex-1 overflow-auto flex items-center justify-center bg-slate-800/50 p-4">
      <div className="relative max-w-full max-h-full" style={{ display: 'inline-block' }}>
        <img
          src={image.preview}
          alt="Editing canvas"
          className="block max-w-full max-h-[calc(100vh-120px)] object-contain"
          draggable={false}
          data-testid="canvas-image"
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
