
import { PdfViewer } from './PdfViewer';
import { Icon } from '@citadel-app/ui';
import { resolveResourceUrl } from '@citadel-app/core';
import { CodexEntry } from '@citadel-app/core';

export interface PdfModuleProps {
    entry: CodexEntry;
    highlights?: any[];
    onHighlightAdd?: (h: any) => void;
    onHighlightDelete?: (id: string) => void;
    highlightUtilsRef?: any;
    config?: { map?: Record<string, string> };
}

export const PdfViewerWrapper = ({ entry, highlights, onHighlightAdd, onHighlightDelete, highlightUtilsRef, config }: PdfModuleProps) => {
    // Resolve PDF path
    // 1. Check config mapping for 'source'
    // 2. Fallback to hardcoded defaults (pdfPath, sourceUrl)

    let rawPath = '';

    // Check mapped field
    const sourceField = config?.map?.['source'];
    if (sourceField) {
        // e.g. entry['newsletterPdf'] or entry.frontmatter['newsletterPdf']
        rawPath = entry[sourceField] || entry.frontmatter?.[sourceField];
    }

    // Fallbacks
    if (!rawPath) {
        rawPath = entry.frontmatter?.pdfPath || entry.sourceUrl || entry.frontmatter?.sourceUrl;
    }

    const pdfUrl = rawPath ? resolveResourceUrl(entry.filePath, rawPath) : undefined;

    return (
        <div className="h-full border-r border-border bg-gray-100 dark:bg-gray-900 relative">
            {pdfUrl ? (
                <PdfViewer
                    url={pdfUrl}
                    highlights={highlights || []}
                    onHighlightChange={onHighlightAdd || (() => { })}
                    onDeleteHighlight={onHighlightDelete || (() => { })}
                    highlightUtilsRef={highlightUtilsRef}
                />
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <Icon name="FileQuestion" size={48} className="mb-4 opacity-50" />
                    <p className="text-sm">No PDF associated</p>
                    <p className="text-xs mt-1">Add pdfPath to metadata/frontmatter</p>
                </div>
            )}
        </div>
    );
};
