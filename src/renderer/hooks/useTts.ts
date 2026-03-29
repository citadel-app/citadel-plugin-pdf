import { useState, useEffect, useCallback } from 'react';
import { TtsSentence } from '@citadel-app/core';

import { useCoreServices } from '@citadel-app/ui';
interface UseTtsReturn {
    isPlaying: boolean;
    isLoading: boolean;
    currentSentenceIndex: number;
    sentences: TtsSentence[];
    ttsEnabled: boolean;
    setTtsEnabled: (enabled: boolean) => void;
    play: () => void;
    pause: () => void;
    stop: () => void;
    setSentences: (sentences: TtsSentence[]) => void;
    playSentence: (index: number) => void;
    speed: number;
    setSpeed: (speed: number) => void;
    voice: string;
    setVoice: (voice: string) => void;
}

/** Dynamic prefetch depth: more at higher speeds since chunks finish faster */
function getPrefetchDepth(): number {
    if (_speed >= 2.5) return 25;
    if (_speed >= 2.0) return 20;
    if (_speed >= 1.5) return 15;
    return 10;
}

// ── Module-level singletons (survive component remounts) ──────────────
const singletonAudio = new Audio();

interface PrefetchEntry {
    promise: Promise<string | null>;
    voice: string;
    speed: number;
}
const prefetchCache = new Map<number, PrefetchEntry>();
let currentObjUrl: string | null = null;
let queueIndex = -1;
let stopped = false;
let srcCleared = false;

// Current params — kept in sync by the hook
let _sentences: TtsSentence[] = [];
let _voice = 'af_sarah';
let _speed = 1.0;
let _ttsEnabled = false; // TTS is opt-in, disabled by default

// Will be set by the hook to drive React state updates
let _setIsPlaying: (v: boolean) => void = () => {};
let _setIsLoading: (v: boolean) => void = () => {};
let _setCurrentSentenceIndex: (v: number) => void = () => {};
let _playSentenceFn: (index: number) => void = () => {};

function revokeCurrentUrl() {
    if (currentObjUrl) {
        URL.revokeObjectURL(currentObjUrl);
        currentObjUrl = null;
    }
}

function clearPrefetchCache() {
    for (const entry of prefetchCache.values()) {
        entry.promise.then(url => { if (url) URL.revokeObjectURL(url); });
    }
    prefetchCache.clear();
}

// Module-level variable for TTS URL, updated by the hook
let _ttsUrl = 'http://localhost:5050';

export function setTtsUrl(url: string) {
    _ttsUrl = url;
}

/** Fetch audio, capturing voice+speed at call time to prevent race conditions */
function fetchAudioRaw(text: string, voice?: string, speed?: number): Promise<string | null> {
    const v = voice ?? _voice;
    const s = speed ?? _speed;
    return fetch(`${_ttsUrl}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: v, speed: s }),
    }).then(async response => {
        if (!response.ok) {
            console.error("TTS Server Error:", await response.text());
            return null;
        }
        const blob = await response.blob();
        return URL.createObjectURL(blob);
    }).catch(e => {
        console.error("Failed to fetch TTS audio:", e);
        return null;
    });
}

function getAudioForIndex(index: number): Promise<string | null> {
    if (index < 0 || index >= _sentences.length) return Promise.resolve(null);
    const cached = prefetchCache.get(index);
    if (cached) {
        prefetchCache.delete(index);
        // Verify the cached entry was fetched with current voice+speed
        if (cached.voice === _voice && cached.speed === _speed) {
            return cached.promise;
        }
        // Stale — discard and refetch
        cached.promise.then(url => { if (url) URL.revokeObjectURL(url); });
    }
    return fetchAudioRaw(_sentences[index].text);
}

function prefetchUpcoming(fromIndex: number) {
    const depth = getPrefetchDepth();
    const currentVoice = _voice;
    const currentSpeed = _speed;
    for (let i = 1; i <= depth; i++) {
        const idx = fromIndex + i;
        if (idx >= _sentences.length) break;
        // Skip if already prefetching with matching params
        const existing = prefetchCache.get(idx);
        if (existing && existing.voice === currentVoice && existing.speed === currentSpeed) continue;
        // Discard stale entry if present
        if (existing) {
            existing.promise.then(url => { if (url) URL.revokeObjectURL(url); });
        }
        prefetchCache.set(idx, {
            promise: fetchAudioRaw(_sentences[idx].text, currentVoice, currentSpeed),
            voice: currentVoice,
            speed: currentSpeed,
        });
    }
}

async function playSentenceImpl(index: number) {
    if (index < 0 || index >= _sentences.length) {
        revokeCurrentUrl();
        clearPrefetchCache();
        _setIsPlaying(false);
        _setIsLoading(false);
        _setCurrentSentenceIndex(-1);
        queueIndex = -1;
        return;
    }

    stopped = false;
    _setIsLoading(true);
    _setCurrentSentenceIndex(index);
    queueIndex = index;

    prefetchUpcoming(index);
    const audioUrl = await getAudioForIndex(index);

    if (stopped) {
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        _setIsLoading(false);
        return;
    }

    if (audioUrl) {
        revokeCurrentUrl();
        currentObjUrl = audioUrl;
        singletonAudio.src = audioUrl;
        singletonAudio.playbackRate = 1.0;
        try {
            await singletonAudio.play();
            _setIsPlaying(true);
        } catch (e) {
            console.error("Playback failed:", e);
            _setIsPlaying(false);
        }
    } else {
        console.warn(`TTS fetch failed for sentence ${index}, stopping playback.`);
        revokeCurrentUrl();
        clearPrefetchCache();
        _setIsPlaying(false);
        _setCurrentSentenceIndex(-1);
        queueIndex = -1;
    }
    _setIsLoading(false);
}

// Wire up the audio element once at module level
singletonAudio.onended = () => {
    const nextIndex = queueIndex + 1;
    revokeCurrentUrl();
    if (nextIndex < _sentences.length) {
        _playSentenceFn(nextIndex);
    } else {
        _setIsPlaying(false);
        _setCurrentSentenceIndex(-1);
        queueIndex = -1;
    }
};

singletonAudio.onerror = () => {
    if (srcCleared) {
        srcCleared = false;
        return;
    }
    console.error("Audio playback error");
    _setIsLoading(false);
    _setIsPlaying(false);
};

// ── React hook ────────────────────────────────────────────────────────
export const useTts = (): UseTtsReturn => {
    const { settings } = useCoreServices();
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(queueIndex);
    const [sentences, setSentencesState] = useState<TtsSentence[]>(_sentences);
    const [speed, setSpeedState] = useState(_speed);
    const [voice, setVoiceState] = useState(_voice);
    const [ttsEnabled, setTtsEnabledState] = useState(_ttsEnabled);

    // Sync module-level params
    useEffect(() => {
        _sentences = sentences;
        _voice = voice;
        _speed = speed;
        _ttsEnabled = ttsEnabled;
        setTtsUrl(settings.ttsUrl || 'http://localhost:5050');

        _setIsPlaying = setIsPlaying;
        _setIsLoading = setIsLoading;
        _setCurrentSentenceIndex = setCurrentSentenceIndex;
        _playSentenceFn = playSentenceImpl; // This should be playSentenceImpl, not playSentence
    }, [sentences, voice, speed, ttsEnabled, settings.ttsUrl]);

    // On mount, restore current state from singleton
    useEffect(() => {
        if (queueIndex >= 0) {
            setCurrentSentenceIndex(queueIndex);
            setIsPlaying(!singletonAudio.paused && singletonAudio.src !== '');
        }

        // On unmount: stop audio so there's never an orphan playing
        return () => {
            srcCleared = true;
            singletonAudio.pause();
            singletonAudio.src = '';
            revokeCurrentUrl();
            clearPrefetchCache();
            queueIndex = -1;
            stopped = true;
            _setIsPlaying = () => {};
            _setIsLoading = () => {};
            _setCurrentSentenceIndex = () => {};
            _playSentenceFn = () => {};
        };
    }, []);

    // Keep module-level values in sync
    useEffect(() => { _sentences = sentences; }, [sentences]);
    useEffect(() => {
        if (_voice !== voice || _speed !== speed) {
            clearPrefetchCache();
        }
        _voice = voice;
        _speed = speed;
    }, [voice, speed]);

    const setSentences = useCallback((s: TtsSentence[]) => {
        setSentencesState(s);
        _sentences = s;
        // Eagerly prefetch the first few sentences so play starts instantly
        if (s.length > 0) {
            const eagerCount = Math.min(3, s.length);
            for (let i = 0; i < eagerCount; i++) {
                if (!prefetchCache.has(i)) {
                    prefetchCache.set(i, {
                        promise: fetchAudioRaw(s[i].text, _voice, _speed),
                        voice: _voice,
                        speed: _speed,
                    });
                }
            }
        }
    }, []);

    const setSpeed = useCallback((s: number) => {
        setSpeedState(s);
        _speed = s;
        clearPrefetchCache();
    }, []);

    const setVoice = useCallback((v: string) => {
        setVoiceState(v);
        _voice = v;
        clearPrefetchCache();
    }, []);

    const playSentence = useCallback((index: number) => {
        playSentenceImpl(index);
    }, []);

    const play = useCallback(() => {
        if (queueIndex === -1 && _sentences.length > 0) {
            playSentenceImpl(0);
        } else if (singletonAudio.paused && queueIndex !== -1) {
            singletonAudio.play().then(() => {
                setIsPlaying(true);
            }).catch((e) => {
                console.error("Resume failed:", e);
            });
        }
    }, []);

    const pause = useCallback(() => {
        if (!singletonAudio.paused) {
            singletonAudio.pause();
            setIsPlaying(false);
        }
    }, []);

    const stop = useCallback(() => {
        stopped = true;
        singletonAudio.pause();
        singletonAudio.currentTime = 0;
        srcCleared = true;
        singletonAudio.src = '';
        revokeCurrentUrl();
        clearPrefetchCache();
        setIsPlaying(false);
        setIsLoading(false);
        setCurrentSentenceIndex(-1);
        queueIndex = -1;
    }, []);

    return {
        isPlaying,
        isLoading,
        currentSentenceIndex,
        sentences,
        ttsEnabled: _ttsEnabled,
        setTtsEnabled: useCallback((enabled: boolean) => {
            _ttsEnabled = enabled;
            if (!enabled) {
                // Stop everything when disabling
                stopped = true;
                singletonAudio.pause();
                srcCleared = true;
                singletonAudio.src = '';
                revokeCurrentUrl();
                clearPrefetchCache();
                setIsPlaying(false);
                setIsLoading(false);
                setCurrentSentenceIndex(-1);
                queueIndex = -1;
            }
        }, []),
        play,
        pause,
        stop,
        setSentences,
        playSentence,
        speed,
        setSpeed,
        voice,
        setVoice
    };
};
