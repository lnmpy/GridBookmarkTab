import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ToolId } from '@app/services/toolbox.service';

@Component({
  selector: 'app-tool-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (toolId) {
      @case ('calculator') {
        <svg [attr.class]="iconClass" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="5" y="3" width="14" height="18" rx="2.5" />
          <path d="M8.5 7.5h7" />
          <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" />
          <path d="M8.5 15h.01M12 15h.01M15.5 15h.01" />
          <path d="M8.5 18.2h.01M12 18.2h.01M15.5 18.2h.01" />
        </svg>
      }
      @case ('pomodoro') {
        <svg [attr.class]="iconClass" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="13" r="7.5" />
          <path d="M12 9.5V13l2.5 1.5" />
          <path d="M9.5 3h5M12 3v2.5" />
        </svg>
      }
      @case ('qrCode') {
        <svg [attr.class]="iconClass" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="4" y="4" width="6" height="6" rx="1" />
          <rect x="14" y="4" width="6" height="6" rx="1" />
          <rect x="4" y="14" width="6" height="6" rx="1" />
          <path d="M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z" />
        </svg>
      }
      @case ('colorPicker') {
        <svg [attr.class]="iconClass" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m19.5 4.5-1 1a2.1 2.1 0 0 1-3 0l-1-1a2.1 2.1 0 0 1 0-3l1-1a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3z" transform="translate(-1 2)" />
          <path d="m14.5 6.5 3 3-9.2 9.2a2 2 0 0 1-1.1.5l-3.2.5.5-3.2a2 2 0 0 1 .5-1.1L14.5 6.5z" />
          <path d="m12.5 8.5 3 3" />
        </svg>
      }
    }
  `,
})
export class ToolIconComponent {
  @Input({ required: true }) toolId!: ToolId;
  @Input() iconClass = 'w-5 h-5';
}
