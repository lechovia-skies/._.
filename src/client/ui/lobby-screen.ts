import { DIFFICULTIES } from '../../shared/ai/difficulty.ts';
import { TEAM_NAMES } from '../../shared/data/aircraft/registry.ts';
import type { TeamId } from '../../shared/data/aircraft/types.ts';
import { MAP_NAMES } from '../../shared/data/maps/registry.ts';
import { roomCapacity, type RoomSettings } from '../../shared/net/protocol.ts';
import { WEATHER } from '../../shared/world/weather.ts';
import { formatTimeOfDay } from '../hud/format.ts';
import { el } from './choice-group.ts';
import { MISSION_LABELS } from './records-format.ts';

export interface LobbyPilot {
  id: number;
  callsign: string;
  team: TeamId;
  /** the jet's name */
  jet: string;
  host: boolean;
  you: boolean;
}

/** What the lobby shows; built afresh by the game every half second. */
export interface LobbyState {
  code: string;
  invite: string;
  isHost: boolean;
  hostName: string;
  settings: RoomSettings;
  pilots: readonly LobbyPilot[];
  /** the jets this pilot may fly, and the one flown */
  jets: readonly { id: string; name: string }[];
  jet: string;
}

export interface LobbyHandlers {
  /** the host starts the match */
  onStart(): void;
  /** fly round the map until the match starts */
  onFly(): void;
  onJet(id: string): void;
  /** the same settings as the title screen's */
  onSettings(): void;
  onLeave(): void;
}

/** The room's settings in a few lines. */
export function roomSummary(s: RoomSettings): string[] {
  const lines = [MISSION_LABELS[s.mode] ?? s.mode];
  if (s.mode !== 'free-flight') lines.push(`${2 * s.teamSize} pilots, ${s.teamSize} v ${s.teamSize} · empty seats flown by ${DIFFICULTIES[s.botSkill].label} AI pilots`);
  lines.push(`${MAP_NAMES[s.map]} · ${formatTimeOfDay(s.environment.startHour)} · ${WEATHER[s.environment.weather].label}`);
  return lines;
}

/** The pilots in the lobby: the host first, then by side and name. */
export function sortPilots(pilots: readonly LobbyPilot[]): LobbyPilot[] {
  return [...pilots].sort((a, b) => Number(b.host) - Number(a.host) || a.team.localeCompare(b.team) || a.callsign.localeCompare(b.callsign) || a.id - b.id);
}

/** The line under the code: what to do with it, or who is awaited. */
export function lobbyLine(s: Pick<LobbyState, 'isHost' | 'hostName' | 'pilots'>): string {
  if (!s.isHost) return `Waiting for ${s.hostName} to start the match.`;
  return s.pilots.length <= 1
    ? 'Give this code to your friends: they join it from Online on the title screen. Start whenever you like.'
    : `${s.pilots.length} pilots in the room. Start the match when everyone is in.`;
}

/**
 * An online room's lobby (revision 33, at the owner's request): the host creates the room and its code appears here,
 * big, to pass on; the others join with it and wait here until the host starts the match, and everyone comes back
 * here after each match. Who is in, what the room flies and the jet to fly; meanwhile anyone may fly round the map.
 */
export class LobbyScreen {
  private readonly overlay = el('div', 'overlay translucent');
  private readonly code = el('p', 'lobby-code');
  private readonly done = el('span', 'lobby-done');
  private readonly line = el('p', 'lobby-line');
  private readonly summary = el('ul', 'lobby-summary');
  private readonly count = el('h3', 'eyebrow lobby-count');
  private readonly pilots = el('ul', 'lobby-pilots');
  private readonly jet = el('select', 'world-select');
  private readonly start = el('button', 'button lobby-start', 'Start the match');
  private readonly fly = el('button', 'button secondary', 'Fly while you wait');
  private readonly settings = el('button', 'button secondary', 'Settings');
  private readonly leave = el('button', 'button secondary');
  private state: LobbyState | null = null;
  private shownKey = '';
  private jetsKey = '';

  constructor(root: HTMLElement, handlers: LobbyHandlers) {
    this.overlay.hidden = true;
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-labelledby', 'lobby-title');
    const panel = el('div', 'panel lobby-panel');
    const head = el('div', 'lobby-head');
    const title = el('h2', 'lobby-title', 'Lobby');
    title.id = 'lobby-title';
    head.append(el('p', 'eyebrow', 'Room code'), this.code);
    const copyCode = el('button', 'button secondary lobby-copy', 'Copy code');
    const copyLink = el('button', 'button secondary lobby-copy', 'Copy invite link');
    for (const b of [copyCode, copyLink, this.start, this.fly, this.settings, this.leave]) b.type = 'button';
    this.done.setAttribute('aria-live', 'polite');
    const copyRow = el('div', 'lobby-copy-row');
    copyRow.append(copyCode, copyLink, this.done);
    this.line.setAttribute('aria-live', 'polite');
    const jetLabel = el('label', 'online-select lobby-jet');
    jetLabel.append(el('span', 'eyebrow', 'Your jet'), this.jet);
    const actions = el('div', 'lobby-actions');
    actions.append(this.start, this.fly, this.settings, this.leave);
    panel.append(title, head, copyRow, this.line, this.summary, this.count, this.pilots, jetLabel, actions);
    this.overlay.appendChild(panel);
    root.appendChild(this.overlay);

    copyCode.addEventListener('click', () => this.copy(this.state?.code ?? ''));
    copyLink.addEventListener('click', () => this.copy(this.state?.invite ?? ''));
    this.start.addEventListener('click', () => handlers.onStart());
    this.fly.addEventListener('click', () => handlers.onFly());
    this.settings.addEventListener('click', () => handlers.onSettings());
    this.leave.addEventListener('click', () => handlers.onLeave());
    this.jet.addEventListener('change', () => handlers.onJet(this.jet.value));
  }

  get visible(): boolean {
    return !this.overlay.hidden;
  }

  show(state: LobbyState): void {
    this.done.textContent = '';
    this.update(state);
    this.overlay.hidden = false;
  }

  hide(): void {
    this.overlay.hidden = true;
  }

  /** Draws what changed. */
  update(state: LobbyState): void {
    this.state = state;
    const key = JSON.stringify([state.code, state.isHost, state.hostName, state.settings, state.pilots]);
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.code.textContent = state.code;
      this.line.textContent = lobbyLine(state);
      this.summary.replaceChildren(...roomSummary(state.settings).map((t) => el('li', undefined, t)));
      this.count.textContent = `Pilots · ${state.pilots.length} / ${roomCapacity(state.settings)}`;
      this.pilots.replaceChildren(
        ...sortPilots(state.pilots).map((p) => {
          const li = el('li', `lobby-pilot team-${p.team}${p.you ? ' is-you' : ''}`);
          li.append(el('span', 'lobby-team', TEAM_NAMES[p.team]), el('span', 'lobby-name', p.callsign), el('span', 'lobby-jet-name', p.jet));
          if (p.host) li.appendChild(el('span', 'lobby-tag', 'Host'));
          if (p.you) li.appendChild(el('span', 'lobby-tag', 'You'));
          return li;
        }),
      );
      this.start.hidden = !state.isHost;
      this.leave.textContent = state.isHost ? 'Close the room' : 'Leave the room';
    }
    const jetsKey = state.jets.map((j) => j.id).join();
    if (jetsKey !== this.jetsKey) {
      this.jetsKey = jetsKey;
      this.jet.replaceChildren(
        ...state.jets.map((j) => {
          const o = el('option', undefined, j.name);
          o.value = j.id;
          return o;
        }),
      );
    }
    if (document.activeElement !== this.jet) this.jet.value = state.jet;
  }

  dispose(): void {
    this.overlay.remove();
  }

  private copy(text: string): void {
    const shown = () => {
      this.done.textContent = 'Copied';
      setTimeout(() => (this.done.textContent = ''), 2000);
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(shown, () => (this.done.textContent = text));
    else this.done.textContent = text;
  }
}
