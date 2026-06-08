import type { ResetPasswordCommand } from '../commands/reset-password.command';
import type { AuthService } from '../services/auth.service';

export class ResetPasswordHandler {
  constructor(private readonly authService: AuthService) {}

  async execute(command: ResetPasswordCommand): Promise<void> {
    await this.authService.resetPassword(
      command.token,
      command.password,
      command.ipAddress,
    );
  }
}
