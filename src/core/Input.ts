/** Keyboard input (GDD §2.2). */
export type Action = 'left' | 'right' | 'special' | 'pause' | 'newSeed' | 'debug';

const BINDINGS: Record<string, Action> = {
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'special',
  Escape: 'pause',
  KeyN: 'newSeed',
  F3: 'debug',
};

export class Input {
  private readonly held = new Set<Action>();
  private readonly pressed = new Set<Action>();

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
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
    return (this.isHeld('right') ? 1 : 0) - (this.isHeld('left') ? 1 : 0);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const action = BINDINGS[event.code];
    if (!action) return;
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
  };
}
