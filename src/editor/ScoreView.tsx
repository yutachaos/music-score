import { useEffect, useRef } from 'react'
import abcjs from 'abcjs'

export interface ScoreViewProps {
  abc: string
  eventRanges: { start: number; end: number }[]
  selected: number | null
  onSelectEvent: (index: number | null) => void
  // steps: diatonic steps below the treble top line at the click position
  onStaffClick: (steps: number) => void
}

export function ScoreView({ abc, eventRanges, selected, onSelectEvent, onStaffClick }: ScoreViewProps) {
  const ref = useRef<HTMLDivElement>(null)
  const clickedElement = useRef(false)
  const callbacks = useRef({ eventRanges, onSelectEvent, onStaffClick })
  useEffect(() => {
    callbacks.current = { eventRanges, onSelectEvent, onStaffClick }
  })

  useEffect(() => {
    const visual = abcjs.renderAbc(ref.current!, abc, {
      responsive: 'resize',
      add_classes: true,
      selectionColor: '#0a84ff',
      clickListener: (abcelem) => {
        clickedElement.current = true
        const { eventRanges, onSelectEvent } = callbacks.current
        const idx = eventRanges.findIndex(
          (r) => abcelem.startChar >= r.start && abcelem.startChar < r.end,
        )
        onSelectEvent(idx >= 0 ? idx : null)
      },
    })
    const range = selected !== null ? eventRanges[selected] : null
    if (range) {
      const engraver = (visual[0] as unknown as { engraver?: { rangeHighlight?: (s: number, e: number) => void } }).engraver
      engraver?.rangeHighlight?.(range.start, range.end)
    }
  }, [abc, selected]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleClick(e: React.MouseEvent) {
    if (clickedElement.current) {
      clickedElement.current = false
      return
    }
    const staves = ref.current!.querySelectorAll<SVGGraphicsElement>('.abcjs-staff')
    if (staves.length === 0) return
    let nearest: DOMRect | null = null
    for (const el of staves) {
      const rect = el.getBoundingClientRect()
      const dist = Math.abs(e.clientY - (rect.top + rect.height / 2))
      if (!nearest || dist < Math.abs(e.clientY - (nearest.top + nearest.height / 2))) {
        nearest = rect
      }
    }
    const gap = nearest!.height / 4
    const steps = Math.round((e.clientY - nearest!.top) / (gap / 2))
    if (steps < -6 || steps > 12) return
    callbacks.current.onStaffClick(steps)
  }

  return <div ref={ref} onClick={handleClick} />
}
