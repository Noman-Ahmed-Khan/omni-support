import { PrismaClient } from '@prisma/client';

export interface AnalyticsProjectionSnapshot {
  totalTickets: number;
  openTickets: number;
  resolvedToday: number;
  criticalTickets: number;
  escalatedTickets: number;
  avgResolutionTimeHours: number;
  slaBreachRate: number;
  ticketsByStatus: Record<string, number>;
  ticketsByPriority: Record<string, number>;
  ticketsByCategory: Record<string, number>;
}

export class AnalyticsProjection {
  constructor(private readonly prisma: PrismaClient) {}

  async getTenantSnapshot(tenantId: string): Promise<AnalyticsProjectionSnapshot> {
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
    ]);

    const statusMap = ticketsByStatus.reduce(
      (acc, row) => ({ ...acc, [row.status]: row._count.status }),
      {} as Record<string, number>,
    );

    const priorityMap = ticketsByPriority.reduce(
      (acc, row) => ({ ...acc, [row.priority]: row._count.priority }),
      {} as Record<string, number>,
    );

    const categoryMap = ticketsByCategory.reduce(
      (acc, row) => ({ ...acc, [row.category]: row._count.category }),
      {} as Record<string, number>,
    );

    return {
      totalTickets,
      openTickets: statusMap['OPEN'] ?? 0,
      resolvedToday,
      criticalTickets: priorityMap['CRITICAL'] ?? 0,
      escalatedTickets,
      avgResolutionTimeHours: 0,
      slaBreachRate: totalTickets > 0 ? slaBreached / totalTickets : 0,
      ticketsByStatus: statusMap,
      ticketsByPriority: priorityMap,
      ticketsByCategory: categoryMap,
    };
  }

  async getPlatformSnapshot(): Promise<{
    totalTenants: number;
    activeTenants: number;
    totalTickets: number;
    totalUsers: number;
    timestamp: Date;
  }> {
    const [totalTenants, activeTenants, totalTickets, totalUsers] = await Promise.all([
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
  }
}
