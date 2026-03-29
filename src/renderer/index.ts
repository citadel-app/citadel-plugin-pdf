import { IModule, RendererRegistrar, ScopedAPI } from '@citadel-app/core';
import { lazy } from 'react';
import { PdfModelStatusWidget } from './components/PdfModelStatusWidget';
import pkg from '../../package.json';

export const PdfModule: IModule = {
    id: pkg.name,
    version: pkg.version,
    permissions: {
        ipc: pkg.citadel.permissions || []
    },
    ipcs: pkg.citadel.providesIpcs || [],

    statusWidgets: [
        { id: 'pdf-models', group: 'Cloud & Local Stack', component: PdfModelStatusWidget }
    ],

    contentModules: {
        pdf: {
            id: 'pdf',
            label: 'PDF Viewer',
            description: 'View and highlight PDF documents.',
            requirements: [
                { key: 'source', types: ['file', 'url'], label: 'PDF Source', description: 'File path or URL to the PDF' }
            ]
        }
    },

    contentViewers: {
        // @ts-ignore
        pdf: lazy(async () => {
            const m = await import('./components/PdfViewerWrapper');
            return { default: m.PdfViewerWrapper as React.ComponentType<any> };
        })
    }
};

// Re-export components for host-level lazy imports if still needed temporarily
export { PdfViewerWrapper as PdfViewer } from './components/PdfViewerWrapper';
