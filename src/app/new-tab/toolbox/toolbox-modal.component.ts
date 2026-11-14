import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { heroXMark } from '@ng-icons/heroicons/outline';
import { I18nService } from '@app/services/i18n.service';
import { ToolId, ToolboxService } from '@app/services/toolbox.service';
import { ToolIconComponent } from './tool-icon.component';
import { PomodoroToolComponent } from './tools/pomodoro-tool.component';
import { QrCodeToolComponent } from './tools/qr-code-tool.component';
import { ColorPickerToolComponent } from './tools/color-picker-tool.component';

@Component({
  selector: 'app-toolbox-modal',
  standalone: true,
  imports: [
    NgIcon,
    ToolIconComponent,
    PomodoroToolComponent,
    QrCodeToolComponent,
    ColorPickerToolComponent,
  ],
  providers: [provideIcons({ heroXMark })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="modal modal-open" (click)="onBackdropClick($event)">
      <div
        class="modal-box surface glass-overlay elev-4 rounded-2xl w-11/12 max-w-lg p-5 relative"
        (click)="$event.stopPropagation()"
      >
        <!-- Header -->
        <div class="flex items-center justify-between gap-3 pb-3.5 mb-4 border-b border-line-soft">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-8 h-8 rounded-xl surface-sunken flex items-center justify-center text-primary shrink-0">
              <app-tool-icon [toolId]="activeToolId()" iconClass="w-4 h-4" />
            </div>
            <h3 class="font-semibold text-[15px] text-base-content truncate">
              {{ i18n.t(currentToolNameKey()) }}
            </h3>
          </div>

          <button
            type="button"
            class="w-7 h-7 rounded-lg grid place-items-center text-ink-2 hover:text-base-content hover:bg-chip transition-colors cursor-pointer"
            (click)="closeModal.emit()"
            [attr.aria-label]="i18n.t('close')"
          >
            <ng-icon name="heroXMark" class="w-4 h-4" />
          </button>
        </div>

        <!-- Tool Body -->
        <div>
          @switch (activeToolId()) {
            @case ('pomodoro') {
              <app-pomodoro-tool />
            }
            @case ('qrCode') {
              <app-qr-code-tool />
            }
            @case ('colorPicker') {
              <app-color-picker-tool />
            }
          }
        </div>
      </div>
    </div>
  `,
})
export class ToolboxModalComponent implements OnInit {
  public i18n = inject(I18nService);
  private toolboxService = inject(ToolboxService);

  @Input() toolId: ToolId = 'calculator';
  @Output() closeModal = new EventEmitter<void>();

  activeToolId = signal<ToolId>('calculator');

  ngOnInit(): void {
    this.activeToolId.set(this.toolId);
  }

  currentToolNameKey(): string {
    return this.toolboxService.getToolDefinition(this.activeToolId()).nameKey;
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
