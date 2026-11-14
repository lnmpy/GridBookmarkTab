import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Output,
  inject,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { heroXMark } from '@ng-icons/heroicons/outline';
import { I18nService } from '@app/services/i18n.service';
import { ToolboxService, ToolId } from '@app/services/toolbox.service';
import { ToolIconComponent } from './tool-icon.component';

@Component({
  selector: 'app-toolbox-manager-modal',
  standalone: true,
  imports: [NgIcon, ToolIconComponent],
  providers: [provideIcons({ heroXMark })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="modal modal-open" (click)="onBackdropClick($event)">
      <div
        class="modal-box surface glass-overlay elev-4 rounded-2xl w-11/12 max-w-md p-5"
        (click)="$event.stopPropagation()"
      >
        <div class="flex items-center justify-between gap-3 pb-3 mb-2 border-b border-line-soft">
          <div>
            <h3 class="font-semibold text-[15px] text-base-content">
              {{ i18n.t('manageTools') }}
            </h3>
            <p class="text-xs text-ink-3 mt-0.5">
              {{ i18n.t('manageToolsDescription') }}
            </p>
          </div>
          <button
            type="button"
            class="w-7 h-7 rounded-lg grid place-items-center text-ink-2 hover:text-base-content hover:bg-chip transition-colors cursor-pointer shrink-0"
            (click)="closeModal.emit()"
            [attr.aria-label]="i18n.t('close')"
          >
            <ng-icon name="heroXMark" class="w-4 h-4" />
          </button>
        </div>

        <div class="flex flex-col gap-1.5 max-h-[360px] overflow-y-auto py-1">
          @for (tool of toolboxService.allToolsOrdered(); track tool.id) {
            <div class="flex items-center justify-between gap-3 px-2.5 py-2 rounded-xl hover:bg-chip/60 transition-colors">
              <div class="flex items-center gap-2.5 min-w-0">
                <div class="w-8 h-8 rounded-lg surface-sunken flex items-center justify-center text-base-content/80 shrink-0">
                  <app-tool-icon [toolId]="tool.id" iconClass="w-4 h-4" />
                </div>
                <span class="text-sm text-base-content truncate">
                  {{ i18n.t(tool.nameKey) }}
                </span>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  class="btn btn-xs rounded-lg"
                  [class.btn-primary]="toolboxService.isPinned(tool.id)"
                  [class.surface]="!toolboxService.isPinned(tool.id)"
                  (click)="onTogglePin(tool.id)"
                >
                  {{ toolboxService.isPinned(tool.id) ? i18n.t('unpinFromMenu') : i18n.t('pinToMenu') }}
                </button>
                <input
                  type="checkbox"
                  class="toggle toggle-xs toggle-primary"
                  [checked]="toolboxService.isVisible(tool.id)"
                  (change)="onToggleVisibility(tool.id)"
                  [attr.aria-label]="i18n.t('showInToolbox')"
                />
              </div>
            </div>
          }
        </div>

        <div class="flex items-center justify-between pt-3 mt-3 border-t border-line-soft">
          <button
            type="button"
            class="btn btn-xs btn-ghost text-ink-2"
            (click)="onReset()"
          >
            {{ i18n.t('resetDefaultTools') }}
          </button>
          <button
            type="button"
            class="btn btn-sm btn-primary rounded-xl px-4"
            (click)="closeModal.emit()"
          >
            {{ i18n.t('confirm') }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ToolboxManagerModalComponent {
  public i18n = inject(I18nService);
  public toolboxService = inject(ToolboxService);

  @Output() closeModal = new EventEmitter<void>();

  onToggleVisibility(id: ToolId): void {
    void this.toolboxService.toggleToolVisibility(id);
  }

  onTogglePin(id: ToolId): void {
    void this.toolboxService.togglePinToMenu(id);
  }

  onReset(): void {
    void this.toolboxService.resetDefaults();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeModal.emit();
    }
  }

  @HostListener('window:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    event.stopPropagation();
    this.closeModal.emit();
  }
}
