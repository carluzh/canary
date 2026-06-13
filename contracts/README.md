# Canary Contracts

Fully-collateralized binary parametric insurance markets, settled automatically from Chainlink price feed history. Foundry project.

## Architecture

```
CanaryMarketFactory ── creates ──▶ CanaryMarket (one per insured risk)
        │                              │
   collateral (USDC,            ┌──────┼──────────────┐
   fixed per factory)           │      │              │
                          complete   order book   settlement
                            sets    (limit orders)  (feed proof)
                                       │
                              AggregatorV3Interface
                              (real Chainlink feed on Arc,
                               or MockV3Aggregator — same bytecode either way)
```

One contract per market keeps the mental model and the frontend simple: every market is its own address holding its own collateral, orders and outcome balances.

### CanaryMarket — the whole product in one contract

**Complete sets** (the collateralization primitive, same as Polymarket/Gnosis CTF):

- `mintSets(amount)` — deposit `amount` USDC, receive `amount` YES + `amount` NO (internal balances).
- `burnSets(amount)` — the reverse, any time before resolution. A complete set is always worth exactly $1, so this is always safe.

**Order book** (price discovery — YES price = premium = implied probability):

- `placeOrder(isYes, isBuy, price, amount)` — limit order. `price` is scaled by 1e6 and must be in (0, 1e6): `20_000` = $0.02 per $1 of cover = 2% implied probability. Buy orders escrow USDC (rounded up); sell orders escrow the outcome tokens.
- `fillOrder(orderId, amount)` — take any open order, partially or fully. No matching engine: the frontend lists open orders (`openOrders()` view or `OrderPlaced`/`OrderFilled` events) and users hit them. Rounding always favors safety: partial fills of buy escrow round down (final fill sweeps the dust, so nothing is ever stranded); sell fills round the taker's cost up (tokens are never free).
- `cancelOrder(orderId)` — maker recovers escrow; works in **any** state so funds can't be stranded after resolution.

**Settlement** (permissionless, no keepers, no humans):

- `settleDepeg(startRoundId)` — proves "price < threshold for the full `breachWindow`, completed before `expiry`" by walking the feed's on-chain round history from `startRoundId` forward. Between feed updates the price *is* the last posted answer, so consecutive below-threshold rounds spanning the window prove a continuous breach. If the feed went silent below threshold, the proof completes once the window elapses in wall-clock time. Reverts with the exact obstruction otherwise (`BreachInterrupted(roundId)`, `BreachWindowNotElapsed`, …).
- `settleExpiry()` — callable after `expiry + settlementGrace`. The grace period exists so a breach that completed just before expiry can still be proven by `settleDepeg` before NO is locked in.
- `redeem()` — winning side redeems 1:1 for USDC. (Tokens sitting in open sell orders must be `cancelOrder`ed back first.)

**Insurance mapping**: underwriter = `mintSets` + sell YES (premium income, keeps NO). Coverage buyer = buy YES (pays premium). Depeg → YES pays $1. No depeg → NO redeems $1, underwriter keeps premium. Yield on idle collateral is deliberately **not** in v1 — it's an additive layer (see roadmap note below).

### CanaryMarketFactory

Permissionless `createMarket(feed, threshold, window, expiry, grace, description)`, registry (`allMarkets()`, `marketCount()`), `MarketCreated` events. Collateral token is fixed at factory deploy (USDC on Arc).

### Cross-chain settlement via CCIP (`src/ccip/`)

USDe/USD is **not** a native Chainlink feed on Arc. Rather than trust a human resolver, we relay the *real* Chainlink answer cross-chain and keep settlement permissionless:

```
source chain (e.g. Sepolia)                 Arc
┌────────────────────┐   CCIP    ┌─────────────────────┐
│ Chainlink USDe/USD │           │ RelayedFeed         │ ── AggregatorV3Interface ──▶ CanaryMarket.settleDepeg()
│        ▲           │           │  (stores rounds,    │
│ DepegSentinel.relay()──ccipSend──▶ ccipReceive)      │
└────────────────────┘           └─────────────────────┘
```

- **`DepegSentinel`** (source): permissionless `relay()` reads the feed's `latestRoundData` and CCIP-sends `(roundId, answer, updatedAt)` to Arc. Pays the CCIP fee in native gas; refunds excess.
- **`RelayedFeed`** (Arc): implements `AggregatorV3Interface`. `ccipReceive` (router-only, source-allowlisted) stores each observation under a **locally monotonic, gapless** round id, preserving the *source* feed's timestamp. So `CanaryMarket.settleDepeg` walks relayed rounds exactly as it would a native feed — no trusted party anywhere in the path. Source is wired once post-deploy via `setSource(selector, sentinel)` (resolves the cross-chain circular-deploy dependency).
- **`MockCcipRouter`** delivers messages in-process so the full sentinel → router → RelayedFeed → settle path runs in one Foundry test.

For the live demo the market points at an operator-controllable feed instead (crash on cue); the CCIP path powers a second "live Chainlink data" market for credibility, so the stage demo never depends on cross-chain latency.

### Frontend integration cheat-sheet

```
factory.allMarkets()             -> address[] of every market
market.marketInfo()              -> state, feed, threshold, window, expiry, supplies, description
market.openOrders()              -> (ids[], Order[]) — render the book, best YES ask = current premium
market.yesBalance(user) / noBalance(user)
events: MarketCreated, SetsMinted/Burned, OrderPlaced/Filled/Cancelled, MarketTriggered, MarketExpired, Redeemed
```

Amounts use collateral decimals (USDC = 6). Prices are 1e6-scaled probabilities. Feed answers/thresholds use the feed's own decimals (8 for USD feeds).

## Testing

93 tests, three layers. `forge test` runs them all.

| Layer | Where | What |
|---|---|---|
| Unit (80) | `test/unit/` | every function, every revert path, settlement edge cases (grace-period race, feed-silence, interrupted breach, threshold exclusivity, round-before-creation…), plus the CCIP relay (router/source guards, gapless rounds, stale-observation, fee refund) and the **end-to-end test that settles a market on Chainlink data relayed across CCIP** |
| Fuzz (8) | `test/fuzz/` | escrow conservation under random fill chunking, rounding safety, random breach histories always/never trigger correctly |
| Invariant (5) | `test/invariant/` | random multi-actor lifecycles against: exact solvency (`balance == backing + buyEscrow`, equality not ≥), YES/NO supply lockstep, token conservation, escrow accounting, state-machine sanity — with `fail-on-revert = true`: handler calls are precondition-guarded, so *any* revert fails the suite |

```sh
forge test                      # full suite
forge test --match-path "test/fuzz/*"
FOUNDRY_PROFILE=ci forge test   # 4096 fuzz runs, deeper invariants (pre-demo sanity)
forge coverage --no-match-coverage "(test|script|mocks)"
```

Coverage: **100% lines, 99.6% statements, 96.7% branches, 100% functions** across all `src/` contracts.

## Deploy

`script/Deploy.s.sol` deploys the factory + an operator-controllable demo feed + demo market, and writes `deployments.json` (chainId + addresses) for the frontend. Set `CCIP_ROUTER` to also deploy a `RelayedFeed` + a live-Chainlink-via-CCIP market.

### Network reference (verified against Chainlink docs, June 2026)

| | Arc Testnet | Ethereum Sepolia (relay source) |
|---|---|---|
| chainId | 5042002 | 11155111 |
| RPC | `https://rpc.testnet.arc.network` | your Sepolia RPC |
| Explorer | `https://testnet.arcscan.app` | etherscan |
| USDC (6-dec ERC-20 collateral) | `0x3600000000000000000000000000000000000000` | — |
| CCIP Router | `0xdE4E7FED43FAC37EB21aA0643d9852f75332eab8` | `0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59` |
| CCIP chain selector | `3034092155422581607` | `16015286601757825753` |

CCIP fee tokens on Arc: USDC (native gas), WUSDC, LINK. The Sepolia→Arc lane is live (OnRamp v1.6.0). **There is no USDe/USD Chainlink feed on Sepolia** — for the relayed market either point `SOURCE_FEED` at a real existing Sepolia feed to prove the mechanism (e.g. ETH/USD `0x694AA1769357215DE4FAC081bf1f309aDC325306`) or deploy a `MockV3Aggregator` on Sepolia as the USDe source.

```sh
# local (mocks auto-deployed)
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast --private-key $PK

# Arc testnet, demo market only (gas is USDC on Arc — fund the deployer accordingly)
forge script script/Deploy.s.sol --rpc-url https://rpc.testnet.arc.network --broadcast --private-key $PK

# Arc testnet, also deploy the CCIP-relayed market
CCIP_ROUTER=0xdE4E7FED43FAC37EB21aA0643d9852f75332eab8 \
forge script script/Deploy.s.sol --rpc-url https://rpc.testnet.arc.network --broadcast --private-key $PK
```

Then the sentinel on Sepolia (needs Sepolia ETH for gas + the CCIP fee), using the `RELAYED_FEED` from `deployments.json`:

```sh
SOURCE_FEED=0x694AA1769357215DE4FAC081bf1f309aDC325306 \
SOURCE_ROUTER=0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59 \
ARC_SELECTOR=3034092155422581607 \
RELAYED_FEED=0x<from_deployments> \
forge script script/DeploySentinel.s.sol --rpc-url $SEPOLIA_RPC --broadcast --private-key $PK

# then on Arc, authorize the sentinel (Sepolia selector):
#   cast send <RELAYED_FEED> "setSource(uint64,address)" 16015286601757825753 <sentinel> --rpc-url https://rpc.testnet.arc.network --private-key $PK
# then poke the relay (anyone, repeatedly):
#   cast send <sentinel> "relay()" --value $(cast call <sentinel> "quote()(uint256)" --rpc-url $SEPOLIA_RPC) --rpc-url $SEPOLIA_RPC --private-key $PK
```

`script/DemoSeed.s.sol` (anvil only) sets up the full demo scenario — see root README. The frontend handoff (ABIs, address wiring, the order-book↔UI mapping) lives in `../frontend-integration/`.

## Design decisions & known limitations

- **`evm_version = paris`** — avoids PUSH0/transient storage so the bytecode runs on any EVM chain regardless of how current its hardfork support is. Cheap insurance for a chain we haven't deployed to yet.
- **Single-phase feed assumption** — `settleDepeg` walks `roundId + 1`, which is gapless within one aggregator phase (and in our mock). Chainlink *proxy* feeds bump the phase on aggregator upgrades (rare); a breach window spanning a phase change would need proxy-aware walking. Fine for the hackathon; flag honestly if asked.
- **CCIP delivery ordering** — `RelayedFeed` dedupes by messageId and enforces strictly-increasing source round ids with non-decreasing timestamps, so replays and out-of-order *older* messages revert. The one residual edge is a reordered delivery where a later-timestamp message lands before an earlier recovery, which would drop that recovery round; we rely on CCIP delivering a single lane's messages from one sentinel in order. Buffering/reordering is the production fix. Surfaced by the adversarial review; low-risk for the single sequential sender here.
- **Round-walk gas** — proving a 1h window on a feed updating every ~10s touches ~360 rounds (~2M gas). Fine on a testnet; pagination (`settleDepegPartial`) is the known fix at scale.
- **Trusted, USDC-like collateral** — return values are checked, but fee-on-transfer/rebasing tokens are out of scope by design (collateral is USDC, fixed per factory).
- **`openOrders()` is O(n)** — a free view for demo-scale books; an indexer takes over at real scale.
- **No fees, no yield routing in v1** — both are additive: a fee is a bps skim in `fillOrder`/`redeem`; yield is an adapter the idle set collateral gets parked in (productive-ratio per market). Neither changes the market/settlement core, which is why they're deferred.
- **No oracle staleness checks on trading** — trading needs no oracle at all; the feed is only read at settlement, where staleness is precisely the thing being reasoned about (feed silence = price persistence). Deliberate, not an oversight.
