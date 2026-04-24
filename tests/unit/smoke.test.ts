import { describe, it, expect } from 'vitest';

describe('scaffold smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });

  it('has DOM via jsdom', () => {
    const div = document.createElement('div');
    div.textContent = 'hello';
    expect(div.textContent).toBe('hello');
  });
});
