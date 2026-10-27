import notes from './update-notes.json';

export interface UpdateNotes { zh: string[]; en: string[] }
export const updateNotes: Record<string, UpdateNotes> = notes;
