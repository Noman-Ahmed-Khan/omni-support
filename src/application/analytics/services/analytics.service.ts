import type { PrismaClient, Prisma } from '@prisma/client';

import type { CacheService } from '../../../infrastructure/cache/cache.service';
import { AnalyticsCacheStrategy } from '../../../infrastructure/cache/strategies/analytics.cache';
import { addDays, startOfUtcDay } from '../../../shared/utils/date.util';
import { logger } from '../../../shared/utils/logger.util';

export interface DashboardMetrics {
  totalTickets: number;
  openTickets: number;
  resolvedToday: number;
  criticalTickets: number;
  escalatedTickets: number;
  avgResolutionTimeHours: number;
  slaBreachRate: number;
  agentWorkload: AgentWorkload[];
  ticketsByStatus: Record<string, number>;
  ticketsByPriority: Record<string, number>;
  ticketsByCategory: Record<string, number>;
}

export interface AgentWorkload {
  agentId: string;
  agentName: string;
  openTickets: number;
  resolvedToday: number;
  avgResponseTimeHours: number;
}

export interface TrendData {
  date: string;
  value: number;
}

export class AnalyticsService {
  private readonly analyticsCache: AnalyticsCacheStrategy;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache: CacheService,
  ) {
    this.analyticsCache = new AnalyticsCacheStrategy(cache);
  }

  async getDashboardMetrics(tenantId: string): Promise<DashboardMetrics> {
    const cached = await this.analyticsCache.getDashboard<DashboardMetrics>(
      tenantId,
      'metrics',
    );

    if (cached) {
      return cached;
    }

    const metrics = await this.computeDashboardMetrics(tenantId);
    await this.analyticsCache.setDashboard(tenantId, 'metrics', metrics);
    return metrics;
  }

  private async computeDashboardMetrics(tenantId: string): Promise<DashboardMetrics> {
    // Day boundaries are UTC so results do not depend on the server's timezone.
    const todayStart = startOfUtcDay(new Date());

    const [
      totalTickets,
      ticketsByStatus,
      ticketsByPriority,
      ticketsByCategory,
      resolvedToday,
      escalatedTickets,
      slaBreached,
      agents,
    ] = await Promise.all([
      this.prisma.ticket.count({ where: { tenantId } }),

      this.prisma.ticket.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { status: true },
      }),

      this.prisma.ticket.groupBy({
        by: ['priority'],
        where: { tenantId },
        _count: { priority: true },
      }),

      this.prisma.ticket.groupBy({
        by: ['category'],
        where: { tenantId },
        _count: { category: true },
      }),

      this.prisma.ticket.count({
        where: {
          tenantId,
          status: 'RESOLVED',
          resolvedAt: { gte: todayStart },
        },
      }),

      this.prisma.ticket.count({
        where: { tenantId, isEscalated: true, status: { notIn: ['RESOLVED', 'CLOSED'] } },
      }),

      this.prisma.ticket.count({
        where: { tenantId, slaBreached: true },
      }),

      this.prisma.user.findMany({
        where: { tenantId, role: 'AGENT', status: 'ACTIVE' },
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);

    // Compute average resolution time
    const resolvedWithTime = await this.prisma.ticket.findMany({
      where: {
        tenantId,
        status: 'RESOLVED',
        resolvedAt: { not: null },
      },
      select: { createdAt: true, resolvedAt: true },
      take: 100,
      orderBy: { resolvedAt: 'desc' },
    });

    const avgResolutionMs =
      resolvedWithTime.length > 0
        ? resolvedWithTime.reduce(
            (sum, t) => sum + (t.resolvedAt!.getTime() - t.createdAt.getTime()),
            0,
          ) / resolvedWithTime.length
        : 0;

    // Agent workload: two grouped queries instead of two queries per agent.
    const agentIds = agents.map((agent) => agent.id);
    const [openByAgent, resolvedTodayByAgent] = await Promise.all([
      this.prisma.ticket.groupBy({
        by: ['assignedAgentId'],
        where: {
          tenantId,
          assignedAgentId: { in: agentIds },
          status: { notIn: ['RESOLVED', 'CLOSED'] },
        },
        _count: { _all: true },
      }),
      this.prisma.ticket.groupBy({
        by: ['assignedAgentId'],
        where: {
          tenantId,
          assignedAgentId: { in: agentIds },
          status: 'RESOLVED',
          resolvedAt: { gte: todayStart },
        },
        _count: { _all: true },
      }),
    ]);

    const countFor = (
      rows: Array<{ assignedAgentId: string | null; _count: { _all: number } }>,
      agentId: string,
    ): number => rows.find((row) => row.assignedAgentId === agentId)?._count._all ?? 0;

    const agentWorkload: AgentWorkload[] = agents.map((agent) => ({
      agentId: agent.id,
      agentName: `${agent.firstName} ${agent.lastName}`,
      openTickets: countFor(openByAgent, agent.id),
      resolvedToday: countFor(resolvedTodayByAgent, agent.id),
      avgResponseTimeHours: 0, // Can be computed from firstResponseAt
    }));

    const statusMap = ticketsByStatus.reduce(
      (acc, r) => ({ ...acc, [r.status]: r._count.status }),
      {} as Record<string, number>,
    );

    const priorityMap = ticketsByPriority.reduce(
      (acc, r) => ({ ...acc, [r.priority]: r._count.priority }),
      {} as Record<string, number>,
    );

    const categoryMap = ticketsByCategory.reduce(
      (acc, r) => ({ ...acc, [r.category]: r._count.category }),
      {} as Record<string, number>,
    );

    return {
      totalTickets,
      openTickets: statusMap['OPEN'] ?? 0,
      resolvedToday,
      criticalTickets: priorityMap['CRITICAL'] ?? 0,
      escalatedTickets,
      avgResolutionTimeHours: avgResolutionMs / (1000 * 60 * 60),
      slaBreachRate: totalTickets > 0 ? slaBreached / totalTickets : 0,
      agentWorkload,
      ticketsByStatus: statusMap,
      ticketsByPriority: priorityMap,
      ticketsByCategory: categoryMap,
    };
  }

  async getTicketTrends(tenantId: string, days: number = 30): Promise<TrendData[]> {
    const cacheKey = `analytics:${tenantId}:trends:${days}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => this.computeTicketTrends(tenantId, days),
      { ttl: 300 }, // 5 minutes
    );
  }

  private async computeTicketTrends(
    tenantId: string,
    days: number,
  ): Promise<TrendData[]> {
    const today = startOfUtcDay(new Date());
    const startDate = addDays(today, -days);

    const tickets = await this.prisma.ticket.findMany({
      where: {
        tenantId,
        createdAt: { gte: startDate },
      },
      select: { createdAt: true },
    });

    // Group by date
    const grouped: Record<string, number> = {};

    tickets.forEach((t) => {
      const dateKey = t.createdAt.toISOString().split('T')[0];
      grouped[dateKey] = (grouped[dateKey] ?? 0) + 1;
    });

    // Fill missing dates
    const result: TrendData[] = [];
    for (let i = days; i >= 0; i--) {
      const dateKey = addDays(today, -i).toISOString().split('T')[0];
      result.push({ date: dateKey, value: grouped[dateKey] ?? 0 });
    }

    return result;
  }

  /**
   * Stores the activity of one UTC day (default: yesterday) for a tenant.
   *
   * Counts of created, resolved, closed and escalated tickets are for that day only;
   * open/critical/active-agent figures are the state at the time the snapshot is taken.
   */
  async generateDailySnapshot(
    tenantId: string,
    day: Date = addDays(startOfUtcDay(new Date()), -1),
  ): Promise<void> {
    try {
      const dayStart = startOfUtcDay(day);
      const dayEnd = addDays(dayStart, 1);
      const during = { gte: dayStart, lt: dayEnd };

      const [
        createdTickets,
        resolvedTickets,
        closedTickets,
        escalatedTickets,
        slaBreachedCount,
        openTickets,
        byPriority,
        byCategory,
        totalCustomers,
        activeAgents,
        resolvedDuring,
      ] = await Promise.all([
        this.prisma.ticket.count({ where: { tenantId, createdAt: during } }),
        this.prisma.ticket.count({ where: { tenantId, resolvedAt: during } }),
        this.prisma.ticket.count({ where: { tenantId, closedAt: during } }),
        this.prisma.ticket.count({ where: { tenantId, escalatedAt: during } }),
        this.prisma.ticket.count({
          where: { tenantId, slaBreached: true, dueAt: during },
        }),
        this.prisma.ticket.count({
          where: { tenantId, status: { notIn: ['RESOLVED', 'CLOSED'] } },
        }),
        this.prisma.ticket.groupBy({
          by: ['priority'],
          where: { tenantId, createdAt: during },
          _count: { _all: true },
        }),
        this.prisma.ticket.groupBy({
          by: ['category'],
          where: { tenantId, createdAt: during },
          _count: { _all: true },
        }),
        this.prisma.customer.count({ where: { tenantId } }),
        this.prisma.user.count({ where: { tenantId, role: 'AGENT', status: 'ACTIVE' } }),
        this.prisma.ticket.findMany({
          where: { tenantId, resolvedAt: during },
          select: { createdAt: true, resolvedAt: true },
        }),
      ]);

      const priorityCount = (priority: string): number =>
        byPriority.find((row) => row.priority === priority)?._count._all ?? 0;

      const avgResolutionTimeMs =
        resolvedDuring.length > 0
          ? BigInt(
              Math.round(
                resolvedDuring.reduce(
                  (sum, t) => sum + (t.resolvedAt!.getTime() - t.createdAt.getTime()),
                  0,
                ) / resolvedDuring.length,
              ),
            )
          : null;

      const data = {
        totalTickets: createdTickets,
        openTickets,
        resolvedTickets,
        closedTickets,
        escalatedTickets,
        slaBreachedCount,
        avgResolutionTimeMs,
        criticalTickets: priorityCount('CRITICAL'),
        highTickets: priorityCount('HIGH'),
        mediumTickets: priorityCount('MEDIUM'),
        lowTickets: priorityCount('LOW'),
        totalCustomers,
        activeAgents,
        categoryDistribution: toInputJson(
          Object.fromEntries(byCategory.map((row) => [row.category, row._count._all])),
        ),
      };

      await this.prisma.analyticsSnapshot.upsert({
        where: {
          tenantId_snapshotDate: { tenantId, snapshotDate: dayStart },
        },
        update: data,
        create: { tenantId, snapshotDate: dayStart, ...data },
      });

      logger.info('Analytics snapshot generated', {
        tenantId,
        snapshotDate: dayStart.toISOString().slice(0, 10),
      });
    } catch (error) {
      logger.error('Failed to generate analytics snapshot', { tenantId, error });
    }
  }

  async getPlatformMetrics(): Promise<{
    totalTenants: number;
    activeTenants: number;
    totalTickets: number;
    totalUsers: number;
    timestamp: Date;
  }> {
    const cacheKey = 'platform:metrics';

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const [totalTenants, activeTenants, totalTickets, totalUsers] = await Promise.all(
          [
            this.prisma.tenant.count(),
            this.prisma.tenant.count({ where: { status: 'ACTIVE' } }),
            this.prisma.ticket.count(),
            this.prisma.user.count({ where: { role: { not: 'PLATFORM_ADMIN' } } }),
          ],
        );

        return {
          totalTenants,
          activeTenants,
          totalTickets,
          totalUsers,
          timestamp: new Date(),
        };
      },
      { ttl: 300 },
    );
  }
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
