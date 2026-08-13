import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/roboto-mono/latin-400.css'
import '@fontsource/roboto-mono/latin-400-italic.css'
import '@fontsource/roboto-mono/latin-700.css'
import '@fontsource/roboto-mono/latin-700-italic.css'
import App from './App'

const render = () => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

// Fabric caches glyph metrics. If it measures an imported deck before its web
// fonts finish loading, the fallback metrics remain cached and wrapping stays
// wrong even after the correct face appears. Load the bundled deck font first.
if ('fonts' in document) {
  Promise.all([
    document.fonts.load('400 16px "Roboto Mono"'),
    document.fonts.load('italic 400 16px "Roboto Mono"'),
    document.fonts.load('700 16px "Roboto Mono"'),
    document.fonts.load('italic 700 16px "Roboto Mono"'),
  ]).then(render, render)
} else {
  render()
}
