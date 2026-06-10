import { useEffect, useRef } from 'react'
import abcjs from 'abcjs'

export function ScoreView({ abc }: { abc: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    abcjs.renderAbc(ref.current!, abc, { responsive: 'resize', add_classes: true })
  }, [abc])

  return <div ref={ref} />
}
