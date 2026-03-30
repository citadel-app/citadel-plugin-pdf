import { MainRegistrar } from '@citadel-app/core';
import { app, net, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs-extra';

export interface DownloadProgress {
    total: number;
    received: number;
    percent: number;
    filename: string;
}

export class ModelDownloadService {
    private modelsDir: string;
    private isDownloading: boolean = false;
    private readonly REQUIRED_FILES = [
        'https://huggingface.co/thewh1teagle/Kokoro/resolve/main/kokoro-v0_19.onnx',
        'https://huggingface.co/thewh1teagle/Kokoro/resolve/main/voices.json'
    ];

    constructor(private registrar: MainRegistrar<'@citadel-app/pdf'>) {
        this.modelsDir = path.join(app.getPath('userData'), 'models');
        fs.ensureDirSync(this.modelsDir);
        this.registerHandlers();
    }

    private registerHandlers() {
        this.registrar.handle('models.check', async () => {
            return this.checkModels();
        });


        this.registrar.handle('models.download', async () => {
            if (this.isDownloading) return { success: false, error: 'Download already in progress' };
            
            try {
                for (const url of this.REQUIRED_FILES) {
                    const result = await this.downloadModels(url);
                    if (!result.success) return result;
                }
                return { success: true };
            } catch (error: any) {
                return { success: false, error: error.message };
            }
        });

    }

    public checkModels() {
        const modelPath = path.join(this.modelsDir, 'kokoro-v0_19.onnx');
        const voicesJsonPath = path.join(this.modelsDir, 'voices.json');

        return {
            modelExists: fs.existsSync(modelPath),
            voicesExists: fs.existsSync(voicesJsonPath),
            modelsDir: this.modelsDir
        };
    }

    public async downloadModels(url: string = this.REQUIRED_FILES[0]): Promise<{ success: boolean; error?: string }> {

        this.isDownloading = true;
        const filename = path.basename(url);
        const targetPath = path.join(this.modelsDir, filename);

        try {
            console.log(`[ModelDownloadService] Starting download from ${url} to ${targetPath}`);
            const request = net.request(url);
            
            return new Promise((resolve, reject) => {
                request.on('response', (response) => {
                    const totalBytes = parseInt(response.headers['content-length'] as string, 10);
                    let receivedBytes = 0;
                    const fileStream = fs.createWriteStream(targetPath);

                    response.on('data', (chunk) => {
                        receivedBytes += chunk.length;
                        fileStream.write(chunk);

                        const progress: DownloadProgress = {
                            total: totalBytes,
                            received: receivedBytes,
                            percent: Math.round((receivedBytes / totalBytes) * 100),
                            filename
                        };

                        // Send progress to all windows
                        BrowserWindow.getAllWindows().forEach(win => {
                            win.webContents.send('models:download-progress', progress);
                        });
                    });

                    response.on('end', () => {
                        fileStream.end();
                        this.isDownloading = false;
                        console.log(`[ModelDownloadService] Download completed: ${filename}`);
                        resolve({ success: true });
                    });

                    response.on('error', (err) => {
                        fileStream.close();
                        fs.removeSync(targetPath);
                        this.isDownloading = false;
                        reject(err);
                    });
                });

                request.on('error', (err) => {
                    this.isDownloading = false;
                    reject(err);
                });

                request.end();
            });
        } catch (error: any) {
            this.isDownloading = false;
            console.error(`[ModelDownloadService] Download failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    public getModelsDir(): string {
        return this.modelsDir;
    }
}
