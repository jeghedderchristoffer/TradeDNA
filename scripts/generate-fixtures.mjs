#!/usr/bin/env node
/**
 * Generates synthetic TradeZero-format fixtures for the test suite.
 *
 *   node scripts/generate-fixtures.mjs
 *
 * Output: src/test-fixtures/tradezero-trades.csv and src/test-fixtures/tradezero-cash.csv
 *
 * Everything is produced from a fixed seed, so the files are reproducible and contain no real
 * trades. The shapes mirror the broker exports exactly: same headers, side codes, fee columns,
 * note formats for locates / credits / single-use / pre-borrow / overnight borrow, software and
 * banking rows. Invariants the tests rely on:
 *   - every position returns to flat (no open trades, no unmatched fills)
 *   - some trades are held overnight, both long and short
 *   - every short has a locate row the same day; overnight shorts have an ONB row
 *   - a few locates are bought for symbols never shorted that day (unused locates)
 *   - fee columns always add up to Gross − Net
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const OUT_DIR = path.resolve(import.meta.dirname, '../src/test-fixtures')
const ACCOUNT = 'ACCT0001'
const NAME = 'Sample Trader'

// ---------- deterministic randomness ----------
let seed = 0x5eed1234
function rand() {
  // mulberry32
  seed = (seed + 0x6d2b79f5) | 0
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)]
const between = (a, b) => a + rand() * (b - a)
const chance = (p) => rand() < p
function gauss() {
  const u = 1 - rand()
  const v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
const r2 = (n) => Math.round(n * 100) / 100
const r4 = (n) => Math.round(n * 10_000) / 10_000

// ---------- calendar ----------
function tradingDays(from, to) {
  const days = []
  const d = new Date(from + 'T12:00:00Z')
  const end = new Date(to + 'T12:00:00Z')
  while (d <= end) {
    const dow = d.getUTCDay()
    if (dow >= 1 && dow <= 5 && chance(0.6)) days.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return days
}
function addBusinessDays(key, n) {
  const d = new Date(key + 'T12:00:00Z')
  while (n > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    const dow = d.getUTCDay()
    if (dow >= 1 && dow <= 5) n--
  }
  return d.toISOString().slice(0, 10)
}
const mdY = (key) => `${key.slice(5, 7)}/${key.slice(8, 10)}/${key.slice(0, 4)}`
const md = (key) => `${key.slice(5, 7)}/${key.slice(8, 10)}`
const hms = (sec) =>
  `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`

// ---------- universe ----------
const SYMBOLS = [
  'ABVX',
  'ACRN',
  'ALTO',
  'AMPX',
  'ARQT',
  'AVGR',
  'BCTX',
  'BNZI',
  'BOLT',
  'BRTX',
  'CLRB',
  'CNSP',
  'COEP',
  'CYCN',
  'DATS',
  'DRMA',
  'ELAB',
  'ENSC',
  'EVTV',
  'FRGT',
  'GNPX',
  'GRNQ',
  'HOTH',
  'HUBC',
  'ICCT',
  'IMTE',
  'INAB',
  'JAGX',
  'JZXN',
  'KTTA',
  'LGMK',
  'LIPO',
  'LUCY',
  'MGOL',
  'MLGO',
  'MTNB',
  'NAOV',
  'NCPL',
  'NUWE',
  'NVOS',
  'OCEA',
  'ONFO',
  'PALI',
  'PIXY',
  'PRFX',
  'QLGN',
  'RELI',
  'RVSN',
  'SBFM',
  'SGBX',
  'SINT',
  'SNTG',
  'SXTC',
  'TCBP',
  'TIRX',
  'TNON',
  'UPXI',
  'VERB',
  'VINO',
  'VRAX',
  'WINT',
  'WISA',
  'XCUR',
  'XPON',
  'YOSH',
  'ZCMD',
  'ZVSA',
]
const CLR = ['VIRTU', 'CTDL', 'LAMP', 'RICE', 'CDRG']

// ---------- trade generation ----------
const days = tradingDays('2025-07-01', '2026-06-30')
const fills = [] // { date, sec, side, symbol, qty, price, clr, liq }
const cash = [] // { date, deposit, withdraw, type, note, order }
const dayLocates = new Map() // date -> Set(symbol) already located
const openOvernight = [] // shorts to close on a later day: { symbol, qty, price, closeDate, rate }

/**
 * Price for a fill. Four decimals on round lots (multiples of 100) and two decimals otherwise,
 * so qty × price is always an exact number of cents — like the real export, where Gross Proceeds
 * is the exact product.
 */
function pricePoint(base, qty = 100) {
  const p = Math.max(0.2, base)
  return qty % 100 === 0 ? r4(p) : r2(p)
}

function feeRow(side, qty, price) {
  const gross = r2((side === 'S' || side === 'SS' ? 1 : -1) * qty * price)
  const comm = r2(Math.min(1, Math.max(0.5, qty * 0.004)))
  const selling = side === 'S' || side === 'SS'
  const sec = selling ? r2(Math.abs(gross) * 0.0000278) : 0
  const taf = selling ? r2(Math.max(0.01, qty * 0.000166)) : 0
  const nscc = 0.03
  const nasdaq = 0.01
  const fees = r2(comm + sec + taf + nscc + nasdaq)
  const net = r2(gross - fees)
  return { gross, comm, sec, taf, nscc, nasdaq, net }
}

function addLocate(date, symbol, qty, order) {
  const rate = r4(pick([0.002, 0.003, 0.004, 0.004, 0.006, 0.0075, 0.01, 0.012, 0.02]))
  const kind = chance(0.06) ? 'Single-Use' : chance(0.02) ? 'Pre-Borrow' : 'Locate'
  cash.push({
    date,
    deposit: 0,
    withdraw: r2(qty * rate),
    type: 'Locate Fees',
    note: `${kind} ${qty} ${symbol} @ ${rate} per share`,
    order,
  })
  if (chance(0.15)) {
    const creditQty = Math.max(50, Math.round((qty * pick([0.25, 0.5, 1])) / 50) * 50)
    const creditRate = r4(rate * pick([0.3, 0.5, 0.62]))
    const prefix = chance(0.2) ? '62% Locate CreditLocate' : 'Locate credit'
    cash.push({
      date,
      deposit: r2(creditQty * creditRate),
      withdraw: 0,
      type: 'Locate Fees',
      note: `${prefix} ${creditQty} ${symbol} @ ${creditRate} per share`,
      order: order + 0.5,
    })
  }
  return rate
}

for (let di = 0; di < days.length; di++) {
  const date = days[di]
  const nextDay = days[di + 1]
  let order = 0

  // close overnight shorts/longs opened earlier
  for (const pos of openOvernight.filter((p) => p.closeDate === date)) {
    const sec = Math.floor(between(9.5 * 3600, 11 * 3600))
    const exitPrice = pricePoint(pos.price * (1 + gauss() * 0.06), pos.qty)
    fills.push({
      date,
      sec,
      side: pos.side === 'SS' ? 'BC' : 'S',
      symbol: pos.symbol,
      qty: pos.qty,
      price: exitPrice,
      clr: pick(CLR),
      liq: pick(['', '', '1', '2']),
    })
    if (pos.side === 'SS') {
      const onbRate = r4(Math.exp(between(Math.log(0.0002), Math.log(0.08))))
      cash.push({
        date,
        deposit: 0,
        withdraw: r2(pos.qty * onbRate),
        type: 'Locate & Borrow Charge',
        note: `ONB ${pos.qty} ${pos.symbol} ($${onbRate}) for ${md(pos.openDate)}`,
        order: order++,
      })
    }
  }

  const tradeCount = 2 + Math.floor(rand() * 6)
  // one position per symbol per day, and never touch a symbol that is still held overnight
  const todaysSymbols = new Set(
    openOvernight.filter((p) => p.closeDate >= date).map((p) => p.symbol),
  )
  for (let ti = 0; ti < tradeCount; ti++) {
    let symbol = pick(SYMBOLS)
    while (todaysSymbols.has(symbol)) symbol = pick(SYMBOLS)
    const isShort = chance(0.42)
    const base = pricePoint(Math.exp(between(Math.log(0.6), Math.log(28))))
    const qtyBase =
      base < 1
        ? pick([500, 1000, 1500, 2000])
        : base < 3
          ? pick([200, 300, 500, 1000])
          : base < 10
            ? pick([100, 200, 300, 500])
            : pick([50, 100, 150, 200])
    const startSec = Math.floor(
      chance(0.15)
        ? between(4 * 3600, 9.5 * 3600)
        : chance(0.7)
          ? between(9.5 * 3600, 11.5 * 3600)
          : between(11.5 * 3600, 15.75 * 3600),
    )
    const overnight = chance(0.05) && !!nextDay
    todaysSymbols.add(symbol)

    if (isShort) {
      if (!dayLocates.has(date)) dayLocates.set(date, new Set())
      if (!dayLocates.get(date).has(symbol)) {
        addLocate(
          date,
          symbol,
          Math.max(100, Math.round((qtyBase * pick([1, 1, 1, 1.5])) / 100) * 100),
          order++,
        )
        dayLocates.get(date).add(symbol)
      }
    }

    // entries: 1–3 fills
    const entryFills = 1 + Math.floor(rand() * 3)
    let sec = startSec
    let qtyLeft = qtyBase
    let held = 0
    for (let i = 0; i < entryFills; i++) {
      const q =
        i === entryFills - 1
          ? qtyLeft
          : Math.max(50, Math.round(qtyLeft / (entryFills - i) / 50) * 50)
      qtyLeft -= q
      held += q
      const p = pricePoint(base * (1 + gauss() * 0.004), q)
      fills.push({
        date,
        sec,
        side: isShort ? 'SS' : 'B',
        symbol,
        qty: q,
        price: p,
        clr: pick(CLR),
        liq: pick(['', '', '', '1', '2', 'AR']),
      })
      sec += Math.floor(between(3, 240))
      if (qtyLeft <= 0) break
    }

    if (overnight) {
      openOvernight.push({
        symbol,
        qty: held,
        price: base,
        side: isShort ? 'SS' : 'B',
        openDate: date,
        closeDate: days[Math.min(days.length - 1, di + 1 + Math.floor(rand() * 2))],
      })
      continue
    }

    // exits: 1–3 fills, slight negative drift after costs
    const move = gauss() * 0.035 + (chance(0.55) ? 0.01 : -0.012)
    const exitBase = pricePoint(base * (1 + (isShort ? -move : move)))
    const exitFills = 1 + Math.floor(rand() * 3)
    sec += Math.floor(between(20, 90 * 60))
    let toClose = held
    for (let i = 0; i < exitFills; i++) {
      const q =
        i === exitFills - 1
          ? toClose
          : Math.max(50, Math.round(toClose / (exitFills - i) / 50) * 50)
      if (q <= 0) break
      toClose -= q
      const p = pricePoint(exitBase * (1 + gauss() * 0.003), q)
      fills.push({
        date,
        sec: Math.min(sec, 19 * 3600 + 59 * 60),
        side: isShort ? 'BC' : 'S',
        symbol,
        qty: q,
        price: p,
        clr: pick(CLR),
        liq: pick(['', '', '1', '2']),
      })
      sec += Math.floor(between(1, 120))
      if (toClose <= 0) break
    }
  }

  // an unused locate now and then (bought, never shorted)
  if (chance(0.12)) {
    let sym = pick(SYMBOLS)
    while (todaysSymbols.has(sym)) sym = pick(SYMBOLS)
    addLocate(date, sym, pick([100, 200, 300, 500]), order++)
  }

  // monthly platform fee on the first trading day of a month
  if (di === 0 || days[di - 1].slice(0, 7) !== date.slice(0, 7)) {
    cash.push({
      date: `${date.slice(0, 7)}-01`,
      deposit: 0,
      withdraw: 59,
      type: 'Software & Data',
      note: 'ZeroPro',
      order: -1,
    })
  }
}

// banking
cash.push({
  date: '2025-06-30',
  deposit: 5000,
  withdraw: 0,
  type: 'Banking',
  note: 'Wire In',
  order: 0,
})
cash.push({
  date: '2025-06-30',
  deposit: 0,
  withdraw: 15,
  type: 'Banking',
  note: 'Wire In Fee',
  order: 1,
})

// close anything still open on the last day so the fixture ends flat
const lastDay = days[days.length - 1]
for (const pos of openOvernight.filter(
  (p) => p.closeDate > lastDay || !days.includes(p.closeDate),
)) {
  fills.push({
    date: lastDay,
    sec: 15 * 3600,
    side: pos.side === 'SS' ? 'BC' : 'S',
    symbol: pos.symbol,
    qty: pos.qty,
    price: pos.price,
    clr: 'VIRTU',
    liq: '',
  })
}

// ---------- write CSVs ----------
fills.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.sec - b.sec))
const tradeHeader =
  'Account,T/D,S/D,Currency,Type,Side,Symbol,Qty,Price,Exec Time,Comm,SEC,TAF,NSCC,Nasdaq,ECN Remove,ECN Add,Gross Proceeds,Net Proceeds,Clr Broker,Liq,Note'
const tradeRows = fills.map((f) => {
  const fee = feeRow(f.side, f.qty, f.price)
  const type = f.side === 'B' || f.side === 'S' ? 2 : 3
  return [
    ACCOUNT,
    mdY(f.date),
    mdY(addBusinessDays(f.date, 1)),
    'USD',
    type,
    f.side,
    f.symbol,
    f.qty,
    f.price,
    hms(f.sec),
    fee.comm,
    fee.sec,
    fee.taf,
    fee.nscc,
    fee.nasdaq,
    0,
    0,
    fee.gross,
    fee.net,
    f.clr,
    f.liq,
    '',
  ].join(',')
})

cash.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order))
const cashHeader = 'Account,Name,Currency,E/D,Deposit,Withdraw,Type,Note,Product'
const cashRows = cash.map((c) =>
  [ACCOUNT, NAME, 'USD', mdY(c.date), c.deposit, c.withdraw, c.type, c.note, 'Equities'].join(','),
)

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(
  path.join(OUT_DIR, 'tradezero-trades.csv'),
  [tradeHeader, ...tradeRows].join('\n') + '\n',
)
writeFileSync(path.join(OUT_DIR, 'tradezero-cash.csv'), [cashHeader, ...cashRows].join('\n') + '\n')

console.log(`trading days: ${days.length}, fills: ${fills.length}, cash rows: ${cash.length}`)
