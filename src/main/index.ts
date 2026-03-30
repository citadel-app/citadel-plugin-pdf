import { MainRegistrar, WorkspaceContext } from '@citadel-app/core';
import { ModelDownloadService } from './services/ModelDownloadService';
import { TtsSidecar } from './sidecars/TtsSidecar';

export async function activateMain(registrar: MainRegistrar<'@citadel-app/pdf'>, _workspace: WorkspaceContext | null) {
    console.log('[PdfModule/Main] Activating PDF rendering & TTS backend services');

    // 1. Initialize Dependency Graph
    const modelDownloader = new ModelDownloadService(registrar);
    
    // We pass a standalone settings object or function since TtsSidecar expects SettingsService interface.
    // Instead of passing the entire global AppSettingsService (which breaks boundaries), 
    // we use a lightweight proxy shape containing the expected method!
    const legacySettingsShim = {
        getSetting: (key: string) => {
            if (key === 'ttsDataPath') {
                // Return dynamic path here if needed.
                return ''; 
            }
            return null;
        }
    } as any;
    
    const ttsSidecar = new TtsSidecar(legacySettingsShim, modelDownloader);

    // 2. Register native sidecar container dynamically with Citadel Sandbox!
    if (registrar.registerSidecar) {
        registrar.registerSidecar(ttsSidecar);
    } else {
        console.warn('[PdfModule/Main] Sandbox core missing registerSidecar abstraction.');
    }

    // 3. Map precise IPC hooks directly to the Docker wrapper engine
    registrar.handle('tts.start', async () => {
        try {
            await ttsSidecar.start();
            return true;
        } catch (e) {
            console.error('[PdfModule/Main] Failed to start TTS:', e);
            throw e;
        }
    });

    registrar.handle('tts.stop', async () => {
        try {
            await ttsSidecar.stop();
            return true;
        } catch (e) {
            console.error('[PdfModule/Main] Failed to stop TTS:', e);
            throw e;
        }
    });

    registrar.handle('tts.status', async () => {
        return { daemon: (ttsSidecar as any).status };
    });
}


