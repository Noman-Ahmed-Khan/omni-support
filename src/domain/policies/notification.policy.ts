export class NotificationPolicy {
  preferChannel(availableChannels: string[], preferredChannel?: string): string {
    if (preferredChannel && availableChannels.includes(preferredChannel)) {
      return preferredChannel;
    }

    if (availableChannels.includes('IN_APP')) {
      return 'IN_APP';
    }

    return availableChannels[0] ?? 'IN_APP';
  }
}
