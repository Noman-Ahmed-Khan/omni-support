import { AuthService } from '../services/auth.service';
import { ForgotPasswordCommand } from '../commands/forgot-password.command';

export class ForgotPasswordHandler {
  constructor(private readonly authService: AuthService) {}

  async execute(command: ForgotPasswordCommand): Promise<void> {
    await this.authService.forgotPassword(command.email);
  }
}
