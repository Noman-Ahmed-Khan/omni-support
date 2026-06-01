import { AuthService, TokenPair } from '../services/auth.service';
import { RefreshTokenCommand } from '../commands/refresh-token.command';

export class RefreshTokenHandler {
  constructor(private readonly authService: AuthService) {}

  async execute(command: RefreshTokenCommand): Promise<TokenPair> {
    return this.authService.refreshTokens(
      command.refreshToken,
      command.ipAddress,
      command.userAgent,
    );
  }
}
