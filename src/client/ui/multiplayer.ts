import { DIFFICULTIES, type DifficultyId } from '../../shared/ai/difficulty.ts';
import { TEAM_NAMES } from '../../shared/data/aircraft/registry.ts';
import type { TeamId } from '../../shared/data/aircraft/types.ts';
import { MAP_NAMES, type MapId } from '../../shared/data/maps/registry.ts';
import { type AiJets, MAX_TEAM_SIZE, type OnlineModeId } from '../../shared/net/protocol.ts';
import type { SpawnStart } from '../../shared/world/spawns.ts';
import { START_HOURS, TIME_OF_DAY_IDS, TIME_OF_DAY_LABELS, type TimeOfDayId } from '../../shared/world/time-of-day.ts';
import airSuperiorityImg from '../assets/lobby/air-superiority.jpg';
import dogfightImg from '../assets/lobby/dogfight.jpg';
import freeFlightImg from '../assets/lobby/free-flight.jpg';
import headerImg from '../assets/lobby/header.jpg';
import strikeImg from '../assets/lobby/strike.jpg';
import teamObjectiveImg from '../assets/lobby/team-objective.jpg';
import { el } from './choice-group.ts';
import { missionLine, PLAY_MISSIONS } from './match-setup.ts';

/*
 * The multiplayer screens (revision 37), laid out after the owner's picture: a header with the two flags; on the left
 * HOST / JOIN, the ROOM CODE and the GAME SETTINGS; on the right the GAME MODES as picture cards, the AIRCRAFT seat
 * by seat, and one big button; BACK at the foot. The same layout sets a room up from the title screen and is the
 * room's lobby once it is open. The pictures are taken in the game.
 */

const TEAMS: readonly TeamId[] = ['usa', 'russia'];

/** Inline icons, drawn in the current colour. */
const ICON = {
  jet: '<path d="M32 3l3.4 14.6.9 8.9L60 40.6v5.2L36.3 39.4l-.9 10.4 8.4 6.4v3.4L32 56.2l-11.8 3.4v-3.4l8.4-6.4-.9-10.4L4 45.8v-5.2l23.7-14.1.9-8.9z"/>',
  host: '<circle cx="24" cy="20" r="10"/><path d="M5 52c0-11 8.5-18 19-18s19 7 19 18z"/><path d="M50 18v20M40 28h20" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>',
  join: '<g fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"><path d="M26 38l12-12"/><path d="M29 22l5-5a10 10 0 0 1 14 14l-5 5"/><path d="M35 42l-5 5a10 10 0 0 1-14-14l5-5"/></g>',
  copy: '<g fill="none" stroke="currentColor" stroke-width="5"><rect x="20" y="20" width="32" height="36" rx="3"/><path d="M12 44V12a4 4 0 0 1 4-4h26"/></g>',
  info: '<circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="32" cy="19" r="4"/><path d="M28 27h8v22h-8z"/>',
  players: '<circle cx="32" cy="20" r="12"/><path d="M10 56c0-13 10-21 22-21s22 8 22 21z"/>',
  crosshair: '<g fill="none" stroke="currentColor" stroke-width="5"><circle cx="32" cy="32" r="18"/><path d="M32 4v14M32 46v14M4 32h14M46 32h14"/></g><circle cx="32" cy="32" r="4"/>',
  shield: '<path d="M32 4l24 9v17c0 15-10 25-24 30C18 55 8 45 8 30V13z"/>',
  team: '<circle cx="32" cy="18" r="9"/><circle cx="13" cy="24" r="7"/><circle cx="51" cy="24" r="7"/><path d="M16 54c0-11 7-18 16-18s16 7 16 18z"/><path d="M2 52c0-9 5-14 12-14 3 0 5 1 7 2-4 4-6 8-6 12z"/><path d="M62 52c0-9-5-14-12-14-3 0-5 1-7 2 4 4 6 8 6 12z"/>',
  target: '<g fill="none" stroke="currentColor" stroke-width="5"><circle cx="32" cy="32" r="24"/><circle cx="32" cy="32" r="13"/></g><circle cx="32" cy="32" r="5"/>',
  compass: '<circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-width="5"/><path d="M32 12l7 20-7 20-7-20z"/>',
  clock: '<circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-width="5"/><path d="M29 14h6v17l12 7-3 5-15-9z"/>',
  rank: '<path d="M8 20l24-12 24 12v9L32 17 8 29z"/><path d="M8 40l24-12 24 12v9L32 37 8 49z"/>',
  map: '<path d="M4 14l18-8 20 8 18-8v44l-18 8-20-8-18 8z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><path d="M22 6v44M42 14v44" stroke="currentColor" stroke-width="4"/>',
  runway: '<path d="M24 4h16l8 56H16z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><path d="M32 12v8M32 28v8M32 44v8" stroke="currentColor" stroke-width="4"/>',
  back: '<path d="M30 12L10 32l20 20M12 32h44" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>',
} as const;

function icon(name: keyof typeof ICON, className: string): HTMLSpanElement {
  const span = el('span', className);
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 64 64" fill="currentColor">${ICON[name]}</svg>`;
  return span;
}

/** The two flags, drawn: thirteen stripes and a starred canton; white, blue and red. */
function flag(team: TeamId, className: string): HTMLSpanElement {
  const span = el('span', className);
  span.setAttribute('role', 'img');
  span.setAttribute('aria-label', team === 'usa' ? 'Flag of the United States' : 'Flag of Russia');
  if (team === 'russia') {
    span.innerHTML = '<svg viewBox="0 0 90 60"><rect width="90" height="20" fill="#fff"/><rect y="20" width="90" height="20" fill="#0039a6"/><rect y="40" width="90" height="20" fill="#d52b1e"/></svg>';
    return span;
  }
  const stripes = Array.from({ length: 13 }, (_, i) => `<rect y="${((i * 60) / 13).toFixed(2)}" width="114" height="${(60 / 13).toFixed(2)}" fill="${i % 2 ? '#fff' : '#b22234'}"/>`).join('');
  const stars: string[] = [];
  for (let r = 0; r < 9; r++) for (let c = 0; c < (r % 2 ? 5 : 6); c++) stars.push(`<circle cx="${(3.8 + c * 7.6 + (r % 2 ? 3.8 : 0)).toFixed(1)}" cy="${(3.2 + r * 3.6).toFixed(1)}" r="1.1" fill="#fff"/>`);
  span.innerHTML = `<svg viewBox="0 0 114 60">${stripes}<rect width="45.6" height="32.3" fill="#3c3b6e"/>${stars.join('')}</svg>`;
  return span;
}

/** A mode's card: its picture, icon, name and a short line (the full rules in its tooltip). */
export const MODE_CARDS: Readonly<Record<OnlineModeId, { name: string; text: string; image: string; icon: keyof typeof ICON }>> = {
  'team-deathmatch': { name: 'Dogfight', text: 'Close combat. Most kills wins.', image: dogfightImg, icon: 'crosshair' },
  'air-superiority': { name: 'Air Superiority', text: 'Hold the zones. Control the skies.', image: airSuperiorityImg, icon: 'shield' },
  'team-objective': { name: 'Team Objective', text: 'Down their Sentinels. Guard yours.', image: teamObjectiveImg, icon: 'team' },
  strike: { name: 'Strike', text: 'Bomb the ground targets, or defend them.', image: strikeImg, icon: 'target' },
  'free-flight': { name: 'Free Flight', text: 'No enemies. Fly anywhere.', image: freeFlightImg, icon: 'compass' },
};

const START_LABELS: Record<SpawnStart, string> = { air: 'Air start', runway: 'Runway start' };

/** A pilot in a seat, as the AIRCRAFT list shows them. */
export interface SeatPilot {
  callsign: string;
  team: TeamId;
  /** the jet's id */
  jet: string;
  host: boolean;
  you: boolean;
}

/** One row of the AIRCRAFT list: a seat of a side. */
export interface SeatRow {
  team: TeamId;
  /** numbered down the list, the USA's seats first */
  n: number;
  who: 'you' | 'pilot' | 'ai';
  /** a pilot's name; '' for an AI pilot */
  name: string;
  host: boolean;
  /** a pilot's jet, or an AI seat's (null: a random one) */
  jet: string | null;
  /** an AI seat's place among its side's AI pilots (-1 for a pilot): its jet is `aiJets[team][ai]` */
  ai: number;
}

/**
 * The seats of a match, side by side: on each side its pilots (the host first, then you, then by name), then the AI
 * pilots filling it up to `teamSize` (none in Free Flight). A side with more pilots than seats shows them all.
 */
export function seatRows(teamSize: number, pilots: readonly SeatPilot[], aiJets: AiJets | undefined, withAi: boolean): SeatRow[] {
  const rows: SeatRow[] = [];
  let n = 0;
  for (const team of TEAMS) {
    const side = pilots
      .filter((p) => p.team === team)
      .sort((a, b) => Number(b.host) - Number(a.host) || Number(b.you) - Number(a.you) || a.callsign.localeCompare(b.callsign));
    for (const p of side) rows.push({ team, n: ++n, who: p.you ? 'you' : 'pilot', name: p.callsign, host: p.host, jet: p.jet, ai: -1 });
    const free = withAi ? Math.max(0, teamSize - side.length) : 0;
    for (let k = 0; k < free; k++) rows.push({ team, n: ++n, who: 'ai', name: '', host: false, jet: aiJets?.[team][k] ?? null, ai: k });
  }
  return rows;
}

/** The AI jets with seat `index` of `team` set to `jet` (null: random). */
export function withAiJet(aiJets: AiJets | undefined, team: TeamId, index: number, jet: string | null): AiJets {
  const next: AiJets = { usa: [...(aiJets?.usa ?? [])], russia: [...(aiJets?.russia ?? [])] };
  const side = next[team];
  while (side.length <= index) side.push(null);
  side[index] = jet;
  while (side.length > 0 && side[side.length - 1] === null) side.pop();
  return next;
}

/** The time of day a room's starting hour stands for (the nearest of the four). */
export function timeOfDayAt(hour: number): TimeOfDayId {
  let best: TimeOfDayId = 'day';
  for (const t of TIME_OF_DAY_IDS) if (Math.abs(START_HOURS[t] - hour) < Math.abs(START_HOURS[best] - hour)) best = t;
  return best;
}

/** What a room flies, as the screen sets it. */
export interface MpSettings {
  mode: OnlineModeId;
  teamSize: number;
  time: TimeOfDayId;
  skill: DifficultyId;
  map: MapId;
  aiJets?: AiJets;
}

/** Everything the screen shows; the owner builds it afresh on every change. */
export interface MpView {
  /** setting a room up from the title screen, or in the room's lobby */
  stage: 'setup' | 'room';
  role: 'host' | 'join';
  /** setup: the pilot name being typed */
  name: string;
  /** the room's code: set in a room; being typed when joining; '' before hosting */
  code: string;
  invite: string;
  /** the line under the code */
  status: string;
  error: string;
  settings: MpSettings;
  /** the pilot's own start (setup) */
  start: SpawnStart;
  /** runway starts are possible (Lechovia) */
  runway: boolean;
  /** this pilot may change the settings (the host) */
  edit: boolean;
  /** the fewest seats a side may have: the pilots in */
  minSeats: number;
  /** the modes the room can fly (Strike needs the Test Range) */
  modes: readonly OnlineModeId[];
  /** the maps on offer: in a room only its own */
  maps: readonly MapId[];
  seats: readonly SeatRow[];
  /** the jets this pilot may fly, both sides */
  jets: readonly { id: string; name: string; team: TeamId }[];
  /** every fighter by side, for the AI seats */
  allJets: readonly { id: string; name: string; team: TeamId }[];
  action: { label: string; enabled: boolean };
  back: string;
}

export interface MpHandlers {
  onRole?(role: 'host' | 'join'): void;
  onName?(name: string): void;
  onCode?(code: string): void;
  onSettings(next: MpSettings): void;
  onStart?(start: SpawnStart): void;
  onJet(id: string): void;
  onAiJet(team: TeamId, index: number, jet: string | null): void;
  onAction(): void;
  onBack(): void;
  /** in a room: fly round until the match starts, and the game's settings */
  onFly?(): void;
  onGameSettings?(): void;
}

interface Stepper<T> {
  row: HTMLElement;
  set(values: readonly T[], value: T, enabled: boolean): void;
}

/** A settings row: icon, label and ‹ value ›. */
function stepper<T>(iconName: keyof typeof ICON, label: string, name: (v: T) => string, onChange: (v: T) => void): Stepper<T> {
  const row = el('div', 'mp-row');
  const prev = el('button', 'mp-step', '‹');
  const next = el('button', 'mp-step', '›');
  const value = el('output', 'mp-step-value');
  prev.type = 'button';
  next.type = 'button';
  prev.setAttribute('aria-label', `Previous ${label.toLowerCase()}`);
  next.setAttribute('aria-label', `Next ${label.toLowerCase()}`);
  value.setAttribute('aria-live', 'polite');
  const box = el('div', 'mp-stepper');
  box.append(prev, value, next);
  row.append(icon(iconName, 'mp-row-icon'), el('span', 'mp-row-label', label), box);
  let list: readonly T[] = [];
  let at = 0;
  prev.addEventListener('click', () => at > 0 && onChange(list[at - 1]));
  next.addEventListener('click', () => at < list.length - 1 && onChange(list[at + 1]));
  return {
    row,
    set(values, v, enabled) {
      list = values;
      at = Math.max(0, values.indexOf(v));
      value.textContent = name(v);
      prev.disabled = !enabled || at <= 0;
      next.disabled = !enabled || at >= values.length - 1;
      row.classList.toggle('is-fixed', !enabled);
    },
  };
}

function panel(title: string): { box: HTMLElement; title: HTMLHeadingElement } {
  const box = el('section', 'mp-panel');
  const h = el('h3', 'mp-panel-title', title);
  box.appendChild(h);
  return { box, title: h };
}

/**
 * The screen itself: built once, then `update` with each new view. Seat rows are drawn again only when they change,
 * and not while one of their lists is open.
 */
export class MultiplayerLayout {
  readonly element = el('div', 'mp');
  private view: MpView | null = null;
  private readonly roles: Record<'host' | 'join', HTMLButtonElement>;
  private readonly roleTexts: Record<'host' | 'join', HTMLSpanElement>;
  private readonly nameRow = el('label', 'mp-name');
  private readonly nameInput = el('input', 'mp-name-input');
  private readonly error = el('p', 'mp-error');
  private readonly privacy = el(
    'p',
    'mp-note',
    'Online play links the browsers in a room directly (WebRTC): they meet through public relays, and the others can see your IP address, as in most peer-to-peer games. Some networks do not allow direct links.',
  );
  private readonly codeText = el('output', 'mp-code-text');
  private readonly codeInput = el('input', 'mp-code-input');
  private readonly copy = el('button', 'mp-copy');
  private readonly copyLink = el('button', 'mp-link', 'Copy invite link');
  private readonly copied = el('span', 'mp-copied');
  private readonly status = el('p', 'mp-line');
  private readonly info = el('p', 'mp-line mp-info');
  private readonly infoText = el('span', undefined);
  private readonly settingsNote = el('p', 'mp-note');
  private readonly players: Stepper<number>;
  private readonly mode: Stepper<OnlineModeId>;
  private readonly time: Stepper<TimeOfDayId>;
  private readonly skill: Stepper<DifficultyId>;
  private readonly map: Stepper<MapId>;
  private readonly start: Stepper<SpawnStart>;
  private readonly modesPanel: HTMLElement;
  private readonly modeCards = new Map<OnlineModeId, HTMLButtonElement>();
  private readonly modeNote = el('p', 'mp-note');
  private readonly seatsTitle: HTMLHeadingElement;
  private readonly sides = el('div', 'mp-sides');
  private readonly action = el('button', 'mp-action');
  private readonly back = el('button', 'mp-back');
  private readonly backText = el('span', undefined);
  private readonly fly = el('button', 'mp-ghost', 'Fly while you wait');
  private readonly gameSettings = el('button', 'mp-ghost', 'Settings');
  private seatsKey = '';
  private readonly handlers: MpHandlers;

  constructor(handlers: MpHandlers) {
    this.handlers = handlers;
    const root = this.element;

    // The header: the title over the jets, the flags on the right.
    const head = el('header', 'mp-head');
    head.style.setProperty('--mp-art', `url("${headerImg}")`);
    const brand = el('div', 'mp-brand');
    const titles = el('div', 'mp-titles');
    const h2 = el('h2', 'mp-title', 'Multiplayer');
    h2.id = 'mp-title';
    titles.append(h2, el('p', 'mp-sub', 'Lechovia Skies · USA vs Russia'));
    brand.append(icon('jet', 'mp-emblem'), titles);
    const versus = el('div', 'mp-versus');
    const flags = el('div', 'mp-flags');
    flags.append(flag('usa', 'mp-flag'), el('span', 'mp-vs', 'VS'), flag('russia', 'mp-flag'));
    versus.append(el('p', 'mp-tag', 'Real jets. Real tactics. Team up. Fight.'), flags);
    head.append(brand, versus);

    // HOST / JOIN, with the pilot name.
    const hj = panel('Host / Join');
    const roleRow = el('div', 'mp-roles');
    const roleCard = (role: 'host' | 'join', name: string, text: string) => {
      const b = el('button', 'mp-role');
      b.type = 'button';
      const t = el('span', 'mp-role-text', text);
      const words = el('span', 'mp-role-words');
      words.append(el('span', 'mp-role-name', name), t);
      b.append(icon(role, 'mp-role-icon'), words);
      b.addEventListener('click', () => handlers.onRole?.(role));
      roleRow.appendChild(b);
      return [b, t] as const;
    };
    const [hostCard, hostText] = roleCard('host', 'Host', 'Create a room and get a code');
    const [joinCard, joinText] = roleCard('join', 'Join', 'Enter a room code');
    this.roles = { host: hostCard, join: joinCard };
    this.roleTexts = { host: hostText, join: joinText };
    this.nameInput.maxLength = 12;
    this.nameInput.autocomplete = 'off';
    this.nameInput.spellcheck = false;
    this.nameInput.placeholder = 'Name';
    this.nameRow.append(el('span', 'mp-name-label', 'Pilot name'), this.nameInput, el('span', 'mp-name-hint', 'up to 5 letters'));
    this.nameInput.addEventListener('input', () => handlers.onName?.(this.nameInput.value));
    this.error.setAttribute('role', 'alert');
    hj.box.append(roleRow, this.nameRow, this.error, this.privacy);

    // ROOM CODE.
    const rc = panel('Room code');
    const codeBox = el('div', 'mp-code');
    this.codeText.setAttribute('aria-live', 'polite');
    // Room for a pasted invite link: the code is read out of it.
    this.codeInput.maxLength = 200;
    this.codeInput.autocomplete = 'off';
    this.codeInput.spellcheck = false;
    this.codeInput.placeholder = 'K7QF3M';
    this.codeInput.setAttribute('aria-label', 'Room code');
    this.codeInput.addEventListener('input', () => handlers.onCode?.(this.codeInput.value));
    this.codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handlers.onAction();
      }
    });
    this.copy.type = 'button';
    this.copy.title = 'Copy the code';
    this.copy.setAttribute('aria-label', 'Copy the code');
    this.copy.appendChild(icon('copy', 'mp-copy-icon'));
    this.copy.addEventListener('click', () => this.copyText(this.view?.code ?? ''));
    this.copyLink.type = 'button';
    this.copyLink.addEventListener('click', () => this.copyText(this.view?.invite ?? ''));
    this.copied.setAttribute('aria-live', 'polite');
    codeBox.append(this.codeText, this.codeInput, this.copy);
    this.status.setAttribute('aria-live', 'polite');
    this.info.append(icon('info', 'mp-info-icon'), this.infoText);
    const linkRow = el('div', 'mp-link-row');
    linkRow.append(this.copyLink, this.copied);
    rc.box.append(codeBox, this.status, this.info, linkRow);

    // GAME SETTINGS.
    const gs = panel('Game settings');
    const change = (patch: Partial<MpSettings>) => this.view && handlers.onSettings({ ...this.view.settings, ...patch });
    this.players = stepper<number>('players', 'Players', (n) => `${n}v${n}`, (teamSize) => change({ teamSize }));
    this.mode = stepper<OnlineModeId>('crosshair', 'Play mode', (m) => MODE_CARDS[m].name, (mode) => change({ mode }));
    this.time = stepper<TimeOfDayId>('clock', 'Time of day', (t) => TIME_OF_DAY_LABELS[t], (time) => change({ time }));
    this.skill = stepper<DifficultyId>('rank', 'AI pilots', (d) => DIFFICULTIES[d].label, (skill) => change({ skill }));
    this.map = stepper<MapId>('map', 'Map', (m) => MAP_NAMES[m], (map) => change({ map }));
    this.start = stepper<SpawnStart>('runway', 'Your start', (s) => START_LABELS[s], (s) => handlers.onStart?.(s));
    gs.box.append(this.players.row, this.mode.row, this.time.row, this.skill.row, this.map.row, this.start.row, this.settingsNote);

    // GAME MODES.
    const gm = panel('Game modes');
    this.modesPanel = gm.box;
    const cards = el('div', 'mp-modes');
    for (const m of PLAY_MISSIONS) {
      const c = MODE_CARDS[m];
      const b = el('button', 'mp-mode');
      b.type = 'button';
      b.title = missionLine(m);
      const img = el('img', 'mp-mode-img');
      img.src = c.image;
      img.alt = '';
      img.decoding = 'async';
      const body = el('span', 'mp-mode-body');
      body.append(icon(c.icon, 'mp-mode-icon'), el('span', 'mp-mode-name', c.name), el('span', 'mp-mode-text', c.text));
      b.append(img, body);
      b.addEventListener('click', () => change({ mode: m }));
      cards.appendChild(b);
      this.modeCards.set(m, b);
    }
    gm.box.append(cards, this.modeNote);

    // AIRCRAFT.
    const ac = panel('Aircraft');
    this.seatsTitle = ac.title;
    ac.box.append(this.sides);

    this.action.type = 'button';
    this.action.addEventListener('click', () => handlers.onAction());
    const actionRow = el('div', 'mp-action-row');
    actionRow.appendChild(this.action);

    const left = el('div', 'mp-col');
    left.append(hj.box, rc.box, gs.box);
    const right = el('div', 'mp-col');
    right.append(gm.box, ac.box, actionRow);
    const grid = el('div', 'mp-grid');
    grid.append(left, right);

    const foot = el('footer', 'mp-foot');
    this.back.type = 'button';
    this.back.append(icon('back', 'mp-back-icon'), this.backText);
    this.back.addEventListener('click', () => handlers.onBack());
    for (const b of [this.fly, this.gameSettings]) b.type = 'button';
    this.fly.addEventListener('click', () => handlers.onFly?.());
    this.gameSettings.addEventListener('click', () => handlers.onGameSettings?.());
    const footLeft = el('div', 'mp-foot-left');
    footLeft.append(this.back, this.fly, this.gameSettings);
    foot.append(footLeft, el('p', 'mp-foot-note', 'USA vs Russia  |  Multiplayer lobby'));

    root.append(head, grid, foot);
  }

  /** Draws the view. */
  update(view: MpView): void {
    this.view = view;
    const setup = view.stage === 'setup';
    const host = view.role === 'host';
    const s = view.settings;
    const flies = s.mode !== 'free-flight';

    for (const role of ['host', 'join'] as const) {
      const b = this.roles[role];
      b.classList.toggle('is-active', view.role === role);
      b.disabled = !setup && view.role !== role;
      b.setAttribute('aria-pressed', String(view.role === role));
    }
    if (setup) {
      this.roleTexts.host.textContent = 'Create a room and get a code';
      this.roleTexts.join.textContent = 'Enter a room code';
    } else {
      this.roleTexts.host.textContent = host ? 'Your room: you start the match' : 'Create a room and get a code';
      this.roleTexts.join.textContent = host ? 'Enter a room code' : 'You are in the room';
    }
    this.nameRow.hidden = !setup;
    this.privacy.hidden = !setup;
    if (document.activeElement !== this.nameInput) this.nameInput.value = view.name;
    this.error.textContent = view.error;
    this.error.hidden = view.error === '';

    // The code: shown in a room, typed to join, to come when hosting.
    const typing = setup && !host;
    this.codeInput.hidden = !typing;
    this.codeText.hidden = typing;
    if (typing && document.activeElement !== this.codeInput) this.codeInput.value = view.code;
    this.codeText.textContent = !setup ? view.code : '– – – – – –';
    this.codeText.classList.toggle('is-empty', setup);
    this.copy.hidden = typing;
    this.copy.disabled = setup;
    this.copyLink.hidden = setup;
    this.status.textContent = view.status;
    this.infoText.textContent = setup ? (host ? 'The code is generated when you host a room.' : 'Or open the invite link your friend sent.') : 'Your friends join from Multiplayer → Join, or with the invite link.';

    // Settings: the host sets the room; a pilot joining sets only their start.
    const edit = view.edit;
    const showMatch = !(setup && !host);
    for (const st of [this.players, this.mode, this.time, this.skill, this.map]) st.row.hidden = !showMatch;
    const sizes = Array.from({ length: MAX_TEAM_SIZE - view.minSeats + 1 }, (_, i) => view.minSeats + i);
    this.players.set(sizes, Math.max(view.minSeats, s.teamSize), edit && flies);
    this.players.row.classList.toggle('is-off', !flies);
    this.mode.set(view.modes, s.mode, edit);
    this.time.set(TIME_OF_DAY_IDS, s.time, edit);
    this.skill.set(Object.keys(DIFFICULTIES) as DifficultyId[], s.skill, edit && flies);
    this.skill.row.classList.toggle('is-off', !flies);
    this.map.set(view.maps, s.map, edit && view.maps.length > 1);
    this.start.row.hidden = !setup;
    this.start.set(view.runway ? (['air', 'runway'] as const) : (['air'] as const), view.start, view.runway);
    this.settingsNote.textContent = !showMatch
      ? 'The host sets the match: you choose your jet and side under Aircraft, and your start.'
      : !setup && !edit
        ? 'The host sets the match.'
        : !setup && view.maps.length === 1
          ? `The room flies on ${MAP_NAMES[s.map]}${view.modes.includes('strike') ? '' : '; Strike needs a room on the Test Range'}.`
          : '';
    this.settingsNote.hidden = this.settingsNote.textContent === '';

    // Game modes.
    this.modesPanel.hidden = !showMatch;
    for (const [m, b] of this.modeCards) {
      b.classList.toggle('is-active', m === s.mode);
      b.setAttribute('aria-pressed', String(m === s.mode));
      b.disabled = !edit || !view.modes.includes(m);
      b.classList.toggle('is-unavailable', !view.modes.includes(m));
    }
    this.modeNote.textContent = missionLine(s.mode);

    // Aircraft, seat by seat.
    const ai = view.seats.filter((r) => r.who === 'ai').length;
    this.seatsTitle.textContent = '';
    this.seatsTitle.append('Aircraft ', el('span', 'mp-count', !showMatch ? '(your jet)' : flies ? `(${view.seats.length} slots)` : `(${view.seats.length} pilots)`));
    this.seatsTitle.title = ai ? `${ai} of the seats flown by AI pilots` : '';
    const key = JSON.stringify([view.seats, view.jets.map((j) => j.id), view.edit, view.stage]);
    if (key !== this.seatsKey && !this.sides.contains(document.activeElement)) {
      this.seatsKey = key;
      this.drawSeats(view);
    }

    this.action.textContent = view.action.label;
    this.action.disabled = !view.action.enabled;
    this.backText.textContent = view.back;
    this.fly.hidden = setup;
    this.gameSettings.hidden = setup;
  }

  // The screen opens at its top: focusing the button at the foot must not scroll it there.
  focusAction(): void {
    this.action.focus({ preventScroll: true });
  }

  focusCode(): void {
    this.codeInput.focus({ preventScroll: true });
  }

  focusName(): void {
    this.nameInput.focus({ preventScroll: true });
  }

  private drawSeats(view: MpView): void {
    const columns: HTMLElement[] = [];
    for (const team of TEAMS) {
      const rows = view.seats.filter((r) => r.team === team);
      if (rows.length === 0 && view.stage === 'setup' && view.role === 'join') continue;
      const col = el('div', `mp-side team-${team}`);
      const head = el('div', 'mp-side-head');
      head.append(flag(team, 'mp-side-flag'), el('span', 'mp-side-name', TEAM_NAMES[team]));
      col.appendChild(head);
      for (const r of rows) col.appendChild(this.seat(view, r));
      if (rows.length === 0) col.appendChild(el('p', 'mp-side-empty', 'No pilots on this side.'));
      columns.push(col);
    }
    this.sides.replaceChildren(...columns);
  }

  private seat(view: MpView, r: SeatRow): HTMLElement {
    const row = el('div', `mp-slot is-${r.who}`);
    const who = r.who === 'ai' ? 'AI pilot' : r.who === 'you' ? (r.host ? 'You · Host' : 'You') : r.host ? `${r.name} · Host` : r.name;
    const body = el('div', 'mp-slot-body');
    body.appendChild(el('span', 'mp-slot-who', who));
    const nameOf = (id: string | null) => (id === null ? 'Random jet' : (view.allJets.find((j) => j.id === id)?.name ?? id));
    if (r.who === 'you' && view.jets.length > 0) {
      // Your own jet, either side: in the lobby a jet of the other side takes you there.
      const sel = el('select', 'mp-slot-select');
      sel.setAttribute('aria-label', 'Your jet');
      for (const team of TEAMS) {
        const group = el('optgroup');
        group.label = TEAM_NAMES[team];
        for (const j of view.jets.filter((x) => x.team === team)) {
          const o = el('option', undefined, j.name);
          o.value = j.id;
          group.appendChild(o);
        }
        if (group.children.length) sel.appendChild(group);
      }
      sel.value = r.jet ?? '';
      sel.addEventListener('change', () => this.handlers.onJet(sel.value));
      body.appendChild(sel);
    } else if (r.who === 'ai' && view.edit) {
      const sel = el('select', 'mp-slot-select');
      sel.setAttribute('aria-label', `AI pilot ${r.ai + 1} of ${TEAM_NAMES[r.team]}: jet`);
      const random = el('option', undefined, 'Random jet');
      random.value = '';
      sel.appendChild(random);
      for (const j of view.allJets.filter((x) => x.team === r.team)) {
        const o = el('option', undefined, j.name);
        o.value = j.id;
        sel.appendChild(o);
      }
      sel.value = r.jet ?? '';
      sel.addEventListener('change', () => this.handlers.onAiJet(r.team, r.ai, sel.value || null));
      body.appendChild(sel);
    } else {
      body.appendChild(el('span', 'mp-slot-jet', nameOf(r.jet)));
    }
    row.append(el('span', 'mp-slot-n', String(r.n)), icon('jet', 'mp-slot-icon'), body);
    return row;
  }

  private copyText(text: string): void {
    const shown = () => {
      this.copied.textContent = 'Copied';
      setTimeout(() => (this.copied.textContent = ''), 2000);
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(shown, () => (this.copied.textContent = text));
    else this.copied.textContent = text;
  }
}
