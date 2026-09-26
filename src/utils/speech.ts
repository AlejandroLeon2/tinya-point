// Speech-to-text service (plan-speak-search.md Fase 1, D4 — naming per
// extras.md §7: code in English, domain/UI in Spanish). Turns voice into
// text via the Web Speech API and delivers it through a callback: the
// island owning `onText` triggers the search (D1 — one path for voice and
// keyboard). No network dependencies or AI (§15).

export type VoiceState = 'idle' | 'listening' | 'error';

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

// lib.dom.d.ts does not expose SpeechRecognition in every environment (D4).
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

type WindowWithSpeech = {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as WindowWithSpeech;
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

export function isSpeechSupported(): boolean {
  return getRecognitionConstructor() !== null;
}

// User-facing copy stays Spanish (extras.md §7: UI text in Spanish).
const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'No se puede acceder al micrófono. Revisa los permisos del navegador.',
  'service-not-allowed': 'No se puede acceder al micrófono. Revisa los permisos del navegador.',
  'audio-capture': 'No se encontró un micrófono disponible.',
  'no-speech': 'No se detectó ninguna voz. Intenta nuevamente.',
  network: 'No se pudo utilizar el micrófono. Verifica tu conexión.',
};

export interface VoiceSearchOptions {
  onText: (text: string) => void;
  onState?: (state: VoiceState) => void;
  onError?: (message: string) => void;
  lang?: string;
}

export interface VoiceSearch {
  start(): void;
  stop(): void;
  cancel(): void;
  getState(): VoiceState;
}

export function createVoiceSearch(options: VoiceSearchOptions): VoiceSearch {
  const Ctor = getRecognitionConstructor();
  let state: VoiceState = 'idle';
  let recognition: SpeechRecognitionLike | null = null;

  function setState(next: VoiceState): void {
    if (state === next) return;
    state = next;
    options.onState?.(next);
  }

  function notifyError(message: string): void {
    setState('error');
    if (message) options.onError?.(message);
    setState('idle');
  }

  function ensureRecognition(): SpeechRecognitionLike | null {
    if (!Ctor) return null;
    if (recognition) return recognition;
    recognition = new Ctor();
    recognition.lang = options.lang ?? 'es-PE';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      if (!last?.isFinal) return;
      const text = (last[0]?.transcript ?? '').trim();
      if (text) {
        setState('idle');
        options.onText(text);
      }
    };
    recognition.onerror = (event) => {
      const code = event.error ?? '';
      // Manual cancel: silent, just return to idle.
      if (code === 'aborted') {
        setState('idle');
        return;
      }
      notifyError(ERROR_MESSAGES[code] ?? 'No se pudo utilizar el micrófono.');
    };
    recognition.onend = () => setState('idle');
    return recognition;
  }

  return {
    start(): void {
      const instance = ensureRecognition();
      if (!instance || state === 'listening') return;
      try {
        setState('listening');
        instance.start();
      } catch {
        notifyError('No se pudo utilizar el micrófono.');
      }
    },
    stop(): void {
      // stop() lets the final result arrive; abort() discards it.
      try {
        recognition?.stop();
      } catch {
        // already stopped
      }
    },
    cancel(): void {
      try {
        recognition?.abort();
      } catch {
        // already stopped
      }
      setState('idle');
    },
    getState(): VoiceState {
      return state;
    },
  };
}
