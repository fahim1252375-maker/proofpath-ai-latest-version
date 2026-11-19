import React from 'react';

function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  const result: React.ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > cursor) result.push(text.slice(cursor, match.index));
    const token = match[0];
    if (token.startsWith('**')) result.push(<strong key={`${keyPrefix}-${index}`}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('*')) result.push(<em key={`${keyPrefix}-${index}`}>{token.slice(1, -1)}</em>);
    else if (token.startsWith('`')) result.push(<code key={`${keyPrefix}-${index}`} className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.9em] dark:bg-white/10">{token.slice(1, -1)}</code>);
    else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      const href = link ? safeExternalUrl(link[2]) : null;
      result.push(href
        ? <a key={`${keyPrefix}-${index}`} href={href} target="_blank" rel="noopener noreferrer" className="font-semibold underline decoration-[#C5F36A] decoration-2 underline-offset-2">{link?.[1]}</a>
        : link?.[1] || token);
    }
    cursor = match.index + token.length;
    index += 1;
  }
  if (cursor < text.length) result.push(text.slice(cursor));
  return result;
}

export function MarkdownMessage({ content }: { content: string }) {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let code: string[] | null = null;
  const flushParagraph = () => {
    if (paragraph.length) blocks.push(<p key={`p-${blocks.length}`} className="whitespace-pre-wrap">{inline(paragraph.join('\n'), `p-${blocks.length}`)}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) blocks.push(<ul key={`ul-${blocks.length}`} className="list-disc space-y-1 pl-5">{list.map((item, index) => <li key={index}>{inline(item, `li-${blocks.length}-${index}`)}</li>)}</ul>);
    list = [];
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line.startsWith('```')) {
      flushParagraph();
      flushList();
      if (code) {
        blocks.push(<pre key={`code-${lineIndex}`} className="overflow-x-auto rounded-lg bg-[#101713] p-3 text-xs text-[#F7F7F0]"><code>{code.join('\n')}</code></pre>);
        code = null;
      } else code = [];
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const headingText = inline(heading[2], `h-${lineIndex}`);
      if (heading[1].length === 1) blocks.push(<h3 key={`h-${lineIndex}`} className="font-display text-base font-bold">{headingText}</h3>);
      else if (heading[1].length === 2) blocks.push(<h4 key={`h-${lineIndex}`} className="font-display text-sm font-bold">{headingText}</h4>);
      else blocks.push(<h5 key={`h-${lineIndex}`} className="font-semibold">{headingText}</h5>);
      continue;
    }
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
      continue;
    }
    const numbered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (numbered) {
      flushParagraph();
      list.push(numbered[1]);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  if (code) blocks.push(<pre key="code-open" className="overflow-x-auto rounded-lg bg-[#101713] p-3 text-xs text-[#F7F7F0]"><code>{code.join('\n')}</code></pre>);
  flushParagraph();
  flushList();
  return <div className="space-y-2">{blocks}</div>;
}
