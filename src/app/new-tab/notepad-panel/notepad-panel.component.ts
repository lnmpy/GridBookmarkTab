import {
    Component,
    inject,
    ViewChild,
    ElementRef,
    AfterViewInit,
    HostListener,
    EventEmitter,
    Output,
    Input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { NoteService, NoteMeta } from '@app/services/note.service';
import { I18nService } from '@app/services/i18n.service';

@Component({
    selector: 'app-notepad-panel',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './notepad-panel.component.html',
    styleUrls: ['./notepad-panel.component.scss'],
})
export class NotepadPanelComponent implements AfterViewInit {
    private noteService: NoteService = inject(NoteService);
    i18n: I18nService = inject(I18nService);

    @ViewChild('editor') editorRef!: ElementRef<HTMLTextAreaElement>;
    @Output() close = new EventEmitter<void>();
    @Input() expanded = false;
    @Output() expandedChange = new EventEmitter<boolean>();

    notes: NoteMeta[] = [];
    activeNoteId: string | null = null;
    noteTitle = '';
    fontSize = 0.9; // rem

    private static readonly FONT_SIZE_KEY = 'notepad_font_size';
    private static readonly MIN_FONT = 0.75;
    private static readonly MAX_FONT = 1.5;
    private static readonly FONT_STEP = 0.05;

    async ngAfterViewInit() {
        // Load font size
        try {
            const result = await chrome.storage.local.get(NotepadPanelComponent.FONT_SIZE_KEY);
            if (result[NotepadPanelComponent.FONT_SIZE_KEY]) {
                this.fontSize = result[NotepadPanelComponent.FONT_SIZE_KEY] as number;
            }
        } catch (_) { }

        this.notes = await this.noteService.loadAllMeta();
        if (this.notes.length === 0) {
            const note = await this.noteService.create();
            this.notes = [note];
        }
        await this.switchTo(this.notes[0].id);
    }

    async switchTo(id: string) {
        // Save nothing — content is saved on input
        this.activeNoteId = id;
        const meta = this.notes.find((n) => n.id === id);
        this.noteTitle = meta?.title || '';
        const content = await this.noteService.loadContent(id);
        if (this.editorRef?.nativeElement) {
            this.editorRef.nativeElement.value = content;
        }
    }

    async createNote() {
        const note = await this.noteService.create();
        this.notes.unshift(note);
        await this.switchTo(note.id);
    }

    async deleteNote(id: string) {
        if (this.notes.length <= 1) {
            return; // Don't delete the last note
        }
        await this.noteService.delete(id);
        this.notes = this.notes.filter((n) => n.id !== id);
        // If we deleted the active note, switch to first available
        if (this.activeNoteId === id) {
            await this.switchTo(this.notes[0].id);
        }
    }

    onTitleChange() {
        if (!this.activeNoteId) return;
        const meta = this.notes.find((n) => n.id === this.activeNoteId);
        if (meta) {
            meta.title = this.noteTitle;
        }
        this.noteService.saveTitle(this.activeNoteId, this.noteTitle);
    }

    onInput() {
        if (!this.activeNoteId) return;
        const content = this.editorRef.nativeElement.value;
        this.noteService.saveContent(this.activeNoteId, content);
    }

    getNoteLabel(note: NoteMeta): string {
        return note.title || this.i18n.t('untitled');
    }

    toggleExpanded() {
        this.expanded = !this.expanded;
        this.expandedChange.emit(this.expanded);
    }

    increaseFontSize() {
        this.fontSize = Math.min(NotepadPanelComponent.MAX_FONT, +(this.fontSize + NotepadPanelComponent.FONT_STEP).toFixed(2));
        this.saveFontSize();
    }

    decreaseFontSize() {
        this.fontSize = Math.max(NotepadPanelComponent.MIN_FONT, +(this.fontSize - NotepadPanelComponent.FONT_STEP).toFixed(2));
        this.saveFontSize();
    }

    private saveFontSize() {
        chrome.storage.local.set({ [NotepadPanelComponent.FONT_SIZE_KEY]: this.fontSize }).catch(() => { });
    }

    onClose() {
        this.close.emit();
    }

    @HostListener('document:keydown.escape')
    onEscKey() {
        this.onClose();
    }
}
