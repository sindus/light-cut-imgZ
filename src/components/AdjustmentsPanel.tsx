import { useEffect, useRef, useState } from 'react'

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

// ─── Helpers ────────────────────────────────────────────────────────────────

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
  m[0] = delta[0]
  m[n - 1] = delta[n - 2]
  for (let k = 1; k < n - 1; k++) m[k] = (delta[k - 1] + delta[k]) / 2

  for (let k = 0; k < n - 1; k++) {
    if (Math.abs(delta[k]) < 1e-9) {
      m[k] = 0; m[k + 1] = 0
    } else {
      const a = m[k] / delta[k], b = m[k + 1] / delta[k]
      const sq = a * a + b * b
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

const CW = 200, CH = 200, RADIUS = 7

function ptToCanvas(px: number, py: number): [number, number] {
  return [px * CW, CH - py * CH]
}
function canvasToPt(cx: number, cy: number): [number, number] {
  return [Math.max(0, Math.min(1, cx / CW)), Math.max(0, Math.min(1, 1 - cy / CH))]
}
function findNearest(cx: number, cy: number, pts: [number, number][]): number {
  for (let i = 0; i < pts.length; i++) {
    const [pcx, pcy] = ptToCanvas(pts[i][0], pts[i][1])
    if (Math.hypot(cx - pcx, cy - pcy) <= RADIUS + 3) return i
  }
  return -1
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
        className="w-full accent-indigo-500"
        style={{ height: '4px' }}
      />
    </div>
  )
}

function SectionActions({
  isLoading, onApply, onReset,
}: { isLoading: boolean; onApply: () => void; onReset: () => void }) {
  return (
    <div className="flex gap-2 pt-2">
      <button
        onClick={onReset}
        disabled={isLoading}
        className="flex-1 px-3 py-1.5 text-xs text-slate-400 bg-slate-800 hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
      >
        Reset
      </button>
      <button
        onClick={onApply}
        disabled={isLoading}
        className="flex-1 px-3 py-1.5 text-xs text-white bg-indigo-600 hover:bg-indigo-500 rounded transition-colors disabled:opacity-50"
      >
        {isLoading ? 'Applying…' : 'Apply'}
      </button>
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
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4 pt-1 space-y-3">{children}</div>}
    </div>
  )
}

// ─── Curves Editor ───────────────────────────────────────────────────────────

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
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, CW, CH)

    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 0.5
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(CW * i / 4, 0); ctx.lineTo(CW * i / 4, CH); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, CH * i / 4); ctx.lineTo(CW, CH * i / 4); ctx.stroke()
    }

    ctx.strokeStyle = '#334155'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, CH); ctx.lineTo(CW, 0); ctx.stroke()

    const lut = computeCurveLut(userPoints)
    ctx.strokeStyle = '#818cf8'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * CW, y = CH - (lut[i] / 255) * CH
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.stroke()

    for (const [px, py] of userPoints) {
      const [cx, cy] = ptToCanvas(px, py)
      ctx.beginPath(); ctx.arc(cx, cy, RADIUS - 2, 0, Math.PI * 2)
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
    if (idx >= 0) {
      dragIdxRef.current = idx
    } else if (pts.length < 10) {
      const newPt = canvasToPt(cx, cy)
      const newPts: [number, number][] = [...pts, newPt].sort((a, b) => a[0] - b[0])
      dragIdxRef.current = newPts.findIndex((p) => Math.abs(p[0] - newPt[0]) < 0.001 && Math.abs(p[1] - newPt[1]) < 0.001)
      ptsRef.current = newPts
      onChange(newPts)
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const idx = dragIdxRef.current
    if (idx === null || idx < 0) return
    const [cx, cy] = clientToCanvas(e)
    const newPt = canvasToPt(cx, cy)
    const pts = [...ptsRef.current]
    pts[idx] = newPt
    ptsRef.current = pts
    onChange(pts)
  }

  const handleMouseUp = () => {
    if (dragIdxRef.current !== null) {
      const sorted: [number, number][] = [...ptsRef.current].sort((a, b) => a[0] - b[0])
      ptsRef.current = sorted
      onChange(sorted)
    }
    dragIdxRef.current = null
  }

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const [cx, cy] = clientToCanvas(e)
    const pts = ptsRef.current
    const idx = findNearest(cx, cy, pts)
    if (idx >= 0) {
      const newPts = pts.filter((_, i) => i !== idx)
      ptsRef.current = newPts
      onChange(newPts)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        width={CW}
        height={CH}
        className="w-full rounded border border-slate-700 cursor-crosshair"
        style={{ imageRendering: 'pixelated' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
      />
      <p className="text-xs text-slate-600">Click to add point · Drag to move · Right-click to remove</p>
    </div>
  )
}

// ─── Main panel ──────────────────────────────────────────────────────────────

const BC_DEFAULT = { brightness: 0, contrast: 0 }
const HSL_DEFAULT = { hue: 0, saturation: 0, lightness: 0 }
const LEVELS_DEFAULT = { inBlack: 0, inWhite: 255, gamma: 1.0, outBlack: 0, outWhite: 255 }
const WB_DEFAULT = { temperature: 0, tint: 0 }
const SHARPEN_DEFAULT = { amount: 100, radius: 1.0, threshold: 0 }

export function AdjustmentsPanel({ tabId, isLoading, onApply, onPreviewFilterChange }: AdjustmentsPanelProps) {
  const [open, setOpen] = useState<string | null>(null)

  const [bc, setBc] = useState(BC_DEFAULT)
  const [exposure, setExposure] = useState(0)
  const [hsl, setHsl] = useState(HSL_DEFAULT)
  const [vibrance, setVibrance] = useState(0)
  const [levels, setLevels] = useState(LEVELS_DEFAULT)
  const [curvePoints, setCurvePoints] = useState<[number, number][]>([])
  const [wb, setWb] = useState(WB_DEFAULT)
  const [sharpen, setSharpen] = useState(SHARPEN_DEFAULT)
  const [denoise, setDenoise] = useState(0)

  const toggle = (id: string) => {
    setOpen((prev) => {
      const next = prev === id ? null : id
      onPreviewFilterChange(computePreview(next))
      return next
    })
  }

  const computePreview = (section: string | null): string | null => {
    switch (section) {
      case 'bc': {
        if (bc.brightness === 0 && bc.contrast === 0) return null
        return `brightness(${((bc.brightness + 100) / 100).toFixed(3)}) contrast(${((bc.contrast + 100) / 100).toFixed(3)})`
      }
      case 'exposure':
        return exposure === 0 ? null : `brightness(${Math.pow(2, exposure).toFixed(3)})`
      case 'hsl': {
        if (hsl.hue === 0 && hsl.saturation === 0 && hsl.lightness === 0) return null
        return `hue-rotate(${hsl.hue}deg) saturate(${((hsl.saturation + 100) / 100).toFixed(3)}) brightness(${((hsl.lightness + 100) / 100).toFixed(3)})`
      }
      case 'vibrance':
        return vibrance === 0 ? null : `saturate(${((vibrance + 100) / 100).toFixed(3)})`
      case 'denoise':
        return denoise === 0 ? null : `blur(${(denoise / 100).toFixed(2)}px)`
      default:
        return null
    }
  }

  const emitPreview = (section: string | null, state: Record<string, unknown>) => {
    switch (section) {
      case 'bc': {
        const b = (state.brightness as number ?? bc.brightness)
        const c = (state.contrast as number ?? bc.contrast)
        if (b === 0 && c === 0) { onPreviewFilterChange(null); return }
        onPreviewFilterChange(`brightness(${((b + 100) / 100).toFixed(3)}) contrast(${((c + 100) / 100).toFixed(3)})`)
        break
      }
      case 'exposure': {
        const ev = (state.exposure as number ?? exposure)
        onPreviewFilterChange(ev === 0 ? null : `brightness(${Math.pow(2, ev).toFixed(3)})`)
        break
      }
      case 'hsl': {
        const h = state.hue as number ?? hsl.hue
        const s = state.saturation as number ?? hsl.saturation
        const l = state.lightness as number ?? hsl.lightness
        if (h === 0 && s === 0 && l === 0) { onPreviewFilterChange(null); return }
        onPreviewFilterChange(`hue-rotate(${h}deg) saturate(${((s + 100) / 100).toFixed(3)}) brightness(${((l + 100) / 100).toFixed(3)})`)
        break
      }
      case 'vibrance': {
        const v = state.vibrance as number ?? vibrance
        onPreviewFilterChange(v === 0 ? null : `saturate(${((v + 100) / 100).toFixed(3)})`)
        break
      }
      case 'denoise': {
        const d = state.strength as number ?? denoise
        onPreviewFilterChange(d === 0 ? null : `blur(${(d / 100).toFixed(2)}px)`)
        break
      }
      default:
        onPreviewFilterChange(null)
    }
  }

  const afterApplyOrReset = () => onPreviewFilterChange(null)

  if (!tabId) return null

  return (
    <aside className="w-72 bg-slate-900 border-l border-slate-700 flex flex-col overflow-hidden shrink-0">
      <div className="px-4 py-2.5 border-b border-slate-700 shrink-0">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Adjustments</span>
      </div>

      <div className="overflow-y-auto flex-1 divide-y divide-slate-800">

        {/* Brightness / Contrast */}
        <Section id="bc" title="Brightness / Contrast" open={open === 'bc'} onToggle={toggle}>
          <Slider label="Brightness" value={bc.brightness} min={-100} max={100} step={1}
            onChange={(v) => { const next = { ...bc, brightness: v }; setBc(next); emitPreview('bc', { brightness: v, contrast: next.contrast }) }} />
          <Slider label="Contrast" value={bc.contrast} min={-100} max={100} step={1}
            onChange={(v) => { const next = { ...bc, contrast: v }; setBc(next); emitPreview('bc', { brightness: next.brightness, contrast: v }) }} />
          <SectionActions isLoading={isLoading}
            onApply={async () => { await onApply({ type: 'brightness-contrast', brightness: bc.brightness, contrast: bc.contrast }); afterApplyOrReset() }}
            onReset={() => { setBc(BC_DEFAULT); afterApplyOrReset() }} />
        </Section>

        {/* Exposure */}
        <Section id="exposure" title="Exposure" open={open === 'exposure'} onToggle={toggle}>
          <Slider label="Exposure" value={exposure} min={-3} max={3} step={0.05} unit=" EV"
            onChange={(v) => { setExposure(v); emitPreview('exposure', { exposure: v }) }} />
          <SectionActions isLoading={isLoading}
            onApply={async () => { await onApply({ type: 'exposure', exposure }); afterApplyOrReset() }}
            onReset={() => { setExposure(0); afterApplyOrReset() }} />
        </Section>

        {/* Hue / Saturation */}
        <Section id="hsl" title="Hue / Saturation" open={open === 'hsl'} onToggle={toggle}>
          <Slider label="Hue" value={hsl.hue} min={-180} max={180} step={1} unit="°"
            onChange={(v) => { const next = { ...hsl, hue: v }; setHsl(next); emitPreview('hsl', next) }} />
          <Slider label="Saturation" value={hsl.saturation} min={-100} max={100} step={1}
            onChange={(v) => { const next = { ...hsl, saturation: v }; setHsl(next); emitPreview('hsl', next) }} />
          <Slider label="Lightness" value={hsl.lightness} min={-100} max={100} step={1}
            onChange={(v) => { const next = { ...hsl, lightness: v }; setHsl(next); emitPreview('hsl', next) }} />
          <SectionActions isLoading={isLoading}
            onApply={async () => { await onApply({ type: 'hue-saturation', hue: hsl.hue, saturation: hsl.saturation, lightness: hsl.lightness }); afterApplyOrReset() }}
            onReset={() => { setHsl(HSL_DEFAULT); afterApplyOrReset() }} />
        </Section>

        {/* Vibrance */}
        <Section id="vibrance" title="Vibrance" open={open === 'vibrance'} onToggle={toggle}>
          <Slider label="Vibrance" value={vibrance} min={-100} max={100} step={1}
            onChange={(v) => { setVibrance(v); emitPreview('vibrance', { vibrance: v }) }} />
          <SectionActions isLoading={isLoading}
            onApply={async () => { await onApply({ type: 'vibrance', vibrance }); afterApplyOrReset() }}
            onReset={() => { setVibrance(0); afterApplyOrReset() }} />
        </Section>

        {/* Levels */}
        <Section id="levels" title="Levels" open={open === 'levels'} onToggle={toggle}>
          <Slider label="Input black" value={levels.inBlack} min={0} max={253} step={1}
            onChange={(v) => setLevels((p) => ({ ...p, inBlack: Math.min(v, p.inWhite - 2) }))} />
          <Slider label="Input white" value={levels.inWhite} min={2} max={255} step={1}
            onChange={(v) => setLevels((p) => ({ ...p, inWhite: Math.max(v, p.inBlack + 2) }))} />
          <Slider label="Gamma" value={levels.gamma} min={0.1} max={10} step={0.05}
            onChange={(v) => setLevels((p) => ({ ...p, gamma: v }))} />
          <Slider label="Output black" value={levels.outBlack} min={0} max={255} step={1}
            onChange={(v) => setLevels((p) => ({ ...p, outBlack: Math.min(v, p.outWhite - 1) }))} />
          <Slider label="Output white" value={levels.outWhite} min={0} max={255} step={1}
            onChange={(v) => setLevels((p) => ({ ...p, outWhite: Math.max(v, p.outBlack + 1) }))} />
          <SectionActions isLoading={isLoading}
            onApply={async () => { await onApply({ type: 'levels', inBlack: levels.inBlack, inWhite: levels.inWhite, gamma: levels.gamma, outBlack: levels.outBlack, outWhite: levels.outWhite }); afterApplyOrReset() }}
            onReset={() => { setLevels(LEVELS_DEFAULT); afterApplyOrReset() }} />
        </Section>

        {/* Curves */}
        <Section id="curves" title="Curves" open={open === 'curves'} onToggle={toggle}>
          <CurvesEditor userPoints={curvePoints} onChange={setCurvePoints} />
          <SectionActions isLoading={isLoading}
            onApply={async () => { await onApply({ type: 'curves', points: curvePoints }); afterApplyOrReset() }}
            onReset={() => { setCurvePoints([]); afterApplyOrReset() }} />
        </Section>

        {/* White Balance */}
        <Section id="wb" title="White Balance" open={open === 'wb'} onToggle={toggle}>
          <Slider label="Temperature" value={wb.temperature} min={-100} max={100} step={1}
            onChange={(v) => setWb((p) => ({ ...p, temperature: v }))} />
          <Slider label="Tint" value={wb.tint} min={-100} max={100} step={1}
            onChange={(v) => setWb((p) => ({ ...p, tint: v }))} />
          <SectionActions isLoading={isLoading}
            onApply={async () => { await onApply({ type: 'white-balance', temperature: wb.temperature, tint: wb.tint }); afterApplyOrReset() }}
            onReset={() => { setWb(WB_DEFAULT); afterApplyOrReset() }} />
        </Section>

        {/* Sharpen */}
        <Section id="sharpen" title="Sharpen" open={open === 'sharpen'} onToggle={toggle}>
          <Slider label="Amount" value={sharpen.amount} min={0} max={200} step={1}
            onChange={(v) => setSharpen((p) => ({ ...p, amount: v }))} />
          <Slider label="Radius" value={sharpen.radius} min={0.1} max={5} step={0.1}
            onChange={(v) => setSharpen((p) => ({ ...p, radius: v }))} />
          <Slider label="Threshold" value={sharpen.threshold} min={0} max={255} step={1}
            onChange={(v) => setSharpen((p) => ({ ...p, threshold: v }))} />
          <SectionActions isLoading={isLoading}
            onApply={async () => { await onApply({ type: 'sharpen', amount: sharpen.amount, radius: sharpen.radius, threshold: sharpen.threshold }); afterApplyOrReset() }}
            onReset={() => { setSharpen(SHARPEN_DEFAULT); afterApplyOrReset() }} />
        </Section>

        {/* Denoise */}
        <Section id="denoise" title="Denoise" open={open === 'denoise'} onToggle={toggle}>
          <Slider label="Strength" value={denoise} min={0} max={100} step={1}
            onChange={(v) => { setDenoise(v); emitPreview('denoise', { strength: v }) }} />
          <SectionActions isLoading={isLoading}
            onApply={async () => { await onApply({ type: 'denoise', strength: denoise }); afterApplyOrReset() }}
            onReset={() => { setDenoise(0); afterApplyOrReset() }} />
        </Section>

      </div>
    </aside>
  )
}
