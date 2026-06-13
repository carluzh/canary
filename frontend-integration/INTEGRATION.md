# Frontend ↔ Contracts integration

The contract is an **on-chain order book** (`CanaryMarket`), not the AMM the
original `BINARY_MARKET_ABI` assumed. The UX doesn't change — buy cover,
underwrite, see one price — only how those map to calls. Everything you need is
in this folder.

## What to copy where

| This folder | Goes to | Notes |
|---|---|---|
| `abis.json` | `lib/contracts/abis.json` | exact compiler ABIs |
| `abi.ts` | `lib/contracts/abi.ts` | replaces the old `BINARY_MARKET_ABI` |
| `addresses.ts` | `lib/contracts/addresses.ts` | reads `deployments.json` |
| `canary.ts` | `lib/contracts/canary.ts` | price + buy/underwrite mapping |
| `deployments.json` (from `contracts/` after deploy) | `lib/contracts/deployments.json` | addresses + chainId |

`tsconfig` needs `"resolveJsonModule": true` (Next.js has it on by default).

## Concept mapping (this is the whole adaptation)

| Your UI concept | Order-book reality | Helper |
|---|---|---|
| `market.priceYes` (0..1) | best YES ask (mid if both sides quoted) | `priceYes(book)` |
| risk-curve point | same — `priceYes` per market | `priceYes(book)` |
| Simple: "Cover amount" + "Premium" | fill cheapest YES asks for N shares; premium = Σ price·amount | `planBuyCover(market, book, coverShares)` |
| Expert: Buy YES / Buy NO | `planBuyCover` (YES) / fill NO asks (mirror) | `planBuyCover` |
| Underwrite / Blink deposit | `mintSets(amount)` + sell YES at your premium, keep NO | `planUnderwrite(market, amount, price)` |
| `positionOf(user)` | `yesBalance(user)`, `noBalance(user)` | direct reads |
| `redeem()` | `redeem()` (winning side pays $1/share) | `redeem(market)` |
| `state()` 0/1/2 | Open / TriggeredYes / ExpiredNo | `MarketState` enum |
| `resolve(bool)` | **gone** — settlement is permissionless `settleDepeg(roundId)` or `settleExpiry()` | `settleDepeg(market, id)` |

The book itself comes from `CanaryMarket.openOrders()` → `(ids[], Order[])`,
shaped as `OrderBook` in `canary.ts`. List markets via
`CanaryMarketFactory.allMarkets()`; render metadata from `marketInfo()`.

## Per-screen wiring

**Dashboard / risk curve** — `factory.allMarkets()` → for each, `openOrders()` →
`priceYes(book)`. That number is both the premium and the implied probability.

**Trade panel (buy cover)** — read `openOrders()`, call
`planBuyCover(market, book, coverShares)`. It returns `{ calls, premium }`:
`approveUsdc(usdc, market, premium)` then run `calls` (sequential `fillOrder`s).
`coverShares` = the user's "Cover amount" in USDC base units (6-dec).

**Underwrite (Blink)** — `approveUsdc(usdc, market, amount)` then the two calls
from `planUnderwrite(market, amount, premiumPrice)`. `premiumPrice` is
PRICE_SCALE-scaled (e.g. `20_000n` = $0.02 = 2%).

**Portfolio** — `yesBalance`/`noBalance`; after resolution show `redeem()`.

## Units (important)

- amounts (shares, USDC, premiums): **6-dec** USDC base units.
- order price: **PRICE_SCALE = 1e6**. `price/1e6 ∈ (0,1)` is the probability.
- feed answer / `depegThreshold`: feed decimals (**8** for USD feeds), e.g. `0.95e8`.
- a YES share pays exactly `1e6` (=$1) on a depeg; NO pays `1e6` if no depeg.

## The "no AMM seed" gotcha

An order book has no price until someone posts orders. For the demo, seed the
book first (the `DemoSeed` script does this, or call `planUnderwrite` once from a
team wallet) so `priceYes` is populated and there are asks to buy. If a market's
book is empty, `priceYes()` returns 0.5 and `planBuyCover` returns no calls —
render that as "no liquidity yet".

## Settlement is automatic (no resolve button for users)

There is no `resolve(bool)`. When a depeg is provable, anyone calls
`settleDepeg(startRoundId)` and the market flips to `TriggeredYes`; after expiry,
anyone calls `settleExpiry()` → `ExpiredNo`. For the demo, the settle call is a
single button (or a script). `startRoundId` is the first feed round below
threshold. In the demo it's simply `feed.latestRound()` read right after the
crash transaction (the crash is the breaching round); in general, scan the feed's
round history for the first answer below `depegThreshold`.
