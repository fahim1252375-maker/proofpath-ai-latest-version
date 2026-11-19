import React, { useEffect, useRef, useState } from 'react';
import { AudioLines, Bot, CalendarDays, Check, ClipboardCheck, Copy, ExternalLink, FileText, Loader2, MessagesSquare, Mic, Plus, RotateCcw, Search, Send, Square, Trash2, Volume2, VolumeX } from 'lucide-react';
import { getAdvisorWorkflows, type AdvisorWorkflow } from '../lib/advisorWorkflows';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { AssistantMessage, ConversationItem } from '../types';
import { EmptyState, SkeletonBlock } from '../components/ui/Common';
import { JarvisOrb, JarvisOrbStyles } from '../components/assistant/JarvisOrb';
import { MarkdownMessage } from '../components/assistant/MarkdownMessage';

interface RecognitionResultEvent extends Event {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  }
}

/**
 * Copilot availability states, derived only from the server's own
 * fallbackReason (Guided Mode is never described as Gemini output).
 */
export type AssistantFallbackKind =
  | 'quota_exhausted'
  | 'provider_off'
  | 'consent_required'
  | 'outdated_consent'
  | 'provider_unavailable'
  | 'local_provider_unavailable';

export interface AssistantFallbackNotice {
  kind: AssistantFallbackKind;
  title: string;
  detail: string;
}

const QUOTA_REASONS = ['user_limit', 'global_limit', 'concurrency_limit'] as const;
const PROVIDER_OFF_REASONS = [
  'disabled',
  'free_tier_unconfirmed',
  'student_audience_unapproved',
  'model_unavailable',
  'api_key_missing',
  'global_limit_unconfigured',
] as const;

export function classifyAssistantFallback(
  fallbackReason: string | null | undefined,
  options: { previousConsentAt?: string | null } = {}
): AssistantFallbackNotice | null {
  if (!fallbackReason) return null;

  if (fallbackReason === 'consent_required') {
    if (options.previousConsentAt) {
      return {
        kind: 'outdated_consent',
        title: 'Your earlier Gemini consent is outdated',
        detail:
          'ProofPath versions its AI privacy terms, and the consent decision saved on ' +
          `${options.previousConsentAt.slice(0, 10)} no longer applies to the current version. ` +
          'Review the “What is sent to Google?” summary and tick the consent box again to re-enable Gemini. ' +
          'Your question was answered locally in Guided Mode.',
      };
    }
    return {
      kind: 'consent_required',
      title: 'External AI needs your consent',
      detail:
        'Gemini stayed off because external processing is not consented for your account. ' +
        'Guided Mode answered locally using your ProofPath data. Tick the consent box in the privacy panel above if you want Gemini Free responses.',
    };
  }

  if ((QUOTA_REASONS as readonly string[]).includes(fallbackReason)) {
    return {
      kind: 'quota_exhausted',
      title: 'Today’s Gemini quota is used up',
      detail:
        'Your daily allowance or the site-wide free-tier cap is spent, so Gemini was not called. ' +
        'Guided Mode answered locally from your ProofPath data and remains fully available. Counters reset at midnight Pacific time.',
    };
  }

  if ((PROVIDER_OFF_REASONS as readonly string[]).includes(fallbackReason)) {
    return {
      kind: 'provider_off',
      title: 'Gemini is switched off by the operator',
      detail:
        'This deployment has not enabled external AI: the free tier, model, API key, and project cap must all be confirmed by the operator first. ' +
        'Guided Mode answered locally from your records and is unaffected.',
    };
  }

  if (fallbackReason === 'local_provider_unavailable') {
    return {
      kind: 'local_provider_unavailable',
      title: 'That local model is unavailable',
      detail: 'ProofPath used deterministic Guided Mode. Check that the local server is running and the selected model is installed, then try again.',
    };
  }

  return {
    kind: 'provider_unavailable',
    title: 'Gemini is unavailable right now',
    detail:
      fallbackReason === 'provider_rate_limited'
        ? 'Google rate-limited the request, so no message was sent externally. Guided Mode answered locally; try again after the counter resets at midnight Pacific time.'
        : 'Gemini could not be reached, so nothing was sent externally. Guided Mode answered locally from your ProofPath data.',
  };
}

/**
 * The availability endpoint keeps the consent contract unchanged: it reports
 * only the active consent flag and the last decision timestamp. A timestamp
 * with an inactive flag means a previous decision exists but is no longer
 * active (outdated version or revoked), which is what the re-consent UX keys on.
 */
export function hasInactiveConsentDecision(status: {
  consent: boolean;
  consentUpdatedAt: string | null;
} | null): boolean {
  return Boolean(status && !status.consent && status.consentUpdatedAt);
}

export function AssistantPage({
  initialOpportunityId = '',
  initialReportId = '',
}: {
  initialOpportunityId?: string;
  initialReportId?: string;
}) {
  const { user, addToast } = useAuth();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [language, setLanguage] = useState<'en' | 'bn'>(user?.preferredLanguage || 'en');
  const [input, setInput] = useState('');
  const [providerPreference, setProviderPreference] = useState<'auto' | 'guided' | 'ollama' | 'openjarvis' | 'gemini'>('auto');
  const [conversationSearch, setConversationSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const generationAbort = useRef<AbortController | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [aiStatus, setAiStatus] = useState<{
    availability: string;
    aiReady: boolean;
    consent: boolean;
    consentUpdatedAt: string | null;
    usedToday: number;
    dailyLimit: number;
    remainingToday: number;
    resetAt: string;
    localProviders: Array<{
      id: 'ollama' | 'openjarvis';
      label: string;
      configured: boolean;
      available: boolean;
      model: string | null;
      models: string[];
      detail: string;
    }>;
  } | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<AssistantFallbackNotice | null>(null);
  const [retryPrompt, setRetryPrompt] = useState('');
  const [sendError, setSendError] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const loadConversations = async () => {
    setLoadingConvs(true);
    try {
      const data = await apiRequest<{ items: ConversationItem[] }>('/api/assistant/conversations');
      setConversations(data.items);
      if (!activeConvId && data.items.length > 0 && !initialOpportunityId && !initialReportId) {
        setActiveConvId(data.items[0].id);
        setLanguage(data.items[0].language);
      }
    } finally {
      setLoadingConvs(false);
    }
  };

  useEffect(() => {
    loadConversations();
    apiRequest<typeof aiStatus>('/api/assistant/status')
      .then(setAiStatus)
      .catch(() => setAiStatus(null));
  }, []);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const loadVoices = () => setBrowserVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
      window.speechSynthesis.cancel();
      recognitionRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (!activeConvId) {
      setMessages([]);
      return;
    }
    setLoadingMsgs(true);
    apiRequest<{ items: AssistantMessage[] }>(`/api/assistant/conversations/${activeConvId}/messages`)
      .then((res) => setMessages(res.items))
      .catch(() => setMessages([]))
      .finally(() => setLoadingMsgs(false));
  }, [activeConvId]);

  const handleSend = async (promptText?: string) => {
    const text = (promptText ?? input).trim();
    if (!text || sending) return;
    setSending(true);
    const controller = new AbortController();
    generationAbort.current = controller;
    if (!promptText) setInput('');

    try {
      const res = await apiRequest<{
        conversationId: string;
        userMessage: AssistantMessage;
        assistantMessage: AssistantMessage;
        fallbackReason: string | null;
        usage: { usedToday: number; dailyLimit: number; resetAt: string };
      }>('/api/assistant/chat', {
        method: 'POST',
        body: JSON.stringify({
          conversationId: activeConvId || undefined,
          message: text,
          language,
          contextOpportunityId: initialOpportunityId || undefined,
          contextReportId: initialReportId || undefined,
          provider: providerPreference,
        }),
        signal: controller.signal,
      });

      if (!activeConvId) {
        setActiveConvId(res.conversationId);
        await loadConversations();
      }
      setMessages((prev) => [...prev, res.userMessage, res.assistantMessage]);
      setAiStatus((current) => current ? {
        ...current,
        usedToday: res.usage.usedToday,
        dailyLimit: res.usage.dailyLimit,
        remainingToday: Math.max(0, res.usage.dailyLimit - res.usage.usedToday),
        resetAt: res.usage.resetAt,
      } : current);
      setRetryPrompt('');
      setSendError('');
      setFallbackNotice(
        classifyAssistantFallback(res.fallbackReason, {
          previousConsentAt: res.fallbackReason === 'consent_required' ? aiStatus?.consentUpdatedAt || null : null,
        })
      );
    } catch (err) {
      setRetryPrompt(text);
      setSendError(controller.signal.aborted
        ? 'Local generation stopped. Your message remains in this conversation.'
        : err instanceof Error ? err.message : 'Unable to reach ProofPath Advisor.');
      setFallbackNotice(null);
    } finally {
      if (generationAbort.current === controller) generationAbort.current = null;
      setSending(false);
    }
  };

  const handleStop = () => generationAbort.current?.abort();

  const handleRegenerate = async () => {
    if (!activeConvId || sending) return;
    setSending(true);
    setSendError('');
    try {
      const res = await apiRequest<{
        fallbackReason: string | null;
        assistantMessage: AssistantMessage;
        usage: { usedToday: number; dailyLimit: number; resetAt: string };
      }>(`/api/assistant/conversations/${activeConvId}/regenerate`, {
        method: 'POST',
        body: JSON.stringify({ provider: providerPreference }),
      });
      setMessages((previous) => previous.map((message) => message.id === res.assistantMessage.id ? res.assistantMessage : message));
      setAiStatus((current) => current ? {
        ...current,
        usedToday: res.usage.usedToday,
        dailyLimit: res.usage.dailyLimit,
        remainingToday: Math.max(0, res.usage.dailyLimit - res.usage.usedToday),
        resetAt: res.usage.resetAt,
      } : current);
      setFallbackNotice(classifyAssistantFallback(res.fallbackReason));
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Unable to regenerate the response.');
    } finally {
      setSending(false);
    }
  };

  const startVoiceInput = () => {
    if (language === 'bn') {
      addToast({ type: 'error', title: 'Bengali dictation is not enabled', description: 'Browser Bengali recognition has not been reliability-tested. Type Bengali text or switch the response language to English for browser dictation.' });
      return;
    }
    const Constructor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Constructor) {
      addToast({ type: 'error', title: 'Voice input unavailable', description: 'This browser does not expose speech recognition. You can still type your message.' });
      return;
    }
    const recognition = new Constructor();
    recognitionRef.current = recognition;
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() || '';
      if (transcript) {
        setInput((current) => current ? `${current} ${transcript}` : transcript);
        setVoiceTranscript(transcript);
      }
    };
    recognition.onerror = () => {
      setListening(false);
      addToast({ type: 'error', title: 'Could not recognize speech', description: 'Review microphone permission or type your message instead.' });
    };
    recognition.onend = () => setListening(false);
    try {
      setListening(true);
      setVoiceTranscript('');
      recognition.start();
    } catch {
      setListening(false);
      addToast({ type: 'error', title: 'Microphone unavailable', description: 'Your browser could not start speech recognition.' });
    }
  };

  const speakMessage = (message: AssistantMessage) => {
    if (!('speechSynthesis' in window)) return;
    if (speakingMessageId === message.id) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }
    const prefix = language === 'bn' ? 'bn' : 'en';
    const voice = browserVoices.find((candidate) => candidate.lang.toLowerCase().startsWith(prefix));
    if (!voice) {
      addToast({ type: 'error', title: 'No matching browser voice', description: language === 'bn' ? 'Bengali voice output is not confirmed on this browser. Read the response instead.' : 'No English speech voice is available in this browser.' });
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message.content);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);
    setSpeakingMessageId(message.id);
    window.speechSynthesis.speak(utterance);
  };

  const handleConsentChange = async (enabled: boolean) => {
    try {
      await apiRequest('/api/assistant/consent', {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      });
      const next = await apiRequest<typeof aiStatus>('/api/assistant/status');
      setAiStatus(next);
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Privacy setting not saved',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    }
  };

  const handleNewChat = () => {
    setActiveConvId(null);
    setMessages([]);
  };

  const handleDeleteConv = async (id: string) => {
    await apiRequest(`/api/assistant/conversations/${id}`, { method: 'DELETE' });
    if (activeConvId === id) {
      setActiveConvId(null);
      setMessages([]);
    }
    loadConversations();
  };

  const handleClearHistory = async () => {
    if (!window.confirm('Clear all of your saved advisor conversations? This cannot be undone.')) return;
    await apiRequest('/api/assistant/conversations', { method: 'DELETE' });
    setActiveConvId(null);
    setMessages([]);
    await loadConversations();
  };

  const handleCopy = async (message: AssistantMessage) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      window.setTimeout(() => setCopiedMessageId(null), 1500);
    } catch {
      addToast({ type: 'error', title: 'Copy unavailable', description: 'Your browser did not allow clipboard access.' });
    }
  };

  const suggestedQuestions =
    language === 'bn'
      ? [
          'আমার প্রোফাইল অনুযায়ী কোন স্কলারশিপগুলো সবচেয়ে উপযুক্ত?',
          'ভুয়া স্কলারশিপ বা ইন্টার্নশিপ প্রতারণা চেনার উপায় কী?',
          'আমার প্রোফাইলের সঙ্গে কোন প্রকাশিত সুযোগের রেকর্ড মেলে?',
        ]
      : [
          'Which published opportunity records match my profile?',
          'What red flags indicate a scholarship or internship scam?',
          'Compare eligibility requirements in my saved opportunity records.',
          'What documents should I prepare 3 months before deadlines?',
        ];

  const advisorWorkflows = getAdvisorWorkflows(language);
  const localProviders = aiStatus?.localProviders || [];
  const ollamaStatus = localProviders.find((provider) => provider.id === 'ollama');
  const openJarvisStatus = localProviders.find((provider) => provider.id === 'openjarvis');
  const speechRecognitionAvailable = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  const matchingSpeechVoice = browserVoices.some((voice) => voice.lang.toLowerCase().startsWith(language === 'bn' ? 'bn' : 'en'));
  const filteredConversations = conversations.filter((conversation) => conversation.title.toLowerCase().includes(conversationSearch.trim().toLowerCase()));
  const lastAssistantMessageId = [...messages].reverse().find((message) => message.role === 'assistant')?.id;
  const workflowIcons = {
    roadmap: CalendarDays,
    eligibility: ClipboardCheck,
    statement: FileText,
    interview: MessagesSquare,
  } as const;

  return (
    <div className="pp-depth-page pp-depth-assistant space-y-4">
      <JarvisOrbStyles />
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="font-mono text-[11px] font-semibold tracking-wider text-[#5E6B5B] uppercase dark:text-[#C5F36A]">
            Student opportunity intelligence
          </p>
          <h1 className="mt-0.5 font-display text-2xl font-bold text-[#101713] dark:text-[#F7F7F0]">
            JARVIS Student Advisor
          </h1>
          <p className="text-xs text-[#5E6B5B] dark:text-[#8C9A88]">
            Practical guidance grounded in your saved profile, published opportunities, and application records.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg bg-[#E4E8E0]/60 p-1 dark:bg-[#1D2520]">
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`rounded-md px-3 py-1 text-xs font-semibold ${
                language === 'en'
                  ? 'bg-[#101713] text-[#C5F36A] dark:bg-[#C5F36A] dark:text-[#101713]'
                  : 'text-[#5E6B5B] dark:text-[#A9B5A6]'
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setLanguage('bn')}
              className={`rounded-md px-3 py-1 text-xs font-semibold ${
                language === 'bn'
                  ? 'bg-[#101713] text-[#C5F36A] dark:bg-[#C5F36A] dark:text-[#101713]'
                  : 'text-[#5E6B5B] dark:text-[#A9B5A6]'
              }`}
            >
              বাংলা (Bangla)
            </button>
          </div>
          <button
            type="button"
            onClick={handleNewChat}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#101713] px-3 py-1.5 text-xs font-semibold text-[#C5F36A] hover:bg-[#1D2520] dark:bg-[#C5F36A] dark:text-[#101713]"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Session</span>
          </button>
        </div>
      </div>

      <section className="jarvis-console flex flex-col gap-4 rounded-2xl border border-[#344339] bg-[#101713] p-4 text-[#F7F7F0] shadow-xl shadow-[#101713]/10 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-center gap-4">
          <JarvisOrb size="lg" active={sending} />
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C5F36A]">JARVIS · advisory core</p>
            <p className="mt-1 text-sm font-semibold">
              {providerPreference === 'guided' ? 'Deterministic ProofPath guidance'
                : providerPreference === 'gemini' ? 'Gemini Free, with consent and operator limits'
                : providerPreference === 'ollama' ? (ollamaStatus?.available ? `Local model ready · ${ollamaStatus.model}` : 'Ollama local model unavailable')
                : providerPreference === 'openjarvis' ? (openJarvisStatus?.available ? `OpenJarvis ready · ${openJarvisStatus.model}` : 'OpenJarvis API unavailable')
                : ollamaStatus?.available ? `Local-first · ${ollamaStatus.model}`
                : openJarvisStatus?.available ? `OpenJarvis local · ${openJarvisStatus.model}`
                : 'Guided mode ready · checking optional providers'}
            </p>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[#A9B5A6]">
              A model receives only the current redacted message. Your saved profile, prior chats, private reports, and files are not included in provider requests. Eligibility and evidence summaries below come from ProofPath’s existing rules and records.
            </p>
          </div>
        </div>
        <label className="flex min-w-0 flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-[#A9B5A6] sm:w-64">
          Response provider
          <select
            value={providerPreference}
            onChange={(event) => setProviderPreference(event.target.value as typeof providerPreference)}
            className="h-10 rounded-lg border border-[#3A493E] bg-[#1D2520] px-3 text-xs font-medium normal-case tracking-normal text-[#F7F7F0] outline-none focus:border-[#C5F36A]"
            aria-label="Choose JARVIS response provider"
          >
            <option value="auto">Automatic · local first</option>
            <option value="guided">ProofPath Guided Mode</option>
            <option value="ollama">Ollama local{ollamaStatus?.model ? ` · ${ollamaStatus.model}` : ''}</option>
            <option value="openjarvis">OpenJarvis local API{openJarvisStatus?.model ? ` · ${openJarvisStatus.model}` : ''}</option>
            <option value="gemini">Gemini Free · consent required</option>
          </select>
        </label>
      </section>

      <section aria-label="AI privacy and availability" className="rounded-xl border border-[#DCE5D3] bg-white p-4 dark:border-[#2C3730] dark:bg-[#141B17]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#101713] dark:text-[#F7F7F0]">
              {ollamaStatus?.available ? 'A local Ollama model is reachable from this ProofPath server' : openJarvisStatus?.available ? 'The local OpenJarvis API is reachable' : aiStatus?.aiReady && aiStatus.availability === 'ready' ? 'Gemini Free is available with your consent' : 'ProofPath Guided Mode is available'}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[#5E6B5B] dark:text-[#A9B5A6]">
              {aiStatus?.availability === 'ready'
                ? `${aiStatus.remainingToday} of ${aiStatus.dailyLimit} daily Gemini responses remain. The counter resets at ${new Date(aiStatus.resetAt).toLocaleString()}.`
                : 'Local model calls are enabled only when a loopback service is reachable. Gemini stays off unless its terms are compatible with this student-facing service, the operator confirms that review, the project limits are configured, and you opt in. Guided Mode uses deterministic ProofPath data.'}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-[#F0F4E9] px-3 py-1 text-xs font-semibold text-[#40552F] dark:bg-[#1D2A1E] dark:text-[#C5F36A]">
            {ollamaStatus?.available ? 'Local model · no cloud call' : openJarvisStatus?.available ? 'Local API · server-side' : aiStatus?.aiReady && aiStatus.availability === 'ready' ? 'Free tier · capped' : 'No-cost guided mode'}
          </span>
        </div>
        <details className="mt-3 rounded-lg bg-[#F7F7F0] p-3 text-xs leading-relaxed text-[#455044] dark:bg-[#0C110E] dark:text-[#A9B5A6]">
          <summary className="cursor-pointer font-semibold text-[#101713] dark:text-[#F7F7F0]">What is sent to Google?</summary>
          <p className="mt-2">
            Only your current message is sent to Google Gemini after obvious email addresses, phone numbers, and labeled identity numbers are removed. Redaction can miss details, so do not include sensitive or confidential information. Your profile, previous chats, verification reports, and uploaded files are never included. Google’s Free-tier terms may allow prompts and responses to be used to improve its products; see the{' '}
            <a href="https://aistudio.google.com/docs/terms" target="_blank" rel="noopener noreferrer" className="font-semibold underline">Gemini API terms</a>.
          </p>
          <p className="mt-2">You can turn external processing off at any time. Guided Mode remains available.</p>
        </details>
        <label className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-[#243329] dark:text-[#D5DDD2]">
          <input
            type="checkbox"
            className="mt-0.5 accent-[#668A38]"
            checked={Boolean(aiStatus?.consent)}
            onChange={(event) => handleConsentChange(event.target.checked)}
          />
          <span>Allow my current message, after limited best-effort redaction, to be sent to Google Gemini Free. Google may use Free-tier prompts and responses to improve its products. Gemini remains unavailable unless the operator also confirms the service audience is compatible with Google’s current terms.</span>
        </label>
        {hasInactiveConsentDecision(aiStatus) && (
          <p role="status" className="mt-2 rounded-lg bg-[#C5F36A]/20 px-2.5 py-2 text-[11px] font-medium leading-relaxed text-[#101713] dark:bg-[#C5F36A]/10 dark:text-[#C5F36A]">
            Your earlier consent (saved {aiStatus?.consentUpdatedAt?.slice(0, 10)}) is outdated: ProofPath versions its AI privacy terms, so the previous approval no longer applies. Review the terms above and tick the box to consent again. Guided Mode stays available either way.
          </p>
        )}
      </section>

      {(initialOpportunityId || initialReportId) && (
        <div className="rounded-lg border border-[#9ECF42] bg-[#C5F36A]/20 px-3 py-2 text-xs font-medium text-[#101713] dark:border-[#C5F36A]/40 dark:bg-[#C5F36A]/10 dark:text-[#C5F36A]">
          Context attached: {initialOpportunityId ? `Opportunity ${initialOpportunityId}` : `Verification Report ${initialReportId}`}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Conversation History */}
        <aside className="rounded-xl border border-[#E4E8E0] bg-white p-3 lg:col-span-3 dark:border-[#232D27] dark:bg-[#141B17]">
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <p className="font-mono text-[11px] font-semibold text-[#5E6B5B] uppercase dark:text-[#8C9A88]">Conversations</p>
            {conversations.length > 0 && <button type="button" onClick={handleClearHistory} className="text-[10px] font-semibold text-[#71806E] underline hover:text-red-600">Clear all</button>}
          </div>
          <label className="relative mb-2 block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#71806E]" aria-hidden="true" />
            <input
              type="search"
              value={conversationSearch}
              onChange={(event) => setConversationSearch(event.target.value)}
              placeholder="Search conversations"
              aria-label="Search saved conversations"
              className="h-9 w-full rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] pl-8 pr-2 text-xs text-[#101713] outline-none focus:border-[#9BAA91] dark:border-[#354139] dark:bg-[#0C110E] dark:text-[#F7F7F0]"
            />
          </label>
          {loadingConvs ? (
            <SkeletonBlock className="h-24" />
          ) : filteredConversations.length === 0 ? (
            <p className="px-2 py-4 text-xs text-[#5E6B5B]">No saved conversations yet.</p>
          ) : (
            <div className="space-y-1">
              {filteredConversations.map((c) => (
                <div
                  key={c.id}
                  className={`group flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs ${
                    activeConvId === c.id
                      ? 'bg-[#101713] text-[#C5F36A] dark:bg-[#C5F36A] dark:text-[#101713]'
                      : 'text-[#101713] hover:bg-[#F7F7F0] dark:text-[#E4E8E0] dark:hover:bg-[#1D2520]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActiveConvId(c.id);
                      setLanguage(c.language);
                    }}
                    className="min-w-0 flex-1 truncate text-left font-semibold"
                  >
                    {c.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteConv(c.id)}
                    aria-label="Delete conversation"
                    className="opacity-0 group-hover:opacity-100 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Chat Viewport */}
        <div className="flex h-[560px] flex-col rounded-xl border border-[#E4E8E0] bg-white lg:col-span-9 dark:border-[#232D27] dark:bg-[#141B17]">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {loadingMsgs ? (
              <SkeletonBlock className="h-32" />
            ) : messages.length === 0 ? (
              <div className="space-y-6 py-4">
                <EmptyState
                  icon={<Bot className="h-5 w-5" />}
                  title={
                    language === 'bn'
                      ? 'প্রুফপাথ এআই উপদেষ্টাকে জিজ্ঞাসা করুন'
                      : 'Ask ProofPath AI Advisor'
                  }
                  description={
                    language === 'bn'
                      ? 'আপনার যোগ্যতা, স্কলারশিপের শর্তাবলী বা ভেরিফিকেশন রিপোর্ট সম্পর্কে প্রশ্ন করুন।'
                      : 'Ask about opportunity authenticity, eligibility gaps, or application preparation in English or বাংলা.'
                  }
                />
                <section aria-labelledby="advisor-studio-heading" className="space-y-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[#71806E] dark:text-[#C5F36A]">
                        Guided AI workflows
                      </p>
                      <h3 id="advisor-studio-heading" className="font-display text-base font-bold text-[#101713] dark:text-[#F7F7F0]">
                        {language === 'bn' ? 'Strategy Studio' : 'Strategy Studio'}
                      </h3>
                    </div>
                    <p className="text-[11px] text-[#71806E] dark:text-[#8C9A88]">
                      {language === 'bn' ? 'আপনার বর্তমান প্রোফাইল ও উপলব্ধ রেকর্ড ব্যবহার করে' : 'Uses your profile and available records'}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {advisorWorkflows.map((workflow) => {
                      const Icon = workflowIcons[workflow.id];
                      return (
                        <button
                          key={workflow.id}
                          type="button"
                          disabled={sending}
                          onClick={() => handleSend(workflow.prompt)}
                          className="group flex min-h-[124px] items-start gap-3 rounded-xl border border-[#E4E8E0] bg-[#FBFBF7] p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[#A6B98F] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#2C3730] dark:bg-[#101713] dark:hover:border-[#C5F36A]/60"
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E4E8E0] bg-white text-[#243329] transition-colors group-hover:border-[#C5F36A] group-hover:bg-[#C5F36A]/20 dark:border-[#354139] dark:bg-[#1D2520] dark:text-[#C5F36A]">
                            <Icon className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-[#101713] dark:text-[#F7F7F0]">{workflow.title}</span>
                            <span className="mt-1 block text-xs leading-relaxed text-[#71806E] dark:text-[#9EAD9B]">{workflow.description}</span>
                            <span className="mt-3 inline-flex items-center text-[10px] font-semibold uppercase tracking-wider text-[#5E6B5B] group-hover:text-[#101713] dark:text-[#C5F36A] dark:group-hover:text-[#F7F7F0]">
                              {language === 'bn' ? 'Workflow শুরু করুন' : 'Start workflow'} <span className="ml-1" aria-hidden="true">→</span>
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section aria-labelledby="quick-question-heading" className="space-y-2">
                  <h3 id="quick-question-heading" className="text-[11px] font-semibold text-[#71806E] dark:text-[#8C9A88]">
                    {language === 'bn' ? 'অথবা দ্রুত একটি প্রশ্ন করুন' : 'Or start with a quick question'}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {suggestedQuestions.map((q) => (
                      <button
                        key={q}
                        type="button"
                        disabled={sending}
                        onClick={() => handleSend(q)}
                        className="rounded-lg border border-[#E4E8E0] px-3 py-2 text-left text-xs font-medium text-[#243329] transition-colors hover:border-[#9BAA91] hover:bg-[#F7F7F0] disabled:opacity-50 dark:border-[#354139] dark:text-[#D5DDD2] dark:hover:bg-[#1D2520]"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-[#101713] text-[#F7F7F0] dark:bg-[#C5F36A] dark:text-[#101713]'
                        : 'border border-[#E4E8E0] bg-[#F7F7F0] text-[#101713] dark:border-[#232D27] dark:bg-[#0C110E] dark:text-[#F7F7F0]'
                    }`}
                  >
                    {m.role === 'assistant' && (
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-[#5E6B5B] dark:text-[#A9B5A6]">
                        <span className="inline-flex items-center gap-1.5">
                          <JarvisOrb size="sm" active={sending && m.id === lastAssistantMessageId} />
                          {m.provider === 'ollama' ? 'Ollama · local model'
                            : m.provider === 'openjarvis' ? 'OpenJarvis · local API'
                            : m.provider === 'gemini' || m.responseMode === 'gemini' ? 'Gemini Free · local checks'
                            : 'ProofPath JARVIS response'}
                        </span>
                        <span className="flex items-center gap-1">
                          {m.role === 'assistant' && 'groundingRefs' in m && matchingSpeechVoice && (
                            <button type="button" onClick={() => speakMessage(m)} className="inline-flex items-center gap-1 rounded px-1 py-0.5 normal-case tracking-normal hover:bg-white/60 dark:hover:bg-[#1D2520]" aria-label={speakingMessageId === m.id ? 'Stop speaking response' : 'Read response aloud'}>
                              {speakingMessageId === m.id ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                            </button>
                          )}
                          <button type="button" onClick={() => handleCopy(m)} className="inline-flex items-center gap-1 rounded px-1 py-0.5 normal-case tracking-normal hover:bg-white/60 dark:hover:bg-[#1D2520]" aria-label="Copy assistant response">
                            {copiedMessageId === m.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            {copiedMessageId === m.id ? 'Copied' : 'Copy'}
                          </button>
                          {activeConvId && m.id === lastAssistantMessageId && (
                            <button type="button" onClick={handleRegenerate} disabled={sending} className="inline-flex items-center gap-1 rounded px-1 py-0.5 normal-case tracking-normal hover:bg-white/60 disabled:opacity-40 dark:hover:bg-[#1D2520]" aria-label="Regenerate assistant response">
                              <RotateCcw className="h-3 w-3" />
                              <span className="sr-only sm:not-sr-only">Regenerate</span>
                            </button>
                          )}
                        </span>
                      </div>
                    )}
                    <MarkdownMessage content={m.content} />
                    {m.groundingRefs && m.groundingRefs.length > 0 && (
                      <div className="mt-3 border-t border-[#E4E8E0] pt-2 text-xs dark:border-[#232D27]">
                        <p className="font-semibold text-[#5E6B5B]">Links from your saved ProofPath records:</p>
                        <ul className="mt-1 space-y-1">
                          {m.groundingRefs.map((ref, idx) => (
                            <li key={idx}>
                              <a
                                href={ref.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-semibold text-[#101713] underline decoration-[#C5F36A] decoration-2 dark:text-[#C5F36A]"
                              >
                                <span className="truncate max-w-xs">{ref.title}</span>
                                <ExternalLink className="h-3 w-3 shrink-0" />
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {sendError && (
            <div role="alert" className="mx-3 mb-2 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <span>{sendError}</span>
              {retryPrompt && <button type="button" onClick={() => handleSend(retryPrompt)} disabled={sending} className="shrink-0 font-semibold underline">Retry</button>}
            </div>
          )}

          {fallbackNotice && (
            <div
              role="status"
              aria-live="polite"
              data-testid="assistant-fallback-notice"
              className={`mx-3 mb-2 rounded-lg border px-3 py-2 text-xs leading-relaxed ${
                fallbackNotice.kind === 'quota_exhausted'
                  ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
                  : fallbackNotice.kind === 'outdated_consent'
                  ? 'border-[#9ECF42] bg-[#C5F36A]/20 text-[#101713] dark:border-[#C5F36A]/50 dark:bg-[#C5F36A]/10 dark:text-[#C5F36A]'
                  : 'border-[#E4E8E0] bg-[#F7F7F0] text-[#243329] dark:border-[#354139] dark:bg-[#0C110E] dark:text-[#D5DDD2]'
              }`}
            >
              <p className="font-semibold">{fallbackNotice.title}</p>
              <p className="mt-0.5">{fallbackNotice.detail}</p>
            </div>
          )}

          {sending && (
            <div role="status" aria-live="polite" className="mx-3 mb-2 flex items-center justify-between gap-3 rounded-lg border border-[#C5F36A]/40 bg-[#C5F36A]/10 px-3 py-2 text-xs text-[#243329] dark:text-[#D5DDD2]">
              <span className="inline-flex items-center gap-2"><AudioLines className="h-3.5 w-3.5 text-[#668A38] dark:text-[#C5F36A]" />Waiting for the selected provider to finish this response.</span>
              {(providerPreference === 'ollama' || providerPreference === 'openjarvis') && (
                <button type="button" onClick={handleStop} className="inline-flex shrink-0 items-center gap-1 font-semibold text-[#101713] underline dark:text-[#C5F36A]"><Square className="h-3 w-3" /> Stop</button>
              )}
            </div>
          )}
          {voiceTranscript && (
            <div className="mx-3 mb-2 rounded-lg border border-[#E4E8E0] bg-[#FBFBF7] px-3 py-2 text-xs text-[#455044] dark:border-[#354139] dark:bg-[#101713] dark:text-[#A9B5A6]">
              <span className="font-semibold">Dictation preview · English:</span> {voiceTranscript}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex flex-wrap items-center gap-2 border-t border-[#E4E8E0] p-3 dark:border-[#232D27]"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={2000}
              aria-label="Message the ProofPath Student Copilot"
              placeholder={
                language === 'bn'
                  ? 'বাংলায় বা ইংরেজিতে আপনার প্রশ্ন লিখুন...'
                  : 'Ask about eligibility, documents, or verification risks...'
              }
              className="h-10 min-w-[120px] flex-1 rounded-lg border border-[#E4E8E0] bg-[#F7F7F0] px-3 text-sm text-[#101713] focus:border-[#101713] focus:outline-none dark:border-[#232D27] dark:bg-[#0C110E] dark:text-[#F7F7F0] dark:focus:border-[#C5F36A]"
            />
            <button
              type="button"
              onClick={() => {
                if (listening) recognitionRef.current?.stop();
                else startVoiceInput();
              }}
              disabled={language === 'bn' || !speechRecognitionAvailable || sending}
              aria-label={listening ? 'Stop English dictation' : 'Start English dictation'}
              title={speechRecognitionAvailable ? 'Browser English speech recognition; review the transcription before sending' : 'Speech recognition is not available in this browser'}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#E4E8E0] px-3 text-xs font-semibold text-[#243329] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#354139] dark:text-[#D5DDD2]"
            >
              {listening ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{listening ? 'Stop' : 'Dictate'}</span>
            </button>
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#101713] px-4 text-xs font-semibold text-[#C5F36A] hover:bg-[#1D2520] disabled:opacity-50 dark:bg-[#C5F36A] dark:text-[#101713]"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span>Send</span>
            </button>
          </form>
          <p className="px-3 pb-3 text-[10px] leading-relaxed text-[#71806E] dark:text-[#8C9A88]">
            Voice controls use browser speech features only. Dictation is English-only and stays as an editable preview before sending. Bengali recognition and voice quality have not been verified; typing remains available.
          </p>
        </div>
      </div>
    </div>
  );
}
