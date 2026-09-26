import type { ICustomerRepository } from '../../../domain/customer/repositories/customer.repository.interface';
import {
  TicketAccessPolicy,
  type TicketViewer,
} from '../../../domain/policies/ticket-access.policy';
import type { TicketEntity } from '../../../domain/ticket/entities/ticket.entity';
import type { ITicketRepository } from '../../../domain/ticket/repositories/ticket.repository.interface';
import { ForbiddenError } from '../../../shared/errors/application.error';
import { NotFoundError } from '../../../shared/errors/domain.error';

export interface TicketActor {
  id: string;
  role: string;
  email: string;
  tenantId: string;
}

/** Restrictions applied to ticket listings for the given actor. */
export interface TicketListScope {
  assignedAgentId?: string;
  customerId?: string;
  /** True when the actor can see no tickets at all (e.g. a customer without a record). */
  none: boolean;
}

export class TicketAccessService {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById'>,
    private readonly customerRepo: Pick<ICustomerRepository, 'findByEmail'>,
    private readonly policy: TicketAccessPolicy = new TicketAccessPolicy(),
  ) {}

  async resolveViewer(actor: TicketActor): Promise<TicketViewer> {
    if (actor.role !== 'CUSTOMER') {
      return { id: actor.id, role: actor.role };
    }

    const customer = await this.customerRepo.findByEmail(actor.email, actor.tenantId);
    return { id: actor.id, role: actor.role, customerId: customer?.id };
  }

  /**
   * Throws NotFoundError when the ticket is not in the actor's organization and
   * ForbiddenError when it is, but the actor may not see it.
   */
  async assertCanAccess(actor: TicketActor, ticketId: string): Promise<TicketEntity> {
    const ticket = await this.ticketRepo.findById(ticketId, actor.tenantId);
    if (!ticket) {
      throw new NotFoundError('Ticket', ticketId);
    }

    const viewer = await this.resolveViewer(actor);
    if (!this.policy.canView(viewer, ticket)) {
      throw new ForbiddenError('You do not have access to this ticket');
    }

    return ticket;
  }

  async listScope(actor: TicketActor): Promise<TicketListScope> {
    switch (actor.role) {
      case 'TENANT_MANAGER':
        return { none: false };
      case 'AGENT':
        return { assignedAgentId: actor.id, none: false };
      case 'CUSTOMER': {
        const viewer = await this.resolveViewer(actor);
        return viewer.customerId
          ? { customerId: viewer.customerId, none: false }
          : { none: true };
      }
      default:
        return { none: true };
    }
  }

  /** The customer record a CUSTOMER user acts for; tickets they open are filed under it. */
  async requireOwnCustomerId(actor: TicketActor): Promise<string> {
    const viewer = await this.resolveViewer(actor);
    if (!viewer.customerId) {
      throw new ForbiddenError('Your account is not linked to a customer record');
    }
    return viewer.customerId;
  }
}
