import { Injectable } from '@angular/core';

export interface NoteMeta {
    id: string;
    title: string;
    updatedAt: number;
}

@Injectable({
    providedIn: 'root',
})
export class NoteService {
    private static readonly META_KEY = 'notepad_notes';
    private saveTimeout = new Map<string, ReturnType<typeof setTimeout>>();

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    async loadAllMeta(): Promise<NoteMeta[]> {
        try {
            const result = await chrome.storage.local.get(NoteService.META_KEY);
            const metas: NoteMeta[] = result[NoteService.META_KEY] || [];
            // Sort by updatedAt descending (most recent first)
            return metas.sort((a, b) => b.updatedAt - a.updatedAt);
        } catch (e) {
            console.warn('Failed to load notes meta:', e);
            return [];
        }
    }

    async loadContent(id: string): Promise<string> {
        try {
            const key = `notepad_note_${id}`;
            const result = await chrome.storage.local.get(key);
            return result[key] || '';
        } catch (e) {
            console.warn('Failed to load note content:', e);
            return '';
        }
    }

    async create(title?: string): Promise<NoteMeta> {
        const meta: NoteMeta = {
            id: this.generateId(),
            title: title || '',
            updatedAt: Date.now(),
        };
        const metas = await this.loadAllMeta();
        metas.unshift(meta);
        await this.saveMetas(metas);
        return meta;
    }

    async delete(id: string): Promise<void> {
        const metas = await this.loadAllMeta();
        const filtered = metas.filter((m) => m.id !== id);
        await this.saveMetas(filtered);
        // Remove content
        try {
            await chrome.storage.local.remove(`notepad_note_${id}`);
        } catch (e) {
            console.warn('Failed to remove note content:', e);
        }
    }

    saveContent(id: string, content: string): void {
        this.debouncedSave(`content_${id}`, async () => {
            const key = `notepad_note_${id}`;
            await chrome.storage.local.set({ [key]: content });
            await this.touchUpdatedAt(id);
        });
    }

    saveTitle(id: string, title: string): void {
        this.debouncedSave(`title_${id}`, async () => {
            const metas = await this.loadAllMeta();
            const meta = metas.find((m) => m.id === id);
            if (meta) {
                meta.title = title;
                meta.updatedAt = Date.now();
                await this.saveMetas(metas);
            }
        });
    }

    private async touchUpdatedAt(id: string): Promise<void> {
        const metas = await this.loadAllMeta();
        const meta = metas.find((m) => m.id === id);
        if (meta) {
            meta.updatedAt = Date.now();
            await this.saveMetas(metas);
        }
    }

    private async saveMetas(metas: NoteMeta[]): Promise<void> {
        try {
            await chrome.storage.local.set({
                [NoteService.META_KEY]: metas,
            });
        } catch (e) {
            console.warn('Failed to save notes meta:', e);
        }
    }

    private debouncedSave(key: string, fn: () => Promise<void>): void {
        const existing = this.saveTimeout.get(key);
        if (existing) {
            clearTimeout(existing);
        }
        this.saveTimeout.set(
            key,
            setTimeout(async () => {
                try {
                    await fn();
                } catch (e) {
                    console.warn('Failed to save:', e);
                }
                this.saveTimeout.delete(key);
            }, 500),
        );
    }

    getWordCount(html: string): number {
        const text = html.replace(/<[^>]*>/g, ' ').trim();
        if (!text) return 0;
        const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g);
        const words = text
            .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, '')
            .trim()
            .split(/\s+/)
            .filter((w) => w.length > 0);
        return (cjk?.length || 0) + words.length;
    }
}
