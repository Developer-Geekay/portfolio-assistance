import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Piper's ONNX Runtime creates pthread workers that re-import this entry file
// to share the WASM module state. Bail immediately in non-browser contexts so
// the workers don't crash on `document is not defined`.
if (typeof document !== 'undefined') {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
