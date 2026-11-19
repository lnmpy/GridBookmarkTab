import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  heroAdjustmentsHorizontal,
  heroArrowLeft,
  heroHome,
} from "@ng-icons/heroicons/outline";
import { ToastContainerComponent } from "@app/components/toast-container/toast-container.component";
import { ToolIconComponent } from "@app/new-tab/toolbox/tool-icon.component";
import { ColorPickerToolComponent } from "@app/new-tab/toolbox/tools/color-picker-tool.component";
import { PomodoroToolComponent } from "@app/new-tab/toolbox/tools/pomodoro-tool.component";
import { QrCodeToolComponent } from "@app/new-tab/toolbox/tools/qr-code-tool.component";
import { I18nService } from "@app/services/i18n.service";
import { PomodoroService } from "@app/services/pomodoro.service";
import { SettingsService } from "@app/services/settings.service";
import {
  ToolDefinition,
  ToolId,
  ToolboxService,
} from "@app/services/toolbox.service";

@Component({
  selector: "app-popup",
  standalone: true,
  imports: [
    NgIcon,
    ToastContainerComponent,
    ToolIconComponent,
    PomodoroToolComponent,
    QrCodeToolComponent,
    ColorPickerToolComponent,
  ],
  providers: [
    provideIcons({
      heroAdjustmentsHorizontal,
      heroArrowLeft,
      heroHome,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="w-[360px] min-h-screen flex flex-col bg-base-200 text-base-content p-4 select-none"
    >
      @if (activeToolId(); as toolId) {
        <!-- Active Tool Header -->
        <div
          class="flex items-center justify-between gap-2 pb-3 mb-3.5 border-b border-line-soft"
        >
          <div class="flex items-center gap-2 min-w-0">
            <button
              type="button"
              class="w-7 h-7 rounded-lg grid place-items-center text-ink-2 hover:text-base-content hover:bg-chip transition-colors cursor-pointer shrink-0"
              (click)="backToMenu()"
              [attr.title]="i18n.t('back')"
              [attr.aria-label]="i18n.t('back')"
            >
              <ng-icon name="heroArrowLeft" class="w-4 h-4" />
            </button>
            <div
              class="w-7 h-7 rounded-lg surface-sunken flex items-center justify-center text-primary shrink-0"
            >
              <app-tool-icon [toolId]="toolId" iconClass="w-4 h-4" />
            </div>
            <h1 class="text-[14px] font-semibold text-base-content truncate">
              {{ i18n.t(currentToolNameKey()) }}
            </h1>
          </div>

          <button
            type="button"
            class="w-7 h-7 rounded-lg grid place-items-center text-ink-2 hover:text-base-content hover:bg-chip transition-colors cursor-pointer shrink-0"
            (click)="openNewTab()"
            [attr.title]="i18n.t('openInNewTab')"
            [attr.aria-label]="i18n.t('openInNewTab')"
          >
            <ng-icon name="heroHome" class="w-4 h-4" />
          </button>
        </div>

        <!-- Active Tool Content -->
        <div>
          @switch (toolId) {
            @case ("pomodoro") {
              <app-pomodoro-tool />
            }
            @case ("qrCode") {
              <app-qr-code-tool />
            }
            @case ("colorPicker") {
              <app-color-picker-tool />
            }
          }
        </div>
      } @else {
        <!-- Tool Menu Header -->
        <div class="flex items-center justify-between px-1 mb-3">
          <h1 class="text-[14px] font-semibold text-base-content">
            {{ i18n.t("toolbox") }}
          </h1>
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="w-7 h-7 rounded-lg grid place-items-center text-ink-2 hover:text-base-content hover:bg-chip transition-colors cursor-pointer"
              (click)="openNewTab()"
              [attr.title]="i18n.t('openInNewTab')"
              [attr.aria-label]="i18n.t('openInNewTab')"
            >
              <ng-icon name="heroHome" class="w-4 h-4" />
            </button>
            <button
              type="button"
              class="w-7 h-7 rounded-lg grid place-items-center text-ink-2 hover:text-base-content hover:bg-chip transition-colors cursor-pointer"
              (click)="openSettings()"
              [attr.title]="i18n.t('settings')"
              [attr.aria-label]="i18n.t('settings')"
            >
              <ng-icon name="heroAdjustmentsHorizontal" class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Tool Grid -->
        <div class="grid grid-cols-3 gap-1.5">
          @for (tool of menuTools(); track tool.id) {
            <button
              type="button"
              class="group flex flex-col items-center justify-center gap-2 py-3 px-2 rounded-2xl hover:bg-chip transition-colors cursor-pointer relative"
              (click)="onToolClick(tool)"
            >
              <div
                class="w-11 h-11 rounded-[13px] surface-sunken flex items-center justify-center transition-colors relative"
                [class.text-primary]="
                  tool.id === 'pomodoro' && pomodoroService.isRunning()
                "
                [class.text-base-content/85]="
                  !(tool.id === 'pomodoro' && pomodoroService.isRunning())
                "
                [class.group-hover:text-base-content]="
                  !(tool.id === 'pomodoro' && pomodoroService.isRunning())
                "
              >
                <app-tool-icon [toolId]="tool.id" iconClass="w-5 h-5" />
              </div>
              <span
                class="text-[12px] text-ink-2 group-hover:text-base-content truncate max-w-full leading-tight"
              >
                @if (tool.id === "pomodoro" && pomodoroService.isRunning()) {
                  <span
                    class="font-mono font-semibold text-primary tabular-nums"
                  >
                    {{ pomodoroService.formattedTime() }}
                  </span>
                } @else {
                  {{ i18n.t(tool.nameKey) }}
                }
              </span>
            </button>
          }
        </div>
      }
    </div>
    <app-toast-container />
  `,
})
export class PopupComponent implements OnInit {
  public i18n = inject(I18nService);
  public toolboxService = inject(ToolboxService);
  public pomodoroService = inject(PomodoroService);
  private settingsService = inject(SettingsService);
  private destroyRef = inject(DestroyRef);

  activeToolId = signal<ToolId | null>(null);

  menuTools = computed<ToolDefinition[]>(() => {
    const visible = this.toolboxService.visibleTools();
    return visible.length > 0 ? visible : this.toolboxService.allToolsOrdered();
  });

  currentToolNameKey = computed<string>(() => {
    const toolId = this.activeToolId();
    if (!toolId) return "toolbox";
    return this.toolboxService.getToolDefinition(toolId).nameKey;
  });

  ngOnInit(): void {
    this.settingsService.settingsSource
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((settings) => {
        document.documentElement.setAttribute(
          "data-theme",
          settings.theme || "light",
        );
      });
  }

  onToolClick(tool: ToolDefinition): void {
    if (tool.id === "calculator") {
      const url =
        typeof chrome !== "undefined" && chrome.runtime?.getURL
          ? chrome.runtime.getURL("index.html#/?target=calculator")
          : "/index.html#/?target=calculator";
      if (typeof chrome !== "undefined" && chrome.tabs?.create) {
        chrome.tabs.create({ url });
        window.close();
      } else {
        window.open(url, "_blank");
      }
      return;
    }
    this.activeToolId.set(tool.id);
  }

  backToMenu(): void {
    this.activeToolId.set(null);
  }

  openNewTab(): void {
    if (typeof chrome !== "undefined" && chrome.tabs?.create) {
      chrome.tabs.create({ url: "chrome://newtab" });
      window.close();
    }
  }

  openSettings(): void {
    if (typeof chrome !== "undefined" && chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
      window.close();
    }
  }

  @HostListener("window:keydown.escape", ["$event"])
  onEscape(event: Event): void {
    if (this.activeToolId()) {
      event.preventDefault();
      this.backToMenu();
    }
  }
}
