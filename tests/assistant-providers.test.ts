import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateLocalAssistantResponse, getAssistantProviderStatus, getProviderSettings } from '../server/assistant-providers.ts';

const providerEnvKeys = [
  'OLLAMA_BASE_URL',
  'OLLAMA_ENABLED',
  'OLLAMA_MODEL',
  'OPENJARVIS_BASE_URL',
  'OPENJARVIS_MODEL',
  'OPENJARVIS_API_KEY',
] as const;
const originalProviderEnv = Object.fromEntries(providerEnvKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of providerEnvKeys) {
    const value = originalProviderEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
});

describe('server-side local assistant providers', () => {
  it('accepts loopback endpoints and refuses external or credential-bearing URLs', () => {
    process.env.OLLAMA_BASE_URL = 'http://192.168.1.20:11434';
    process.env.OPENJARVIS_BASE_URL = 'http://user:pass@localhost:8000';

    const settings = getProviderSettings();

    expect(settings.ollamaBase).toBeNull();
    expect(settings.openJarvisConfigured).toBe(false);
    expect(settings.openJarvisBase).toBeNull();
    expect(settings.ollamaModel).toBe('qwen3.5:2b');
  });

  it('detects listed local models using normalized loopback API paths', async () => {
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
    process.env.OLLAMA_MODEL = 'qwen3.5:2b';
    process.env.OPENJARVIS_BASE_URL = 'http://localhost:8000';
    process.env.OPENJARVIS_MODEL = 'qwen3.5:4b';

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input)).pathname;
      const payload = pathname === '/api/tags'
        ? { models: [{ name: 'qwen3.5:2b' }] }
        : { data: [{ id: 'qwen3.5:4b' }] };
      return new Response(JSON.stringify(payload), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const statuses = await getAssistantProviderStatus();
    const ollama = statuses.find((item) => item.id === 'ollama');
    const openJarvis = statuses.find((item) => item.id === 'openjarvis');

    expect(ollama?.available).toBe(true);
    expect(openJarvis?.available).toBe(true);
    expect(fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname).sort())
      .toEqual(['/api/tags', '/v1/models']);
  });

  it('supports an explicit Ollama disable switch for hosted demos', async () => {
    process.env.OLLAMA_ENABLED = 'false';
    const settings = getProviderSettings();
    expect(settings.ollamaBase).toBeNull();

    const statuses = await getAssistantProviderStatus();
    expect(statuses.find((item) => item.id === 'ollama')).toMatchObject({
      configured: false,
      available: false,
      model: null,
    });
  });

  it('disables Ollama thinking and returns the final chat content', async () => {
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
    process.env.OLLAMA_MODEL = 'qwen3.5:2b';
    delete process.env.OPENJARVIS_BASE_URL;

    let chatRequest: Record<string, unknown> | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const pathname = new URL(String(input)).pathname;
      if (pathname === '/api/tags') {
        return new Response(JSON.stringify({ models: [{ name: 'qwen3.5:2b' }] }), { status: 200 });
      }
      chatRequest = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ message: { content: 'Local model check passed.' } }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await generateLocalAssistantResponse('ollama', {
      prompt: 'Reply with exactly: Local model check passed.',
      language: 'en',
      maxOutputTokens: 650,
    });

    expect(chatRequest?.think).toBe(false);
    expect(response).toMatchObject({
      text: 'Local model check passed.',
      provider: 'ollama',
      model: 'qwen3.5:2b',
    });
  });
});
