import { PrismaClient, Prisma } from '@prisma/client';
import { CacheService } from '../../../infrastructure/cache/cache.service';
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
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache: CacheService,
  ) {}

  async getDashboardMetrics(tenantId: string): Promise<DashboardMetrics> {
    const cacheKey = CacheService.dashboardKey(tenantId, 'metrics');

    return this.cache.getOrSet(
      cacheKey,
      async () => this.computeDashboardMetrics(tenantId),
      { ttl: 60 }, // 1 minute cache
    );
  }

  private async computeDashboardMetrics(
    tenantId: string,
  ): Promise<DashboardMetrics> {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

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
            (sum, t) =>
              sum + (t.resolvedAt!.getTime() - t.createdAt.getTime()),
            0,
          ) / resolvedWithTime.length
        : 0;

    // Agent workload
    const agentWorkload: AgentWorkload[] = await Promise.all(
      agents.map(async (agent) => {
        const [openCount, resolvedCount] = await Promise.all([
          this.prisma.ticket.count({
            where: {
              tenantId,
              assignedAgentId: agent.id,
              status: { notIn: ['RESOLVED', 'CLOSED'] },
            },
          }),
          this.prisma.ticket.count({
            where: {
              tenantId,
              assignedAgentId: agent.id,
              status: 'RESOLVED',
              resolvedAt: { gte: todayStart },
            },
          }),
        ]);

        return {
          agentId: agent.id,
          agentName: `${agent.firstName} ${agent.lastName}`,
          openTickets: openCount,
          resolvedToday: resolvedCount,
          avgResponseTimeHours: 0, // Can be computed from firstResponseAt
        };
      }),
    );

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

  async getTicketTrends(
    tenantId: string,
    days: number = 30,
  ): Promise<TrendData[]> {
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
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

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
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      result.push({ date: dateKey, value: grouped[dateKey] ?? 0 });
    }

    return result;
  }

  async generateDailySnapshot(tenantId: string): Promise<void> {
    try {
      const metrics = await this.computeDashboardMetrics(tenantId);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await this.prisma.analyticsSnapshot.upsert({
        where: {
          tenantId_snapshotDate: { tenantId, snapshotDate: today },
        },
        update: {
          totalTickets: metrics.totalTickets,
          openTickets: metrics.openTickets,
          resolvedTickets: metrics.ticketsByStatus['RESOLVED'] ?? 0,
          closedTickets: metrics.ticketsByStatus['CLOSED'] ?? 0,
          escalatedTickets: metrics.escalatedTickets,
          criticalTickets: metrics.criticalTickets,
          categoryDistribution: toInputJson(metrics.ticketsByCategory),
          agentPerformance: toInputJson(metrics.agentWorkload),
        },
        create: {
          tenantId,
          snapshotDate: today,
          totalTickets: metrics.totalTickets,
          openTickets: metrics.openTickets,
          resolvedTickets: metrics.ticketsByStatus['RESOLVED'] ?? 0,
          closedTickets: metrics.ticketsByStatus['CLOSED'] ?? 0,
          escalatedTickets: metrics.escalatedTickets,
          criticalTickets: metrics.criticalTickets,
          categoryDistribution: toInputJson(metrics.ticketsByCategory),
          agentPerformance: toInputJson(metrics.agentWorkload),
        },
      });

      logger.info('Analytics snapshot generated', { tenantId });
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
        const [totalTenants, activeTenants, totalTickets, totalUsers] =
          await Promise.all([
            this.prisma.tenant.count(),
            this.prisma.tenant.count({ where: { status: 'ACTIVE' } }),
            this.prisma.ticket.count(),
            this.prisma.user.count({ where: { role: { not: 'PLATFORM_ADMIN' } } }),
          ]);

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
