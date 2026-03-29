import {
    PdfLoader,
    PdfHighlighter,
    PdfSelection,
    TextHighlight,
    AreaHighlight,
    useHighlightContainerContext,
    MonitoredHighlightContainer,
} from 'react-pdf-highlighter-extended';
import { PdfContextMenu } from './PdfContextMenu';
import { HighlightContextMenu } from './HighlightContextMenu';
import { Icon } from '@citadel-app/ui';
import { useState, useEffect, useRef, useMemo } from 'react';
import React from 'react';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import 'react-pdf-highlighter-extended/dist/esm/style/PdfHighlighter.css';
import 'react-pdf-highlighter-extended/dist/esm/style/TextHighlight.css';
import 'react-pdf-highlighter-extended/dist/esm/style/AreaHighlight.css';
import 'react-pdf-highlighter-extended/dist/esm/style/MouseSelection.css';
import 'react-pdf-highlighter-extended/dist/esm/style/pdf_viewer.css';
import { useTts } from '../hooks/useTts';
import { extractSentencesFromPdf } from '../lib/pdf-text-loader';
import { TtsControls } from './TtsControls';

// Resolve PDF worker
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfViewerProps {
    url: string;
    highlights: any[];
    onHighlightChange: (highlight: any) => void;
}

interface HighlightContainerProps {
    onDeleteHighlight: (id: string) => void;
}

const HighlightContainer = ({ onDeleteHighlight }: HighlightContainerProps) => {
    const { highlight, isScrolledTo, highlightBindings } = useHighlightContainerContext();
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);

    const isTextHighlight = !Boolean(highlight.content && highlight.content.image);
    const isTts = (highlight as any).type === 'tts';

    if (isTts) {
        // Render a simple highlight for TTS without context menu functionality
        return (
            <div className={`absolute border-b-2 border-yellow-500 bg-yellow-200/30 dark:bg-yellow-500/20 mix-blend-multiply dark:mix-blend-screen transition-all duration-300 ${isScrolledTo ? 'ring-2 ring-yellow-500 ring-offset-2' : ''}`}
                style={{
                    left: 0,
                    top: 0,
                    width: '100%',
                    height: '100%'
                }}
            />
        );
    }

    const component = isTextHighlight ? (
        <TextHighlight isScrolledTo={isScrolledTo} highlight={highlight} />
    ) : (
        <AreaHighlight
            isScrolledTo={isScrolledTo}
            highlight={highlight}
            onChange={(_boundingRect) => {
                // Handle resize/move if needed
            }}
            bounds={highlightBindings.textLayer}
        />
    );

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY });
    };

    return (
        <MonitoredHighlightContainer
            highlightTip={contextMenu ? {
                position: highlight.position,
                content: (
                    <HighlightContextMenu
                        highlight={highlight}
                        onDelete={() => {
                            console.log('Deleting highlight with ID:', highlight.id);
                            onDeleteHighlight(highlight.id);
                        }}
                        onClose={() => setContextMenu(null)}
                    />
                )
            } : undefined}
            onMouseLeave={() => {
            }}
        >
            <div onContextMenu={handleContextMenu}>
                {component}
            </div>
        </MonitoredHighlightContainer>
    );
};

const PdfViewerContent = React.memo(({
    pdfDocument,
    url,
    highlights,
    onHighlightChange,
    onDeleteHighlight,
    highlightUtilsRef
}: PdfViewerProps & {
    pdfDocument: any,
    onDeleteHighlight: (id: string) => void,
    highlightUtilsRef?: React.MutableRefObject<any>
}) => {
    const [selectionTip, setSelectionTip] = useState<{ position: any, selection: PdfSelection } | null>(null);
    const {
        isPlaying, isLoading, play, pause, stop,
        currentSentenceIndex, sentences, setSentences,
        playSentence, speed, setSpeed,
        ttsEnabled, setTtsEnabled
    } = useTts();

    // Click-to-seek: double-click on a PDF page to jump TTS to that sentence
    const containerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const container = containerRef.current;
        if (!container || sentences.length === 0 || !ttsEnabled) return;

        const handleSeek = (e: MouseEvent) => {
            // Find the closest .page ancestor to get page number and bounds
            const target = e.target as HTMLElement;
            const pageEl = target.closest('.page') as HTMLElement | null;
            if (!pageEl) return;

            const pageNum = parseInt(pageEl.getAttribute('data-page-number') || '0', 10);
            if (!pageNum) return;

            // Convert click to normalized coordinates within the page
            const rect = pageEl.getBoundingClientRect();
            const normX = (e.clientX - rect.left) / rect.width;
            const normY = (e.clientY - rect.top) / rect.height;

            // Find the sentence on this page closest to the click
            let bestIndex = -1;
            let bestDist = Infinity;
            for (let i = 0; i < sentences.length; i++) {
                const s = sentences[i];
                if (s.page !== pageNum) continue;
                const cx = s.box.x + s.box.width / 2;
                const cy = s.box.y + s.box.height / 2;
                const dist = Math.hypot(normX - cx, normY - cy);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestIndex = i;
                }
            }

            if (bestIndex >= 0) {
                e.preventDefault();
                e.stopPropagation();
                playSentence(bestIndex);
            }
        };

        // Use capture phase to intercept before react-pdf-highlighter handles the event
        container.addEventListener('dblclick', handleSeek, true);
        return () => container.removeEventListener('dblclick', handleSeek, true);
    }, [sentences, playSentence, ttsEnabled]);

    // Extract sentences on load (only when TTS enabled)
    useEffect(() => {
        if (pdfDocument && ttsEnabled) {
            extractSentencesFromPdf(pdfDocument).then(setSentences);
        }
    }, [pdfDocument, setSentences, ttsEnabled]);

    // Direct DOM-based TTS highlight overlay + auto-scroll
    // Renders per-line rects for accurate multi-line highlighting
    useEffect(() => {
        const sentence = (currentSentenceIndex >= 0 && sentences[currentSentenceIndex])
            ? sentences[currentSentenceIndex]
            : null;

        const TTS_CONTAINER_ID = 'tts-overlay-container';
        let cancelled = false;
        let rafId: number | null = null;

        const cleanup = () => {
            const existing = document.getElementById(TTS_CONTAINER_ID);
            if (existing) existing.remove();
        };

        if (!sentence || !isPlaying) {
            cleanup();
            return;
        }

        const createOverlay = (retries = 0) => {
            if (cancelled) return;

            const container = containerRef.current;
            if (!container) return;

            const pageEl = container.querySelector(`.page[data-page-number="${sentence.page}"]`) as HTMLElement | null;
            if (!pageEl) {
                // Page not rendered yet — retry after next frame (up to ~10 frames)
                if (retries < 10) {
                    rafId = requestAnimationFrame(() => createOverlay(retries + 1));
                }
                return;
            }

            const pageRect = pageEl.getBoundingClientRect();
            cleanup();

            const overlayContainer = document.createElement('div');
            overlayContainer.id = TTS_CONTAINER_ID;
            overlayContainer.style.position = 'absolute';
            overlayContainer.style.left = '0';
            overlayContainer.style.top = '0';
            overlayContainer.style.width = '100%';
            overlayContainer.style.height = '100%';
            overlayContainer.style.pointerEvents = 'none';
            overlayContainer.style.zIndex = '10';

            pageEl.style.position = 'relative';
            pageEl.appendChild(overlayContainer);

            const rects = sentence.rects && sentence.rects.length > 0
                ? sentence.rects
                : [sentence.box];

            for (const rect of rects) {
                const el = document.createElement('div');
                el.style.position = 'absolute';
                el.style.left = `${rect.x * pageRect.width}px`;
                el.style.top = `${rect.y * pageRect.height}px`;
                el.style.width = `${Math.max(rect.width * pageRect.width, 40)}px`;
                el.style.height = `${Math.max(rect.height * pageRect.height, 16)}px`;
                el.style.backgroundColor = 'rgba(234, 179, 8, 0.18)';
                el.style.boxShadow = '0 2px 0 0 #eab308';
                el.style.borderRadius = '2px';
                el.style.transition = 'opacity 0.15s ease';
                overlayContainer.appendChild(el);
            }

            if (overlayContainer.firstElementChild) {
                overlayContainer.firstElementChild.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        };

        createOverlay();

        return () => {
            cancelled = true;
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    }, [currentSentenceIndex, isPlaying, sentences]);

    const displayHighlights = highlights || [];

    return (
        <div ref={containerRef} style={{ height: '100%' }}>
            <PdfHighlighter
                pdfDocument={pdfDocument}
                enableAreaSelection={(event) => event.altKey}
                onSelection={(selection) => {
                    console.log('Selection event fired:', selection);
                    const position = selection.position;
                    setSelectionTip({ position, selection });
                }}
                selectionTip={selectionTip ? (
                    <PdfContextMenu
                        selection={selectionTip.selection}
                        onHighlight={() => {
                            console.log('Confirming highlight in viewer', selectionTip);
                            const { selection } = selectionTip;
                            const ghostHighlight = selection.makeGhostHighlight();
                            const highlight = { ...ghostHighlight, id: Date.now().toString(), comment: { text: '', emoji: '' } };
                            onHighlightChange(highlight);
                            setSelectionTip(null);
                        }}
                        onClose={() => setSelectionTip(null)}
                    />
                ) : null}
                highlights={displayHighlights}
                onScrollAway={() => setSelectionTip(null)}
                utilsRef={(utils) => {
                    if (highlightUtilsRef) {
                        highlightUtilsRef.current = utils;
                    }
                }}
            >
                <HighlightContainer onDeleteHighlight={onDeleteHighlight} />
            </PdfHighlighter>

            {ttsEnabled ? (
                <TtsControls
                    isPlaying={isPlaying}
                    isLoading={isLoading}
                    onPlay={play}
                    onPause={pause}
                    onStop={() => { stop(); setTtsEnabled(false); }}
                    speed={speed}
                    setSpeed={setSpeed}
                    textDetail={currentSentenceIndex >= 0 ? `Sentence ${currentSentenceIndex + 1}/${sentences.length}` : undefined}
                />
            ) : (
                <button
                    onClick={() => setTtsEnabled(true)}
                    className="absolute bottom-6 right-6 p-3 bg-background/90 dark:bg-gray-800/95 backdrop-blur shadow-xl border border-border rounded-full z-[100] hover:bg-muted transition-colors"
                    title="Enable Text-to-Speech"
                >
                    <Icon name="Headphones" size={20} />
                </button>
            )}
        </div>
    );
});

export const PdfViewer = React.memo(({ url, highlights, onHighlightChange, onDeleteHighlight, highlightUtilsRef }: PdfViewerProps & { onDeleteHighlight: (id: string) => void, highlightUtilsRef?: React.MutableRefObject<any> }) => {
    return (
        <div className="h-full w-full relative overflow-hidden bg-gray-50 dark:bg-gray-900 pdf-viewer-container">
            <PdfLoader document={url} beforeLoad={(_progress) => <div className="p-4 text-muted-foreground italic">Loading PDF...</div>}>
                {(pdfDocument) => (
                    <PdfViewerContent
                        pdfDocument={pdfDocument}
                        url={url}
                        highlights={highlights}
                        onHighlightChange={onHighlightChange}
                        onDeleteHighlight={onDeleteHighlight}
                        highlightUtilsRef={highlightUtilsRef}
                    />
                )}
            </PdfLoader>
        </div>
    );
});
