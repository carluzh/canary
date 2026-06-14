#!/usr/bin/env bash
#
# settle-demo.sh : trigger the USDe depeg on the demo market, off-app, via cast.
#
# What this does (the settlement recipe, end to end):
#   1. Crash the operator-controllable demo feed below the depeg threshold.
#   2. Capture the round id of that first below-threshold answer (startRoundId).
#   3. Push a SECOND below-threshold answer dated PAST the breach-window end, so
#      settleDepeg's gapless round-walk sees a round at/after windowEnd and
#      terminates immediately. This is the "instant" path: no 900s wall-clock wait.
#      (Documented fallback: skip step 3 and sleep 900s of real time instead.)
#   4. Call settleDepeg(startRoundId). State flips Open(0) -> TriggeredYes(1).
#   5. Print the new state and tell the operator to Redeem in-app.
#
# WHY this works (see contracts/src/CanaryMarket.sol settleDepeg):
#   The market proves "price < threshold sustained for breachWindow seconds".
#   Between feed updates the price IS the last posted answer, so two consecutive
#   below-threshold rounds whose timestamps straddle the window prove a
#   continuous breach. The walk:
#       windowEnd = startUpdatedAt + breachWindow
#       for each round r+1: if it doesn't exist AND block.timestamp < windowEnd -> revert BreachWindowNotElapsed
#                           if its updatedAt >= windowEnd -> DONE (window covered)
#                           if its answer >= threshold     -> revert BreachInterrupted (recovery)
#   So a single extra below-threshold round timestamped >= windowEnd ends the
#   walk on the first iteration, regardless of wall-clock time.
#
# The demo feed is a MockV3Aggregator (8-dec). Its surface:
#   updateAnswer(int256)               -> push a round at the current block time
#   updateAnswerAt(int256, uint256)    -> push a round at an explicit timestamp
#   latestRound() (uint80)             -> the most recent round id
#   getRoundData(uint80)               -> (roundId, answer, startedAt, updatedAt, answeredInRound)
#
# Threshold is 0.95e8 (=$0.95). Crash price defaults to 0.94e8 (=$0.94), which is
# below threshold so PriceNotBelowThreshold cannot trigger.
#
# Guarded reverts:
#   PriceNotBelowThreshold  -> CRASH_PRICE must be strictly < THRESHOLD (checked below).
#   BreachInterrupted       -> never push an answer >= THRESHOLD between start and windowEnd.
#   BreachWindowNotElapsed  -> handled by the instant second-round-past-windowEnd push.
#
# Usage:
#   PRIVATE_KEY=0x<demo operator / feed owner key> ./scripts/settle-demo.sh
#
# Optional overrides (all have sane defaults for the live Arc deployment):
#   RPC_URL, DEMO_FEED, DEMO_MARKET, THRESHOLD, CRASH_PRICE, WAIT_REAL_TIME=1
#
# Requires: Foundry (`cast`), and a funded operator key (gas on Arc is USDC).

set -euo pipefail

# ---------------------------------------------------------------- parameters
RPC_URL="${RPC_URL:-https://rpc.testnet.arc.network}"
DEMO_FEED="${DEMO_FEED:-0xFB372fC78B0088Fef05cecE85bEFBCa546Cd059e}"
DEMO_MARKET="${DEMO_MARKET:-0x054DD5CFC211542b9A6AEf563482D4EC441F3b3F}"
THRESHOLD="${THRESHOLD:-95000000}"     # 0.95e8, the depeg threshold (8-dec)
CRASH_PRICE="${CRASH_PRICE:-94000000}" # 0.94e8, below threshold
WAIT_REAL_TIME="${WAIT_REAL_TIME:-0}"  # set to 1 to use the 900s wall-clock fallback

: "${PRIVATE_KEY:?Set PRIVATE_KEY to the demo operator / feed owner private key}"

echo "==> canary depeg settlement"
echo "    RPC_URL     = $RPC_URL"
echo "    DEMO_FEED   = $DEMO_FEED"
echo "    DEMO_MARKET = $DEMO_MARKET"
echo "    THRESHOLD   = $THRESHOLD"
echo "    CRASH_PRICE = $CRASH_PRICE"
echo

# Guard PriceNotBelowThreshold up front: crash price must be strictly below threshold.
if [ "$CRASH_PRICE" -ge "$THRESHOLD" ]; then
  echo "ERROR: CRASH_PRICE ($CRASH_PRICE) must be strictly below THRESHOLD ($THRESHOLD)." >&2
  echo "       settleDepeg would revert with PriceNotBelowThreshold." >&2
  exit 1
fi

cast_send() { cast send --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" "$@"; }
cast_call() { cast call --rpc-url "$RPC_URL" "$@"; }

# --------------------------------------------------- 0. read market config
# Pull breachWindow straight from the market so the instant-path timestamp math
# is correct even if the demo market is re-deployed with a different window.
# marketInfo() returns:
#   (state, collateral, priceFeed, depegThreshold, breachWindow, expiry,
#    settlementGrace, yesSupply, noSupply, description)
echo "==> reading market config (marketInfo)"
BREACH_WINDOW=$(cast_call "$DEMO_MARKET" \
  "marketInfo()(uint8,address,address,int256,uint64,uint64,uint64,uint256,uint256,string)" \
  | sed -n '5p')
BREACH_WINDOW="${BREACH_WINDOW%% *}" # strip any trailing annotation
echo "    breachWindow = ${BREACH_WINDOW}s"
echo

# --------------------------------------------------- 1. crash the feed
# updateAnswer pushes a new round at the CURRENT block timestamp with the crash
# price. This becomes the first below-threshold round (our startRoundId).
echo "==> [1/4] crashing feed: updateAnswer($CRASH_PRICE)  (USDe -> \$$(echo "scale=4; $CRASH_PRICE/100000000" | bc 2>/dev/null || echo "$CRASH_PRICE/1e8"))"
cast_send "$DEMO_FEED" "updateAnswer(int256)" "$CRASH_PRICE" >/dev/null
echo "    done."
echo

# --------------------------------------------------- 2. capture startRoundId
# latestRound() is the round we just pushed: the start of the breach.
echo "==> [2/4] reading startRoundId (latestRound)"
START_ROUND=$(cast_call "$DEMO_FEED" "latestRound()(uint80)")
START_ROUND="${START_ROUND%% *}"
echo "    startRoundId = $START_ROUND"

# Read that round's updatedAt so we can compute windowEnd precisely.
# getRoundData returns (roundId, answer, startedAt, updatedAt, answeredInRound).
START_UPDATED_AT=$(cast_call "$DEMO_FEED" \
  "getRoundData(uint80)(uint80,int256,uint256,uint256,uint80)" "$START_ROUND" \
  | sed -n '4p')
START_UPDATED_AT="${START_UPDATED_AT%% *}"
WINDOW_END=$(( START_UPDATED_AT + BREACH_WINDOW ))
echo "    startUpdatedAt = $START_UPDATED_AT, windowEnd = $WINDOW_END"
echo

# --------------------------------------------------- 3. cover the breach window
if [ "$WAIT_REAL_TIME" = "1" ]; then
  # Fallback path: leave the feed silent and wait out breachWindow in real time.
  # settleDepeg then completes because: next round doesn't exist AND
  # block.timestamp >= windowEnd, so the walk breaks without BreachWindowNotElapsed.
  WAIT_SECS=$(( BREACH_WINDOW + 5 ))
  echo "==> [3/4] FALLBACK: waiting ${WAIT_SECS}s of real wall-clock for the breach window to elapse"
  echo "    (no second round pushed; settleDepeg breaks once block.timestamp >= windowEnd)"
  sleep "$WAIT_SECS"
  echo "    window elapsed."
else
  # Instant path: push a SECOND below-threshold round dated just past windowEnd.
  # settleDepeg's walk sees round (start+1) with updatedAt >= windowEnd on its
  # first iteration and breaks immediately, proving a gapless sub-threshold span
  # across the entire window without waiting. The answer stays below threshold so
  # BreachInterrupted cannot fire.
  PAST_END=$(( WINDOW_END + 1 ))
  echo "==> [3/4] INSTANT: updateAnswerAt($CRASH_PRICE, $PAST_END)  (second sub-threshold round dated past windowEnd)"
  cast_send "$DEMO_FEED" "updateAnswerAt(int256,uint256)" "$CRASH_PRICE" "$PAST_END" >/dev/null
  echo "    done. Round-walk will terminate on the first step."
fi
echo

# --------------------------------------------------- 4. settle
# settleDepeg(startRoundId) is permissionless. It walks from startRoundId,
# confirms the sustained breach, and flips state to TriggeredYes(1).
echo "==> [4/4] settleDepeg($START_ROUND)"
cast_send "$DEMO_MARKET" "settleDepeg(uint80)" "$START_ROUND" >/dev/null
echo "    done."
echo

# --------------------------------------------------- result
NEW_STATE=$(cast_call "$DEMO_MARKET" "state()(uint8)")
NEW_STATE="${NEW_STATE%% *}"
echo "==> market state() = $NEW_STATE"
case "$NEW_STATE" in
  0) echo "    State.Open: settlement did NOT take. Check the reverts above." ;;
  1) echo "    State.TriggeredYes: DEPEG PROVEN. YES pays \$1, NO pays \$0." ;;
  2) echo "    State.ExpiredNo: market expired without a proven depeg." ;;
  *) echo "    unknown state." ;;
esac
echo
echo "==> Next: in the app, click REDEEM on the USDe market to collect the 1:1"
echo "    USDC payout on your YES (coverage) balance. (The redeemer must already"
echo "    hold free YES, buy cover first if you have not.)"
