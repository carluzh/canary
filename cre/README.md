# Canary Watchtower — Chainlink CRE workflow ✅ working

A [Chainlink Runtime Environment](https://docs.chain.link/cre) workflow that autonomously watches the USDe price on a cron schedule (DON consensus) and, on a provable depeg, **fires settlement itself** — no keeper, no human. Completes the Chainlink stack to three products used non-trivially: **Data Feeds** (round-history settlement proof) + **CCIP** (cross-chain feed relay) + **CRE** (autonomous monitor → settle).

```
cron → CRE reads USDe feed on Arc (DON consensus) → depeg? → DON-signed report
     → Keystone Forwarder → CanaryReportReceiver.onReport → market.settleDepeg
```

## Proven live on Arc

Ran end-to-end in `cre workflow simulate --broadcast` against Arc testnet:
- **Read:** `USDe/USD round 1 = 100000000 (threshold 95000000) -> peg ok` (live Arc feed read, DON consensus).
- **Settle:** crashed the feed to `$0.85` → workflow logged `DEPEG`, returned `{ breached: true, settled: true }`, and the target market flipped to **TriggeredYes** — autonomously, on-chain.

`main.ts` uses the verified `cre-sdk` v1.11 API; `CanaryReportReceiver` is deployed + tested on Arc (`contracts/src/cre/CanaryReportReceiver.sol`, 4 tests).

## Reproduce it (verified commands)

```bash
# tooling
curl -fsSL https://bun.sh/install | bash
curl -sSL https://app.chain.link/cre/install.sh | bash    # CRE CLI
xattr -c $HOME/.cre/bin/cre                                # macOS only
cre login

# scaffold + wire our workflow in
cre init --template hello-world-ts --project-name canary-cre --workflow-name watchtower
cp cre/main.ts canary-cre/watchtower/main.ts
cp cre/config.json canary-cre/watchtower/config.staging.json
cd canary-cre/watchtower && bun install && bun add viem && cd ..
```

Then:
- **project.yaml** — add Arc to `staging-settings.rpcs`:
  ```yaml
  - chain-name: arc-testnet
    url: ${ARC_RPC_URL}      # export ARC_RPC_URL=<your Arc RPC>
  ```
- **.env** — set `CRE_ETH_PRIVATE_KEY=<funded Arc key>` (for `--broadcast` writes).

Run:
```bash
# read-only (logs peg ok / DEPEG)
cre workflow simulate watchtower -T staging-settings --non-interactive --trigger-index 0
# full autonomous settlement (crash the feed first, then):
cre workflow simulate watchtower -T staging-settings --non-interactive --trigger-index 0 --broadcast
```

## Config (`config.json` → `config.staging.json`)

Points at the Arc demo feed + the deployed `CanaryReportReceiver`. The receiver is wired to the **simulation** Keystone Forwarder (`0x6E9E…5Edc1`) for `--broadcast`; for a real DON deploy, redeploy it against the **production** Forwarder (`0x76c9…5E62`).

## Demo path

**Local simulation is the surface** (real Arc reads/writes, no gating) — that's what we demo. DON deployment is Early-Access-gated (`cre account access`) and registers on a Sepolia Workflow Registry; not needed for judging.
