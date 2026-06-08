import type { LogoutCommand } from '../commands/logout.command';
import type { AuthService } from '../services/auth.service';

export class LogoutHandler {
  constructor(private readonly authService: AuthService) {}

  async execute(command: LogoutCommand): Promise<void> {
    await this.authService.logout(command.refreshToken, command.userId);
  }
}
