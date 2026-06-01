import { AuthService } from '../services/auth.service';
import { VerifyEmailCommand } from '../commands/verify-email.command';

export class VerifyEmailHandler {
  constructor(private readonly authService: AuthService) {}

  async execute(command: VerifyEmailCommand): Promise<void> {
    await this.authService.verifyEmail(command.userId, command.token);
  }
}
