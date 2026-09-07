# TradeDNA

A private, browser-only trading journal. Import your broker's trade history export, and TradeDNA
turns the fills into round-trip trades and shows you how you actually trade: P&L, fees and
commissions, win rate, profit factor, hold times, long vs short, day trades vs overnight, a
calendar, and more.

**Nothing leaves your device.** There is no server, no account, no analytics. Everything you import
is parsed in the browser tab and stored in your browser's IndexedDB. You export a JSON backup to
move or keep your data, and import it again anywhere TradeDNA runs.

## Features

- **Import from broker** — drop a CSV export, the broker is auto-detected. Overlapping exports are
  fine: every fill gets a deterministic id, so duplicates are skipped.
- **One canonical model** — every broker's rows become the same `Execution` object; the app never
  knows or cares where a fill came from.
- **Trade matching** — fills are matched into position-based round trips (flat → open → flat),
  including scaling in/out, positions that flip through zero, short sales and **overnight / multi-day
  holds**. Fills that close a position opened before your earliest export are flagged instead of
  guessed.
- **Fees are first-class** — every P&L number exists as gross and net, with a global Gross/Net toggle,
  fee breakdown by type (commission, SEC, TAF, ...), fees per trade, per share, per symbol and per
  month, and the count of trades that were winners before fees and losers after.
- **Cash journal costs** — import the broker's cash journal and locate fees, single-use locates,
  pre-borrows and overnight borrow charges are attributed to the short trades that caused them
  (same symbol, same day, pro rata when several). Locates you paid for and never used are reported
  separately. Software subscriptions and bank fees become account overhead. The Fees page shows the
  full cost of trading per month and the bottom line: gross P&L minus everything the broker charged.
- **Analytics** — equity curve, daily P&L, calendar heatmap with weekly totals, long vs short, day vs
  swing, hold time of winners vs losers, weekday and hour-of-day, best/worst symbols, drawdown and
  streaks. Plus risk in R-multiples (1R = your average loss), P&L distribution, P&L by share price,
  position size and position value, the average intraday P&L curve with "what if I stopped at 11:00"
  rows, and day-level consistency (green-day rate, P&L without your best/worst day).
- **Backup & restore** — one JSON file, versioned schema, merge or replace on import.

### Supported brokers

| Broker    | Export                                         | Notes                                                   |
| --------- | ---------------------------------------------- | ------------------------------------------------------- |
| TradeZero | ZeroPro → Account → Trade History → Export CSV | Fills. Times are US/Eastern. Sides B / S / SS / BC.     |
| TradeZero | ZeroPro → Account → Cash Journal → Export CSV  | Locates, borrow charges, software, banking. Optional.   |

Adding a broker is one file: implement the `BrokerImporter` interface in `src/importers/` and
register it in `src/importers/registry.ts`. See `src/importers/tradezero.ts` for the reference.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest: matcher, importers, metrics, storage
npm run typecheck
npm run lint
npm run build      # static site in dist/ — deploy anywhere
```

The app uses hash routing and relative asset paths, so the `dist/` folder works from any static host
or sub-path (GitHub Pages included) with no server configuration.

### Project layout

```
src/
  domain/        pure TypeScript, no React: Execution, Trade, matcher, metrics, backup schema
  importers/     one file per broker + registry + CSV parsing
  storage/       Dexie (IndexedDB) schema, repository functions, React hooks
  features/      screens: onboarding, import, dashboard, calendar, trades, analytics, settings
  components/    UI primitives and chart components
  test-fixtures/ synthetic TradeZero exports used by the tests (regenerate: npm run fixtures)
scripts/         generate-fixtures.mjs — seeded generator for the fixtures, no real trades
```

Executions and cash entries are the only things persisted. Trades, and the attribution of cash
costs to them, are recomputed on load, so the matcher and allocator can improve without data
migrations.

## Privacy

TradeDNA is a static web app. Your trade data is stored in IndexedDB in your browser and is never
transmitted. The only way data leaves your device is when you export a backup yourself. Clearing
site data in your browser deletes the journal, so keep a backup.

## License

MIT
