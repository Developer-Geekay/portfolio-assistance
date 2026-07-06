import Stage from './components/Stage'
import Admin from './components/Admin'

// /assistant-admin (also under a VITE_BASE subpath) → leads & analytics
// dashboard; every data call it makes requires the admin key. All other
// paths render the voice assistant.
const isAdmin = window.location.pathname.replace(/\/$/, '').endsWith('/assistant-admin')

function App() {
  return isAdmin ? <Admin /> : <Stage />
}

export default App
