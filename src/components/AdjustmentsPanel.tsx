import { useCallback, useEffect, useRef, useState } from 'react'

export type AdjustmentCommand =
  | { type: 'brightness-contrast'; brightness: number; contrast: number }
  | { type: 'exposure'; exposure: number }
  | { type: 'hue-saturation'; hue: number; saturation: number; lightness: number }
  | { type: 'vibrance'; vibrance: number }
  | { type: 'levels'; inBlack: number; inWhite: number; gamma: number; outBlack: number; outWhite: number }
  | { type: 'curves'; points: [number, number][] }
  | { type: 'white-balance'; temperature: number; tint: number }
  | { type: 'sharpen'; amount: number; radius: number; threshold: number }
  | { type: 'denoise'; strength: number }

interface AdjustmentsPanelProps {
  tabId: string | null
  isLoading: boolean
  onApply: (cmd: AdjustmentCommand) => Promise<void>
  onPreviewFilterChange: (filter: string | null) => void
}

// ─── Curve LUT ───────────────────────────────────────────────────────────────

function computeCurveLut(raw: [number, number][]): number[] {
  let pts = [...raw].sort((a, b) => a[0] - b[0])
  if (pts.length === 0 || pts[0][0] > 0.001) pts = [[0, 0], ...pts]
  if (pts[pts.length - 1][0] < 0.999) pts = [...pts, [1, 1]]
  const n = pts.length
  if (n < 2) return Array.from({ length: 256 }, (_, i) => i)
  const delta: number[] = []
  for (let k = 0; k < n - 1; k++) {
    const dx = pts[k + 1][0] - pts[k][0]
    delta.push(dx < 1e-9 ? 0 : (pts[k + 1][1] - pts[k][1]) / dx)
  }
  const m = new Array<number>(n)
  m[0] = delta[0]; m[n - 1] = delta[n - 2]
  for (let k = 1; k < n - 1; k++) m[k] = (delta[k - 1] + delta[k]) / 2
  for (let k = 0; k < n - 1; k++) {
    if (Math.abs(delta[k]) < 1e-9) { m[k] = 0; m[k + 1] = 0 }
    else {
      const a = m[k] / delta[k], b = m[k + 1] / delta[k], sq = a * a + b * b
      if (sq > 9) { const t = 3 / Math.sqrt(sq); m[k] = t * a * delta[k]; m[k + 1] = t * b * delta[k] }
    }
  }
  return Array.from({ length: 256 }, (_, i) => {
    const x = i / 255
    let seg = 0
    for (let k = 0; k < n - 1; k++) { if (x >= pts[k][0]) seg = k }
    const h = pts[seg + 1][0] - pts[seg][0]
    const t = h < 1e-9 ? 0 : Math.max(0, Math.min(1, (x - pts[seg][0]) / h))
    const t2 = t * t, t3 = t2 * t
    const y = (2 * t3 - 3 * t2 + 1) * pts[seg][1]
      + (t3 - 2 * t2 + t) * h * m[seg]
      + (-2 * t3 + 3 * t2) * pts[seg + 1][1]
      + (t3 - t2) * h * m[seg + 1]
    return Math.max(0, Math.min(255, Math.round(y * 255)))
  })
}

// ─── Curves canvas ───────────────────────────────────────────────────────────

const CW = 200, CH = 200, HIT_R = 9

function ptToCanvas(px: number, py: number): [number, number] {
  return [px * CW, CH - py * CH]
}
function canvasToPt(cx: number, cy: number): [number, number] {
  return [Math.max(0, Math.min(1, cx / CW)), Math.max(0, Math.min(1, 1 - cy / CH))]
}
function findNearest(cx: number, cy: number, pts: [number, number][]): number {
  for (let i = 0; i < pts.length; i++) {
    const [pcx, pcy] = ptToCanvas(pts[i][0], pts[i][1])
    if (Math.hypot(cx - pcx, cy - pcy) <= HIT_R) return i
  }
  return -1
}

function CurvesEditor({
  userPoints, onChange,
}: {
  userPoints: [number, number][]
  onChange: (pts: [number, number][]) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragIdxRef = useRef<number | null>(null)
  const ptsRef = useRef(userPoints)
  useEffect(() => { ptsRef.current = userPoints }, [userPoints])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, CW, CH)
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, CW, CH)
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 0.5
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(CW * i / 4, 0); ctx.lineTo(CW * i / 4, CH); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, CH * i / 4); ctx.lineTo(CW, CH * i / 4); ctx.stroke()
    }
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, CH); ctx.lineTo(CW, 0); ctx.stroke()
    const lut = computeCurveLut(userPoints)
    ctx.strokeStyle = '#818cf8'; ctx.lineWidth = 1.5; ctx.beginPath()
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * CW, y = CH - (lut[i] / 255) * CH
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.stroke()
    for (const [px, py] of userPoints) {
      const [cx, cy] = ptToCanvas(px, py)
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2)
      ctx.fillStyle = '#818cf8'; ctx.fill()
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke()
    }
  }, [userPoints])

  const clientToCanvas = (e: React.MouseEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect()
    return [
      Math.max(0, Math.min(CW, (e.clientX - rect.left) * (CW / rect.width))),
      Math.max(0, Math.min(CH, (e.clientY - rect.top) * (CH / rect.height))),
    ]
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    const [cx, cy] = clientToCanvas(e)
    const pts = ptsRef.current
    const idx = findNearest(cx, cy, pts)
    if (idx >= 0) { dragIdxRef.current = idx; return }
    if (pts.length >= 10) return
    const newPt = canvasToPt(cx, cy)
    const newPts: [number, number][] = [...pts, newPt].sort((a, b) => a[0] - b[0])
    dragIdxRef.current = newPts.findIndex((p) => Math.abs(p[0] - newPt[0]) < 0.001 && Math.abs(p[1] - newPt[1]) < 0.001)
    ptsRef.current = newPts
    onChange(newPts)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const idx = dragIdxRef.current
    if (idx === null || idx < 0) return
    const [cx, cy] = clientToCanvas(e)
    const pts = [...ptsRef.current]
    pts[idx] = canvasToPt(cx, cy)
    ptsRef.current = pts; onChange(pts)
  }

  const handleMouseUp = () => {
    if (dragIdxRef.current !== null) {
      const sorted: [number, number][] = [...ptsRef.current].sort((a, b) => a[0] - b[0])
      ptsRef.current = sorted; onChange(sorted)
    }
    dragIdxRef.current = null
  }

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const [cx, cy] = clientToCanvas(e)
    const idx = findNearest(cx, cy, ptsRef.current)
    if (idx >= 0) {
      const newPts = ptsRef.current.filter((_, i) => i !== idx)
      ptsRef.current = newPts; onChange(newPts)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <canvas
        ref={canvasRef} width={CW} height={CH}
        className="w-full rounded border border-slate-700 cursor-crosshair"
        style={{ imageRendering: 'pixelated' }}
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
      />
      <p className="text-xs text-slate-600">Click to add · Drag to move · Right-click to remove</p>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Slider({
  label, value, min, max, step, unit, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number; unit?: string
  onChange: (v: number) => void
}) {
  const decimals = step < 0.1 ? 2 : step < 1 ? 1 : 0
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span className="font-mono text-slate-300 tabular-nums">{value.toFixed(decimals)}{unit ?? ''}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-indigo-500" style={{ height: '4px' }}
      />
    </div>
  )
}

function Section({
  id, title, open, onToggle, children,
}: {
  id: string; title: string; open: boolean; onToggle: (id: string) => void; children: React.ReactNode
}) {
  return (
    <div className="border-b border-slate-800">
      <button
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-slate-300 hover:text-slate-100 hover:bg-slate-800/50 transition-colors"
      >
        <span className="font-medium">{title}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4 pt-1 space-y-3">{children}</div>}
    </div>
  )
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const BC_DEF = { brightness: 0, contrast: 0 }
const HSL_DEF = { hue: 0, saturation: 0, lightness: 0 }
const LEVELS_DEF = { inBlack: 0, inWhite: 255, gamma: 1.0, outBlack: 0, outWhite: 255 }
const WB_DEF = { temperature: 0, tint: 0 }
const SHARPEN_DEF = { amount: 100, radius: 1.0, threshold: 0 }

// ─── Panel ───────────────────────────────────────────────────────────────────

export function AdjustmentsPanel({ tabId, isLoading, onApply, onPreviewFilterChange }: AdjustmentsPanelProps) {
  const [open, setOpen] = useState<string | null>(null)
  const [bc, setBc] = useState(BC_DEF)
  const [exposure, setExposure] = useState(0)
  const [hsl, setHsl] = useState(HSL_DEF)
  const [vibrance, setVibrance] = useState(0)
  const [levels, setLevels] = useState(LEVELS_DEF)
  const [curvePoints, setCurvePoints] = useState<[number, number][]>([])
  const [wb, setWb] = useState(WB_DEF)
  const [sharpen, setSharpen] = useState(SHARPEN_DEF)
  const [denoise, setDenoise] = useState(0)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const schedule = useCallback((cmd: AdjustmentCommand, cssPreview?: string | null) => {
    if (cssPreview !== undefined) onPreviewFilterChange(cssPreview)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      debounceRef.current = null
      await onApply(cmd)
      onPreviewFilterChange(null)
    }, 420)
  }, [onApply, onPreviewFilterChange])

  // Clear pending debounce and preview when tab changes
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      onPreviewFilterChange(null)
    }
  }, [tabId, onPreviewFilterChange])

  if (!tabId) return null

  const toggle = (id: string) => setOpen((p) => p === id ? null : id)

  return (
    <aside className="w-72 bg-slate-900 border-l border-slate-700 flex flex-col overflow-hidden shrink-0">
      <div className="px-4 py-2.5 border-b border-slate-700 shrink-0">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Adjustments</span>
        {isLoading && <span className="ml-2 text-xs text-indigo-400">…</span>}
      </div>

      <div className="overflow-y-auto flex-1">

        <Section id="bc" title="Brightness / Contrast" open={open === 'bc'} onToggle={toggle}>
          <Slider label="Brightness" value={bc.brightness} min={-100} max={100} step={1}
            onChange={(v) => {
              const next = { ...bc, brightness: v }; setBc(next)
              const f = next.brightness === 0 && next.contrast === 0 ? null
                : `brightness(${((next.brightness + 100) / 100).toFixed(3)}) contrast(${((next.contrast + 100) / 100).toFixed(3)})`
              schedule({ type: 'brightness-contrast', brightness: next.brightness, contrast: next.contrast }, f)
            }} />
          <Slider label="Contrast" value={bc.contrast} min={-100} max={100} step={1}
            onChange={(v) => {
              const next = { ...bc, contrast: v }; setBc(next)
              const f = next.brightness === 0 && next.contrast === 0 ? null
                : `brightness(${((next.brightness + 100) / 100).toFixed(3)}) contrast(${((next.contrast + 100) / 100).toFixed(3)})`
              schedule({ type: 'brightness-contrast', brightness: next.brightness, contrast: next.contrast }, f)
            }} />
        </Section>

        <Section id="exposure" title="Exposure" open={open === 'exposure'} onToggle={toggle}>
          <Slider label="Exposure" value={exposure} min={-3} max={3} step={0.05} unit=" EV"
            onChange={(v) => {
              setExposure(v)
              schedule({ type: 'exposure', exposure: v }, v === 0 ? null : `brightness(${Math.pow(2, v).toFixed(3)})`)
            }} />
        </Section>

        <Section id="hsl" title="Hue / Saturation" open={open === 'hsl'} onToggle={toggle}>
          <Slider label="Hue" value={hsl.hue} min={-180} max={180} step={1} unit="°"
            onChange={(v) => {
              const next = { ...hsl, hue: v }; setHsl(next)
              const f = next.hue === 0 && next.saturation === 0 && next.lightness === 0 ? null
                : `hue-rotate(${next.hue}deg) saturate(${((next.saturation + 100) / 100).toFixed(3)}) brightness(${((next.lightness + 100) / 100).toFixed(3)})`
              schedule({ type: 'hue-saturation', hue: next.hue, saturation: next.saturation, lightness: next.lightness }, f)
            }} />
          <Slider label="Saturation" value={hsl.saturation} min={-100} max={100} step={1}
            onChange={(v) => {
              const next = { ...hsl, saturation: v }; setHsl(next)
              const f = next.hue === 0 && next.saturation === 0 && next.lightness === 0 ? null
                : `hue-rotate(${next.hue}deg) saturate(${((next.saturation + 100) / 100).toFixed(3)}) brightness(${((next.lightness + 100) / 100).toFixed(3)})`
              schedule({ type: 'hue-saturation', hue: next.hue, saturation: next.saturation, lightness: next.lightness }, f)
            }} />
          <Slider label="Lightness" value={hsl.lightness} min={-100} max={100} step={1}
            onChange={(v) => {
              const next = { ...hsl, lightness: v }; setHsl(next)
              const f = next.hue === 0 && next.saturation === 0 && next.lightness === 0 ? null
                : `hue-rotate(${next.hue}deg) saturate(${((next.saturation + 100) / 100).toFixed(3)}) brightness(${((next.lightness + 100) / 100).toFixed(3)})`
              schedule({ type: 'hue-saturation', hue: next.hue, saturation: next.saturation, lightness: next.lightness }, f)
            }} />
        </Section>

        <Section id="vibrance" title="Vibrance" open={open === 'vibrance'} onToggle={toggle}>
          <Slider label="Vibrance" value={vibrance} min={-100} max={100} step={1}
            onChange={(v) => {
              setVibrance(v)
              schedule({ type: 'vibrance', vibrance: v }, v === 0 ? null : `saturate(${((v + 100) / 100).toFixed(3)})`)
            }} />
        </Section>

        <Section id="levels" title="Levels" open={open === 'levels'} onToggle={toggle}>
          <Slider label="Input black" value={levels.inBlack} min={0} max={253} step={1}
            onChange={(v) => {
              const next = { ...levels, inBlack: Math.min(v, levels.inWhite - 2) }; setLevels(next)
              schedule({ type: 'levels', ...next })
            }} />
          <Slider label="Input white" value={levels.inWhite} min={2} max={255} step={1}
            onChange={(v) => {
              const next = { ...levels, inWhite: Math.max(v, levels.inBlack + 2) }; setLevels(next)
              schedule({ type: 'levels', ...next })
            }} />
          <Slider label="Gamma" value={levels.gamma} min={0.1} max={10} step={0.05}
            onChange={(v) => {
              const next = { ...levels, gamma: v }; setLevels(next)
              schedule({ type: 'levels', ...next })
            }} />
          <Slider label="Output black" value={levels.outBlack} min={0} max={255} step={1}
            onChange={(v) => {
              const next = { ...levels, outBlack: Math.min(v, levels.outWhite - 1) }; setLevels(next)
              schedule({ type: 'levels', ...next })
            }} />
          <Slider label="Output white" value={levels.outWhite} min={0} max={255} step={1}
            onChange={(v) => {
              const next = { ...levels, outWhite: Math.max(v, levels.outBlack + 1) }; setLevels(next)
              schedule({ type: 'levels', ...next })
            }} />
        </Section>

        <Section id="curves" title="Curves" open={open === 'curves'} onToggle={toggle}>
          <CurvesEditor userPoints={curvePoints} onChange={(pts) => {
            setCurvePoints(pts)
            schedule({ type: 'curves', points: pts })
          }} />
        </Section>

        <Section id="wb" title="White Balance" open={open === 'wb'} onToggle={toggle}>
          <Slider label="Temperature" value={wb.temperature} min={-100} max={100} step={1}
            onChange={(v) => {
              const next = { ...wb, temperature: v }; setWb(next)
              schedule({ type: 'white-balance', temperature: next.temperature, tint: next.tint })
            }} />
          <Slider label="Tint" value={wb.tint} min={-100} max={100} step={1}
            onChange={(v) => {
              const next = { ...wb, tint: v }; setWb(next)
              schedule({ type: 'white-balance', temperature: next.temperature, tint: next.tint })
            }} />
        </Section>

        <Section id="sharpen" title="Sharpen" open={open === 'sharpen'} onToggle={toggle}>
          <Slider label="Amount" value={sharpen.amount} min={0} max={200} step={1}
            onChange={(v) => {
              const next = { ...sharpen, amount: v }; setSharpen(next)
              schedule({ type: 'sharpen', amount: next.amount, radius: next.radius, threshold: next.threshold })
            }} />
          <Slider label="Radius" value={sharpen.radius} min={0.1} max={5} step={0.1}
            onChange={(v) => {
              const next = { ...sharpen, radius: v }; setSharpen(next)
              schedule({ type: 'sharpen', amount: next.amount, radius: next.radius, threshold: next.threshold })
            }} />
          <Slider label="Threshold" value={sharpen.threshold} min={0} max={255} step={1}
            onChange={(v) => {
              const next = { ...sharpen, threshold: v }; setSharpen(next)
              schedule({ type: 'sharpen', amount: next.amount, radius: next.radius, threshold: next.threshold })
            }} />
        </Section>

        <Section id="denoise" title="Denoise" open={open === 'denoise'} onToggle={toggle}>
          <Slider label="Strength" value={denoise} min={0} max={100} step={1}
            onChange={(v) => {
              setDenoise(v)
              schedule({ type: 'denoise', strength: v }, v === 0 ? null : `blur(${(v / 100).toFixed(2)}px)`)
            }} />
        </Section>

      </div>
    </aside>
  )
}
