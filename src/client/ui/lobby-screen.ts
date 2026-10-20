import { listAircraft } from '../../shared/data/aircraft/registry.ts';
import type { TeamId } from '../../shared/data/aircraft/types.ts';
import type { RoomSettings } from '../../shared/net/protocol.ts';
import { START_HOURS } from '../../shared/world/time-of-day.ts';
import { el } from './choice-group.ts';
import { PLAY_MISSIONS } from './match-setup.ts';
import { type MpSettings, type MpView, MultiplayerLayout, seatRows, timeOfDayAt, withAiJet } from './multiplayer.ts';

export interface LobbyPilot {
  id: number;
  callsign: string;
  team: TeamId;
  /** the jet's id */
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
  /** the jets this pilot may fly, both sides (a jet of the other side takes them there), and the one flown */
  jets: readonly { id: string; name: string; team: TeamId }[];
  jet: string;
}

export interface LobbyHandlers {
  /** the host starts the match */
  onStart(): void;
  /** fly round the map until the match starts */
  onFly(): void;
  onJet(id: string): void;
  /** the host changes the room (revision 37) */
  onRoom(next: RoomSettings): void;
  /** the same settings as the title screen's */
  onSettings(): void;
  onLeave(): void;
}

/** The line under the code: what to do with it, or who is awaited. */
export function lobbyLine(s: Pick<LobbyState, 'isHost' | 'hostName' | 'pilots'>): string {
  if (!s.isHost) return `Waiting for ${s.hostName} to start the game.`;
  return s.pilots.length <= 1
    ? 'Share this code with your friends to join. Start the game whenever you like.'
    : `${s.pilots.length} pilots in the room. Start the game when everyone is in.`;
}

const ALL_JETS = listAircraft().map((a) => ({ id: a.id, name: a.name, team: a.team }));

/** The Multiplayer screen's view of an open room (revision 37). */
export function roomView(state: LobbyState): MpView {
  const s = state.settings;
  return {
    stage: 'room',
    role: state.isHost ? 'host' : 'join',
    name: '',
    code: state.code,
    invite: state.invite,
    status: lobbyLine(state),
    error: '',
    settings: { mode: s.mode, teamSize: s.teamSize, time: timeOfDayAt(s.environment.startHour), skill: s.botSkill, map: s.map, aiJets: s.aiJets },
    start: 'air',
    runway: false,
    edit: state.isHost,
    minSeats: Math.max(1, Math.ceil(state.pilots.length / 2)),
    // The map is the room's: Strike only in a room on the Test Range.
    modes: s.map === 'test-range' ? PLAY_MISSIONS : PLAY_MISSIONS.filter((m) => m !== 'strike'),
    maps: [s.map],
    seats: seatRows(s.teamSize, state.pilots, s.aiJets, s.mode !== 'free-flight'),
    jets: state.jets,
    allJets: ALL_JETS,
    action: state.isHost ? { label: 'Start game', enabled: true } : { label: `Waiting for ${state.hostName}`, enabled: false },
    back: state.isHost ? 'Close the room' : 'Leave the room',
  };
}

/** The room's settings with the screen's changes: a new time of day sets the starting hour, else it stays. */
export function changedRoom(s: RoomSettings, next: MpSettings): RoomSettings {
  const environment = next.time === timeOfDayAt(s.environment.startHour) ? s.environment : { ...s.environment, startHour: START_HOURS[next.time] };
  return { ...s, mode: next.mode, teamSize: next.teamSize, botSkill: next.skill, environment, aiJets: next.aiJets ?? s.aiJets };
}

/**
 * An online room's lobby (revision 33, at the owner's request; laid out after the owner's picture since revision 37):
 * the code to pass on, the room's settings (the host changes them here), the modes, every seat with its jet (your own
 * to choose, the AI seats' for the host), and START GAME for the host. Everyone comes back here after each match;
 * meanwhile anyone may fly round the map.
 */
export class LobbyScreen {
  private readonly overlay = el('div', 'mp-overlay');
  private readonly layout: MultiplayerLayout;
  private state: LobbyState | null = null;

  constructor(root: HTMLElement, handlers: LobbyHandlers) {
    this.overlay.hidden = true;
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-labelledby', 'mp-title');
    this.layout = new MultiplayerLayout({
      onSettings: (next) => this.state && handlers.onRoom(changedRoom(this.state.settings, next)),
      onJet: (id) => handlers.onJet(id),
      onAiJet: (team, index, jet) => this.state && handlers.onRoom({ ...this.state.settings, aiJets: withAiJet(this.state.settings.aiJets, team, index, jet) }),
      onAction: () => this.state?.isHost && handlers.onStart(),
      onBack: () => handlers.onLeave(),
      onFly: () => handlers.onFly(),
      onGameSettings: () => handlers.onSettings(),
    });
    this.overlay.appendChild(this.layout.element);
    root.appendChild(this.overlay);
  }

  get visible(): boolean {
    return !this.overlay.hidden;
  }

  show(state: LobbyState): void {
    this.update(state);
    this.overlay.hidden = false;
    this.layout.focusAction();
  }

  hide(): void {
    this.overlay.hidden = true;
  }

  /** Draws what changed. */
  update(state: LobbyState): void {
    this.state = state;
    this.layout.update(roomView(state));
  }

  dispose(): void {
    this.overlay.remove();
  }
}
