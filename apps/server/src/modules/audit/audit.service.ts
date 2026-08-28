import { prisma } from '../../lib/prisma';

interface AuditEntry {
  tenantId: string | null;
  userId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

/**
 * Fire-and-forget style audit logging (awaited, but failures are swallowed
 * and logged rather than failing the primary business operation — an audit
 * log write failure should never block a sale from completing).
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: entry.metadata as any,
        ipAddress: entry.ipAddress ?? undefined,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to write audit log', err);
  }
}

export async function listAuditLogs(tenantId: string, page: number, pageSize: number) {
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { id: true, fullName: true, email: true } } },
    }),
    prisma.auditLog.count({ where: { tenantId } }),
  ]);
  return { items, total };
}
