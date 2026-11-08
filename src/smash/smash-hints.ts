/**
 * How to smash each instrument, said in pictograms rather than words: red
 * discs read left to right, joined by chevrons (grab it › swing it down ›
 * it breaks). An instrument's sign shows its card in turn with how to play
 * it, and while it is held or broken, what to do next.
 */

import { ACCENT, type HudSign, type HudStep, type LabelSprite } from '../guitar/guitar-model.js';
import { SmashHold } from './smashable-component.js';

const GRAB: HudStep = { icon: 'grab', smash: true };
const SWING: HudStep = { icon: 'swingDown', smash: true };
const BURST: HudStep = { icon: 'burst', smash: true };
const THROW: HudStep = { icon: 'throwArc', smash: true };
const PUSH: HudStep = { icon: 'hand', smash: true };
const TOPPLE: HudStep = { icon: 'topple', smash: true };
const LET_GO: HudStep = { icon: 'hand', smash: true, faint: true };
const RESET: HudStep = { icon: 'locateFixed', smash: true };

const card = (...steps: HudStep[]): HudSign => ({ steps, chain: true });

/** What to do to break each kind of instrument. */
export const SMASH_CARD = {
  /** A fist round the neck picks it up; swung down onto the floor, it breaks. */
  grabAndSwing: card(GRAB, SWING, BURST),
  /** Already in the hand: swung down onto the floor, it breaks. */
  swing: card(SWING, BURST),
  /** A fist on a drum pulls it off; thrown, it breaks where it lands. */
  grabAndThrow: card(GRAB, THROW, BURST),
  /** Shoved, it topples and breaks as it lands. */
  topple: card(PUSH, TOPPLE, BURST),
  /** In the hand: swing it down to smash it, or open the hand to throw it. */
  held: card(SWING, BURST, LET_GO),
  /** Wrecked: the panel's reset button (the same icon) brings it back whole. */
  reset: card(RESET),
} as const;

/** How long each of a sign's two cards shows before the other, in seconds. */
const TURN_SECONDS = 3.5;

/** The parts of a smasher the hints read. */
export interface SmashState {
  hold: string;
  holding: boolean;
  wrecked: boolean;
  health: number;
}

/**
 * One instrument's smashing hints. `card` says how to break it; `lying`
 * is what to do with it knocked down but not yet wrecked.
 */
export class SmashHints {
  private readonly playSigns = new Map<readonly HudStep[], HudSign>();
  /** Reused, so drawing allocates nothing once each health has been shown. */
  private readonly sign: HudSign = { chain: true };
  private shownHealth = -1;

  constructor(
    private readonly card: HudSign,
    private readonly lying: HudSign = card,
  ) {}

  /** The how-to-play steps, in turn with how to smash it. */
  drawHowTo(hud: LabelSprite, play: readonly HudStep[]): void {
    if (Math.floor(performance.now() / 1000 / TURN_SECONDS) % 2 === 1) {
      hud.draw(this.card, ACCENT.smash);
      return;
    }
    let sign = this.playSigns.get(play);
    if (sign == null) {
      sign = { steps: play };
      this.playSigns.set(play, sign);
    }
    hud.draw(sign, ACCENT.idle);
  }

  /**
   * While it is held or broken, draws what to do next with how much is
   * left, and says so; otherwise draws nothing and returns false.
   */
  drawSmashing(hud: LabelSprite, smash: SmashState): boolean {
    let steps: readonly HudStep[] | undefined;
    if (smash.holding) steps = SMASH_CARD.held.steps;
    else if (smash.wrecked) steps = SMASH_CARD.reset.steps;
    else if (smash.hold === SmashHold.Thrown) steps = this.lying.steps;
    else return false;
    // How much is left, as a number; once wrecked, only what to do about it.
    const health = smash.wrecked ? -1 : Math.round(smash.health * 100);
    if (health !== this.shownHealth) {
      this.shownHealth = health;
      this.sign.headline = health < 0 ? undefined : `${health}%`;
    }
    this.sign.steps = steps;
    hud.draw(this.sign, ACCENT.smash);
    return true;
  }
}
