import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
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

beforeEach(() => { vi.clearAllMocks() })

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
    ;['Brightness / Contrast', 'Exposure', 'Hue / Saturation', 'Vibrance',
      'Levels', 'Curves', 'White Balance', 'Sharpen', 'Denoise'].forEach((t) =>
      expect(screen.getByText(t)).toBeInTheDocument(),
    )
  })

  it('has no Apply or Reset buttons', () => {
    renderPanel()
    expect(screen.queryByText('Apply')).toBeNull()
    expect(screen.queryByText('Reset')).toBeNull()
  })

  it('all sections are collapsed by default — no sliders visible', () => {
    renderPanel()
    expect(screen.queryByRole('slider')).toBeNull()
  })

  it('clicking a section header opens it and reveals sliders', async () => {
    renderPanel()
    await userEvent.click(screen.getByText('Brightness / Contrast'))
    expect(screen.getAllByRole('slider')).toHaveLength(2)
  })

  it('clicking an open section header collapses it', async () => {
    renderPanel()
    await userEvent.click(screen.getByText('Brightness / Contrast'))
    await userEvent.click(screen.getByText('Brightness / Contrast'))
    expect(screen.queryByRole('slider')).toBeNull()
  })

  it('only one section can be open at a time', async () => {
    renderPanel()
    await userEvent.click(screen.getByText('Brightness / Contrast'))
    expect(screen.getAllByRole('slider')).toHaveLength(2)
    await userEvent.click(screen.getByText('Exposure'))
    expect(screen.getAllByRole('slider')).toHaveLength(1)
    expect(screen.getByText(/EV/)).toBeInTheDocument()
  })

  it('moving a slider emits a CSS preview filter immediately', async () => {
    renderPanel()
    await userEvent.click(screen.getByText('Exposure'))
    fireEvent.change(screen.getByRole('slider'), { target: { value: '1' } })
    expect(defaultProps.onPreviewFilterChange).toHaveBeenCalledWith('brightness(2.000)')
  })

  it('shows loading indicator when isLoading is true', () => {
    renderPanel({ isLoading: true })
    expect(screen.getByText('…')).toBeInTheDocument()
  })

  describe('debounce behavior', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    function openSection(name: string) {
      // Use fireEvent (not userEvent) so fake timers don't interfere
      fireEvent.click(screen.getByText(name))
    }

    it('slider does not call onApply immediately', () => {
      renderPanel()
      openSection('Exposure')
      fireEvent.change(screen.getByRole('slider'), { target: { value: '1' } })
      expect(defaultProps.onApply).not.toHaveBeenCalled()
    })

    it('onApply is called once after debounce timeout', async () => {
      renderPanel()
      openSection('Exposure')
      fireEvent.change(screen.getByRole('slider'), { target: { value: '1' } })
      await act(async () => { vi.advanceTimersByTime(500) })
      expect(defaultProps.onApply).toHaveBeenCalledTimes(1)
      expect(defaultProps.onApply).toHaveBeenCalledWith({ type: 'exposure', exposure: 1 })
    })

    it('rapid changes coalesce into a single onApply call', async () => {
      renderPanel()
      openSection('Exposure')
      const slider = screen.getByRole('slider')
      fireEvent.change(slider, { target: { value: '0.5' } })
      fireEvent.change(slider, { target: { value: '1.0' } })
      fireEvent.change(slider, { target: { value: '1.5' } })
      await act(async () => { vi.advanceTimersByTime(500) })
      expect(defaultProps.onApply).toHaveBeenCalledTimes(1)
      expect(defaultProps.onApply).toHaveBeenCalledWith({ type: 'exposure', exposure: 1.5 })
    })

    it('preview filter is cleared after onApply resolves', async () => {
      renderPanel()
      openSection('Exposure')
      fireEvent.change(screen.getByRole('slider'), { target: { value: '1' } })
      await act(async () => { vi.advanceTimersByTime(500) })
      const calls = defaultProps.onPreviewFilterChange.mock.calls
      expect(calls[calls.length - 1][0]).toBeNull()
    })

    it('Brightness/Contrast sends both values in the command', async () => {
      const onApply = vi.fn().mockResolvedValue(undefined)
      renderPanel({ onApply })
      openSection('Brightness / Contrast')
      const [brSlider, ctSlider] = screen.getAllByRole('slider')
      fireEvent.change(brSlider, { target: { value: '50' } })
      fireEvent.change(ctSlider, { target: { value: '-30' } })
      await act(async () => { vi.advanceTimersByTime(500) })
      expect(onApply).toHaveBeenCalledWith({ type: 'brightness-contrast', brightness: 50, contrast: -30 })
    })

    it('Levels sends all 5 parameters', async () => {
      const onApply = vi.fn().mockResolvedValue(undefined)
      renderPanel({ onApply })
      openSection('Levels')
      const sliders = screen.getAllByRole('slider')
      fireEvent.change(sliders[0], { target: { value: '20' } })
      await act(async () => { vi.advanceTimersByTime(500) })
      expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
        type: 'levels', inBlack: 20, inWhite: 255, gamma: 1, outBlack: 0, outWhite: 255,
      }))
    })
  })
})
