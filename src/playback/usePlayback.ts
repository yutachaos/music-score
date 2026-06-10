import { useCallback, useRef, useState } from 'react'
import abcjs, { type TuneObject } from 'abcjs'

export function usePlayback() {
  const [playing, setPlaying] = useState(false)
  const synth = useRef<InstanceType<typeof abcjs.synth.CreateSynth> | null>(null)
  const timing = useRef<abcjs.TimingCallbacks | null>(null)
  const highlighted = useRef<Element[]>([])

  function clearHighlight() {
    for (const el of highlighted.current) el.classList.remove('playing')
    highlighted.current = []
  }

  const stop = useCallback(() => {
    timing.current?.stop()
    timing.current = null
    synth.current?.stop()
    synth.current = null
    for (const el of highlighted.current) el.classList.remove('playing')
    highlighted.current = []
    setPlaying(false)
  }, [])

  async function play(visualObj: TuneObject) {
    stop()
    const s = new abcjs.synth.CreateSynth()
    await s.init({ visualObj })
    await s.prime()
    const t = new abcjs.TimingCallbacks(visualObj, {
      eventCallback: (ev) => {
        clearHighlight()
        if (!ev) {
          setPlaying(false)
          return
        }
        const els = (ev.elements ?? []).flat() as Element[]
        for (const el of els) el.classList.add('playing')
        highlighted.current = els
      },
    })
    synth.current = s
    timing.current = t
    setPlaying(true)
    t.start()
    s.start()
  }

  return { playing, play, stop }
}
