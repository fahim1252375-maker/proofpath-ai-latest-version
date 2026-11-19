import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownMessage } from '../src/components/assistant/MarkdownMessage.tsx';

describe('assistant Markdown rendering', () => {
  it('keeps parsing after paragraph breaks and closes fenced code blocks at end of input', () => {
    const markup = renderToStaticMarkup(
      <MarkdownMessage content={'First paragraph.\n\nSecond paragraph.\n\n```text\nplain output'} />
    );

    expect(markup).toContain('First paragraph.');
    expect(markup).toContain('Second paragraph.');
    expect(markup).toContain('plain output');
    expect(markup.match(/<p(?:\s|>)/g)).toHaveLength(2);
    expect(markup).toContain('<pre');
  });
});
