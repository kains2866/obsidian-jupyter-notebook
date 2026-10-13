/** Synced identity must never include device-local interpreter paths. */
export function syncedEnvironmentSettings(settings:{vaultId:string;bridgePython:string;kernelPython:string}):{vaultId:string}{return {vaultId:settings.vaultId}}
