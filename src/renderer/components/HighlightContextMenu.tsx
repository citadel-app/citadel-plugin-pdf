import { Icon } from '@citadel-app/ui';
import { ViewportHighlight } from 'react-pdf-highlighter-extended';

interface HighlightContextMenuProps {
    highlight: ViewportHighlight;
    onDelete: () => void;
    onClose: () => void;
}

export const HighlightContextMenu = ({ highlight, onDelete, onClose }: HighlightContextMenuProps) => {
    const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();

        const content = highlight.content;

        if (content?.text) {
            await navigator.clipboard.writeText(content.text);
        } else if (content?.image) {
            try {
                const response = await fetch(content.image);
                const blob = await response.blob();
                await navigator.clipboard.write([
                    new ClipboardItem({
                        [blob.type]: blob,
                    }),
                ]);
            } catch (error) {
                console.error('Failed to copy image:', error);
            }
        }
        onClose();
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        console.log('Delete button clicked for highlight');
        onDelete();
        onClose();
    };

    return (
        <div className="bg-background text-foreground border border-border rounded-md shadow-xl p-1 flex flex-col gap-1 min-w-[150px] animate-in fade-in zoom-in duration-200 z-50">
            <button
                onClick={handleCopy}
                className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted hover:text-foreground rounded-sm text-left transition-colors font-medium"
            >
                <Icon name={highlight.content?.image ? "Image" : "Copy"} size={14} />
                <span>{highlight.content?.image ? "Copy Image" : "Copy Text"}</span>
            </button>
            <button
                onClick={handleDelete}
                className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-destructive hover:text-destructive-foreground text-destructive rounded-sm text-left transition-colors font-medium"
            >
                <Icon name="Trash" size={14} />
                <span>Delete</span>
            </button>
        </div>
    );
};
