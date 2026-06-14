# Live deployments

Deployed and seeded on testnet. Deployer: `0xb135A894e1fb22f12AE375E5A2127171547dB075`.

## Arc Testnet (chainId 5042002)

| Contract | Address |
|---|---|
| USDC (collateral, 6-dec ERC-20) | `0x3600000000000000000000000000000000000000` |
| CanaryMarketFactory | `0xab248128e5a5C37a9b2fbe38798a553FAEC62250` |
| Demo feed (operator-controllable) | `0xFB372fC78B0088Fef05cecE85bEFBCa546Cd059e` |
| Demo market — "USDe < $0.95 for 15m" | `0x054DD5CFC211542b9A6AEf563482D4EC441F3b3F` |
| RelayedFeed (USDe/USD via CCIP) | `0xA795Baa9E4300EA015B094D14E152f123Edc94ad` |
| Relayed market — "USDe < $0.95 for 1h (live Chainlink via CCIP)" | `0x15e536171034089B4114B3a85fDb8Eddf3Df8422` |

Both markets are seeded with an underwriter ask: demo market YES @ **$0.015 (1.5% implied depeg probability)**, relayed market YES @ **$0.02 (2%)** — a realistic low-single-digit USDe tail with a slight term structure (the 30-day relayed market prices marginally above the 7-day demo market).

## Arc Testnet — self-funding yield market

| Contract | Address |
|---|---|
| MockYieldVault (asset = USDC) | `0xD55835F9a5b479De306f94EF3301A1E16E935920` |
| CanaryMarketFactory (yield-enabled build) | `0xf7C7Bfb584356550E85e568E281C0AA0758A4AA7` |
| Yield market — "USDe < $0.95 (self-funding)" | `0x5E6caB3f8b12A735a84b6241CA413D06a2D39fd1` |

Config: 0% protocol fee (testnet), **30% of net yield rebated to coverage buyers**, 70% to underwriters; 100% of collateral deployed to the venue (no idle buffer). **Verified live on Arc:** a buyer paid a 40,000 (=$0.04) premium, $1.00 of yield was harvested and split exactly 300,000 / 700,000 (30/70), and the buyer claimed their 300,000 rebate — netting a **profit while still holding the cover** ("the float pays the premium"). In production the vault is USYC (T-bill yield, independent of the insured USDe risk) or an Aave-USDC 4626.

## Ethereum Sepolia (CCIP relay source)

| Contract | Address |
|---|---|
| Mock USDe/USD source feed (8-dec) | `0xab248128e5a5C37a9b2fbe38798a553FAEC62250` |
| DepegSentinel | `0xFB372fC78B0088Fef05cecE85bEFBCa546Cd059e` |

## CCIP wiring

- Lane: Sepolia (selector `16015286601757825753`) → Arc (selector `3034092155422581607`), OnRamp v1.6.0.
- `RelayedFeed.setSource` is wired to the Sentinel. First price ($1.00) relayed; CCIP delivery to Arc takes a few minutes, after which `RelayedFeed.latestRound()` increments and the relayed market settles permissionlessly off real-cross-chain Chainlink data.
- To push a new price: on Sepolia, `MockV3Aggregator.updateAnswer(<price>)` then `DepegSentinel.relay()` (value ≥ `quote()`). In production the sentinel points at the real **mainnet** USDe/USD feed instead of the mock — only `SOURCE_FEED` changes.

> Note: the Sepolia source feed is a mock because **no USDe/USD Chainlink feed exists on any testnet** (the real one is mainnet-only) and Arc's CCIP lanes are testnet-only. The relay transport is real Chainlink CCIP end to end.
