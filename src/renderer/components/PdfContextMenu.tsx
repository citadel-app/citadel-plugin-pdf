import { Icon } from '@citadel-app/ui';
import { PdfSelection } from 'react-pdf-highlighter-extended';

interface PdfContextMenuProps {
    selection: PdfSelection;
    onHighlight: () => void;
    onClose: () => void;
}

export const PdfContextMenu = ({ selection, onHighlight, onClose }: PdfContextMenuProps) => {
    const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        console.log('Copying content:', selection.content);

        if (selection.content.text) {
            await navigator.clipboard.writeText(selection.content.text);
        } else if (selection.content.image) {
            try {
                const response = await fetch(selection.content.image);
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

    const handleHighlight = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        console.log('Highlighting selection');
        onHighlight();
        onClose();
    };

    return (
        <div className="bg-background text-foreground border border-border rounded-md shadow-xl p-1 flex flex-col gap-1 min-w-[150px] animate-in fade-in zoom-in duration-200 z-50">
            <button
                onClick={handleHighlight}
                className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted hover:text-foreground rounded-sm text-left transition-colors font-medium"
            >
                <Icon name="Highlighter" size={14} />
                <span>Highlight</span>
            </button>
            <button
                onClick={handleCopy}
                className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted hover:text-foreground rounded-sm text-left transition-colors font-medium"
            >
                <Icon name={selection.content.image ? "Image" : "Copy"} size={14} />
                <span>{selection.content.image ? "Copy Image" : "Copy Text"}</span>
            </button>
        </div>
    );
};
