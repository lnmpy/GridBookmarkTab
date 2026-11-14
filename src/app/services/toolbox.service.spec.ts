import { TestBed } from '@angular/core/testing';
import { DEFAULT_TOOL_ORDER, ToolboxService } from './toolbox.service';

describe('ToolboxService', () => {
  let service: ToolboxService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToolboxService);
  });

  it('should initialize with 4 default visible tools', () => {
    expect(service.visibleTools().map((t) => t.id)).toEqual(DEFAULT_TOOL_ORDER);
    expect(service.pinnedTools().length).toBe(0);
  });

  it('should pin and unpin a tool to menu', async () => {
    const pinned = await service.togglePinToMenu('calculator');
    expect(pinned).toBe(true);
    expect(service.isPinned('calculator')).toBe(true);
    expect(service.pinnedTools().map((t) => t.id)).toEqual(['calculator']);

    const unpinned = await service.togglePinToMenu('calculator');
    expect(unpinned).toBe(false);
    expect(service.isPinned('calculator')).toBe(false);
    expect(service.pinnedTools().length).toBe(0);
  });

  it('should reorder visible tools and persist order', async () => {
    await service.reorderVisibleTools(0, 2);
    const order = service.visibleTools().map((t) => t.id);
    expect(order[0]).toBe('pomodoro');
    expect(order[1]).toBe('qrCode');
    expect(order[2]).toBe('calculator');
  });

  it('should toggle tool visibility and reset to defaults', async () => {
    await service.toggleToolVisibility('pomodoro');
    expect(service.isVisible('pomodoro')).toBe(false);
    expect(service.visibleTools().some((t) => t.id === 'pomodoro')).toBe(false);

    await service.resetDefaults();
    expect(service.isVisible('pomodoro')).toBe(true);
    expect(service.visibleTools().map((t) => t.id)).toEqual(DEFAULT_TOOL_ORDER);
  });
});
