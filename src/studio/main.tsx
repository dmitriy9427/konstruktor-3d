import '@fontsource-variable/onest'
import '@fontsource-variable/jetbrains-mono'
import '../styles/base.css'
import '../styles/studio.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
