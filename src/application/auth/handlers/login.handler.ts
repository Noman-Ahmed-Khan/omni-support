import type { LoginCommand } from '../commands/login.command';
import type { AuthResult, AuthService } from '../services/auth.service';

export class LoginHandler {
  constructor(private readonly authService: AuthService) {}

  async execute(command: LoginCommand): Promise<AuthResult> {
    return this.authService.login(command);
  }
}
