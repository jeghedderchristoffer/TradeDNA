import { useEffect } from 'react'
import { useSettings } from '@/storage/hooks'

/** Applies the `.dark` class on <html> from settings (system → prefers-color-scheme). */
export function ThemeEffect() {
  const [settings] = useSettings()
  useEffect(() => {
    const root = document.documentElement
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && mq.matches)
      root.classList.toggle('dark', dark)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [settings.theme])
  return null
}
