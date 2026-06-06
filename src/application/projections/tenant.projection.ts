import { PrismaClient } from '@prisma/client';

export interface TenantProjectionRecord {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  createdAt: Date;
  updatedAt: Date;
}

export class TenantProjection {
  constructor(private readonly prisma: PrismaClient) {}

  async list(search?: string): Promise<TenantProjectionRecord[]> {
    return this.prisma.tenant.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search, mode: 'insensitive' } },
              { domain: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        plan: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
