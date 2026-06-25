import { useEffect, useRef } from 'react'
import { useCrop } from '../hooks/useCrop'
import type { CropRect } from '../types'

interface CropOverlayProps {
  imageWidth: number
  imageHeight: number
  onApply: (rect: CropRect) => void
  onCancel: () => void
}

const HANDLE_SIZE = 8

export function CropOverlay({ imageWidth, imageHeight, onApply, onCancel }: CropOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { cropRect, onPointerDown, onPointerMove, onPointerUp } = useCrop(imageWidth, imageHeight)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const scaleX = canvas.offsetWidth / imageWidth
    const scaleY = canvas.offsetHeight / imageHeight

    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Dimmed overlay
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Clear the crop region
    const cx = cropRect.x * scaleX
    const cy = cropRect.y * scaleY
    const cw = cropRect.width * scaleX
    const ch = cropRect.height * scaleY

    ctx.clearRect(cx, cy, cw, ch)

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(cx, cy, cw, ch)

    // Rule-of-thirds grid
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 0.5
    for (let i = 1; i < 3; i++) {
      ctx.beginPath()
      ctx.moveTo(cx + (cw / 3) * i, cy)
      ctx.lineTo(cx + (cw / 3) * i, cy + ch)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx, cy + (ch / 3) * i)
      ctx.lineTo(cx + cw, cy + (ch / 3) * i)
      ctx.stroke()
    }

    // Handles
    const handles = [
      [cx, cy],
      [cx + cw / 2, cy],
      [cx + cw, cy],
      [cx, cy + ch / 2],
      [cx + cw, cy + ch / 2],
      [cx, cy + ch],
      [cx + cw / 2, cy + ch],
      [cx + cw, cy + ch],
    ]

    ctx.fillStyle = '#fff'
    for (const [hx, hy] of handles) {
      ctx.fillRect(hx - HANDLE_SIZE / 2, hy - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
    }
  }, [cropRect, imageWidth, imageHeight])

  return (
    <div className="absolute inset-0 flex flex-col">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-crosshair"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-label="Crop selection"
      />
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-10">
        <span className="text-xs text-white/70 bg-black/50 px-2 py-1 rounded self-center">
          {cropRect.width} × {cropRect.height}
        </span>
        <button
          onClick={onCancel}
          className="px-4 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => onApply(cropRect)}
          className="px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors"
        >
          Apply
        </button>
      </div>
    </div>
  )
}
