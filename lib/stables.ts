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
  { symbol: "USDS", name: "Sky Dollar", color: "#FFC93F", logo: "/tokens/usds.png", address: "0xdC035D45d973E3EC169d2276DDab16f1e407384F", decimals: 18, marketcap: 8_446_338_295, capacityTotal: 3_200_000, capacityUsed: 1_400_000, coverCost: 0.03 },
  { symbol: "USDe", name: "Ethena USDe", color: "#2D2D2D", logo: "/tokens/usde.png", address: "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3", decimals: 18, marketcap: 4_484_656_532, capacityTotal: 4_500_000, capacityUsed: 3_800_000, coverCost: 0.05 },
  { symbol: "DAI", name: "Dai", color: "#F5AC37", logo: "/tokens/dai.png", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18, marketcap: 4_407_695_181, capacityTotal: 5_000_000, capacityUsed: 2_100_000, coverCost: 0.022 },
  { symbol: "USD1", name: "World Liberty Financial USD", color: "#C0A062", logo: "/tokens/usd1.png", address: "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d", decimals: 18, marketcap: 4_361_864_172, capacityTotal: 1_800_000, capacityUsed: 900_000, coverCost: 0.045 },
  { symbol: "BUIDL", name: "BlackRock USD", color: "#1A1A1A", logo: "/tokens/buidl.png", address: "0x7712c34205737192402172409a8F7ccef8aA2AEc", decimals: 6, marketcap: 3_025_912_949, capacityTotal: 2_500_000, capacityUsed: 600_000, coverCost: 0.015 },
  { symbol: "USYC", name: "Circle USYC", color: "#0A2A66", logo: "/tokens/usyc.png", address: "0x136471a34f6ef19fE571EFFC1CA711fdb8E49f2b", decimals: 6, marketcap: 3_011_968_984, capacityTotal: 2_200_000, capacityUsed: 800_000, coverCost: 0.016 },
  { symbol: "PYUSD", name: "PayPal USD", color: "#0070BA", logo: "/tokens/pyusd.png", address: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8", decimals: 6, marketcap: 2_766_487_579, capacityTotal: 1_500_000, capacityUsed: 1_100_000, coverCost: 0.028 },
  { symbol: "USDG", name: "Global Dollar", color: "#0F62FE", logo: "/tokens/usdg.png", address: "0xe343167631d89B6Ffc58B88d6b7fB0228795491D", decimals: 6, marketcap: 2_604_387_508, capacityTotal: 1_200_000, capacityUsed: 400_000, coverCost: 0.035 },
  { symbol: "USDY", name: "Ondo US Dollar Yield", color: "#11233F", logo: "/tokens/usdy.png", address: "0x96F6eF951840721AdBF46Ac996b59E0235CB985C", decimals: 18, marketcap: 2_148_947_174, capacityTotal: 1_000_000, capacityUsed: 700_000, coverCost: 0.04 },
];

export function getStable(symbol: string): Stable | undefined {
  return STABLES.find((s) => s.symbol.toLowerCase() === symbol.toLowerCase());
}
