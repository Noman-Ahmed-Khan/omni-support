import { AddCommentCommand } from '../commands/add-comment.command';
import { TicketService } from '../services/ticket.service';

export class AddCommentHandler {
  constructor(private readonly ticketService: TicketService) {}

  async execute(command: AddCommentCommand): Promise<unknown> {
    return this.ticketService.addComment(command);
  }
}
