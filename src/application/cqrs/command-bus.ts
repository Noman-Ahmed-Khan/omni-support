import type { CommandHandler } from './command-handler.interface';

export interface CommandBusTransactionRunner {
  <T>(work: () => Promise<T>): Promise<T>;
}

interface RegisteredCommandHandler<TCommand = unknown, TResult = unknown> {
  handler: CommandHandler<TCommand, TResult>;
  transactional: boolean;
}

export class CommandBus {
  private readonly handlers = new Map<
    string,
    RegisteredCommandHandler<unknown, unknown>
  >();

  constructor(private readonly transactionRunner?: CommandBusTransactionRunner) {}

  register<TCommand, TResult>(
    commandName: string,
    handler: CommandHandler<TCommand, TResult>,
    options: { transactional?: boolean } = {},
  ): void {
    this.handlers.set(commandName, {
      handler,
      transactional: options.transactional ?? true,
    });
  }

  registerMany(
    registrations: Array<{
      commandName: string;
      handler: CommandHandler<unknown, unknown>;
      transactional?: boolean;
    }>,
  ): void {
    for (const registration of registrations) {
      this.register(registration.commandName, registration.handler, {
        transactional: registration.transactional,
      });
    }
  }

  async execute<TCommand, TResult>(
    commandName: string,
    command: TCommand,
  ): Promise<TResult> {
    const registration = this.handlers.get(commandName) as
      | RegisteredCommandHandler<TCommand, TResult>
      | undefined;

    if (!registration) {
      throw new Error(`Command handler '${commandName}' is not registered`);
    }

    const work = (): Promise<TResult> => registration.handler.execute(command);

    if (registration.transactional && this.transactionRunner) {
      return this.transactionRunner(work);
    }

    return work();
  }

  has(commandName: string): boolean {
    return this.handlers.has(commandName);
  }

  listRegisteredCommands(): string[] {
    return [...this.handlers.keys()].sort();
  }
}
