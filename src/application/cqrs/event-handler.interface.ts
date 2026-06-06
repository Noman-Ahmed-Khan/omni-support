export interface EventHandler<TEvent = unknown> {
  handle(event: TEvent): Promise<void>;
}
