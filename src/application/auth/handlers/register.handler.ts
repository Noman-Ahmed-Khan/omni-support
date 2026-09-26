import type { RegisterCommand } from '../commands/register.command';
import type { AuthService } from '../services/auth.service';

export class RegisterHandler {
  constructor(private readonly authService: AuthService) {}

  async execute(command: RegisterCommand): Promise<{ userId: string | null }> {
    return this.authService.register(command);
  }
}
