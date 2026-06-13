// Top USD-pegged stablecoins by market cap (excluding USDC), pulled from
// DefiLlama. Mainnet addresses/decimals drive real wallet-balance reads;
// capacity figures are mock underwriting pools for the demo.

export type Stable = {
  symbol: string;
  name: string;
  color: string; // brand hex
  logo: string | null; // /tokens/<symbol>.png
  address: `0x${string}` | null; // Ethereum mainnet ERC-20
  decimals: number;
  marketcap: number;
  capacityTotal: number; // $ underwriting capacity (mock)
  capacityUsed: number; // $ currently covered (mock)
  coverCost: number; // premium, 0..1 (mock)
};

export const STABLES: Stable[] = [
  { symbol: "USDT", name: "Tether", color: "#26A17B", logo: "/tokens/usdt.png", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6, marketcap: 186_439_126_469, capacityTotal: 8_000_000, capacityUsed: 5_900_000, coverCost: 0.018 },
  { symbol: "USDS", name: "Sky Dollar", color: "#FCA848", logo: "/tokens/usds.png", address: "0xdC035D45d973E3EC169d2276DDab16f1e407384F", decimals: 18, marketcap: 8_446_338_295, capacityTotal: 3_200_000, capacityUsed: 1_400_000, coverCost: 0.03 },
  { symbol: "USDe", name: "Ethena USDe", color: "#2D2D2D", logo: "/tokens/usde.png", address: "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3", decimals: 18, marketcap: 4_484_656_532, capacityTotal: 4_500_000, capacityUsed: 3_800_000, coverCost: 0.05 },
  { symbol: "DAI", name: "Dai", color: "#F5AC37", logo: "/tokens/dai.png", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18, marketcap: 4_407_695_181, capacityTotal: 5_000_000, capacityUsed: 2_100_000, coverCost: 0.022 },
  { symbol: "USD1", name: "World Liberty Financial USD", color: "#EAAC08", logo: "/tokens/usd1.png", address: "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d", decimals: 18, marketcap: 4_361_864_172, capacityTotal: 1_800_000, capacityUsed: 900_000, coverCost: 0.045 },
  { symbol: "USDG", name: "Global Dollar", color: "#C7E36C", logo: "/tokens/usdg.png", address: "0xe343167631d89B6Ffc58B88d6b7fB0228795491D", decimals: 6, marketcap: 2_604_387_508, capacityTotal: 1_200_000, capacityUsed: 400_000, coverCost: 0.035 },
  // DeFi-native stablecoins
  { symbol: "GHO", name: "Aave GHO", color: "#28D358", logo: "/tokens/gho.png", address: "0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f", decimals: 18, marketcap: 598_514_685, capacityTotal: 1_200_000, capacityUsed: 520_000, coverCost: 0.03 },
  { symbol: "USD0", name: "Usual USD", color: "#05D74A", logo: "/tokens/usd0.png", address: "0x73A15FeD60Bf67631dC6cd7Bc5B6e8da8190aCF5", decimals: 18, marketcap: 552_861_607, capacityTotal: 1_100_000, capacityUsed: 500_000, coverCost: 0.03 },
  { symbol: "crvUSD", name: "Curve USD", color: "#167D4A", logo: "/tokens/crvusd.png", address: "0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E", decimals: 18, marketcap: 208_467_888, capacityTotal: 900_000, capacityUsed: 380_000, coverCost: 0.028 },
  { symbol: "BOLD", name: "Liquity BOLD", color: "#63D77D", logo: "/tokens/bold.png", address: "0x6440f144b7e50D6a8439336510312d2F54beB01D", decimals: 18, marketcap: 31_091_060, capacityTotal: 420_000, capacityUsed: 150_000, coverCost: 0.035 },
];
