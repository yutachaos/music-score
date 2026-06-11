import { useCallback, useRef, useState } from 'react'
import abcjs, { type TuneObject } from 'abcjs'

export type MetronomeMode = 'off' | 'downbeat' | 'offbeat'

// abcjs drum track (%%MIDI drum): clicks are synthesized into the same audio
// stream as the notes, so they stay sample-accurate. 76/77 are wood blocks.
function drumPattern(mode: MetronomeMode, beats: number): string {
  if (mode === 'downbeat') {
    const pitches = [76, ...Array<number>(beats - 1).fill(77)]
    const velocities = [110, ...Array<number>(beats - 1).fill(70)]
    return `${'d'.repeat(beats)} ${pitches.join(' ')} ${velocities.join(' ')}`
  }
  return `${'zd'.repeat(beats)} ${Array<number>(beats).fill(77).join(' ')} ${Array<number>(beats).fill(70).join(' ')}`
}

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

  async function play(visualObj: TuneObject, program = 0, metronome: MetronomeMode = 'off') {
    stop()
    const s = new abcjs.synth.CreateSynth()
    await s.init({
      visualObj,
      options: {
        program,
        ...(metronome !== 'off' && {
          drum: drumPattern(metronome, visualObj.getBeatsPerMeasure()),
          drumBars: 1,
        }),
      },
    })
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
