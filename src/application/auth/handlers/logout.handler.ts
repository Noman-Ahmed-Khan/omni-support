import { AuthService } from '../services/auth.service';
import { LogoutCommand } from '../commands/logout.command';

export class LogoutHandler {
  constructor(private readonly authService: AuthService) {}

  async execute(command: LogoutCommand): Promise<void> {
    await this.authService.logout(command.refreshToken, command.userId);
  }
}
