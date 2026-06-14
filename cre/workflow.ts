// Canary Watchtower — a Chainlink CRE workflow that autonomously watches the
// USDe price on a cron schedule (DON consensus) and, on a provable depeg, emits
// a DON-signed report that the Keystone Forwarder delivers to
// CanaryReportReceiver.onReport on Arc, which calls the permissionless
// settleDepeg. Data Feeds price it, CRE watches it, settlement fires itself.
//
// API is verified against @chainlink/cre-sdk v1.11 official examples. Arc is a
// supported CRE read+write target (chainSelectorName "arc-testnet"). Validate
// the exact report encoding with `cre workflow simulate --broadcast`.

import {
  bytesToHex,
  CronCapability,
  EVMClient,
  encodeCallMsg,
  getNetwork,
  handler,
  LAST_FINALIZED_BLOCK_NUMBER,
  prepareReportRequest,
  Runner,
  type Runtime,
  TxStatus,
} from "@chainlink/cre-sdk";
import { type Address, decodeFunctionResult, encodeAbiParameters, encodeFunctionData, zeroAddress } from "viem";
import { z } from "zod";

const configSchema = z.object({
  schedule: z.string(), // cron, e.g. "0 */1 * * * *"
  chainSelectorName: z.string(), // "arc-testnet"
  feed: z.string(), // USDe/USD AggregatorV3 on Arc
  receiver: z.string(), // CanaryReportReceiver on Arc
  thresholdE8: z.string(), // depeg threshold, feed decimals, e.g. "95000000"
});
type Config = z.infer<typeof configSchema>;

const AGGREGATOR_ABI = [
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
] as const;

const onCron = (runtime: Runtime<Config>) => {
  const { chainSelectorName, feed, receiver, thresholdE8 } = runtime.config;

  const network = getNetwork({ chainFamily: "evm", chainSelectorName, isTestnet: true });
  if (!network) throw new Error(`unknown network: ${chainSelectorName}`);
  const evm = new EVMClient(network.chainSelector.selector);

  // --- READ: latest USDe/USD round (DON consensus) ---
  const readCall = encodeFunctionData({ abi: AGGREGATOR_ABI, functionName: "latestRoundData" });
  const res = evm
    .callContract(runtime, {
      call: encodeCallMsg({ from: zeroAddress, to: feed as Address, data: readCall }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();
  const decoded = decodeFunctionResult({
    abi: AGGREGATOR_ABI,
    functionName: "latestRoundData",
    data: bytesToHex(res.data),
  }) as readonly [bigint, bigint, bigint, bigint, bigint];

  const roundId = decoded[0];
  const answer = decoded[1];
  const breached = answer < BigInt(thresholdE8);
  runtime.log(`USDe/USD round ${roundId} = ${answer} (threshold ${thresholdE8}) -> ${breached ? "DEPEG" : "peg ok"}`);

  if (!breached) return { roundId: roundId.toString(), breached: false };

  // --- WRITE: report the breach round; the Forwarder -> receiver.onReport ->
  // settleDepeg(roundId). settleDepeg self-verifies the sustained breach, so a
  // premature report just reverts and we retry next cron tick. ---
  const reportPayload = encodeAbiParameters([{ type: "uint80" }], [roundId]);
  const report = runtime.report(prepareReportRequest(reportPayload)).result();
  const resp = evm.writeReport(runtime, { receiver: receiver as Address, report }).result();
  if (resp.txStatus !== TxStatus.SUCCESS) {
    throw new Error(`writeReport failed: ${resp.errorMessage ?? resp.txStatus}`);
  }
  return { roundId: roundId.toString(), breached: true, settled: true };
};

const initWorkflow = (config: Config) => {
  const cron = new CronCapability();
  return [handler(cron.trigger({ schedule: config.schedule }), onCron)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

main();
