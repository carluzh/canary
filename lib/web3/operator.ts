// In-app OPERATOR web3 module. Signs admin/demo txs with a testnet throwaway key
// from process.env.NEXT_PUBLIC_OPERATOR_KEY — SEPARATE from the connected
// MetaMask presenter wallet. Used by the always-visible demo controls to (1)
// create a fresh USDe cover market and (2) crash its feed and auto-settle the
// depeg between back-to-back demos.
//
// Gas on Arc is native USDC, paid by the operator account.
import {
  createWalletClient,
  createPublicClient,
  http,
  parseEventLogs,
  type Abi,
  type WalletClient,
  type PublicClient,
  type Account,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "@/lib/web3/chains";
import {
  USDC_ADDRESS,
  MARKET_FACTORY_ADDRESS,
  DEMO_FEED_ADDRESS,
  YIELD_VAULT_ADDRESS,
} from "@/lib/contracts/addresses";
import {
  CANARY_MARKET_ABI,
  CANARY_FACTORY_ABI,
  ERC20_ABI,
  MarketState,
} from "@/lib/contracts/abi";

// ---- Demo constants -------------------------------------------------------
export const BREACH_WINDOW = 5n; // seconds; != 0 so it is a legal market
export const DEPEG_THRESHOLD = 95000000n; // 0.95e8 on the 8-dec feed
export const SEED_SHARES = 5_000000n; // 5 USDC minted (6-dec); covers both sides below (<=5 each). Small so the operator can run several demos per faucet claim.
// Seed a full two-sided book from the single mint. YES asks are cover supply
// (Buy YES fills them, cheapest first; best ask 1.5% = the displayed price). NO
// asks render as YES bids in the unified book at (1 - price) and are filled by
// Buy NO. Each side's amounts sum to 4.5 <= SEED_SHARES.
export const SEED_YES_ASKS: { price: bigint; amount: bigint }[] = [
  { price: 15000n, amount: 1_800000n }, // ask 1.5% (best)
  { price: 19000n, amount: 700000n }, // ask 1.9%
  { price: 27000n, amount: 2_000000n }, // ask 2.7%
];
export const SEED_NO_ASKS: { price: bigint; amount: bigint }[] = [
  { price: 987000n, amount: 1_100000n }, // shows as YES bid 1.3%
  { price: 990000n, amount: 2_300000n }, // shows as YES bid 1.0%
  { price: 996000n, amount: 900000n }, // shows as YES bid 0.4%
];
export const DEMO_EXPIRY_SECS = 604800; // 7 days, so a created demo market stays settleable for the whole event (1h was too short — markets expired mid-session)

const ONE_DOLLAR = 100000000n; // 1e8 (un-crashed feed)
const CRASH_098 = 98000000n; // 0.98e8 (visible dip, above threshold)
const CRASH_094 = 94000000n; // 0.94e8 (< 0.95 threshold -> breaching round)

// Minimal MockV3Aggregator interface — abis.json may lack it.
const FEED_ABI = [
  {
    type: "function",
    name: "updateAnswer",
    stateMutability: "nonpayable",
    inputs: [{ name: "_answer", type: "int256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "updateAnswerAt",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_answer", type: "int256" },
      { name: "_updatedAt", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "latestRound",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint80" }],
  },
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
  {
    type: "function",
    name: "getRoundData",
    stateMutability: "view",
    inputs: [{ name: "_roundId", type: "uint80" }],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const satisfies Abi;

// MockYieldVault: donate USDC to raise assets/share (demo yield injection).
const VAULT_ABI = [
  {
    type: "function",
    name: "simulateYield",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
] as const satisfies Abi;

// ---- Lazy operator account / clients --------------------------------------
let _account: Account | null | undefined; // undefined = not yet resolved
let _wallet: WalletClient | null = null;
let _public: PublicClient | null = null;

function resolveAccount(): Account | null {
  if (_account !== undefined) return _account;
  const key = process.env.NEXT_PUBLIC_OPERATOR_KEY;
  if (!key) {
    _account = null;
    return _account;
  }
  try {
    const normalized = (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`;
    _account = privateKeyToAccount(normalized);
  } catch {
    _account = null;
  }
  return _account;
}

function getAccount(): Account {
  const acct = resolveAccount();
  if (!acct) {
    throw new Error(
      "Operator wallet unavailable: set NEXT_PUBLIC_OPERATOR_KEY to a valid testnet private key.",
    );
  }
  return acct;
}

function getWallet(): WalletClient {
  if (_wallet) return _wallet;
  _wallet = createWalletClient({
    account: getAccount(),
    chain: arcTestnet,
    transport: http(),
  });
  return _wallet;
}

function getPublic(): PublicClient {
  if (_public) return _public;
  _public = createPublicClient({
    chain: arcTestnet,
    transport: http(),
  });
  return _public;
}

/** Operator key is present and parseable. */
export function hasOperator(): boolean {
  return resolveAccount() !== null;
}

/** The operator account address, or null if no usable key. */
export function operatorAddress(): `0x${string}` | null {
  return resolveAccount()?.address ?? null;
}

// ---- Helpers --------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send a write tx from the operator account and wait for its receipt. Throws a
 * clear Error (surfaced by the UI) if the tx reverts or never confirms.
 */
async function send(
  label: string,
  address: `0x${string}`,
  abi: Abi,
  functionName: string,
  args: readonly unknown[],
): Promise<Hash> {
  const wallet = getWallet();
  const pub = getPublic();
  let hash: Hash;
  try {
    hash = await wallet.writeContract({
      account: getAccount(),
      chain: arcTestnet,
      address,
      abi,
      functionName,
      args: args as never,
    });
  } catch (err) {
    throw new Error(`${label} failed to send: ${(err as Error).message}`);
  }
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`${label} reverted (tx ${hash}).`);
  }
  return hash;
}

// ---- Feed control ---------------------------------------------------------
/** Reset the feed back to $1 (un-crashed) via updateAnswer(1e8). */
export async function resetFeed(feed: `0x${string}`): Promise<void> {
  await send("Reset feed", feed, FEED_ABI as Abi, "updateAnswer", [ONE_DOLLAR]);
}

// ---- Create a fresh cover market ------------------------------------------
/**
 * Create a brand-new USDe cover market on the demo feed and seed it with a YES
 * sell ask so the presenter can buy cover immediately. Returns the new market
 * address and the feed it reads. Each receipt is awaited in turn.
 */
export async function createCoverMarket(
  onStep?: (s: string) => void,
): Promise<{ market: `0x${string}`; feed: `0x${string}` }> {
  const pub = getPublic();

  // 1) Reset the feed to $1 so the new market starts un-crashed.
  onStep?.("Resetting price feed to $1");
  await resetFeed(DEMO_FEED_ADDRESS);

  // 2) Create the market (permissionless) and parse the new address from logs.
  onStep?.("Creating cover market");
  const now = Math.floor(Date.now() / 1000);
  const expiry = BigInt(now + DEMO_EXPIRY_SECS);
  const createHash = await send(
    "Create market",
    MARKET_FACTORY_ADDRESS,
    CANARY_FACTORY_ABI,
    // Plain market with a short 5s breach window so a crash settles fast. (The
    // yield-enabled variant reverts against the already-used shared demo vault,
    // and live yield is not surfaced in the UI, so a plain market fully supports
    // buy / provide-liquidity / crash / redeem.)
    "createMarket",
    [
      DEMO_FEED_ADDRESS,
      DEPEG_THRESHOLD,
      BREACH_WINDOW,
      expiry,
      60n,
      "USDe < $0.95 (demo)",
    ],
  );
  const createReceipt = await pub.waitForTransactionReceipt({ hash: createHash });
  const events = parseEventLogs({
    abi: CANARY_FACTORY_ABI,
    eventName: "MarketCreated",
    logs: createReceipt.logs,
  });
  const created = events[0] as
    | { args: { market: `0x${string}` } }
    | undefined;
  const market = created?.args?.market;
  if (!market) {
    throw new Error("Create market: MarketCreated event not found in receipt.");
  }

  // 3) Seed a two-sided book: approve USDC -> mintSets -> post YES asks (cover
  // supply) and NO asks (render as YES bids), all from the one mint.
  onStep?.("Approving collateral");
  await send(
    "Approve USDC",
    USDC_ADDRESS,
    ERC20_ABI as unknown as Abi,
    "approve",
    [market, SEED_SHARES],
  );

  onStep?.("Minting outcome sets");
  await send("Mint sets", market, CANARY_MARKET_ABI, "mintSets", [SEED_SHARES]);

  // YES asks — cover supply, fillable by Buy YES.
  for (let i = 0; i < SEED_YES_ASKS.length; i++) {
    const o = SEED_YES_ASKS[i]!;
    onStep?.(`Placing YES ask ${i + 1}/${SEED_YES_ASKS.length}`);
    await send("Place YES ask", market, CANARY_MARKET_ABI, "placeOrder", [
      true, // isYes
      false, // sell
      o.price,
      o.amount,
    ]);
  }

  // NO asks — show as YES bids in the unified book, fillable by Buy NO.
  for (let i = 0; i < SEED_NO_ASKS.length; i++) {
    const o = SEED_NO_ASKS[i]!;
    onStep?.(`Placing YES bid ${i + 1}/${SEED_NO_ASKS.length}`);
    await send("Place NO ask", market, CANARY_MARKET_ABI, "placeOrder", [
      false, // isYes=false -> NO
      false, // sell
      o.price,
      o.amount,
    ]);
  }

  return { market, feed: DEMO_FEED_ADDRESS };
}

// ---- Crash + settle -------------------------------------------------------
/**
 * Drive a visible descending crash on the feed (0.98 then 0.94), wait the
 * breach window in real time, then settle the depeg with the breaching round as
 * the start round. No-op if the market is already settled.
 */
export async function crashAndSettle(
  market: `0x${string}`,
  feed: `0x${string}`,
  onStep?: (s: string) => void,
): Promise<void> {
  const pub = getPublic();

  // Guard: skip if the market is no longer Open.
  const state = (await pub.readContract({
    address: market,
    abi: CANARY_MARKET_ABI,
    functionName: "state",
  })) as number;
  if (state !== MarketState.Open) {
    onStep?.("Market already settled");
    return;
  }

  // Read the market's ACTUAL breach window. The seeded default market is 900s; a
  // freshly-created demo market is 5s. marketInfo() ->
  // (state, collateral, priceFeed, depegThreshold, breachWindow, expiry, ...).
  const info = (await pub.readContract({
    address: market,
    abi: CANARY_MARKET_ABI,
    functionName: "marketInfo",
  })) as readonly unknown[];
  const breachWindow = BigInt(info[4] as bigint);

  // 1) Visible descending crash. The 0.94 push is the breaching round.
  onStep?.("Pushing crash to $0.98");
  await send("Crash 0.98", feed, FEED_ABI as Abi, "updateAnswer", [CRASH_098]);

  onStep?.("Pushing crash to $0.94");
  await send("Crash 0.94", feed, FEED_ABI as Abi, "updateAnswer", [CRASH_094]);

  const startRound = (await pub.readContract({
    address: feed,
    abi: FEED_ABI as Abi,
    functionName: "latestRound",
  })) as bigint;
  const round = (await pub.readContract({
    address: feed,
    abi: FEED_ABI as Abi,
    functionName: "getRoundData",
    args: [startRound],
  })) as readonly [bigint, bigint, bigint, bigint, bigint];
  const startUpdatedAt = round[3];

  // 2) Instant settle: push a SECOND sub-threshold round dated just past the
  // window end. settleDepeg's round-walk then sees a sustained breach across the
  // whole window and terminates on the first step, regardless of how long
  // breachWindow is. No real-time wait; works on the 900s default market and 5s
  // created markets alike.
  onStep?.("Confirming breach");
  await send("Confirm breach", feed, FEED_ABI as Abi, "updateAnswerAt", [
    CRASH_094,
    startUpdatedAt + breachWindow + 1n,
  ]);

  // 3) Settle the depeg from the breaching round.
  onStep?.("Settling depeg");
  await send("Settle depeg", market, CANARY_MARKET_ABI, "settleDepeg", [
    startRound,
  ]);
}

// ---- Inject demo yield ----------------------------------------------------
/**
 * Make the held NO position visibly earn: the operator donates `amount` USDC to
 * the yield vault (raising assets/share), then harvests it into the market so
 * underwriters' claimable yield ticks up. Lets the presenter show "idle
 * collateral is earning" on stage. Only meaningful on a yield-enabled market.
 */
export async function accrueYield(
  market: `0x${string}`,
  amount: bigint = 1_000000n,
  onStep?: (s: string) => void,
): Promise<void> {
  onStep?.("Approving yield donation");
  await send("Approve vault", USDC_ADDRESS, ERC20_ABI as unknown as Abi, "approve", [
    YIELD_VAULT_ADDRESS,
    amount,
  ]);
  onStep?.("Injecting yield");
  await send("Inject yield", YIELD_VAULT_ADDRESS, VAULT_ABI as Abi, "simulateYield", [amount]);
  onStep?.("Harvesting into market");
  await send("Harvest yield", market, CANARY_MARKET_ABI, "harvestYield", []);
}
