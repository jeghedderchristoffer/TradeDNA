# TradeDNA

**A private, browser-only trading journal.** Drop in your broker's CSV export and see how you
actually trade: net P&L after fees, win rate, hold times, long vs short, day trades vs overnight,
a calendar, and more.

**→ [Open TradeDNA](https://jeghedderchristoffer.github.io/TradeDNA)** — no install, no account.

Nothing leaves your device. There is no server and no analytics. Your data lives in your browser's
IndexedDB, and you can export it as a JSON backup at any time.

## What you get

- **Import in one drop.** The broker is auto-detected. Re-importing overlapping exports is safe;
  duplicates are skipped.
- **Real round-trip trades.** Fills are matched into positions, including scaling in and out, flips
  through zero, shorts and multi-day holds.
- **Fees front and center.** Every number is available gross and net. See fees by type, per trade,
  per share, per symbol and per month, and how many winners fees turned into losers.
- **Short-selling costs.** Import the cash journal and locates, pre-borrows and overnight borrow
  charges are attributed to the trades that caused them.
- **Analytics that matter.** Equity curve, calendar heatmap, drawdown, streaks, R-multiples,
  hour-of-day and weekday breakdowns, "what if I stopped at 11:00", and day-level consistency.
- **Journal every trade.** Open any trade, tag it (setup, mistake, market condition) and write a
  note. Tags get their own P&L breakdown, so you can see what "fomo" or "a+ setup" actually costs
  or earns you.
- **Per-symbol pages.** Every ticker you have traded, ranked, each with its own P&L, win rate,
  equity curve and trade list.
- **Backup & restore.** One JSON file with your trades, notes and tags. Merge or replace.

## Supported brokers

| Broker    | Export                                                                                |
| --------- | ------------------------------------------------------------------------------------- |
| TradeZero | ZeroPro → Account → Trade History → Export CSV                                        |
| TradeZero | ZeroPro → Account → Cash Journal → Export CSV (optional, for locate and borrow costs) |

Want another broker? Implement the `BrokerImporter` interface in `src/importers/` and register it in
`src/importers/registry.ts`. `src/importers/tradezero.ts` is the reference.

## Run it yourself

```bash
npm install
npm run dev      # http://localhost:5173
npm test
npm run build    # static site in dist/, deploy anywhere
```

The build uses hash routing and relative paths, so `dist/` works from any static host or sub-path.

## Privacy

TradeDNA is a static web app. Your trades are stored in your browser and never transmitted. The only
way data leaves your device is when you export a backup yourself. Clearing site data deletes the
journal, so keep a backup.

## License

MIT
