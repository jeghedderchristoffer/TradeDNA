// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import App from './App'
import { allocateCashEntries } from './domain/allocation'
import { matchExecutions } from './domain/matcher'
import { parseCsv } from './importers/csv'
import { tradezero } from './importers/tradezero'
import { tradezeroCash } from './importers/tradezero-cash'
import { fmtDateKey, fmtMoney, fmtMonthKey, fmtNumber } from './lib/format'
import { db } from './storage/db'
import { clearAllData } from './storage/repo'

const tradesCsv = readFileSync(
  path.resolve(__dirname, 'test-fixtures/tradezero-trades.csv'),
  'utf8',
)
const cashCsv = readFileSync(path.resolve(__dirname, 'test-fixtures/tradezero-cash.csv'), 'utf8')

// Expected values are derived from the fixture so regenerating it never breaks this test.
const executions = tradezero.parse(parseCsv(tradesCsv).rows, { importBatchId: 'x' }).executions
const cashEntries = tradezeroCash.parse(parseCsv(cashCsv).rows, { importBatchId: 'y' }).cashEntries
const trades = matchExecutions(executions).trades
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const F = {
  execCount: fmtNumber(executions.length),
  cashCount: fmtNumber(cashEntries.length),
  commissions: fmtMoney(sum(executions.map((e) => e.fees))),
  net: fmtMoney(sum(trades.map((t) => t.netPnl)), { sign: true }),
  gross: fmtMoney(sum(trades.map((t) => t.grossPnl)), { sign: true }),
  all: fmtNumber(trades.length),
  longs: fmtNumber(trades.filter((t) => t.direction === 'long').length),
  shorts: fmtNumber(trades.filter((t) => t.direction === 'short').length),
  pages: fmtNumber(Math.ceil(trades.length / 50)),
  latestDay: trades
    .map((t) => t.exitDate!)
    .sort()
    .at(-1)!,
  shortWithLocate: allocateCashEntries(trades, cashEntries).trades.find((t) => t.locateFees > 0)!
    .symbol,
}
const latestMonth = F.latestDay.slice(0, 7)

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
    await screen.findByRole(
      'button',
      { name: `Import ${F.execCount} executions` },
      { timeout: 10000 },
    ),
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
    expect(screen.getByText(F.commissions)).toBeTruthy() // commissions in preview
    fireEvent.click(await screen.findByRole('button', { name: `Import ${F.execCount} executions` }))

    await screen.findByText('Net P&L', {}, { timeout: 10000 })
    await waitFor(() => expect(screen.getAllByText(F.net).length).toBeGreaterThan(0))
    expect(await db.executions.count()).toBe(executions.length)
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
    fireEvent.click(await screen.findByRole('button', { name: `Import ${F.cashCount} entries` }))

    // lands on the Fees page
    await screen.findByText('Total cost of trading', {}, { timeout: 10000 })
    expect(screen.getByText('Bottom line')).toBeTruthy()
    expect(screen.getByText('Locate efficiency')).toBeTruthy()
    expect(screen.getByText('Most expensive symbols')).toBeTruthy()
    expect(await db.cashEntries.count()).toBe(cashEntries.length)

    // the dashboard net now includes locates and borrow
    await go('#/dashboard')
    await screen.findByText('Net P&L')
    await waitFor(() => expect(screen.queryAllByText(F.net)).toHaveLength(0))

    // a short trade shows its locate line in the fee breakdown
    await go('#/trades')
    fireEvent.change(await screen.findByLabelText('Filter by symbol'), {
      target: { value: F.shortWithLocate },
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Short' }))
    await screen.findByText(/^\d+ trades/)
    const table = await screen.findByRole('table')
    fireEvent.click(within(table).getAllByRole('row')[1]!)
    await screen.findByText('Fee breakdown')
    expect((await screen.findAllByText('Locate')).length).toBeGreaterThan(0)
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
    await waitFor(() => expect(screen.getAllByText(F.gross).length).toBeGreaterThan(0))
    fireEvent.click(screen.getByRole('tab', { name: 'Net' }))
    await screen.findByText('Net P&L')

    await go('#/trades')
    await screen.findByLabelText('Filter by symbol')
    const table = await screen.findByRole('table')
    // paginated: 50 per page + header row
    expect(within(table).getAllByRole('row')).toHaveLength(51)
    expect(screen.getAllByText(`Page 1 of ${F.pages}`).length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByRole('button', { name: 'Next page' })[0]!)
    await screen.findAllByText(`Page 2 of ${F.pages}`)
    fireEvent.click(within(table).getAllByRole('row')[1]!)
    await screen.findByText('Fee breakdown')

    // global Long / Short filter in the navbar scopes the page
    fireEvent.click(screen.getByRole('tab', { name: 'Short' }))
    await screen.findByText(new RegExp(`^${F.shorts} trades`))
    fireEvent.click(screen.getByRole('tab', { name: 'Long' }))
    await screen.findByText(new RegExp(`^${F.longs} trades`))
    fireEvent.click(screen.getByRole('tab', { name: 'All' }))
    await screen.findByText(new RegExp(`^${F.all} trades`))

    await go('#/calendar')
    await screen.findByRole('heading', { name: fmtMonthKey(latestMonth) }, { timeout: 10000 })
    expect(screen.getByText('Best day')).toBeTruthy()

    // deep link to a day (what the dashboard does when a day is clicked)
    await go(`#/calendar/${latestMonth}?day=${F.latestDay}`)
    await screen.findByText(fmtDateKey(F.latestDay, 'EEEE, MMMM d, yyyy'), {}, { timeout: 10000 })
    const daySymbol = trades.find((t) => t.exitDate === F.latestDay)!.symbol
    expect(screen.getAllByText(daySymbol).length).toBeGreaterThan(0)

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
    await screen.findByText(`Export backup (${F.execCount} executions)`)
    expect(screen.getByText(/TradeZero Trade History/)).toBeTruthy()
  })

  it('restores a backup from the start screen', async () => {
    const backup = {
      app: 'tradedna',
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      executions: executions.slice(0, 40),
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
