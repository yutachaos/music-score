import { scoreToAbc } from './model/abc'
import type { Score } from './model/types'
import { ScoreView } from './editor/ScoreView'

const sample: Score = {
  id: 'sample',
  title: 'きらきら星',
  keySig: 'C',
  timeSig: '4/4',
  tempo: 100,
  events: [
    { kind: 'note', pitch: { step: 'C', octave: 4 }, duration: 4 },
    { kind: 'note', pitch: { step: 'C', octave: 4 }, duration: 4 },
    { kind: 'note', pitch: { step: 'G', octave: 4 }, duration: 4 },
    { kind: 'note', pitch: { step: 'G', octave: 4 }, duration: 4 },
    { kind: 'note', pitch: { step: 'A', octave: 4 }, duration: 4 },
    { kind: 'note', pitch: { step: 'A', octave: 4 }, duration: 4 },
    { kind: 'note', pitch: { step: 'G', octave: 4 }, duration: 2 },
    { kind: 'note', pitch: { step: 'F', octave: 4 }, duration: 4 },
    { kind: 'note', pitch: { step: 'F', octave: 4 }, duration: 4 },
    { kind: 'note', pitch: { step: 'E', octave: 4 }, duration: 4 },
    { kind: 'note', pitch: { step: 'E', octave: 4 }, duration: 4 },
    { kind: 'note', pitch: { step: 'D', octave: 4 }, duration: 4 },
    { kind: 'note', pitch: { step: 'D', octave: 4 }, duration: 4 },
    { kind: 'note', pitch: { step: 'C', octave: 4 }, duration: 2 },
  ],
}

export default function App() {
  return (
    <main>
      <h1>Music Score</h1>
      <ScoreView abc={scoreToAbc(sample)} />
    </main>
  )
}
