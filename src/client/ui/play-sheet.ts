import { el } from './choice-group.ts';
import { type MatchSetup, matchSetupForm } from './match-setup.ts';

export type PlayStep = 'choose' | 'solo';

/** What the Play sheet needs from the title screen. */
export interface PlayDeps {
  /** why the chosen jet cannot fly (not developed, grounded), or null */
  jetProblem(): string | null;
  /** the jet chosen on the title screen, for the line above FLY */
  jetName(): string;
  /** a solo setting changed (the title screen's sky follows the time of day) */
  onSoloChange?(s: MatchSetup): void;
}

const TITLES: Record<PlayStep, string> = { choose: 'Play', solo: 'Solo' };

/**
 * The Play sheet (revision 34, at the owner's request): PLAY on the title screen opens it on a choice between Solo and
 * Multiplayer. Solo sets the match up (the mission, the time of day, the AI pilots, the pilots, the map and start) and
 * flies from here; Multiplayer opens the Multiplayer screen (revision 37).
 */
export function playSheet(deps: PlayDeps, onSolo: (setup: MatchSetup) => void, onMultiplayer: () => void): { dialog: HTMLDialogElement; open(step?: PlayStep): void } {
  const dialog = el('dialog', 'sheet play-sheet');
  dialog.setAttribute('aria-labelledby', 'play-title');
  const form = el('form');
  form.method = 'dialog';
  const head = el('div', 'play-head');
  const back = el('button', 'link', '← Back');
  back.type = 'button';
  const title = el('h2', 'sheet-title', 'Play');
  title.id = 'play-title';
  title.tabIndex = -1;
  head.append(back, title);

  // Step 1: alone or with friends.
  const choose = el('div', 'play-modes');
  const card = (kicker: string, name: string, text: string) => {
    const b = el('button', 'play-mode');
    b.type = 'button';
    b.append(el('span', 'play-mode-kicker', kicker), el('span', 'play-mode-name', name), el('span', 'play-mode-text', text));
    choose.appendChild(b);
    return b;
  };
  const soloCard = card('1 player', 'Solo', 'You, and AI wingmen if you like, against AI pilots.');
  const onlineCard = card('Online', 'Multiplayer', 'Fly with friends: create a room and pass its code on, or join one with a code.');

  // Solo: the settings and FLY.
  const solo = el('div', 'play-step');
  const setup = matchSetupForm('solo', (s) => deps.onSoloChange?.(s));
  const jetLine = el('p', 'play-jet');
  jetLine.setAttribute('aria-live', 'polite');
  const fly = el('button', 'fly', 'Fly');
  fly.type = 'button';
  solo.append(setup.element, jetLine, fly);

  const close = el('button', 'link', 'Close');
  close.value = 'close';
  form.append(head, choose, solo, close);
  dialog.appendChild(form);

  let step: PlayStep = 'choose';
  const show = (s: PlayStep) => {
    step = s;
    title.textContent = TITLES[s];
    back.hidden = s === 'choose';
    choose.hidden = s !== 'choose';
    solo.hidden = s !== 'solo';
    if (s === 'solo') {
      const problem = deps.jetProblem();
      jetLine.textContent = problem ?? `Your jet: ${deps.jetName()} (change it on the title screen).`;
      jetLine.classList.toggle('is-error', problem !== null);
      fly.disabled = problem !== null;
    }
  };
  soloCard.addEventListener('click', () => {
    show('solo');
    fly.focus();
  });
  onlineCard.addEventListener('click', () => {
    dialog.close();
    onMultiplayer();
  });
  back.addEventListener('click', () => {
    show('choose');
    (step === 'choose' ? soloCard : title).focus();
  });
  fly.addEventListener('click', () => {
    if (deps.jetProblem()) return;
    dialog.close();
    onSolo(setup.value());
  });

  return {
    dialog,
    open(s: PlayStep = 'choose') {
      show(s);
      dialog.showModal();
      if (s === 'solo') fly.focus();
      else soloCard.focus();
    },
  };
}
