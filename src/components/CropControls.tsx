import type { CropRect } from '../types'

interface CropControlsProps {
  cropRect: CropRect
  isLoading: boolean
  onApply: () => void
  onCancel: () => void
}

export function CropControls({ cropRect, isLoading, onApply, onCancel }: CropControlsProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-slate-800 border-b border-slate-700 shrink-0">
      <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Crop</span>
      <span className="text-xs text-slate-500 bg-slate-700/60 px-2 py-0.5 rounded font-mono">
        {cropRect.width} × {cropRect.height}
      </span>
      <span className="text-xs text-slate-600">— drag handles to adjust selection · Enter to apply · Escape to cancel</span>
      <div className="flex-1" />
      <button onClick={onCancel} disabled={isLoading} className="toolbar-btn">
        Cancel
      </button>
      <button
        onClick={onApply}
        disabled={isLoading || cropRect.width < 1 || cropRect.height < 1}
        className="toolbar-btn toolbar-btn--primary"
      >
        Apply
      </button>
    </div>
  )
}
