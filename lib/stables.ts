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
  // DeFi-native stablecoins
  { symbol: "GHO", name: "Aave GHO", color: "#B6509E", logo: "/tokens/gho.png", address: "0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f", decimals: 18, marketcap: 598_514_685, capacityTotal: 1_200_000, capacityUsed: 520_000, coverCost: 0.03 },
  { symbol: "USD0", name: "Usual USD", color: "#1B4DFF", logo: "/tokens/usd0.png", address: "0x73A15FeD60Bf67631dC6cd7Bc5B6e8da8190aCF5", decimals: 18, marketcap: 552_861_607, capacityTotal: 1_100_000, capacityUsed: 500_000, coverCost: 0.03 },
  { symbol: "crvUSD", name: "Curve USD", color: "#0F3D2E", logo: "/tokens/crvusd.png", address: "0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E", decimals: 18, marketcap: 208_467_888, capacityTotal: 900_000, capacityUsed: 380_000, coverCost: 0.028 },
  { symbol: "FRAX", name: "Frax", color: "#1A1A1A", logo: "/tokens/frax.png", address: "0x853d955aCEf822Db058eb8505911ED77F175b99e", decimals: 18, marketcap: 196_374_363, capacityTotal: 1_000_000, capacityUsed: 600_000, coverCost: 0.025 },
  { symbol: "frxUSD", name: "Frax USD", color: "#1A1A1A", logo: "/tokens/frxusd.png", address: "0xCAcd6fd266aF91b8AeD52aCCc382b4e165586E29", decimals: 18, marketcap: 123_651_249, capacityTotal: 700_000, capacityUsed: 300_000, coverCost: 0.03 },
  { symbol: "DOLA", name: "Inverse DOLA", color: "#41D1B7", logo: "/tokens/dola.png", address: "0x865377367054516e17014CcdED1e7d814EDC9ce4", decimals: 18, marketcap: 90_020_025, capacityTotal: 500_000, capacityUsed: 200_000, coverCost: 0.03 },
  { symbol: "fxUSD", name: "f(x) fxUSD", color: "#3B82F6", logo: "/tokens/fxusd.png", address: "0x085780639CC2cACd35E474e71f4d000e2405d8f6", decimals: 18, marketcap: 50_679_117, capacityTotal: 450_000, capacityUsed: 180_000, coverCost: 0.04 },
  { symbol: "BOLD", name: "Liquity BOLD", color: "#745DDF", logo: "/tokens/bold.png", address: "0x6440f144b7e50D6a8439336510312d2F54beB01D", decimals: 18, marketcap: 31_091_060, capacityTotal: 420_000, capacityUsed: 150_000, coverCost: 0.035 },
  { symbol: "LUSD", name: "Liquity USD", color: "#745DDF", logo: "/tokens/lusd.png", address: "0x5f98805A4E8be255a32880FDeC7F6728C6568bA0", decimals: 18, marketcap: 28_078_313, capacityTotal: 520_000, capacityUsed: 210_000, coverCost: 0.022 },
  { symbol: "deUSD", name: "Elixir deUSD", color: "#5A4FF5", logo: "/tokens/deusd.png", address: "0x15700B564Ca08D9439C58cA5053166E8317aa138", decimals: 18, marketcap: 12_000_000, capacityTotal: 600_000, capacityUsed: 250_000, coverCost: 0.045 },
  { symbol: "sUSD", name: "Synthetix sUSD", color: "#00D1FF", logo: "/tokens/susd.png", address: "0x57Ab1ec28D129707052df4dF418D58a2D46d5f51", decimals: 18, marketcap: 6_155_803, capacityTotal: 300_000, capacityUsed: 110_000, coverCost: 0.04 },
  { symbol: "USR", name: "Resolv USR", color: "#1A1A1A", logo: "/tokens/usr.png", address: "0x66a1E37c9b0eAddca17d3662D6c05F4DECf3e110", decimals: 18, marketcap: 1_384_131, capacityTotal: 350_000, capacityUsed: 120_000, coverCost: 0.05 },
];

export function getStable(symbol: string): Stable | undefined {
  return STABLES.find((s) => s.symbol.toLowerCase() === symbol.toLowerCase());
}
