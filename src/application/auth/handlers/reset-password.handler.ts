import { AuthService } from '../services/auth.service';
import { ResetPasswordCommand } from '../commands/reset-password.command';

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
