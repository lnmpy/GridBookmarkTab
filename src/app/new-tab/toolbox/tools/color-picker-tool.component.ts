import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { I18nService } from '@app/services/i18n.service';
import { ToolboxService } from '@app/services/toolbox.service';

const COLOR_HISTORY_KEY = 'color_picker_history';

interface EyeDropperResult {
  sRGBHex: string;
}

@Component({
  selector: 'app-color-picker-tool',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4">
      <!-- Preview + Native Picker + EyeDropper -->
      <div class="flex items-center gap-3">
        <label
          class="w-16 h-16 rounded-2xl border border-line cursor-pointer shrink-0 shadow-sm overflow-hidden relative"
          [style.backgroundColor]="hex()"
        >
          <input
            type="color"
            class="opacity-0 w-full h-full cursor-pointer"
            [value]="hex()"
            (input)="onHexInput($any($event.target).value)"
          />
        </label>

        <div class="flex-1 flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <input
              type="text"
              class="input input-sm flex-1 surface-sunken rounded-xl font-mono text-sm uppercase"
              [value]="hex()"
              (input)="onHexInput($any($event.target).value)"
              placeholder="#4F46E5"
            />
            @if (hasEyeDropper) {
              <button
                type="button"
                class="btn btn-sm btn-primary rounded-xl"
                (click)="pickFromScreen()"
              >
                {{ i18n.t('colorPickerEyedropper') }}
              </button>
            }
          </div>
          <span class="text-[11px] text-ink-3">{{ i18n.t('colorPickerHint') }}</span>
        </div>
      </div>

      <!-- Color Formats -->
      <div class="flex flex-col gap-2">
        @for (row of formats(); track row.label) {
          <div class="flex items-center justify-between px-3 py-2 rounded-xl surface-sunken">
            <span class="text-xs font-medium text-ink-2 w-12">{{ row.label }}</span>
            <span class="text-xs font-mono text-base-content flex-1 truncate">{{ row.value }}</span>
            <button
              type="button"
              class="btn btn-xs surface hover:bg-chip rounded-lg"
              (click)="copyValue(row.label, row.value)"
            >
              {{ copiedKey() === row.label ? i18n.t('copied') : i18n.t('copy') }}
            </button>
          </div>
        }
      </div>

      <!-- Recent Colors -->
      @if (history().length > 0) {
        <div class="flex flex-col gap-1.5">
          <span class="text-xs text-ink-3">{{ i18n.t('colorPickerRecent') }}</span>
          <div class="flex items-center gap-2 flex-wrap">
            @for (color of history(); track color) {
              <button
                type="button"
                class="w-7 h-7 rounded-lg border border-line cursor-pointer transition-transform hover:scale-110"
                [style.backgroundColor]="color"
                [title]="color"
                (click)="selectColor(color)"
              ></button>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class ColorPickerToolComponent {
  public i18n = inject(I18nService);
  private toolboxService = inject(ToolboxService);

  readonly hasEyeDropper =
    typeof window !== 'undefined' && 'EyeDropper' in window;

  hex = signal('#4F46E5');
  copiedKey = signal<string | null>(null);
  history = signal<string[]>(
    this.toolboxService.loadToolData<string[]>(COLOR_HISTORY_KEY, [
      '#4F46E5',
      '#1C1B19',
      '#2563C9',
      '#3E6337',
      '#B45309',
    ]),
  );

  formats = computed(() => {
    const { r, g, b } = this.hexToRgb(this.hex());
    const { h, s, l } = this.rgbToHsl(r, g, b);
    return [
      { label: 'HEX', value: this.hex().toUpperCase() },
      { label: 'RGB', value: `rgb(${r}, ${g}, ${b})` },
      { label: 'HSL', value: `hsl(${h}, ${s}%, ${l}%)` },
    ];
  });

  onHexInput(value: string): void {
    const normalized = value.startsWith('#') ? value : `#${value}`;
    if (/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
      this.selectColor(normalized.toUpperCase());
    }
  }

  selectColor(color: string): void {
    const upper = color.toUpperCase();
    this.hex.set(upper);
    const updated = [upper, ...this.history().filter((c) => c !== upper)].slice(0, 10);
    this.history.set(updated);
    void this.toolboxService.saveToolData(COLOR_HISTORY_KEY, updated);
  }

  async pickFromScreen(): Promise<void> {
    try {
      const EyeDropperCtor = (window as unknown as {
        EyeDropper: new () => { open: () => Promise<EyeDropperResult> };
      }).EyeDropper;
      const dropper = new EyeDropperCtor();
      const result = await dropper.open();
      if (result?.sRGBHex) {
        this.selectColor(result.sRGBHex);
      }
    } catch {
      // User cancelled or unsupported
    }
  }

  async copyValue(label: string, value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this.copiedKey.set(label);
      setTimeout(() => {
        if (this.copiedKey() === label) this.copiedKey.set(null);
      }, 1500);
    } catch {
      // Ignore clipboard errors
    }
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16);
    if (Number.isNaN(num)) return { r: 79, g: 70, b: 229 };
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255,
    };
  }

  private rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case rn:
          h = (gn - bn) / d + (gn < bn ? 6 : 0);
          break;
        case gn:
          h = (bn - rn) / d + 2;
          break;
        case bn:
          h = (rn - gn) / d + 4;
          break;
      }
      h /= 6;
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
    };
  }
}
