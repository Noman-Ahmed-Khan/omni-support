export class AiPolicy {
  shouldProcess(
    featureEnabled: boolean,
    tenantActive: boolean,
    contentLength: number,
  ): boolean {
    return featureEnabled && tenantActive && contentLength >= 8;
  }

  shouldPersistResult(confidence: number, threshold = 0.5): boolean {
    return confidence >= threshold;
  }
}
