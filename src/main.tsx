import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/geist/index.css'
import '@fontsource-variable/geist-mono/index.css'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource/roboto-mono/latin-400.css'
import '@fontsource/roboto-mono/latin-400-italic.css'
import '@fontsource/roboto-mono/latin-700.css'
import '@fontsource/roboto-mono/latin-700-italic.css'
import App from './App'
import { initTheme } from './lib/taoBridge'
import { bootPersistence } from './lib/persistence'

const render = () => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

async function start() {
  await initTheme()
  const fonts =
    'fonts' in document
      ? Promise.all([
          document.fonts.load('400 16px "Roboto Mono"'),
          document.fonts.load('italic 400 16px "Roboto Mono"'),
          document.fonts.load('700 16px "Roboto Mono"'),
          document.fonts.load('italic 700 16px "Roboto Mono"'),
        ])
      : Promise.resolve()
  await Promise.all([fonts, bootPersistence()]).catch(() => undefined)
  render()
}

void start()
