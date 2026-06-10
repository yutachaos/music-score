import { useEffect, useState } from 'react'
import { scoreToAbcWithRanges } from './model/abc'
import { trebleStaffPitch } from './model/pitch'
import type { Accidental, Duration, Score } from './model/types'
import { ScoreView } from './editor/ScoreView'
import { Palette } from './editor/Palette'
import { useEditor } from './editor/useEditor'

const initialScore: Score = {
  id: 'score-1',
  title: '新しい楽譜',
  keySig: 'C',
  timeSig: '4/4',
  tempo: 100,
  events: [],
}

export default function App() {
  const editor = useEditor(initialScore)
  const [duration, setDuration] = useState<Duration>(4)
  const [accidental, setAccidental] = useState<Accidental | ''>('')

  const { score } = editor
  const { abc, eventRanges } = scoreToAbcWithRanges(score)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        editor.undo()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        editor.movePitch(1)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        editor.movePitch(-1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        editor.moveSelection(-1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        editor.moveSelection(1)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        editor.deleteSelected()
      } else if (e.key === 'Escape') {
        editor.setSelected(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function handleStaffClick(steps: number) {
    const pitch = trebleStaffPitch(steps)
    editor.insertEvent({
      kind: 'note',
      pitch: accidental ? { ...pitch, accidental } : pitch,
      duration,
    })
  }

  return (
    <main>
      <header>
        <h1>Music Score</h1>
        <input
          value={score.title}
          onChange={(e) => editor.setMeta({ title: e.target.value })}
          aria-label="タイトル"
        />
      </header>
      <Palette
        duration={duration}
        onDuration={setDuration}
        accidental={accidental}
        onAccidental={setAccidental}
        keySig={score.keySig}
        onKeySig={(keySig) => editor.setMeta({ keySig })}
        timeSig={score.timeSig}
        onTimeSig={(timeSig) => editor.setMeta({ timeSig })}
        onInsertRest={() => editor.insertEvent({ kind: 'rest', duration })}
      />
      <p className="hint">
        五線をクリックで音符を挿入（選択音符の後ろに入る）/ ↑↓: 音高 / ←→: 選択移動 / Delete: 削除 / Ctrl+Z: 元に戻す / Esc: 選択解除
      </p>
      <ScoreView
        abc={abc}
        eventRanges={eventRanges}
        selected={editor.selected}
        onSelectEvent={editor.setSelected}
        onStaffClick={handleStaffClick}
      />
    </main>
  )
}
