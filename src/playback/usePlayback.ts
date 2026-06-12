import { useCallback, useRef, useState } from 'react'
import abcjs, { type TuneObject } from 'abcjs'

export type MetronomeMode = 'off' | 'downbeat' | 'offbeat'

export interface PlayOptions {
  program?: number
  metronome?: MetronomeMode
  countIn?: boolean
  loop?: boolean
}

// abcjs drum track (%%MIDI drum): clicks are synthesized into the same audio
// stream as the notes, so they stay sample-accurate. 76/77 are wood blocks.
function drumPattern(mode: MetronomeMode, beats: number): string {
  if (mode === 'offbeat') {
    return `${'zd'.repeat(beats)} ${Array<number>(beats).fill(77).join(' ')} ${Array<number>(beats).fill(70).join(' ')}`
  }
  const pitches = [76, ...Array<number>(beats - 1).fill(77)]
  const velocities = [110, ...Array<number>(beats - 1).fill(70)]
  return `${'d'.repeat(beats)} ${pitches.join(' ')} ${velocities.join(' ')}`
}

export function usePlayback() {
  const [playing, setPlaying] = useState(false)
  const synth = useRef<InstanceType<typeof abcjs.synth.CreateSynth> | null>(null)
  const timing = useRef<abcjs.TimingCallbacks | null>(null)
  const timer = useRef<number | null>(null)
  const highlighted = useRef<Element[]>([])

  function clearHighlight() {
    for (const el of highlighted.current) el.classList.remove('playing')
    highlighted.current = []
  }

  const stop = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    timing.current?.stop()
    timing.current = null
    synth.current?.stop()
    synth.current = null
    for (const el of highlighted.current) el.classList.remove('playing')
    highlighted.current = []
    setPlaying(false)
  }, [])

  async function play(visualObj: TuneObject, opts: PlayOptions = {}) {
    stop()
    const { program = 0, metronome = 'off', countIn = false, loop = false } = opts
    const s = new abcjs.synth.CreateSynth()
    const introMs = countIn ? visualObj.millisecondsPerMeasure() : 0
    const startAll = () => {
      // the count-in is a drum-only intro bar baked into the audio buffer;
      // delay the highlight cursor until the notes actually start
      if (introMs > 0) {
        timer.current = window.setTimeout(() => timing.current?.start(), introMs)
      } else {
        timing.current?.start()
      }
      s.start()
    }
    await s.init({
      visualObj,
      onEnded: () => {
        if (synth.current !== s || !loop) return
        s.stop()
        timing.current?.reset()
        startAll()
      },
      options: {
        program,
        ...((metronome !== 'off' || countIn) && {
          drum: drumPattern(metronome, visualObj.getBeatsPerMeasure()),
          drumBars: 1,
          ...(countIn && { drumIntro: 1 }),
          ...(countIn && metronome === 'off' && { drumOff: true }),
        }),
      },
    })
    await s.prime()
    const t = new abcjs.TimingCallbacks(visualObj, {
      eventCallback: (ev) => {
        clearHighlight()
        if (!ev) {
          if (!loop) setPlaying(false)
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
    startAll()
  }

  return { playing, play, stop }
}
