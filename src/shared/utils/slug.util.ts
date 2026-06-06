export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function appendSlugSuffix(slug: string, suffix: string): string {
  const normalizedSuffix = slugify(suffix);
  return normalizedSuffix ? `${slug}-${normalizedSuffix}` : slug;
}
