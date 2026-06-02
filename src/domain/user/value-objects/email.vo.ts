export class Email {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static create(input: string): Email {
    const normalized = input.toLowerCase().trim();

    if (!Email.isValid(normalized)) {
      throw new Error(`Invalid email address: ${input}`);
    }

    return new Email(normalized);
  }

  private static isValid(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  toString(): string {
    return this.value;
  }

  getDomain(): string {
    return this.value.split('@')[1];
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }
}
