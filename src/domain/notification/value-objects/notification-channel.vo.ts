export enum NotificationChannelValue {
  IN_APP = 'IN_APP',
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
}

export class NotificationChannel {
  private constructor(private readonly value: NotificationChannelValue) {}

  static create(value: string): NotificationChannel {
    const normalized = value.trim().toUpperCase();
    if (!Object.values(NotificationChannelValue).includes(normalized as NotificationChannelValue)) {
      throw new Error(`Invalid notification channel: ${value}`);
    }
    return new NotificationChannel(normalized as NotificationChannelValue);
  }

  isExternal(): boolean {
    return this.value !== NotificationChannelValue.IN_APP;
  }

  toString(): string {
    return this.value;
  }
}
