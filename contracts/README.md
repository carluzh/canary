# Canary Contracts

Fully-collateralized binary parametric insurance markets, settled automatically from Chainlink feed history. Foundry project.

## Architecture

```
CanaryMarketFactory ── creates ──▶ CanaryMarket (one per insured risk)
                                       │
                          complete sets · order book · settlement (feed proof)
                                       │
                              AggregatorV3Interface (Chainlink feed / RelayedFeed / mock)
```

One contract per market: each holds its own collateral, orders, and outcome balances.

### CanaryMarket

- **Complete sets** — `mintSets(amount)` deposits USDC for `amount` YES + `amount` NO; `burnSets` reverses it. A set is always worth $1.
- **Order book** — `placeOrder(isYes, isBuy, price, amount)` / `fillOrder(orderId, amount)` / `cancelOrder(orderId)`. `price` is 1e6-scaled (`20_000` = $0.02 = 2% implied probability). No matching engine — the frontend lists `openOrders()` and users fill them. Rounding always favors solvency.
- **Settlement** (permissionless) — `settleDepeg(startRoundId)` proves "price < threshold for the full `breachWindow`, before `expiry`" by walking the feed's on-chain round history; `settleExpiry()` resolves NO after `expiry + grace`; `redeem()` pays the winning side 1:1.

Insurance mapping: underwriter = `mintSets` + sell YES (keeps NO, earns premium); buyer = buy YES. Depeg → YES pays $1; else NO pays $1.

`CanaryMarketFactory`: permissionless `createMarket(...)` / `createYieldMarket(...)`, registry (`allMarkets()`), `MarketCreated` events. Collateral is fixed per factory (USDC on Arc).

### Cross-chain settlement via CCIP (`src/ccip/`)

USDe/USD isn't a native Chainlink feed on Arc, so we relay the real answer cross-chain rather than trust a resolver:

```
Sepolia: DepegSentinel.relay() ── CCIP ──▶ Arc: RelayedFeed (AggregatorV3Interface) ──▶ settleDepeg()
```

`DepegSentinel` reads the source feed and CCIP-sends each round; `RelayedFeed` (router-only, source-allowlisted) stores them under gapless local round ids preserving the source timestamp, so `settleDepeg` walks them like a native feed — no trusted party. `MockCcipRouter` runs the full path in-process for tests.

### Self-funding yield (`src/interfaces/IYieldStrategy.sol`)

Opt-in via `createYieldMarket(...)` (off → identical to the order-book core). 100% of idle collateral is rehypothecated into a yield venue (USYC / Aave-4626 / `MockYieldVault`); each harvest splits yield three ways: a **protocol fee** (0 on testnet), the **underwriters** (NO), and a **rebate to buyers** (YES) that lowers net premium — for deep-tail, long-dated cover the rebate can exceed the premium, so cover funds itself. Distribution is pro-rata by held-balance × time. The venue must be independent of the insured risk (`asset() == collateral` check + by design). Views: `pendingYield`, `totalCollateralValue`.

### Autonomous settlement via Chainlink CRE

`src/cre/CanaryReportReceiver.sol` turns a Chainlink CRE report into `settleDepeg` (Keystone `onReport`). Paired with the workflow in [`../cre/`](../cre/) — a cron job that watches the feed and fires settlement itself. Proven live on Arc.

## Testing

```sh
forge test                                          # 115 tests
forge coverage --no-match-coverage "(test|script|mocks)"
```

Three layers — unit (functions + every revert + settlement edge cases + CCIP + yield + CRE receiver), fuzz (escrow/rounding conservation, random breach histories, yield split + solvency), and `fail-on-revert` invariants (exact solvency incl. yield, supply lockstep, token conservation). **100% lines / ~97% branches** across `src/`.

## Deploy

`script/Deploy.s.sol` deploys the factory + a demo feed/market and writes `deployments.json`; `DeployYield.s.sol` adds a self-funding market; `DeploySentinel.s.sol` (source chain) + `setSource` wire the CCIP relay.

### Verified network reference

| | Arc Testnet | Ethereum Sepolia |
|---|---|---|
| chainId | 5042002 | 11155111 |
| RPC | `https://rpc.testnet.arc.network` | your Sepolia RPC |
| USDC | `0x3600000000000000000000000000000000000000` | — |
| CCIP Router | `0xdE4E7FED43FAC37EB21aA0643d9852f75332eab8` | `0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59` |
| CCIP selector | `3034092155422581607` | `16015286601757825753` |

```sh
forge script script/Deploy.s.sol --rpc-url https://rpc.testnet.arc.network --broadcast --private-key $PK
```

No USDe/USD feed exists on any testnet, so the relay's source is a `MockV3Aggregator` (in production it points at the real mainnet USDe feed). Live addresses in `DEPLOYMENTS.md`.

## Known limitations

- **`evm_version = paris`** — avoids PUSH0/transient storage so the bytecode runs on any EVM chain.
- **Single-phase feed** — `settleDepeg` walks `roundId + 1` (gapless within one aggregator phase); a window spanning a proxy phase-change needs proxy-aware walking.
- **CCIP ordering** — `RelayedFeed` dedupes by messageId and enforces increasing source rounds; a reordered delivery dropping a recovery round is the one residual edge, mitigated by single-sender per-lane ordering.
- **Round-walk gas** — a long window touches many rounds; pagination is the fix at scale.
- **Trusted USDC-like collateral** — fee-on-transfer/rebasing tokens out of scope by design.
