import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AdjustmentsPanel } from '../components/AdjustmentsPanel'

const defaultProps = {
  tabId: 'tab-1',
  isLoading: false,
  onApply: vi.fn().mockResolvedValue(undefined),
  onPreviewFilterChange: vi.fn(),
}

function renderPanel(props: Partial<typeof defaultProps> = {}) {
  return render(<AdjustmentsPanel {...defaultProps} {...props} />)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AdjustmentsPanel', () => {
  it('renders nothing when tabId is null', () => {
    const { container } = render(
      <AdjustmentsPanel tabId={null} isLoading={false} onApply={vi.fn()} onPreviewFilterChange={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the Adjustments header', () => {
    renderPanel()
    expect(screen.getByText('Adjustments')).toBeInTheDocument()
  })

  it('renders all 9 section titles', () => {
    renderPanel()
    expect(screen.getByText('Brightness / Contrast')).toBeInTheDocument()
    expect(screen.getByText('Exposure')).toBeInTheDocument()
    expect(screen.getByText('Hue / Saturation')).toBeInTheDocument()
    expect(screen.getByText('Vibrance')).toBeInTheDocument()
    expect(screen.getByText('Levels')).toBeInTheDocument()
    expect(screen.getByText('Curves')).toBeInTheDocument()
    expect(screen.getByText('White Balance')).toBeInTheDocument()
    expect(screen.getByText('Sharpen')).toBeInTheDocument()
    expect(screen.getByText('Denoise')).toBeInTheDocument()
  })

  it('all sections are collapsed by default', () => {
    renderPanel()
    expect(screen.queryByLabelText('Brightness')).toBeNull()
    expect(screen.queryByText('Apply')).toBeNull()
  })

  it('clicking a section header opens it and reveals controls', async () => {
    renderPanel()
    await userEvent.click(screen.getByText('Brightness / Contrast'))
    expect(screen.getByText('Brightness')).toBeInTheDocument()
    expect(screen.getByText('Contrast')).toBeInTheDocument()
    expect(screen.getByText('Apply')).toBeInTheDocument()
    expect(screen.getByText('Reset')).toBeInTheDocument()
  })

  it('clicking an open section header collapses it', async () => {
    renderPanel()
    await userEvent.click(screen.getByText('Brightness / Contrast'))
    expect(screen.getByText('Apply')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Brightness / Contrast'))
    expect(screen.queryByText('Apply')).toBeNull()
  })

  it('opening a section emits a preview filter or null', async () => {
    renderPanel()
    await userEvent.click(screen.getByText('Brightness / Contrast'))
    // Default values (0,0) → filter is null (no-op)
    expect(defaultProps.onPreviewFilterChange).toHaveBeenCalledWith(null)
  })

  it('changing the Exposure slider emits a brightness preview filter', async () => {
    renderPanel()
    await userEvent.click(screen.getByText('Exposure'))
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '1' } })
    // 2^1 = 2
    expect(defaultProps.onPreviewFilterChange).toHaveBeenLastCalledWith('brightness(2.000)')
  })

  it('clicking Apply dispatches the correct command', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined)
    renderPanel({ onApply })
    await userEvent.click(screen.getByText('Exposure'))
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '1.5' } })
    await userEvent.click(screen.getByText('Apply'))
    expect(onApply).toHaveBeenCalledWith({ type: 'exposure', exposure: 1.5 })
  })

  it('clicking Reset clears the preview filter', async () => {
    const onPreviewFilterChange = vi.fn()
    renderPanel({ onPreviewFilterChange })
    await userEvent.click(screen.getByText('Exposure'))
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '2' } })
    await userEvent.click(screen.getByText('Reset'))
    expect(onPreviewFilterChange).toHaveBeenLastCalledWith(null)
  })

  it('Apply buttons are disabled while isLoading', async () => {
    renderPanel({ isLoading: true })
    await userEvent.click(screen.getByText('Brightness / Contrast'))
    expect(screen.getByText('Applying…')).toBeDisabled()
    expect(screen.getByText('Reset')).toBeDisabled()
  })

  it('only one section can be open at a time', async () => {
    renderPanel()
    await userEvent.click(screen.getByText('Brightness / Contrast'))
    expect(screen.getByText('Brightness')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Exposure'))
    // Brightness/Contrast section is now closed
    expect(screen.queryByText('Brightness')).toBeNull()
    // Exposure section is open: its slider shows the unit label "EV"
    expect(screen.getByText(/EV/)).toBeInTheDocument()
  })

  it('Levels Apply dispatches levels command with correct defaults', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined)
    renderPanel({ onApply })
    await userEvent.click(screen.getByText('Levels'))
    await userEvent.click(screen.getByText('Apply'))
    expect(onApply).toHaveBeenCalledWith({
      type: 'levels',
      inBlack: 0,
      inWhite: 255,
      gamma: 1,
      outBlack: 0,
      outWhite: 255,
    })
  })

  it('Brightness/Contrast Apply dispatches correct command', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined)
    renderPanel({ onApply })
    await userEvent.click(screen.getByText('Brightness / Contrast'))
    const [brSlider, ctSlider] = screen.getAllByRole('slider')
    fireEvent.change(brSlider, { target: { value: '50' } })
    fireEvent.change(ctSlider, { target: { value: '-30' } })
    await userEvent.click(screen.getByText('Apply'))
    expect(onApply).toHaveBeenCalledWith({ type: 'brightness-contrast', brightness: 50, contrast: -30 })
  })
})
