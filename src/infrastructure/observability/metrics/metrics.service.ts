export interface HttpMetricLabels {
  method: string;
  route: string;
  statusCode: number;
}

export interface HealthMetricLabels {
  check: string;
  status: 'ok' | 'error';
}

export class MetricsService {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();

  increment(name: string, labels: Record<string, string> = {}, value = 1): void {
    const key = this.key(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
  }

  gauge(name: string, labels: Record<string, string> = {}, value: number): void {
    const key = this.key(name, labels);
    this.gauges.set(key, value);
  }

  observeHttpRequest(
    labels: HttpMetricLabels,
    durationMs: number,
    tenantId?: string,
  ): void {
    const baseLabels = {
      method: labels.method,
      route: labels.route,
      status: String(labels.statusCode),
      ...(tenantId ? { tenantId } : {}),
    };

    this.increment('http_requests_total', baseLabels);
    this.increment('http_request_duration_ms_count', baseLabels);
    this.increment('http_request_duration_ms_sum', baseLabels, durationMs);
  }

  observeDbCheck(status: 'ok' | 'error', durationMs: number): void {
    this.increment('db_checks_total', { status });
    this.increment('db_check_duration_ms_count', { status });
    this.increment('db_check_duration_ms_sum', { status }, durationMs);
  }

  observeQueueJob(queue: string, status: 'ok' | 'error', durationMs: number): void {
    this.increment('queue_jobs_total', { queue, status });
    this.increment('queue_job_duration_ms_count', { queue, status });
    this.increment('queue_job_duration_ms_sum', { queue, status }, durationMs);
  }

  observeWorkerRun(worker: string, status: 'ok' | 'error', durationMs: number): void {
    this.increment('worker_runs_total', { worker, status });
    this.increment('worker_run_duration_ms_count', { worker, status });
    this.increment('worker_run_duration_ms_sum', { worker, status }, durationMs);
  }

  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    this.gauge(name, labels, value);
  }

  render(): string {
    const lines: string[] = [];

    for (const [key, value] of this.counters.entries()) {
      const { name, labels } = this.parseKey(key);
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name}${this.formatLabels(labels)} ${value}`);
    }

    for (const [key, value] of this.gauges.entries()) {
      const { name, labels } = this.parseKey(key);
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name}${this.formatLabels(labels)} ${value}`);
    }

    return lines.join('\n');
  }

  snapshot(): {
    counters: Record<string, number>;
    gauges: Record<string, number>;
  } {
    return {
      counters: Object.fromEntries(this.counters.entries()),
      gauges: Object.fromEntries(this.gauges.entries()),
    };
  }

  private key(name: string, labels: Record<string, string>): string {
    const labelEntries = Object.entries(labels).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `${name}|${JSON.stringify(labelEntries)}`;
  }

  private parseKey(key: string): { name: string; labels: Record<string, string> } {
    const [name, rawLabels] = key.split('|');
    const labels = JSON.parse(rawLabels ?? '[]') as Array<[string, string]>;
    return { name, labels: Object.fromEntries(labels) };
  }

  private formatLabels(labels: Record<string, string>): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) {
      return '';
    }

    const rendered = entries
      .map(
        ([label, value]) =>
          `${label}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
      )
      .join(',');

    return `{${rendered}}`;
  }
}
