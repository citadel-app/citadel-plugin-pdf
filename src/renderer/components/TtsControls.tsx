import { Icon } from '@citadel-app/ui';

interface TtsControlsProps {
    isPlaying: boolean;
    isLoading: boolean;
    onPlay: () => void;
    onPause: () => void;
    onStop: () => void;
    speed: number;
    setSpeed: (speed: number) => void;
    textDetail?: string; // e.g. "Sentence 5/100"
}

export const TtsControls = ({ isPlaying, isLoading, onPlay, onPause, onStop, speed, setSpeed, textDetail }: TtsControlsProps) => {
    return (
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex items-center gap-2 bg-background/90 dark:bg-gray-800/95 backdrop-blur shadow-xl border border-border rounded-full px-4 py-2 z-[100] transition-all animate-in slide-in-from-bottom-5">
            {/* Play/Pause */}
            <button
                onClick={isPlaying ? onPause : onPlay}
                disabled={isLoading}
                className="p-2 rounded-full hover:bg-muted transition-colors text-primary disabled:opacity-50"
                title={isPlaying ? "Pause" : "Play"}
            >
                {isLoading ? (
                    <Icon name="Loader2" className="animate-spin" size={20} />
                ) : (
                    <Icon name={isPlaying ? "Pause" : "Play"} size={20} fill={isPlaying ? "currentColor" : "none"} />
                )}
            </button>

            {/* Stop */}
            <button
                onClick={onStop}
                className="p-2 rounded-full hover:bg-muted transition-colors text-destructive"
                title="Stop"
            >
                <Icon name="Square" size={16} fill="currentColor" />
            </button>

            {/* Divider */}
            <div className="w-px h-4 bg-border mx-1" />

            {/* Speed Control */}
            <div className="flex items-center gap-1 text-xs font-medium">
                <button
                    onClick={() => setSpeed(Math.max(0.5, speed - 0.1))}
                    className="p-1 hover:bg-muted rounded"
                >-</button>
                <span className="w-8 text-center">{speed.toFixed(1)}x</span>
                <button
                    onClick={() => setSpeed(Math.min(3.0, speed + 0.1))}
                    className="p-1 hover:bg-muted rounded"
                >+</button>
            </div>

            {textDetail && (
                <>
                    <div className="w-px h-4 bg-border mx-1" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap px-1">
                        {textDetail}
                    </span>
                </>
            )}
        </div>
    );
};
