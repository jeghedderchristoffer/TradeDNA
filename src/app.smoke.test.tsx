// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import App from './App'
import { db } from './storage/db'
import { clearAllData } from './storage/repo'

const tradesCsv = readFileSync(
  path.resolve(__dirname, 'test-fixtures/tradezero-trades.csv'),
  'utf8',
)
const cashCsv = readFileSync(path.resolve(__dirname, 'test-fixtures/tradezero-cash.csv'), 'utf8')

beforeAll(() => {
  // jsdom lacks these browser APIs used by the theme effect and Recharts.
  window.matchMedia ??= (() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

afterEach(async () => {
  cleanup()
  await clearAllData(db)
  window.location.hash = ''
})

async function go(hash: string) {
  window.location.hash = hash
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

async function importTrades() {
  const input = (await screen.findByLabelText(/TradeZero Trade History/)) as HTMLInputElement
  fireEvent.change(input, {
    target: { files: [new File([tradesCsv], 'TradeHistory.csv', { type: 'text/csv' })] },
  })
  fireEvent.click(
    await screen.findByRole('button', { name: /Import 3,330 executions/ }, { timeout: 10000 }),
  )
  await screen.findByText('Net P&L', {}, { timeout: 10000 })
}

describe('TradeDNA end to end (jsdom)', () => {
  it('starts on onboarding, imports a TradeZero trade history, and shows the dashboard', async () => {
    render(<App />)

    await screen.findByText('Import from broker')
    expect(screen.getByText('Upload TradeDNA backup')).toBeTruthy()
    fireEvent.click(screen.getByText(/Choose broker export/))

    // one broker, two dropzones
    expect(screen.getByRole('tab', { name: 'TradeZero' })).toBeTruthy()
    expect(screen.getByLabelText(/TradeZero Cash Journal/)).toBeTruthy()

    const input = (await screen.findByLabelText(/TradeZero Trade History/)) as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [new File([tradesCsv], 'TradeHistory.csv', { type: 'text/csv' })] },
    })

    await screen.findByText('New executions', {}, { timeout: 10000 })
    expect(screen.getByText('$2,824.94')).toBeTruthy() // commissions in preview
    fireEvent.click(await screen.findByRole('button', { name: /Import 3,330 executions/ }))

    await screen.findByText('Net P&L', {}, { timeout: 10000 })
    await waitFor(() => expect(screen.getAllByText('+$40.59').length).toBeGreaterThan(0))
    expect(await db.executions.count()).toBe(3330)
    expect(await db.importBatches.count()).toBe(1)
  })

  it('reads a cash journal dropped on the trade-history zone, attributes locates, and shows the Fees page', async () => {
    render(<App />)
    await screen.findByText('Import from broker')
    fireEvent.click(screen.getByText(/Choose broker export/))
    await importTrades()

    await go('#/import')
    // wrong dropzone on purpose: the file is recognised and switched
    const input = (await screen.findByLabelText(/TradeZero Trade History/)) as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [new File([cashCsv], 'CashJournal.csv', { type: 'text/csv' })] },
    })
    await screen.findByText(/read as one/, {}, { timeout: 10000 })
    expect(screen.getByText('Matched to trades')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: /Import 622 entries/ }))

    // lands on the Fees page
    await screen.findByText('Total cost of trading', {}, { timeout: 10000 })
    expect(screen.getByText('Bottom line')).toBeTruthy()
    expect(screen.getByText('Locate efficiency')).toBeTruthy()
    expect(screen.getByText('Most expensive symbols')).toBeTruthy()
    expect(await db.cashEntries.count()).toBe(622)

    // the dashboard net now includes locates and borrow
    await go('#/dashboard')
    await screen.findByText('Net P&L')
    await waitFor(() => expect(screen.queryAllByText('+$40.59')).toHaveLength(0))

    // a short trade shows its locate line in the fee breakdown
    await go('#/trades')
    fireEvent.change(await screen.findByLabelText('Filter by symbol'), {
      target: { value: 'MOGO' },
    })
    const table = await screen.findByRole('table')
    fireEvent.click(within(table).getAllByRole('row')[1]!)
    await screen.findByText('Fee breakdown')
    expect(await screen.findByText('Locate')).toBeTruthy()
  })

  it('re-importing the same file finds only duplicates', async () => {
    render(<App />)
    await screen.findByText('Import from broker')
    fireEvent.click(screen.getByText(/Choose broker export/))
    await importTrades()

    await go('#/import')
    const input2 = (await screen.findByLabelText(/TradeZero Trade History/)) as HTMLInputElement
    fireEvent.change(input2, { target: { files: [new File([tradesCsv], 'a.csv')] } })
    await screen.findByText(
      /Every row in this file is already in your journal/,
      {},
      { timeout: 10000 },
    )
    const btn = screen.getByRole('button', { name: /Import 0 executions/ })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it('renders every page with data', async () => {
    render(<App />)
    await screen.findByText('Import from broker')
    fireEvent.click(screen.getByText(/Choose broker export/))
    await importTrades()

    fireEvent.click(screen.getByRole('tab', { name: 'Gross' }))
    await screen.findByText('Gross P&L')
    await waitFor(() => expect(screen.getAllByText('+$2,865.53').length).toBeGreaterThan(0))
    fireEvent.click(screen.getByRole('tab', { name: 'Net' }))
    await screen.findByText('Net P&L')

    await go('#/trades')
    await screen.findByLabelText('Filter by symbol')
    const table = await screen.findByRole('table')
    // paginated: 50 per page + header row
    expect(within(table).getAllByRole('row')).toHaveLength(51)
    expect(screen.getAllByText('Page 1 of 23').length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByRole('button', { name: 'Next page' })[0]!)
    await screen.findAllByText('Page 2 of 23')
    fireEvent.click(within(table).getAllByRole('row')[1]!)
    await screen.findByText('Fee breakdown')

    // global Long / Short filter in the navbar scopes the page
    fireEvent.click(screen.getByRole('tab', { name: 'Short' }))
    await screen.findByText(/^463 trades/)
    fireEvent.click(screen.getByRole('tab', { name: 'Long' }))
    await screen.findByText(/^679 trades/)
    fireEvent.click(screen.getByRole('tab', { name: 'All' }))
    await screen.findByText(/^1,142 trades/)

    await go('#/calendar')
    await screen.findByRole('heading', { name: 'September 2026' }, { timeout: 10000 })
    expect(screen.getByText('Best day')).toBeTruthy()

    // deep link to a day (what the dashboard does when a day is clicked)
    await go('#/calendar/2026-09?day=2026-09-04')
    await screen.findByText('Friday, September 4, 2026', {}, { timeout: 10000 })
    expect(screen.getAllByText('AKAN').length).toBeGreaterThan(0)

    await go('#/analytics')
    await screen.findByText('Hold time')
    expect(screen.getByText('Best symbols')).toBeTruthy()
    expect(screen.getByText('Risk & sizing')).toBeTruthy()
    expect(screen.getByText('P&L distribution')).toBeTruthy()
    expect(screen.getByText('If you stopped opening trades at…')).toBeTruthy()
    expect(screen.getByText('Consistency')).toBeTruthy()
    expect(screen.getByText('11:00')).toBeTruthy()

    await go('#/fees')
    await screen.findByText('Total cost of trading')
    expect(screen.getByText('Only commissions so far')).toBeTruthy()

    await go('#/settings')
    await screen.findByText(/Export backup \(3,330 executions\)/)
    expect(screen.getByText(/TradeZero Trade History/)).toBeTruthy()
  })

  it('restores a backup from the start screen', async () => {
    const { tradezero } = await import('./importers/tradezero')
    const { parseCsv } = await import('./importers/csv')
    const backup = {
      app: 'tradedna',
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      executions: tradezero.parse(parseCsv(tradesCsv).rows.slice(0, 40), { importBatchId: 'b' })
        .executions,
      cashEntries: [],
      importBatches: [],
      settings: { pnlBasis: 'gross' },
    }
    render(<App />)
    await screen.findByText('Import from broker')
    fireEvent.click(screen.getByText(/Choose backup file/))
    const input = (await screen.findByLabelText(/Drop your TradeDNA backup/)) as HTMLInputElement
    fireEvent.change(input, {
      target: {
        files: [new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })],
      },
    })
    fireEvent.click(await screen.findByRole('button', { name: /Restore backup/ }))
    await screen.findByText('Gross P&L', {}, { timeout: 5000 })
    expect(await db.executions.count()).toBe(40)
  })
})
