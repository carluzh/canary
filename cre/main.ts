// Canary Watchtower — reads the USDe feed on Arc every tick (DON consensus) and,
// on a provable depeg, reports the breach round so the Keystone Forwarder calls
// CanaryReportReceiver.onReport -> settleDepeg. Data Feeds price it, CRE watches
// it, settlement fires itself.
import {
  bytesToHex,
  CronCapability,
  EVMClient,
  encodeCallMsg,
  getNetwork,
  handler,
  LATEST_BLOCK_NUMBER,
  prepareReportRequest,
  Runner,
  type Runtime,
  TxStatus,
} from "@chainlink/cre-sdk";
import { type Address, decodeFunctionResult, encodeAbiParameters, encodeFunctionData, zeroAddress } from "viem";

export type Config = {
  schedule: string;
  chainSelectorName: string;
  feed: string;
  receiver: string;
  thresholdE8: string;
};

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

export const onCronTrigger = (runtime: Runtime<Config>) => {
  const { chainSelectorName, feed, receiver, thresholdE8 } = runtime.config;

  const network = getNetwork({ chainFamily: "evm", chainSelectorName, isTestnet: true });
  if (!network) throw new Error(`unknown network: ${chainSelectorName}`);
  const evm = new EVMClient(network.chainSelector.selector);

  // READ the latest USDe/USD round (DON consensus).
  const readCall = encodeFunctionData({ abi: AGGREGATOR_ABI, functionName: "latestRoundData" });
  const res = evm
    .callContract(runtime, {
      call: encodeCallMsg({ from: zeroAddress, to: feed as Address, data: readCall }),
      blockNumber: LATEST_BLOCK_NUMBER,
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

  if (!breached) return { roundId: roundId.toString(), breached: false, settled: false };

  // WRITE: report the breach round; Forwarder -> receiver.onReport -> settleDepeg.
  const reportPayload = encodeAbiParameters([{ type: "uint80" }], [roundId]);
  const report = runtime.report(prepareReportRequest(reportPayload)).result();
  const resp = evm.writeReport(runtime, { receiver: receiver as Address, report }).result();
  if (resp.txStatus !== TxStatus.SUCCESS) {
    throw new Error(`writeReport failed: ${resp.errorMessage ?? resp.txStatus}`);
  }
  return { roundId: roundId.toString(), breached: true, settled: true };
};

export const initWorkflow = (config: Config) => {
  const cron = new CronCapability();
  return [handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
