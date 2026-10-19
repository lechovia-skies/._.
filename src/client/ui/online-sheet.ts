import type { MapId } from '../../shared/data/maps/registry.ts';
import { ONLINE_NAME_MAX, type OnlineModeId, onlineName, parseRoomCode, ROOM_CODE_LENGTH, type RoomSettings, sanitizeRoomSettings } from '../../shared/net/protocol.ts';
import type { SpawnStart } from '../../shared/world/spawns.ts';
import type { EnvironmentSettings, TimeOfDayId } from '../../shared/world/time-of-day.ts';
import { el } from './choice-group.ts';
import { fixedWorld, matchSetupForm } from './match-setup.ts';
import { loadSetting, saveSetting } from './storage.ts';

/** The world a hosted room flies in (revision 32: set on the sheet's World page). */
export interface OnlineWorld {
  map: MapId;
  start: SpawnStart;
  time: TimeOfDayId;
}

/**
 * The host's room and their own start (the others start as they each chose); a guest's room code. Either way the
 * pilot's online name.
 */
export type OnlineStart = ({ role: 'host'; settings: RoomSettings; start: SpawnStart } | { role: 'join'; code: string }) & { name: string };

/** What the online part needs from the title screen. */
export interface OnlinePilot {
  /** why the chosen jet cannot fly (not developed, grounded), or null */
  jetProblem(): string | null;
  /** the weather and clock for a time of day, as matches from the title screen fly */
  environment(time: TimeOfDayId): EnvironmentSettings;
}

/** The default name: online, a pilot still called this has not set a name. */
export const DEFAULT_CALLSIGN = 'Pilot';

/** A name fit for online play: not empty, not the default, and already clean (five letters at most). */
export const nameIsSet = (name: string) => name !== '' && name !== DEFAULT_CALLSIGN && onlineName(name) === name;

/*
 * Pilot names (revision 33, at the owner's request): flying alone needs none, so the title screen has no name field.
 * The first time the pilot goes online the sheet asks for one, up to five letters; it is kept from then on.
 */
const NAME_KEY = 'onlineName';

/** The name saved for online play, or '' before the pilot's first time online. */
export function loadOnlineName(): string {
  const raw = loadSetting<unknown>(NAME_KEY, '');
  const name = typeof raw === 'string' ? onlineName(raw) : '';
  return nameIsSet(name) ? name : '';
}

/** Keeps a name for online play; false (and nothing kept) when it is not fit for it. */
export function saveOnlineName(raw: string): boolean {
  const name = onlineName(raw);
  if (!nameIsSet(name)) return false;
  saveSetting(NAME_KEY, name);
  return true;
}

/** What the name step offers the first time: the callsign once typed on the title screen, cut to five letters. */
export function suggestedName(): string {
  const old = loadSetting<unknown>('callsign', '');
  const name = typeof old === 'string' ? onlineName(old) : '';
  return nameIsSet(name) ? name : '';
}

/** The callsign flying alone: the online name if there is one, else the default. */
export const soloCallsign = () => loadOnlineName() || DEFAULT_CALLSIGN;

const NAME_RULE = `Up to ${ONLINE_NAME_MAX} letters or digits (any script), spaces and . _ -`;

/** The map a room's mode flies on and the starts it allows: Strike keeps the Test Range; runways are Lechovia's. */
export function roomWorld(w: OnlineWorld, mode: OnlineModeId): OnlineWorld {
  const map: MapId = mode === 'strike' ? 'test-range' : w.map;
  return { ...w, map, start: map === 'lechovia' && mode !== 'strike' ? w.start : 'air' };
}

/**
 * Multiplayer in the Play sheet (revision 28's Online sheet; revision 34 moved it there): create a room or join one
 * with its code; `?join=CODE` opens it with the code filled in. Revision 32: online the pilot needs a name: without
 * one it first asks for it in the middle; once set it is kept and can be changed at the top. Revision 33: the name is
 * asked for the first time online, up to five letters; a room opens in its lobby. Revision 34: the room is set up with
 * the same form as a solo match (mission, time of day, AI pilots, pilots per side, map and start).
 */
export function onlineSection(pilot: OnlinePilot, onGo: (start: OnlineStart) => void): { element: HTMLElement; open(code?: string, error?: string): void } {
  const section = el('div', 'online-section');
  const note = el(
    'p',
    'sheet-note',
    "Fly with friends: one of you creates a room and gets its code, the others join with the code and wait in the room's lobby until the host starts the match. The match runs in the host's browser, so the host keeps the game open in front. Empty seats are flown by AI pilots.",
  );
  const error = el('p', 'notice online-error');
  error.setAttribute('role', 'alert');
  error.hidden = true;

  // The pilot name: asked for first when it is not set, then shown (and editable) at the top.
  const nameStep = el('div', 'name-step');
  nameStep.setAttribute('role', 'alertdialog');
  nameStep.setAttribute('aria-labelledby', 'name-step-title');
  const stepTitle = el('h3', 'name-step-title', 'Choose your pilot name');
  stepTitle.id = 'name-step-title';
  const stepInput = el('input', 'pilot-input name-step-input');
  stepInput.maxLength = ONLINE_NAME_MAX;
  stepInput.autocomplete = 'off';
  stepInput.spellcheck = false;
  stepInput.placeholder = 'YOUR NAME';
  stepInput.setAttribute('aria-label', 'Pilot name');
  const stepGo = el('button', 'button', 'Continue');
  stepGo.type = 'button';
  const stepHint = el('p', 'name-step-hint');
  const firstHint = `First time online: the others in the room see this name. ${NAME_RULE}.`;
  nameStep.append(el('p', 'name-step-warn', '⚠ No pilot name'), stepTitle, stepInput, stepHint, stepGo);

  const nameRow = el('label', 'online-name');
  nameRow.appendChild(el('span', 'eyebrow', 'Pilot name'));
  const nameInput = el('input', 'pilot-input');
  nameInput.maxLength = ONLINE_NAME_MAX;
  nameInput.autocomplete = 'off';
  nameInput.spellcheck = false;
  nameRow.appendChild(nameInput);

  // Create or join: two pages.
  const tabs = el('div', 'online-tabs');
  tabs.setAttribute('role', 'tablist');
  const pages: { tab: HTMLButtonElement; page: HTMLElement }[] = [];
  const page = (label: string, id: string) => {
    const tab = el('button', 'online-tab', label);
    tab.type = 'button';
    tab.id = `online-tab-${id}`;
    tab.setAttribute('role', 'tab');
    const panel = el('div', 'online-page');
    panel.id = `online-page-${id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    tab.setAttribute('aria-controls', panel.id);
    tabs.appendChild(tab);
    pages.push({ tab, page: panel });
    tab.addEventListener('click', () => showPage(pages.findIndex((p) => p.tab === tab)));
    return panel;
  };
  const showPage = (i: number) => {
    pages.forEach((p, k) => {
      p.page.hidden = k !== i;
      p.tab.setAttribute('aria-selected', String(k === i));
      p.tab.classList.toggle('is-active', k === i);
    });
  };

  const createPage = page('Create a room', 'create');
  const setup = matchSetupForm('online');
  const hostButton = el('button', 'button', 'Create the room');
  hostButton.type = 'button';
  createPage.append(setup.element, el('p', 'sheet-note', 'Your jet: the one chosen on the title screen. The room opens in its lobby with its code.'), hostButton);

  const joinPage = page('Join a room', 'join');
  const codeLabel = el('label', 'online-code');
  codeLabel.appendChild(el('span', 'sr-only', 'Room code'));
  const code = el('input', 'online-code-input');
  code.placeholder = 'ROOM CODE';
  code.maxLength = 64;
  code.autocomplete = 'off';
  code.spellcheck = false;
  code.setAttribute('autocapitalize', 'characters');
  codeLabel.appendChild(code);
  const joinButton = el('button', 'button', 'Join');
  joinButton.type = 'button';
  const joinRow = el('div', 'online-join-row');
  joinRow.append(codeLabel, joinButton);
  joinPage.append(joinRow, el('p', 'sheet-note', `The ${ROOM_CODE_LENGTH}-letter code the host gives you, or their invite link.`));

  const privacy = el(
    'p',
    'sheet-note',
    'Online play links the browsers in a room directly (WebRTC): they meet through public relays, and the others can see your IP address, as in most peer-to-peer games. Some networks do not allow direct links.',
  );
  const body = el('div', 'online-body');
  body.append(nameRow, tabs, ...pages.map((p) => p.page), privacy);
  section.append(note, error, nameStep, body);

  const showError = (text: string | undefined) => {
    error.textContent = text ?? '';
    error.hidden = !text;
  };
  /** Shows the name step until there is a name, then the rest. */
  const showStep = () => {
    const name = loadOnlineName();
    const set = name !== '';
    nameStep.hidden = set;
    body.hidden = !set;
    note.hidden = !set;
    nameInput.value = name;
    stepInput.value = set ? name : suggestedName();
  };
  const confirmName = () => {
    if (!saveOnlineName(stepInput.value)) {
      stepHint.textContent = `Choose a name other than "${DEFAULT_CALLSIGN}". ${NAME_RULE}.`;
      stepHint.classList.add('is-error');
      stepInput.focus();
      return;
    }
    showStep();
    pages.find((p) => !p.page.hidden)?.tab.focus();
  };
  stepGo.addEventListener('click', confirmName);
  stepInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmName();
    }
  });
  nameInput.addEventListener('change', () => {
    // Cleared or back to the default: the name kept stays.
    saveOnlineName(nameInput.value);
    nameInput.value = loadOnlineName();
  });

  /** Online needs a name and a jet fit to fly. */
  const ready = (): boolean => {
    saveOnlineName(nameInput.value);
    if (loadOnlineName() === '') {
      showStep();
      stepInput.focus();
      return false;
    }
    const problem = pilot.jetProblem();
    if (problem) {
      showError(problem);
      return false;
    }
    return true;
  };
  const tryJoin = () => {
    const parsed = parseRoomCode(code.value);
    if (!parsed) {
      showError(`A room code is ${ROOM_CODE_LENGTH} letters and digits, like K7QF3M.`);
      code.focus();
      return;
    }
    if (!ready()) return;
    onGo({ role: 'join', code: parsed, name: loadOnlineName() });
  };
  hostButton.addEventListener('click', () => {
    if (!ready()) return;
    const s = setup.value();
    const w = fixedWorld(s);
    onGo({
      role: 'host',
      start: w.start,
      name: loadOnlineName(),
      settings: sanitizeRoomSettings({ mode: s.mission, map: w.map, environment: pilot.environment(s.time), teamSize: Number(s.seats), botSkill: s.skill }),
    });
  });
  joinButton.addEventListener('click', tryJoin);
  code.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      tryJoin();
    }
  });
  code.addEventListener('input', () => showError(undefined));

  return {
    element: section,
    open(prefill?: string, message?: string) {
      if (prefill) code.value = prefill;
      showError(message);
      showPage(prefill ? 1 : 0);
      showStep();
      stepHint.textContent = firstHint;
      stepHint.classList.remove('is-error');
      if (loadOnlineName() === '') stepInput.focus();
      else if (prefill) joinButton.focus();
    },
  };
}
