import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  ViewChild,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  heroArrowLeft,
  heroCheck,
  heroLink,
} from '@ng-icons/heroicons/outline';
import { ToastService } from '@app/services/toast.service';
import { SettingsService } from '@app/services/settings.service';
import { ToolboxService } from '@app/services/toolbox.service';
import { I18nService } from '@app/services/i18n.service';
import { evaluateCalculatorDocument } from './calculator-evaluator';

function encodeDocToUrlParam(text: string): string {
  if (!text) return '';
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeDocFromUrlParam(encoded: string): string {
  if (!encoded) return '';
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (padded.length % 4)) % 4;
    const base64 = padded + '='.repeat(padLen);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

@Component({
  selector: 'app-calculator',
  standalone: true,
  imports: [NgIcon],
  providers: [
    provideIcons({
      heroArrowLeft,
      heroLink,
      heroCheck,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .calculator-editor-font {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          'Liberation Mono', 'Courier New', monospace;
        font-size: 15px;
        line-height: 32px;
      }
    `,
  ],
  template: `
    <div
      class="min-h-screen h-screen flex flex-col bg-base-200 text-base-content px-4 sm:px-8 md:px-12 lg:px-16 py-5 overflow-hidden"
    >
      <!-- Top Header -->
      <header class="shrink-0 flex items-center justify-between gap-4 pb-4 select-none">
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="surface-quiet elev-1 h-9 px-3 rounded-[10px] flex items-center gap-1.5 text-sm text-ink-2 hover:text-base-content hover:bg-chip transition-colors cursor-pointer"
            (click)="goBack()"
          >
            <ng-icon name="heroArrowLeft" class="w-4 h-4" />
            <span>{{ i18n.t('back') }}</span>
          </button>
          <div class="flex items-center gap-2">
            <h1 class="text-base font-semibold text-base-content">{{ i18n.t('toolCalculator') }}</h1>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="surface-quiet elev-1 h-9 px-3 rounded-[10px] flex items-center gap-1.5 text-xs font-medium text-ink-2 hover:text-base-content hover:bg-chip transition-colors cursor-pointer"
            (click)="copyShareUrl()"
          >
            <ng-icon name="heroLink" class="w-4 h-4" />
            <span>{{ linkCopied() ? i18n.t('linkCopied') : i18n.t('copyLink') }}</span>
          </button>
        </div>
      </header>

      <!-- Notepad Workspace -->
      <main class="flex-1 min-h-0 flex flex-col max-w-5xl w-full mx-auto pb-2">
        <div
          class="surface elev-2 rounded-2xl flex-1 min-h-0 flex overflow-hidden"
        >
          <!-- Left: Line numbers + Input Textarea -->
          <div class="flex-1 min-w-0 flex relative overflow-hidden">
            <!-- Line numbers -->
            <div
              #lineNumbersEl
              class="w-12 shrink-0 py-5 pr-3 text-right text-ink-3/60 select-none overflow-hidden calculator-editor-font border-r border-line-soft bg-base-200/40"
              aria-hidden="true"
            >
              @for (line of evaluated().lines; track $index) {
                <div class="h-8 leading-8 text-xs">{{ $index + 1 }}</div>
              }
            </div>

            <!-- Editor -->
            <textarea
              #textareaEl
              class="flex-1 w-full h-full py-5 px-5 bg-transparent resize-none border-0 text-base-content calculator-editor-font overflow-y-auto focus:outline-none"
              spellcheck="false"
              autocomplete="off"
              [value]="docText()"
              (input)="onDocInput($event)"
              (scroll)="syncScroll()"
            ></textarea>
          </div>

          <!-- Right: Live Results Column -->
          <div
            #resultsEl
            class="w-44 sm:w-56 shrink-0 border-l border-line-soft bg-base-200/35 py-5 px-4 overflow-y-hidden select-none calculator-editor-font"
          >
            @for (line of evaluated().lines; track $index) {
              <div class="h-8 leading-8 flex items-center justify-end">
                @if (line.formatted) {
                  <button
                    type="button"
                    class="group inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg hover:bg-primary/12 text-primary font-semibold transition-colors cursor-pointer max-w-full"
                    (click)="copyResult($index, line.formatted)"
                    [title]="i18n.t('clickToCopyResult')"
                  >
                    <span class="truncate">{{ line.formatted }}</span>
                    @if (copiedLineIndex() === $index) {
                      <ng-icon name="heroCheck" class="w-3.5 h-3.5 shrink-0" />
                    }
                  </button>
                } @else if (line.isError) {
                  <span class="text-xs text-error">Error</span>
                }
              </div>
            }
          </div>
        </div>
      </main>
    </div>
  `,
})
export class CalculatorComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toastService = inject(ToastService);
  private settingsService = inject(SettingsService);
  private toolboxService = inject(ToolboxService);
  public i18n = inject(I18nService);
  private destroyRef = inject(DestroyRef);

  @ViewChild('textareaEl') textareaRef?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('lineNumbersEl') lineNumbersRef?: ElementRef<HTMLDivElement>;
  @ViewChild('resultsEl') resultsRef?: ElementRef<HTMLDivElement>;

  docText = signal('');
  copiedLineIndex = signal<number | null>(null);
  linkCopied = signal(false);

  evaluated = computed(() => evaluateCalculatorDocument(this.docText()));

  constructor() {
    afterNextRender(() => {
      this.textareaRef?.nativeElement.focus();
    });
  }

  ngOnInit(): void {
    // Ensure theme is applied when directly landing on #/calculator
    const theme = this.settingsService.settingsSource.value.theme || 'light';
    document.documentElement.setAttribute('data-theme', theme);

    let hasUrlContent = false;
    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const encoded = params['content'] as string | undefined;
        if (encoded !== undefined) {
          hasUrlContent = true;
          const decoded = decodeDocFromUrlParam(encoded);
          if (decoded !== this.docText()) {
            this.docText.set(decoded);
          }
        }
      });

    if (!hasUrlContent) {
      const cachedPrefill = this.toolboxService.getCalculatorDefaultContent();
      if (cachedPrefill) {
        this.docText.set(cachedPrefill);
      } else {
        void this.toolboxService
          .getCalculatorDefaultContentAsync()
          .then((asyncPrefill) => {
            if (asyncPrefill && !this.docText()) {
              this.docText.set(asyncPrefill);
            }
          });
      }
    }
  }

  onDocInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.updateDocument(value);
  }

  private updateDocument(value: string): void {
    this.docText.set(value);
    const encoded = encodeDocToUrlParam(value);
    if (typeof window !== 'undefined') {
      const nextUrl = encoded
        ? `/index.html?target=calculator&content=${encoded}`
        : '/index.html?target=calculator';
      window.history.replaceState(null, '', nextUrl);
    }
  }

  syncScroll(): void {
    const scrollTop = this.textareaRef?.nativeElement.scrollTop ?? 0;
    if (this.lineNumbersRef?.nativeElement) {
      this.lineNumbersRef.nativeElement.scrollTop = scrollTop;
    }
    if (this.resultsRef?.nativeElement) {
      this.resultsRef.nativeElement.scrollTop = scrollTop;
    }
  }

  async copyResult(index: number, value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this.copiedLineIndex.set(index);
      setTimeout(() => {
        if (this.copiedLineIndex() === index) {
          this.copiedLineIndex.set(null);
        }
      }, 1400);
    } catch {
      // Ignore clipboard errors
    }
  }

  async copyShareUrl(): Promise<void> {
    try {
      const encoded = encodeDocToUrlParam(this.docText());
      const base = `${window.location.origin}/index.html?target=calculator`;
      const shareUrl = encoded ? `${base}&content=${encoded}` : base;
      await navigator.clipboard.writeText(shareUrl);
      this.linkCopied.set(true);
      this.toastService.show(this.i18n.t('copiedCalculatorLinkToast'), 'success');
      setTimeout(() => this.linkCopied.set(false), 1500);
    } catch {
      // Ignore clipboard errors
    }
  }

  goBack(): void {
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', '/index.html');
    }
    void this.router.navigate(['/new-tab']);
  }
}
