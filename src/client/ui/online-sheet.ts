import { DIFFICULTIES, type DifficultyId } from '../../shared/ai/difficulty.ts';
import { MAP_IDS, MAP_NAMES, type MapId } from '../../shared/data/maps/registry.ts';
import { ONLINE_NAME_MAX, type OnlineModeId, ONLINE_MODES, onlineName, parseRoomCode, ROOM_CODE_LENGTH, type RoomSettings, sanitizeRoomSettings } from '../../shared/net/protocol.ts';
import { SPAWN_STARTS, type SpawnStart } from '../../shared/world/spawns.ts';
import { type EnvironmentSettings, TIME_OF_DAY_IDS, TIME_OF_DAY_LABELS, type TimeOfDayId } from '../../shared/world/time-of-day.ts';
import { choiceGroup, el } from './choice-group.ts';
import { MISSION_LABELS } from './records-format.ts';
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

/** What the sheet needs from the title screen. */
export interface OnlinePilot {
  /** why the chosen jet cannot fly (not developed, grounded), or null */
  jetProblem(): string | null;
  /** the title screen's world, the World page's first choice */
  world(): OnlineWorld;
  /** the weather and clock for a time of day, as matches from the title screen fly */
  environment(time: TimeOfDayId): EnvironmentSettings;
}

const SEATS = ['1', '2', '4'] as const;
type Seats = (typeof SEATS)[number];

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

const START_LABELS: Record<SpawnStart, string> = { air: 'Air start', runway: 'Runway start' };

/** The map a room's mode flies on and the starts it allows: Strike keeps the Test Range; runways are Lechovia's. */
export function roomWorld(w: OnlineWorld, mode: OnlineModeId): OnlineWorld {
  const map: MapId = mode === 'strike' ? 'test-range' : w.map;
  return { ...w, map, start: map === 'lechovia' && mode !== 'strike' ? w.start : 'air' };
}

function select<T extends string>(label: string, values: readonly T[], names: (v: T) => string, value: T, onChange: (v: T) => void): HTMLLabelElement {
  const wrap = el('label', 'online-select');
  wrap.appendChild(el('span', 'eyebrow', label));
  const sel = el('select', 'world-select');
  for (const v of values) {
    const o = el('option', undefined, names(v));
    o.value = v;
    sel.appendChild(o);
  }
  sel.value = value;
  sel.addEventListener('change', () => onChange(sel.value as T));
  wrap.appendChild(sel);
  return wrap;
}

/**
 * The title screen's Online sheet (revision 28): host a room or join one with its code. `?join=CODE` opens it with
 * the code filled in. Revision 32: online the pilot needs a name: without one the sheet first asks for it in the
 * middle of the screen; once set it is carried over from then on and can be changed at the top of the sheet. The
 * host sets the room on two pages: Room (mode, seats, AI pilots) and World (map, start, time of day). Revision 33: the
 * name is asked for the first time online, up to five letters; a room opens in its lobby.
 */
export function onlineSheet(pilot: OnlinePilot, onGo: (start: OnlineStart) => void): { dialog: HTMLDialogElement; open(code?: string, error?: string): void } {
  const dialog = el('dialog', 'sheet online-sheet');
  dialog.setAttribute('aria-labelledby', 'online-title');
  const form = el('form');
  form.method = 'dialog';
  const title = el('h2', 'sheet-title', 'Online');
  title.id = 'online-title';
  title.tabIndex = -1;
  const note = el(
    'p',
    'sheet-note',
    "Fly with friends: one of you hosts a room and gets its code, the others join it with the code and wait in the room's lobby until the host starts the match. The match runs in the host's browser, so the host keeps the game open in front. Empty seats are flown by AI pilots.",
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

  // Host: the Room and World pages.
  const host = el('section', 'online-part');
  host.appendChild(el('h3', 'eyebrow', 'Create a room'));
  let mode: OnlineModeId = ONLINE_MODES.find((m) => m === loadSetting<unknown>('onlineMode', 'team-deathmatch')) ?? 'team-deathmatch';
  let seats: Seats = SEATS.find((s) => s === String(loadSetting<unknown>('onlineSeats', '2'))) ?? '2';
  let skill: DifficultyId = (Object.keys(DIFFICULTIES) as DifficultyId[]).find((d) => d === loadSetting<unknown>('onlineSkill', 'veteran')) ?? 'veteran';
  const savedWorld = loadSetting<Partial<Record<keyof OnlineWorld, unknown>> | null>('onlineWorld', null);
  const titleWorld = pilot.world();
  const world: OnlineWorld = {
    map: MAP_IDS.find((m) => m === savedWorld?.map) ?? titleWorld.map,
    start: SPAWN_STARTS.find((s) => s === savedWorld?.start) ?? titleWorld.start,
    time: TIME_OF_DAY_IDS.find((t) => t === savedWorld?.time) ?? titleWorld.time,
  };

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

  const roomPage = page('Room', 'room');
  const modes = choiceGroup(
    'online-mode',
    'Mode',
    ONLINE_MODES.map((m) => ({ value: m, label: MISSION_LABELS[m] })),
    mode,
    (m) => {
      mode = m;
      saveSetting('onlineMode', m);
      refreshWorld();
    },
  );
  const seatGroup = choiceGroup(
    'online-seats',
    'Pilots per side',
    SEATS.map((n) => ({ value: n, label: `${n} v ${n}` })),
    seats,
    (n) => {
      seats = n;
      saveSetting('onlineSeats', n);
    },
  );
  seatGroup.title = 'Seats on each side: the ones no one takes are flown by AI pilots';
  const skillGroup = choiceGroup(
    'online-skill',
    'AI pilots',
    Object.values(DIFFICULTIES).map((d) => ({ value: d.id, label: d.label })),
    skill,
    (d) => {
      skill = d;
      saveSetting('onlineSkill', d);
    },
  );
  const hostRow = el('div', 'online-row');
  hostRow.append(seatGroup, skillGroup);
  roomPage.append(modes, hostRow);

  const worldPage = page('World', 'world');
  const saveWorld = () => saveSetting('onlineWorld', world);
  const mapSel = select('Map', MAP_IDS, (m) => MAP_NAMES[m], world.map, (m) => {
    world.map = m;
    saveWorld();
    refreshWorld();
  });
  const startSel = select('Your start', SPAWN_STARTS, (s) => START_LABELS[s], world.start, (s) => {
    world.start = s;
    saveWorld();
  });
  const timeSel = select('Time of day', TIME_OF_DAY_IDS, (t) => TIME_OF_DAY_LABELS[t], world.time, (t) => {
    world.time = t;
    saveWorld();
  });
  const worldRow = el('div', 'online-row');
  worldRow.append(mapSel, startSel, timeSel);
  const worldNote = el('p', 'sheet-note');
  worldPage.append(worldRow, worldNote);
  // Strike keeps the Test Range; runway starts need Lechovia's airfields.
  const refreshWorld = () => {
    const w = roomWorld(world, mode);
    const map = mapSel.querySelector('select') as HTMLSelectElement;
    const start = startSel.querySelector('select') as HTMLSelectElement;
    map.disabled = mode === 'strike';
    map.value = w.map;
    start.disabled = w.map !== 'lechovia';
    start.value = w.start;
    worldNote.textContent =
      mode === 'strike'
        ? 'Strike is flown on the Test Range, from the air.'
        : 'The time of day and the map are the same for everyone in the room. Each pilot starts as they choose: AI pilots start with you.';
  };
  showPage(0);
  refreshWorld();

  const hostButton = el('button', 'button', 'Create the room');
  hostButton.type = 'button';
  host.append(tabs, ...pages.map((p) => p.page), el('p', 'sheet-note', 'Your jet: the one selected on the title screen.'), hostButton);

  // Join.
  const join = el('section', 'online-part');
  join.appendChild(el('h3', 'eyebrow', 'Join a room'));
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
  join.append(joinRow, el('p', 'sheet-note', `The ${ROOM_CODE_LENGTH}-letter code the host gives you, or their invite link.`));

  const privacy = el(
    'p',
    'sheet-note',
    'Online play links the browsers in a room directly (WebRTC): they meet through public relays, and the others can see your IP address, as in most peer-to-peer games. Some networks do not allow direct links.',
  );
  const close = el('button', 'link', 'Close');
  close.value = 'close';
  const body = el('div', 'online-body');
  body.append(nameRow, host, join, privacy);
  form.append(title, note, error, nameStep, body, close);
  dialog.appendChild(form);

  const showError = (text: string | undefined) => {
    error.textContent = text ?? '';
    error.hidden = !text;
  };
  /** Shows the name step until there is a name, then the rest of the sheet. */
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
    title.focus();
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
    dialog.close();
    onGo({ role: 'join', code: parsed, name: loadOnlineName() });
  };
  hostButton.addEventListener('click', () => {
    if (!ready()) return;
    const w = roomWorld(world, mode);
    dialog.close();
    onGo({ role: 'host', start: w.start, name: loadOnlineName(), settings: sanitizeRoomSettings({ mode, map: w.map, environment: pilot.environment(w.time), teamSize: Number(seats), botSkill: skill }) });
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
    dialog,
    open(prefill?: string, message?: string) {
      if (prefill) code.value = prefill;
      showError(message);
      showStep();
      stepHint.textContent = firstHint;
      stepHint.classList.remove('is-error');
      dialog.showModal();
      if (loadOnlineName() === '') stepInput.focus();
      else if (prefill) joinButton.focus();
      else title.focus();
    },
  };
}
