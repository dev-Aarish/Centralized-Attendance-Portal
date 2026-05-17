// src/App.jsx
import AppRouter from './router/index'
import { AuthProvider } from './hooks/useAuth'
import { ToastProvider } from './components/shared/ToastProvider'

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppRouter />
      </ToastProvider>
    </AuthProvider>
  )
}