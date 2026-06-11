import { useCallback, useRef, useState } from 'react'
import abcjs, { type TuneObject } from 'abcjs'

export type MetronomeMode = 'off' | 'downbeat' | 'offbeat'

export function usePlayback() {
  const [playing, setPlaying] = useState(false)
  const [metronome, setMetronomeState] = useState<MetronomeMode>('off')
  const metronomeRef = useRef<MetronomeMode>('off')
  const synth = useRef<InstanceType<typeof abcjs.synth.CreateSynth> | null>(null)
  const timing = useRef<abcjs.TimingCallbacks | null>(null)
  const highlighted = useRef<Element[]>([])
  const audio = useRef<AudioContext | null>(null)

  function setMetronome(mode: MetronomeMode) {
    metronomeRef.current = mode
    setMetronomeState(mode)
  }

  function click(accent: boolean) {
    const ctx = (audio.current ??= new AudioContext())
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = accent ? 1600 : 1100
    gain.gain.setValueAtTime(0.4, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.06)
  }

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

  async function play(visualObj: TuneObject, program = 0) {
    stop()
    const s = new abcjs.synth.CreateSynth()
    await s.init({ visualObj, options: { program } })
    await s.prime()
    const beatsPerBar = visualObj.getBeatsPerMeasure()
    const t = new abcjs.TimingCallbacks(visualObj, {
      beatSubdivisions: 2,
      beatCallback: (beatNumber) => {
        const mode = metronomeRef.current
        if (mode === 'off') return
        const sub = Math.round(beatNumber * 2)
        if (sub % 2 !== (mode === 'downbeat' ? 0 : 1)) return
        click(mode === 'downbeat' && sub % (beatsPerBar * 2) === 0)
      },
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

  return { playing, play, stop, metronome, setMetronome }
}
