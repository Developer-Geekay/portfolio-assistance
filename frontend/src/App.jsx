import { useRef } from 'react'
import ParticleStage from './components/ParticleStage'
import VoiceControl from './components/VoiceControl'
import './App.css'

function App() {
  // Shared between voice logic and particle canvas — no re-renders needed
  const modeRef     = useRef('ambient')   // ambient | listening | processing | speaking
  const analyserRef = useRef(null)        // WebAudio analyser while mic is live

  return (
    <div className="app">
      <ParticleStage modeRef={modeRef} analyserRef={analyserRef} />
      <VoiceControl modeRef={modeRef} analyserRef={analyserRef} />
    </div>
  )
}

export default App
