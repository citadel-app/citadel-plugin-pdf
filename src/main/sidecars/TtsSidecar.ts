import { ISidecarConfig, AbstractDockerSidecar } from '@citadel-app/core';
import { AppSettingsService } from '../../services/AppSettingsService';
import { ModelDownloadService } from '../../services/ModelDownloadService';
import { spawn } from 'child_process';

export class TtsSidecar extends AbstractDockerSidecar {
    private settings: AppSettingsService;
    private downloader: ModelDownloadService;

    constructor(settings: AppSettingsService, downloader: ModelDownloadService) {
        // Standard base configuration for the TTS container
        const config: ISidecarConfig = {
            id: 'tts',
            type: 'daemon',
            containerName: 'codex-tts',
            image: 'ghcr.io/citadel-app/sidecar-tts:latest',
            ports: ['5050:5050']
        };
        super(config);
        this.settings = settings;
        this.downloader = downloader;
    }

    /**
     * Build the context before executing docker run. 
     * Handles volume mappings dynamically based on current user settings.
     */
    protected buildDockerRunArgs(): string[] {
        // Evaluate dynamic paths right before booting
        const ttsDataPath = (this.settings.getSetting('ttsDataPath') as string || '').replace(/\\/g, '/');
        const modelsDir = this.downloader.getModelsDir().replace(/\\/g, '/');

        const dynamicVolumes: string[] = [];
        if (ttsDataPath) dynamicVolumes.push(`${ttsDataPath}:/app/.tts_cache`);
        if (modelsDir) dynamicVolumes.push(`${modelsDir}:/app/models`);

        // Inject dynamic properties into the config right before the abstract class builds the CLI string
        this.config.volumes = dynamicVolumes;
        
        return super.buildDockerRunArgs();
    }

    /**
     * Check if models exist and optionally pull the image.
     */
    protected async onBeforeStart(): Promise<boolean> {
        // 1. Validate models
        const status = this.downloader.checkModelStatus();
        if (!status.modelExists || !status.voicesExists) {
            console.warn('[Sidecar:tts] TTS models or voices missing. Aborting sidecar boot.');
            // Let the frontend know we failed due to a missing runtime dependency
            return false;
        }

        // 2. Pull the Docker Image
        console.log(`[Sidecar:tts] Pulling image ${this.config.image}...`);
        
        return new Promise<boolean>((resolve) => {
            const pullCmd = `${this.dockerPath} pull ${this.config.image}`;
            const pullChild = spawn(pullCmd, { shell: true });
            
            pullChild.stdout.on('data', (data) => console.log(`[Sidecar:tts:pull] ${data}`));
            pullChild.stderr.on('data', (data) => console.error(`[Sidecar:tts:pull] ${data}`));

            pullChild.on('close', (code) => {
                if (code !== 0) {
                    console.error(`[Sidecar:tts] Docker pull failed with code ${code}. Will attempt boot with cached image if available.`);
                    resolve(true); // Don't block boot entirely if offline but image exists locally
                } else {
                    resolve(true);
                }
            });
        });
    }

    protected onClose(code: number | null): void {
        console.log(`[Sidecar:tts] Daemon naturally exited with code: ${code}`);
    }
}
