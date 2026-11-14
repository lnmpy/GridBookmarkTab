import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import {
  PomodoroMode,
  PomodoroService,
} from '@app/services/pomodoro.service';
import { I18nService } from '@app/services/i18n.service';

@Component({
  selector: 'app-pomodoro-tool',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-center gap-4 py-1 select-none">
      <!-- Mode selector -->
      <div class="w-full flex items-center gap-1 p-1 rounded-xl surface-sunken justify-center">
        @for (m of modes(); track m.key) {
          <button
            type="button"
            class="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex-1 whitespace-nowrap"
            [class.bg-base-100]="pomodoro.mode() === m.key"
            [class.text-base-content]="pomodoro.mode() === m.key"
            [class.text-ink-2]="pomodoro.mode() !== m.key"
            (click)="pomodoro.switchMode(m.key)"
          >
            {{ m.label }}
          </button>
        }
      </div>

      <!-- Circular Progress Ring -->
        <div class="relative w-44 h-44 flex items-center justify-center my-1">
          <svg class="w-full h-full -rotate-90" viewBox="0 0 120 120">
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="var(--gbk-line)"
              stroke-width="6"
            />
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="var(--color-primary)"
              stroke-width="6"
              stroke-linecap="round"
              [attr.stroke-dasharray]="circumference"
              [attr.stroke-dashoffset]="dashOffset()"
              class="transition-[stroke-dashoffset] duration-300 ease-linear"
            />
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center">
            <span class="text-4xl font-semibold tracking-tight font-mono text-base-content">
              {{ pomodoro.formattedTime() }}
            </span>
            <button
              type="button"
              class="text-xs text-ink-3 hover:text-ink-2 mt-1 cursor-pointer transition-colors"
              (click)="pomodoro.resetCompletedCount()"
              [title]="i18n.t('pomodoroResetCountTitle')"
            >
              {{ i18n.t('pomodoroCompletedCount', [pomodoro.completedCount().toString()]) }}
            </button>
          </div>
        </div>

        <!-- Controls -->
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="btn btn-sm btn-primary rounded-xl px-6 h-9"
            (click)="pomodoro.toggleRunning()"
          >
            {{ pomodoro.isRunning() ? i18n.t('pomodoroPause') : i18n.t('pomodoroStart') }}
          </button>
          <button
            type="button"
            class="btn btn-sm surface hover:bg-chip rounded-xl px-4 h-9 text-ink-2"
            (click)="pomodoro.reset()"
          >
            {{ i18n.t('pomodoroReset') }}
          </button>
          <button
            type="button"
            class="btn btn-sm surface hover:bg-chip rounded-xl px-3 h-9 text-ink-2"
            (click)="pomodoro.skipPhase()"
            [title]="i18n.t('pomodoroSkipTitle')"
          >
            {{ i18n.t('pomodoroSkip') }}
          </button>
        </div>

        <!-- Background running hint -->
        <div class="text-[11px] text-ink-3 text-center">
          <span>{{ i18n.t('pomodoroBackgroundHint') }}</span>
        </div>
    </div>
  `,
})
export class PomodoroToolComponent {
  public pomodoro = inject(PomodoroService);
  public i18n = inject(I18nService);

  readonly circumference = 2 * Math.PI * 52;

  modes = computed<{ key: PomodoroMode; label: string }[]>(() => {
    const s = this.pomodoro.settings();
    return [
      { key: 'focus', label: this.i18n.t('pomodoroFocusLabel', [s.focusMinutes.toString()]) },
      { key: 'short', label: this.i18n.t('pomodoroShortBreakLabel', [s.shortBreakMinutes.toString()]) },
      { key: 'long', label: this.i18n.t('pomodoroLongBreakLabel', [s.longBreakMinutes.toString()]) },
    ];
  });

  dashOffset = computed(() => {
    const total = this.pomodoro.totalSeconds();
    const progress = total > 0 ? this.pomodoro.remainingSeconds() / total : 0;
    return this.circumference * (1 - progress);
  });
}
