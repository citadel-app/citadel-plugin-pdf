import React, { useState, useEffect, useCallback } from 'react';
import { useCoreServices, Icon, cn } from '@citadel-app/ui';
import { useModels } from '../hooks/useModels';

interface TtsStatus {
    status: string;
    model_loaded: boolean;
    model_path: string;
    cache_entries: number;
}

export const PdfModelStatusWidget = () => {
    const { settings, hostApi: __hostApi } = useCoreServices();
    
    // TTS State
    const [ttsConnected, setTtsConnected] = useState(false);
    const [ttsStatus, setTtsStatus] = useState<TtsStatus | null>(null);
    const [isTransitioning, setIsTransitioning] = useState(false);

    // Model State from the cleanly migrated hook
    const { status: modelStatus, isDownloading, downloadProgress, downloadModel } = useModels();

    const refreshTts = useCallback(async () => {
        try {
            const url = settings?.ttsUrl || 'http://127.0.0.1:5050';
            const res = await fetch(`${url}/status`);
            if (res.ok) {
                const status = await res.json();
                setTtsStatus(status);
                setTtsConnected(true);
            } else {
                setTtsStatus(null);
                setTtsConnected(false);
            }
        } catch (e) {
            setTtsStatus(null);
            setTtsConnected(false);
        }
    }, [settings]);

    useEffect(() => {
        refreshTts();
        const interval = setInterval(refreshTts, 5000);
        return () => clearInterval(interval);
    }, [refreshTts]);

    const handleStartService = async () => {
        setIsTransitioning(true);
        try {
            await __hostApi.module.invoke('@citadel-app/pdf', 'tts.start');
            setTimeout(refreshTts, 1500);
            setTimeout(refreshTts, 3500);
        } catch (e) {
            console.error('[PdfModelStatusWidget] Failed to start TTS:', e);
        } finally {
            setIsTransitioning(false);
        }
    };

    const handleStopService = async () => {
        setIsTransitioning(true);
        try {
            await __hostApi.module.invoke('@citadel-app/pdf', 'tts.stop');
            setTimeout(refreshTts, 1000);
        } catch (e) {
            console.error('[PdfModelStatusWidget] Failed to stop TTS:', e);
        } finally {
            setIsTransitioning(false);
        }
    };

    return (
        <div className="p-5 bg-card/50 border border-border rounded-2xl shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-lg flex items-center gap-3 text-card-foreground">
                    <Icon name="Volume2" size={20} className="text-blue-500" />
                    Audio Extraction Engine
                </h2>
                <button
                    onClick={() => ttsConnected ? handleStopService() : handleStartService()}
                    disabled={isTransitioning}
                    className="p-1.5 hover:bg-muted rounded-md transition-colors"
                >
                    <Icon 
                        name={isTransitioning ? 'Loader2' : (ttsConnected ? 'Square' : 'Play')} 
                        size={14} 
                        className={isTransitioning ? 'animate-spin' : (ttsConnected ? 'text-destructive' : 'text-primary')} 
                    />
                </button>
            </div>
            
            <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center p-2 bg-muted/20 rounded-lg">
                    <span className="text-muted-foreground">Status</span>
                    <span className={cn("font-bold uppercase text-[10px]", ttsConnected ? "text-green-500" : "text-red-500")}>
                        {ttsConnected ? 'Kokoro Ready' : 'Stopped'}
                    </span>
                </div>
                
                <div className="flex justify-between items-center px-2 py-1">
                    <span className="text-muted-foreground text-xs">Cache</span>
                    <span className="font-mono text-xs font-medium">{ttsStatus?.cache_entries ?? 0} items</span>
                </div>

                {/* Model Status & Download */}
                <div className="mt-4 pt-4 border-t border-border/40 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1.5">
                            <Icon name="Database" size={12} />
                            Kokoro V0.19 
                        </span>
                        <span className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded border",
                            (modelStatus?.modelExists && modelStatus?.voicesExists) ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-orange-500/10 text-orange-500 border-orange-500/20"
                        )}>
                            {(modelStatus?.modelExists && modelStatus?.voicesExists) ? 'Downloaded' : 'Missing'}
                        </span>
                    </div>

                    {!(modelStatus?.modelExists && modelStatus?.voicesExists) && !isDownloading && (
                        <button
                            onClick={() => downloadModel()}
                            className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/90 transition-colors"
                        >
                            Download Offline Models (310MB)
                        </button>
                    )}

                    {isDownloading && downloadProgress && (
                        <div className="space-y-2">
                            <div className="flex justify-between text-[10px] font-mono">
                                <span className="truncate max-w-[150px]">{downloadProgress.filename}</span>
                                <span>{downloadProgress.percent}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-primary transition-all duration-300"
                                    style={{ width: `${downloadProgress.percent}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
