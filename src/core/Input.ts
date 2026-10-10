/** Keyboard input (GDD §2.2). */
export type Action = 'left' | 'right' | 'special' | 'pause' | 'newSeed' | 'debug' | 'latencyDown' | 'latencyUp';

const BINDINGS: Record<string, Action> = {
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'special',
  Escape: 'pause',
  KeyN: 'newSeed',
  F3: 'debug',
  BracketLeft: 'latencyDown',
  BracketRight: 'latencyUp',
};

export class Input {
  private readonly held = new Set<Action>();
  private readonly pressed = new Set<Action>();
  /** Active pointers (touch or mouse) held on the game canvas, by side. */
  private readonly pointers = new Map<number, 'left' | 'right'>();

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
    target.addEventListener('pointerdown', this.onPointerDown);
    target.addEventListener('pointerup', this.onPointerUp);
    target.addEventListener('pointercancel', this.onPointerUp);
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.target.removeEventListener('pointerdown', this.onPointerDown);
    this.target.removeEventListener('pointerup', this.onPointerUp);
    this.target.removeEventListener('pointercancel', this.onPointerUp);
  }

  isHeld(action: Action): boolean {
    return this.held.has(action);
  }

  /** True once per key press; cleared by the next call. */
  consumePressed(action: Action): boolean {
    return this.pressed.delete(action);
  }

  /** Digital steering axis in [-1, 1]; positive steers right. */
  steerAxis(): number {
    let left = this.isHeld('left');
    let right = this.isHeld('right');
    for (const side of this.pointers.values()) {
      if (side === 'left') left = true;
      else right = true;
    }
    return (right ? 1 : 0) - (left ? 1 : 0);
  }

  /** Clears pending presses (e.g. when gameplay starts after a menu). */
  clearPressed(): void {
    this.pressed.clear();
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const action = BINDINGS[event.code];
    if (!action) return;
    // Let form controls in menus keep their keyboard behaviour.
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'BUTTON') && action !== 'pause') return;
    event.preventDefault();
    if (!event.repeat) this.pressed.add(action);
    this.held.add(action);
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    const action = BINDINGS[event.code];
    if (action) this.held.delete(action);
  };

  private onBlur = (): void => {
    this.held.clear();
    this.pointers.clear();
  };

  /** Holding the left or right half of the game view steers (touch screens, mouse). */
  private onPointerDown = (event: Event): void => {
    const e = event as PointerEvent;
    if (!(e.target instanceof HTMLCanvasElement)) return;
    this.pointers.set(e.pointerId, e.clientX < window.innerWidth / 2 ? 'left' : 'right');
  };

  private onPointerUp = (event: Event): void => {
    this.pointers.delete((event as PointerEvent).pointerId);
  };
}
