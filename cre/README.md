# Canary Watchtower — Chainlink CRE workflow

A [Chainlink Runtime Environment](https://docs.chain.link/cre) workflow that autonomously watches the USDe price on a cron schedule (DON consensus) and, on a provable depeg, fires settlement itself — no keeper, no human. It completes the Chainlink stack to **three products used non-trivially**: Data Feeds (round-history settlement proof) + CCIP (cross-chain feed relay) + **CRE** (autonomous monitor → settle).

```
cron → CRE reads USDe feed (DON consensus) → depeg? → DON-signed report
     → Keystone Forwarder → CanaryReportReceiver.onReport → market.settleDepeg
```

## Good news from the research: Arc is fully supported

- **Arc is a first-class CRE read+write target** — `chainSelectorName: "arc-testnet"` (chainId 5042002, selector 3034092155422581607), in the `chain-selectors` catalog.
- **Keystone Forwarder on Arc:** production `0x76c9cf548b4179F8901cda1f8623568b58215E62`; simulation `0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1` (for `cre workflow simulate --broadcast`).
- Requirements: CRE CLI ≥ v1.0.7, TS SDK ≥ v1.3.1 (we use v1.11).

## Deployed (Arc testnet)

- **CanaryReportReceiver:** `0x17a6aC04372a6A0be1d99D7962bA837C217bca8f` — verifies the Forwarder and relays the report into `settleDepeg`. Wired to the **simulation** Forwarder + the demo market `0x054D…3b3F` (for the local-sim demo; for a real DON deploy, redeploy it pointing at the production Forwarder). Contract + tests: `contracts/src/cre/CanaryReportReceiver.sol`, 4 tests passing.

## Setup (your machine — verified June 2026)

```bash
curl -sSL https://app.chain.link/cre/install.sh | bash    # installs CRE CLI (v1.18) to ~/.cre
xattr -c $HOME/.cre/cre                                   # macOS only, if Gatekeeper blocks
cre version && cre login                                  # auth
curl -fsSL https://bun.sh/install | bash                  # bun (TS runtime)
cre init                                                  # name it, choose TypeScript
# copy cre/workflow.ts + cre/config.json into the project, then:
bun add @chainlink/cre-sdk zod viem
```

## Run it (local simulation = the demo path)

```bash
cre workflow simulate --target local-simulation --config config.json workflow.ts
# add --broadcast to actually send the settlement report on a funded wallet
```

This reads the live Arc demo feed every minute and logs `peg ok` / `DEPEG`. Crash the demo feed (`MockV3Aggregator.updateAnswer(85000000)`) and the workflow reports the breach → the receiver fires `settleDepeg`. Local simulation makes **real onchain reads** and (with `--broadcast`) **real writes** — no DON needed.

## Demo path vs DON deploy

- **Local simulation is the realistic hackathon surface** (and what judging usually wants): real chain calls, no gating.
- **DON deployment is gated** — it needs Early Access (`cre account access`) and registers the workflow on a Workflow Registry (Sepolia testnet tx). Not guaranteed self-serve in a weekend, so we demo on local simulation.

## Validate in your env

`workflow.ts` uses the verified `cre-sdk` v1.11 API (Runner/handler/CronCapability/EVMClient). The one thing to confirm in `cre workflow simulate` is the exact `prepareReportRequest` → `writeReport` report encoding (it can be version-specific); the receiver expects `abi.encode(uint80 roundId)`.
