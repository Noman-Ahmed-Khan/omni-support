export class TenantSlug {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static create(input: string): TenantSlug {
    const slug = input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (slug.length < 3) {
      throw new Error('Tenant slug must be at least 3 characters');
    }

    if (slug.length > 63) {
      throw new Error('Tenant slug must not exceed 63 characters');
    }

    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
      throw new Error('Tenant slug must start and end with alphanumeric character');
    }

    return new TenantSlug(slug);
  }

  toString(): string {
    return this.value;
  }

  equals(other: TenantSlug): boolean {
    return this.value === other.value;
  }
}