import { resolveTrustProxy } from '../../../src/config/app.config';
import { parseDurationMs } from '../../../src/config/jwt.config';
import { escapeHtml } from '../../../src/shared/utils/html.util';

describe('escapeHtml', () => {
  it('escapes markup and quotes', () => {
    expect(escapeHtml('<a href="x" onclick=\'y\'>&</a>')).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });

  it('stringifies non-string values', () => {
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('parseDurationMs', () => {
  it.each([
    ['15m', 15 * 60 * 1000],
    ['30d', 30 * 24 * 60 * 60 * 1000],
    ['12h', 12 * 60 * 60 * 1000],
    ['3600', 3600 * 1000],
    ['500ms', 500],
  ])('parses %s', (input, expected) => {
    expect(parseDurationMs(input)).toBe(expected);
  });

  it('rejects invalid durations', () => {
    expect(() => parseDurationMs('forever')).toThrow();
  });
});

describe('resolveTrustProxy', () => {
  it.each([
    ['false', false],
    ['', false],
    ['true', true],
    ['1', 1],
  ])('maps %p', (input, expected) => {
    expect(resolveTrustProxy(input)).toBe(expected);
  });

  it('splits address lists', () => {
    expect(resolveTrustProxy('10.0.0.0/8, 127.0.0.1')).toEqual([
      '10.0.0.0/8',
      '127.0.0.1',
    ]);
  });
});
