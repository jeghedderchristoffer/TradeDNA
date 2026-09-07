import { useSyncExternalStore } from 'react'

/**
 * Chart colors as plain hex (Recharts writes SVG attributes, so CSS variables are not reliable).
 * Categorical slots follow the validated default palette order; profit/loss/fee are semantic.
 */
export interface ChartTheme {
  series: readonly string[]
  profit: string
  loss: string
  fee: string
  neutral: string
  grid: string
  axis: string
  muted: string
  text: string
  surface: string
}

export const LIGHT: ChartTheme = {
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  profit: '#1a8f4a',
  loss: '#d03b3b',
  fee: '#c98500',
  neutral: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  muted: '#898781',
  text: '#0b0b0b',
  surface: '#ffffff',
}

export const DARK: ChartTheme = {
  series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  profit: '#3dbb6f',
  loss: '#e66767',
  fee: '#eda100',
  neutral: '#898781',
  grid: '#2c2c2a',
  axis: '#383835',
  muted: '#898781',
  text: '#ffffff',
  surface: '#24262b',
}

function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb)
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => obs.disconnect()
}

export function useIsDark(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains('dark'),
    () => false,
  )
}

export function useChartTheme(): ChartTheme {
  return useIsDark() ? DARK : LIGHT
}

/** Sign-colored fill for P&L marks. */
export function pnlColor(theme: ChartTheme, value: number): string {
  return value > 0 ? theme.profit : value < 0 ? theme.loss : theme.neutral
}
