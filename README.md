# 🐤 Canary

**Parametric insurance markets for DeFi's failure modes — and the live risk curve they're built to produce.**

DeFi prices every asset but has no market for the price of things *going wrong*. Canary builds binary, fully-collateralized insurance markets on machine-verifiable disasters (starting with stablecoin depegs, e.g. "USDe < $0.95 for 1h"), settled automatically off Chainlink — no claims, no disputes, no humans. The prices across all markets are designed to form a live, market-implied **risk curve** for DeFi.

> Wall Street has the CDS curve. DeFi has vibes. We're fixing that.

## How a market works

- **Underwrite** — deposit USDC, mint a complete set (1 YES + 1 NO), sell the YES at your premium and keep the NO. Idle collateral is rehypothecated to earn yield, so cover can fund itself.
- **Buy cover** — buy YES. The price you pay is both the premium and the market-implied probability of the disaster.
- **Settle** — anyone proves the depeg from the Chainlink feed's on-chain round history (`settleDepeg`) → YES redeems $1. No depeg by expiry → NO redeems $1. Permissionless and automatic.

## Live on Arc testnet (chainId 5042002)

| Contract | Address |
|---|---|
| USDC (collateral) | `0x3600000000000000000000000000000000000000` |
| Factory | `0xab248128e5a5C37a9b2fbe38798a553FAEC62250` |
| Demo market | `0x054DD5CFC211542b9A6AEf563482D4EC441F3b3F` |
| Self-funding yield market | `0x5E6caB3f8b12A735a84b6241CA413D06a2D39fd1` |

Full address list in [`contracts/DEPLOYMENTS.md`](contracts/DEPLOYMENTS.md).

## Built with

- **Chainlink** — three products, used non-trivially: **Data Feeds** (settlement proves a sustained breach from the feed's round history), **CCIP** (relays the USDe feed cross-chain onto Arc), **CRE** (a workflow that autonomously watches the feed and fires settlement — proven live on Arc).
- **Arc** — USDC-collateralized markets; idle collateral rehypothecated into Arc-native USYC (T-bill yield) for capital efficiency and self-funding cover.
- **Blink** — native stablecoin deposit flow for buying cover and underwriting.

## Structure

```
app/ · components/ · lib/   Next.js frontend (risk-curve dashboard, trade panel, portfolio)
contracts/                  Foundry — order book + CCIP relay + self-funding yield (115 tests)
cre/                        Chainlink CRE watchtower (autonomous settlement)
frontend-integration/       ABIs, live addresses, and the order-book ↔ UI mapping
```

## Quickstart

```bash
npm install && npm run dev          # frontend
cd contracts && forge test          # contracts (115 tests)
# Chainlink CRE workflow: see cre/README.md
```
