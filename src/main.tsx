import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ClippedTextHint } from './design-system/primitives/ClippedTextHint'
import { AuthProvider } from './auth/AuthProvider'
import { LocaleProvider } from './i18n/LocaleProvider'
import './styles/index.css'
import './styles/responsive.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element was not found')
}

createRoot(root).render(
  <LocaleProvider>
    <AuthProvider>
      <App />
      <ClippedTextHint />
    </AuthProvider>
  </LocaleProvider>,
)
