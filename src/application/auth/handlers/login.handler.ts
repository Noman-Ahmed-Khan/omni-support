import { AuthResult, AuthService } from '../services/auth.service';
import { LoginCommand } from '../commands/login.command';

export class LoginHandler {
  constructor(private readonly authService: AuthService) {}

  async execute(command: LoginCommand): Promise<AuthResult> {
    return this.authService.login(command);
  }
}
