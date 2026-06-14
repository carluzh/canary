# Canary: on-camera demo runbook

Onchain parametric insurance on stablecoin depegs, settled permissionlessly off a
Chainlink price feed, with instant-native USDC deposits via Blink and a
self-funding yield layer. One market (USDe) is fully live on Arc testnet; the rest
are cosmetic view-only exhibits.

This is the script for the pitch. Follow it top to bottom.

---

## What you are showing

```
  User
   │  buy cover / underwrite (USDC)
   ▼
  Blink instant native deposit ──► CanaryMarket on Arc (chainId 5042002)
                                      │   complete sets + limit order book
                                      │   100% idle collateral rehypothecated
                                      ▼
                                  Yield vault (USYC-style)  ── streams yield to
                                      │                        underwriters + a
                                      ▼                        rebate to buyers
                                  Chainlink price feed (USDe/USD)
                                      │   price < $0.95 sustained 15m?
                                      ▼
                                  settleDepeg  ──►  TriggeredYes
                                      │
                                      ▼
                                  Redeem: YES pays $1, NO pays $0
```

Insurance mapping: coverage buyer = buys YES (pays a premium). Underwriter =
mints a complete set and sells YES, keeping NO (earns the premium plus yield on
the idle collateral). Depeg proven on-chain -> YES redeems $1. No depeg by
expiry -> NO redeems $1 and the underwriter keeps the premium.

---

## Live addresses (Arc testnet, chainId 5042002)

| Role | Address |
|---|---|
| USDC (6-dec collateral, also the native gas token) | `0x3600000000000000000000000000000000000000` |
| Demo market (USDe < $0.95 for 15m), BUY COVER target | `0x054DD5CFC211542b9A6AEf563482D4EC441F3b3F` |
| Demo feed (operator-controllable, 8-dec) | `0xFB372fC78B0088Fef05cecE85bEFBCa546Cd059e` |
| Yield market (self-funding), UNDERWRITE target | `0x5E6caB3f8b12A735a84b6241CA413D06a2D39fd1` |
| Yield vault (USYC-style, asset = USDC) | `0xD55835F9a5b479De306f94EF3301A1E16E935920` |
| Relayed market (live Chainlink via CCIP), VIEW ONLY | `0xe4B514eb25d2F989CD9896960Bc0338B34Fab0B4` |

- RPC: `https://rpc.testnet.arc.network`
- Explorer: `https://testnet.arcscan.app`

---

## Prerequisites

1. **MetaMask** with the Arc testnet network added (chainId 5042002, RPC
   `https://rpc.testnet.arc.network`, explorer `https://testnet.arcscan.app`).
2. **Test USDC from the faucet**: go to `faucet.circle.com`, pick **Arc Testnet**,
   and claim ~10 test USDC to your wallet. On Arc, USDC is BOTH the 6-decimal
   collateral AND the native gas token, so this single faucet drip covers premiums
   and gas. You do not need a separate gas token.
3. **The demo operator key** (the feed owner) available in a terminal as
   `PRIVATE_KEY`, and **Foundry** (`cast`) installed, for the settlement step.
4. App running and pointed at the live addresses above.

Keep cover small: the demo market book has exactly **one fillable ask: 5 shares @
$0.015 (1.5% implied depeg probability)**. Keep your cover purchase **<= $5** of
shares so it fills against that ask.

---

## The flow (on camera)

### 1. Connect
Connect MetaMask to the app on Arc testnet. Show the USDC balance from the faucet.

### 2. Buy cover on USDe (via Blink)
Open the USDe market in **Simple** mode and buy cover. This routes the USDC
through the **Blink instant-native-deposit** seam and fills the seeded 5-share ask
at $0.015. You now hold free YES (your coverage position).

Talking point: the price you paid IS the market-implied probability of a depeg.
The order book is the risk curve.

### 3. Underwrite on the yield market (via Blink)
Switch to **Expert** mode and underwrite on the **yield market**. This does
`mintSets` then sells YES (`placeOrder(isYes=true, isBuy=false, ...)`), so you keep
NO and post an ask. The idle collateral is 100% rehypothecated into the yield
vault, so it earns while it sits.

Talking point ("the float pays the premium"): this is verified live on Arc. A
buyer paid a $0.04 premium, $1.00 of yield was harvested and split 30% to the
buyer / 70% to the underwriter, and the buyer **claimed a rebate larger than the
premium, netting a profit while still holding the cover**. For deep-tail,
long-dated cover the cover funds itself.

Yield reads (`totalCollateralValue`, `pendingYield`, `claimableYield`) only work
on the yield market. They revert on the plain demo market, so the UI gates them.

### 4. Trigger the depeg (off-app, via cast)
In a terminal with the operator key, run:

```sh
PRIVATE_KEY=0x<demo operator key> ./scripts/settle-demo.sh
```

This crashes the demo feed to $0.94 (below the $0.95 threshold), pushes a second
sub-threshold round dated past the 15-minute breach window so the proof completes
**instantly** (no 900-second wall-clock wait), then calls `settleDepeg`. It prints
the new state (you want **`State.TriggeredYes (1)`**) and reminds you to redeem.

The script is the only off-app step. Settlement itself is **permissionless**: the
operator only controls the feed price, not the outcome logic. Anyone can call
`settleDepeg` once the feed history proves the breach.

### 5. Redeem in-app
Back in the app, the USDe market now shows resolved / TriggeredYes. Click
**Redeem**. Your YES pays out 1:1 in USDC. End of loop.

---

## Bounty talking points

**Arc, "Best Prediction Markets / real-world signal":**
- The YES price is a continuously-quoted, on-chain implied probability of a real
  stablecoin depeg, a live risk signal, not a guess.
- Settlement is **machine-verifiable and permissionless**: `settleDepeg` walks the
  Chainlink feed's on-chain round history and proves "price < threshold sustained
  for the breach window". No human resolver, no keeper, no trusted oracle committee.
- Fully collateralized complete sets (Polymarket/Gnosis CTF style): every market is
  its own address holding its own collateral, so payouts are always solvent.

**Blink, "instant native deposit":**
- Buying cover and underwriting both deposit USDC through the Blink seam. The user
  funds an onchain position in one instant native USDC action, no bridging, no
  wrapping, no separate gas token (USDC is gas on Arc).
- The deposit lands directly as collateral in the CanaryMarket, which immediately
  rehypothecates it into the yield vault, so the deposited capital starts earning
  the moment it arrives.

---

## Known gotchas

- **Tiny book.** The demo market has exactly one fillable ask: 5 shares @ $0.015.
  Keep cover **<= $5** of shares or the fill will exceed the book. The yield market
  book is empty today (you create the ask when you underwrite).
- **Redeemer must hold free YES.** `redeem` pays out your YES balance. **Buy cover
  before settling**, and do not leave that YES resting in a sell order (tokens in
  open orders must be `cancelOrder`'d back first).
- **Yield views are market-scoped.** `totalCollateralValue`, `pendingYield`,
  `claimableYield`, `yieldStrategy` REVERT on the plain demo market. Only call them
  on the yield market.
- **Relayed market is read-only.** The relayed market (`0xe4B5...`) is a
  live-Chainlink-via-CCIP credibility exhibit. Its feed has not delivered a round
  (`latestRound() == 0`), so it is **not** settleable and is not the settle path.
  Do not try to trigger or redeem it on camera.
- **Threshold guardrails.** In `settle-demo.sh`, `CRASH_PRICE` must be strictly
  below `THRESHOLD` (0.95e8) or `settleDepeg` reverts `PriceNotBelowThreshold`.
  Never push an answer at or above threshold between the start round and window end
  or it reverts `BreachInterrupted`. The instant second-round-past-windowEnd push
  avoids `BreachWindowNotElapsed`; the documented fallback is `WAIT_REAL_TIME=1`,
  which waits the full 900s instead.
- **Only render the curated market set.** Never iterate `factory.allMarkets()`. It
  returns resolved/test artifacts that must not appear in the UI.
