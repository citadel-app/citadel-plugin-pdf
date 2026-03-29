import { PDFDocumentProxy } from 'pdfjs-dist';
import { TtsSentence, TextItem, detectColumnSplit, sortForReadingOrder, sanitizeForTts } from '@citadel-app/core';

// Regex for filtering
const CAPTION_REGEX = /^(Fig\.|Figure|Table)\s+\d+/i;
const PAGE_NUMBER_REGEX = /^\d+$/;



/**
 * Group items by approximate Y position into line groups.
 * Returns per-line normalized rects and an overall bounding box.
 */
function computeRects(
    chunkItems: TextItem[],
    pageW: number,
    pageH: number
): { box: TtsSentence['box']; rects: TtsSentence['rects'] } {
    if (chunkItems.length === 0) {
        return { box: { x: 0, y: 0, width: 0, height: 0 }, rects: [] };
    }

    // Group by approximate Y (items within 5 PDF units are on the same line)
    const lines: TextItem[][] = [];
    let currentLine: TextItem[] = [chunkItems[0]];

    for (let i = 1; i < chunkItems.length; i++) {
        const item = chunkItems[i];
        const prevY = currentLine[currentLine.length - 1].y;
        if (Math.abs(item.y - prevY) < 5) {
            currentLine.push(item);
        } else {
            lines.push(currentLine);
            currentLine = [item];
        }
    }
    lines.push(currentLine);

    // Compute per-line rects (normalized 0-1)
    const rects: TtsSentence['rects'] = [];
    let minNormX = 1, minNormY = 1, maxNormX2 = 0, maxNormY2 = 0;

    for (const line of lines) {
        const minX = Math.min(...line.map(it => it.x));
        const maxX = Math.max(...line.map(it => it.x + it.width));
        // Use max height in the line for consistent line height
        const lineH = Math.max(...line.map(it => it.height));
        // Use average Y for the line baseline
        const lineY = line.reduce((sum, it) => sum + it.y, 0) / line.length;

        const nx = minX / pageW;
        const ny = 1 - ((lineY + lineH) / pageH); // top in normalized coords
        const nw = (maxX - minX) / pageW;
        const nh = lineH / pageH;

        rects.push({ x: nx, y: ny, width: nw, height: nh });

        minNormX = Math.min(minNormX, nx);
        minNormY = Math.min(minNormY, ny);
        maxNormX2 = Math.max(maxNormX2, nx + nw);
        maxNormY2 = Math.max(maxNormY2, ny + nh);
    }

    return {
        box: {
            x: minNormX,
            y: minNormY,
            width: maxNormX2 - minNormX,
            height: maxNormY2 - minNormY
        },
        rects
    };
}

export const extractSentencesFromPdf = async (pdf: PDFDocumentProxy): Promise<TtsSentence[]> => {
    const sentences: TtsSentence[] = [];
    const numPages = pdf.numPages;

    for (let i = 1; i <= numPages; i++) {
        try {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const viewport = page.getViewport({ scale: 1.0 });
            const pageW = viewport.width;
            const pageH = viewport.height;

            // Parse items
            const rawItems: TextItem[] = (textContent.items as any[]).map(item => {
                const tx = item.transform;
                return {
                    str: item.str,
                    x: tx[4],
                    y: tx[5],
                    width: item.width,
                    height: item.height || 10,
                };
            });

            // Sort for reading order (handles 2-column layouts)
            const items = sortForReadingOrder(rawItems, pageW);

            // Filter and Group into complete sentences
            let currentChunkText = "";
            let currentChunkItems: TextItem[] = [];

            const margin = pageH * 0.05;

            const flushChunk = () => {
                const cleanText = sanitizeForTts(currentChunkText);
                if (cleanText.length > 3 && currentChunkItems.length > 0) {
                    const { box, rects } = computeRects(currentChunkItems, pageW, pageH);
                    sentences.push({ text: cleanText, page: i, box, rects });
                }
                currentChunkText = "";
                currentChunkItems = [];
            };

            for (const item of items) {
                // Filter Heuristics
                if (item.y < margin || item.y > pageH - margin) continue;
                if (PAGE_NUMBER_REGEX.test(item.str.trim())) continue;
                if (CAPTION_REGEX.test(item.str.trim())) continue;
                if (item.str.trim().startsWith("Table ")) continue;

                const text = item.str;
                if (!text.trim()) continue;

                currentChunkItems.push(item);
                currentChunkText += text + " ";

                // Sentence-end detection: analyze the ACCUMULATED text, not individual items
                // (PDF items can split "V" and "." into separate items)
                const accumulated = currentChunkText.trim();
                const wordCount = accumulated.split(/\s+/).length;

                let isSentenceEnd = false;

                if (/[a-zA-Z]{2,}[!?]\s*$/.test(accumulated)) {
                    // ! or ? after a real word (2+ letters) at end of accumulated text
                    isSentenceEnd = true;
                } else if (/\.\s*$/.test(accumulated)) {
                    // Period at end of accumulated text - check what's before it
                    // Extract the last word before the period
                    const beforePeriod = accumulated.slice(0, -1).trim();
                    const lastWord = beforePeriod.split(/[\s()\[\]{}]+/).filter(Boolean).pop() || '';

                    const isDecimal = /\d$/.test(lastWord);  // "3" in "3."
                    const isSingleChar = lastWord.length <= 1; // "V" in "V ."
                    const abbrevs = ['e.g', 'i.e', 'et', 'al', 'vs', 'fig', 'dr', 'mr', 'mrs', 'ms', 'prof', 'inc', 'ltd', 'jr', 'sr', 'st', 'dept', 'approx', 'est', 'ref', 'eq', 'sec', 'ch', 'vol', 'no', 'pp'];
                    const isAbbrev = abbrevs.includes(lastWord.toLowerCase());
                    const isParenOrBracket = /[)\]}\d]$/.test(accumulated.replace(/\.\s*$/, '').trim()); // "(1)." or "]."

                    isSentenceEnd = !isDecimal && !isSingleChar && !isAbbrev && !isParenOrBracket;
                }

                if (isSentenceEnd && wordCount >= 5) {
                    flushChunk();
                }
            }
            flushChunk();
        } catch (e) {
            console.error(`Failed to parse page ${i}`, e);
        }
    }

    return sentences;
};
