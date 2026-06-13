declare module "poisson-disk-sampling" {
  interface PoissonDiskSamplingOptions {
    shape: number[];
    minDistance: number;
    maxDistance?: number;
    tries?: number;
    distanceFunction?: (point: number[]) => number;
    bias?: number;
  }

  export default class PoissonDiskSampling {
    constructor(options: PoissonDiskSamplingOptions, rng?: () => number);
    addPoint(point: number[]): number[] | null;
    addRandomPoint(): number[];
    next(): number[] | null;
    fill(): number[][];
    getAllPoints(): number[][];
    reset(): void;
  }
}
