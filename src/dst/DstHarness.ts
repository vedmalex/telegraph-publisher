import type { MetadataConfig } from "../types/metadata";
import { PathResolver } from "../utils/PathResolver";
import { DependencyManager } from "../dependencies/DependencyManager";
import { MockDstIO } from "./MockDstIO";

export class DstHarness {
  readonly io: MockDstIO;

  constructor(seed: number = 42) {
    this.io = new MockDstIO(seed);
  }

  reset(): void {
    this.io.reset();
  }

  getDependencyManager(config: MetadataConfig): DependencyManager {
    const pathResolver = PathResolver.getInstance();
    return new DependencyManager(config, pathResolver, this.io);
  }
}
