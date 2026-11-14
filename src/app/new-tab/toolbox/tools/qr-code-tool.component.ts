import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { I18nService } from '@app/services/i18n.service';
import { generateQrMatrix } from './qr-encoder';

@Component({
  selector: 'app-qr-code-tool',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4">
      <textarea
        rows="3"
        class="textarea w-full surface-sunken rounded-xl text-sm resize-none placeholder:text-ink-3"
        [attr.placeholder]="i18n.t('qrCodePlaceholder')"
        [value]="text()"
        (input)="text.set($any($event.target).value)"
      ></textarea>

      <div class="flex flex-col items-center justify-center py-4 surface-sunken rounded-2xl min-h-[220px]">
        @if (matrix(); as grid) {
          <div class="bg-white p-3 rounded-xl shadow-sm">
            <svg
              [attr.viewBox]="'0 0 ' + grid.length + ' ' + grid.length"
              class="w-44 h-44 block"
              shape-rendering="crispEdges"
            >
              <rect width="100%" height="100%" fill="#ffffff" />
              @for (row of grid; track $index; let r = $index) {
                @for (cell of row; track $index; let c = $index) {
                  @if (cell) {
                    <rect [attr.x]="c" [attr.y]="r" width="1" height="1" fill="#1c1b19" />
                  }
                }
              }
            </svg>
          </div>
          <div class="flex items-center gap-2 mt-3">
            <button
              type="button"
              class="btn btn-xs surface hover:bg-chip rounded-lg px-3"
              (click)="downloadPng(grid)"
            >
              {{ i18n.t('qrCodeDownloadPng') }}
            </button>
          </div>
        } @else {
          <span class="text-xs text-ink-3">
            {{ text().trim() ? i18n.t('qrCodeTooLong') : i18n.t('qrCodeEmpty') }}
          </span>
        }
      </div>
    </div>
  `,
})
export class QrCodeToolComponent {
  public i18n = inject(I18nService);
  text = signal('https://github.com');

  matrix = computed(() => {
    const value = this.text().trim();
    if (!value) return null;
    return generateQrMatrix(value);
  });

  downloadPng(grid: boolean[][]): void {
    const scale = 10;
    const margin = 20;
    const size = grid.length * scale + margin * 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#1c1b19';
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        if (grid[r][c]) {
          ctx.fillRect(margin + c * scale, margin + r * scale, scale, scale);
        }
      }
    }

    const link = document.createElement('a');
    link.download = 'qrcode.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }
}
