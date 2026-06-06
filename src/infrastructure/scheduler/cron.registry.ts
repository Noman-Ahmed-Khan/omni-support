export interface CronJobDefinition {
  name: string;
  cronExpression: string;
  handler: () => Promise<void>;
  tenantScoped?: boolean;
  lockKey?: string;
}

export class CronRegistry {
  private readonly jobs = new Map<string, CronJobDefinition>();

  register(job: CronJobDefinition): void {
    this.jobs.set(job.name, job);
  }

  list(): CronJobDefinition[] {
    return [...this.jobs.values()];
  }

  getDueJobs(referenceDate: Date = new Date()): CronJobDefinition[] {
    return this.list().filter((job) =>
      matchesCronExpression(job.cronExpression, referenceDate),
    );
  }
}

function matchesCronExpression(expression: string, date: Date): boolean {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = expression.trim().split(/\s+/);

  return (
    matchesField(date.getUTCMinutes(), minute, 0, 59) &&
    matchesField(date.getUTCHours(), hour, 0, 23) &&
    matchesField(date.getUTCDate(), dayOfMonth, 1, 31) &&
    matchesField(date.getUTCMonth() + 1, month, 1, 12) &&
    matchesField(date.getUTCDay(), dayOfWeek, 0, 6)
  );
}

function matchesField(value: number, field: string, min: number, max: number): boolean {
  if (field === '*') {
    return true;
  }

  if (field.startsWith('*/')) {
    const step = Number(field.slice(2));
    return step > 0 && (value - min) % step === 0;
  }

  const parts = field.split(',');
  if (parts.length > 1) {
    return parts.some((part) => matchesField(value, part, min, max));
  }

  if (field.includes('-')) {
    const [start, end] = field.split('-').map(Number);
    return value >= start && value <= end;
  }

  const parsed = Number(field);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max && value === parsed;
}
