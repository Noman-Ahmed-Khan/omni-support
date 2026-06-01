import { AuthService } from '../services/auth.service';
import { RegisterCommand } from '../commands/register.command';

export class RegisterHandler {
  constructor(private readonly authService: AuthService) {}

  async execute(command: RegisterCommand): Promise<{ userId: string }> {
    return this.authService.register(command);
  }
}
