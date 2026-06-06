export interface CommandHandler<TCommand = unknown, TResult = void> {
  execute(command: TCommand): Promise<TResult>;
}
