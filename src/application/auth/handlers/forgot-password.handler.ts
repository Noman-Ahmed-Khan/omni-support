import type { ForgotPasswordCommand } from '../commands/forgot-password.command';
import type { AuthService } from '../services/auth.service';

export class ForgotPasswordHandler {
  constructor(private readonly authService: AuthService) {}

  async execute(command: ForgotPasswordCommand): Promise<void> {
    await this.authService.forgotPassword(command.email);
  }
}
