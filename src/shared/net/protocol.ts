import type { TeamId } from '../data/aircraft/types.ts';
import { DIFFICULTIES, type DifficultyId } from '../ai/difficulty.ts';
import { listAircraft } from '../data/aircraft/registry.ts';
import { MAP_IDS, type MapId } from '../data/maps/registry.ts';
import type { ModeStatus } from '../modes/mode.ts';
import type { GameEvent } from '../world/events.ts';
import { SPAWN_STARTS, type SpawnStart } from '../world/spawns.ts';
import { CALM_NOON, type EnvironmentSettings } from '../world/time-of-day.ts';
import { WEATHER_IDS, type WeatherId } from '../world/weather.ts';

/*
 * Online play between browsers (revision 28). One player hosts: their browser runs the match (the World) and the
 * others' browsers connect straight to it over WebRTC. A joining pilot sends `hello`; the host answers `welcome`. From
 * then on the pilot sends one input per tick and the host 30 snapshots a second, with events, the roster and the mode's
 * status as JSON. The layout follows the dedicated server of milestone M2 (protocols 1 to 4), which this replaces.
 */

/**
 * Bumped whenever a message layout changes; host and pilot must agree (7: the lobby of revision 33; 8: a pilot who
 * joins a match takes over an AI pilot's jet, revision 36; 9: the host changes the room in its lobby, the AI pilots'
 * jets and a pilot changing sides there, revision 37).
 */
export const PROTOCOL_VERSION = 9;

/** The host sends a snapshot every this many ticks (30 Hz at 60 Hz ticks). */
export const SNAPSHOT_EVERY_TICKS = 2;

/** Pilots in one room, the host included: each is a WebRTC link from the host's browser (10 since revision 35). */
export const MAX_PILOTS = 10;
/** Pilots a side: a match has 2 to 10 pilots, half on each side (revision 35, at the owner's request). */
export const MAX_TEAM_SIZE = MAX_PILOTS / 2;

/** Limits on what a pilot may send. */
export const MAX_CLIENT_BINARY_BYTES = 64;
export const MAX_CLIENT_JSON_BYTES = 2048;

/** Modes a room can be hosted with: all but Training. */
export type OnlineModeId = 'team-deathmatch' | 'air-superiority' | 'team-objective' | 'free-flight' | 'strike';
export const ONLINE_MODES: readonly OnlineModeId[] = ['team-deathmatch', 'air-superiority', 'team-objective', 'free-flight', 'strike'];

/**
 * A room waits in its lobby until the host starts a match, and goes back to it after each one (revision 33). In the
 * lobby the pilots' jets cruise in a Free Flight world with no AI pilots and nothing scored.
 */
export type RoomPhase = 'lobby' | 'match';

/** Pilot names online: up to five letters (revision 33). */
export const ONLINE_NAME_MAX = 5;

/** Preset quick-chat lines (no free text). */
export const QUICK_CHAT: readonly string[] = ['Nice shot!', 'Help me!', 'On my way', 'Good game'];

/** What the host chose for the room. */
export interface RoomSettings {
  mode: OnlineModeId;
  /** Strike flies on the Test Range; every other mode on the host's choice */
  map: MapId;
  environment: EnvironmentSettings;
  /** pilots per team: the seats no one flies are AI pilots (none in Free Flight) */
  teamSize: number;
  botSkill: DifficultyId;
  /** the AI pilots' jets, by side in seat order; null or missing for a random one (revision 37) */
  aiJets?: AiJets;
}

/** The jet of each AI pilot of a side, first AI pilot first; null for a random one. */
export type AiJets = Record<TeamId, (string | null)[]>;

/** A typed error for anything a peer sends that breaks the protocol. */
export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}

export interface HelloMessage {
  type: 'hello';
  version: number;
  callsign: string;
  aircraftId: string;
  /** where this pilot starts: in the air or on the runway */
  start: SpawnStart;
}

export interface PingMessage {
  type: 'ping';
  t: number;
}

export interface ChatMessage {
  type: 'chat';
  index: number;
}

/** The jet this pilot flies from the next respawn on. */
export interface JetMessage {
  type: 'jet';
  aircraftId: string;
}

/** Free Flight rooms: new weather and the hour it is now, for everyone in the room. */
export interface WorldMessage {
  type: 'world';
  weather: WeatherId;
  hour: number;
  clockRunning: boolean;
}

/** Free Flight rooms: fly from a point of the map (a runway when the point is on an airfield). */
export interface FlyFromMessage {
  type: 'flyFrom';
  x: number;
  z: number;
}

export type ClientJsonMessage = HelloMessage | PingMessage | ChatMessage | JetMessage | WorldMessage | FlyFromMessage;

export interface RosterEntry {
  id: number;
  callsign: string;
  team: TeamId;
  aircraftId: string;
  isBot: boolean;
  kills: number;
  deaths: number;
}

export interface WelcomeMessage {
  type: 'welcome';
  version: number;
  /** the pilot's aircraft id in the current match */
  you: number;
  settings: RoomSettings;
  /** the match's seed: the wind's direction and gusts come from it */
  seed: number;
  tick: number;
  tickRate: number;
  snapshotEvery: number;
  /** the host's callsign, for "hosted by" */
  host: string;
  /** waiting in the lobby or flying a match */
  phase: RoomPhase;
  /** the host's own aircraft, marked in the lobby's list */
  hostId: number;
}

export type HostJsonMessage =
  | WelcomeMessage
  | { type: 'reject'; reason: string }
  | { type: 'pong'; t: number; tick: number }
  | { type: 'roster'; players: RosterEntry[] }
  | { type: 'events'; tick: number; events: GameEvent[] }
  | { type: 'status'; tick: number; status: ModeStatus }
  | { type: 'chat'; from: number; index: number }
  | { type: 'matchEnd'; status: ModeStatus; restartInS: number }
  /** a new World: the next match, or the lobby again */
  | { type: 'matchStart'; you: number; tick: number; seed: number; phase: RoomPhase; hostId: number }
  /** a Free Flight room's weather or clock changed */
  | { type: 'environment'; environment: EnvironmentSettings }
  /** the host changed the room in its lobby (revision 37): the next match flies these */
  | { type: 'settings'; settings: RoomSettings }
  /** the host is leaving: the room closes */
  | { type: 'shutdown'; reason: string };

/**
 * A pilot name for online play (revision 33): at most five letters or digits of any script (so ヒロト is a name),
 * spaces and . _ -; empty when nothing is left.
 */
export function onlineName(raw: string): string {
  const kept = raw.normalize('NFC').replace(/[^\p{L}\p{N} _.-]/gu, '').trim();
  return Array.from(kept).slice(0, ONLINE_NAME_MAX).join('').trim();
}

/** A callsign as it arrives in a hello: an online name, or "Pilot". */
export function sanitizeCallsign(raw: unknown): string {
  return (typeof raw === 'string' ? onlineName(raw) : '') || 'Pilot';
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isWeather = (v: unknown): v is WeatherId => WEATHER_IDS.includes(v as WeatherId);

/** Weather and clock: known weather, an hour in 0 … 24, a boolean clock; defaults otherwise. */
export function sanitizeEnvironment(raw: unknown): EnvironmentSettings {
  const r = isRecord(raw) ? raw : {};
  const hour = typeof r.startHour === 'number' && Number.isFinite(r.startHour) ? ((r.startHour % 24) + 24) % 24 : CALM_NOON.startHour;
  return { weather: isWeather(r.weather) ? r.weather : 'clear', startHour: hour, clockRunning: r.clockRunning === true };
}

/** Room settings from the title screen or a host: known values only, the team size within 1 … MAX_TEAM_SIZE. */
export function sanitizeRoomSettings(raw: unknown): RoomSettings {
  const r = isRecord(raw) ? raw : {};
  const mode = ONLINE_MODES.find((m) => m === r.mode) ?? 'team-deathmatch';
  const map = mode === 'strike' ? 'test-range' : (MAP_IDS.find((m) => m === r.map) ?? 'lechovia');
  const size = typeof r.teamSize === 'number' && Number.isFinite(r.teamSize) ? Math.round(r.teamSize) : 4;
  const botSkill = (Object.keys(DIFFICULTIES) as DifficultyId[]).find((d) => d === r.botSkill) ?? 'veteran';
  return { mode, map, environment: sanitizeEnvironment(r.environment), teamSize: Math.min(MAX_TEAM_SIZE, Math.max(1, size)), botSkill, aiJets: sanitizeAiJets(r.aiJets) };
}

/** Each side's AI jets: fighters of that side or null, five at most. */
export function sanitizeAiJets(raw: unknown): AiJets {
  const r = isRecord(raw) ? raw : {};
  const side = (team: TeamId) => {
    const list = Array.isArray(r[team]) ? (r[team] as unknown[]).slice(0, MAX_TEAM_SIZE) : [];
    const ids = new Set(listAircraft().filter((a) => a.team === team && !a.support).map((a) => a.id));
    return list.map((v) => (typeof v === 'string' && ids.has(v) ? v : null));
  };
  return { usa: side('usa'), russia: side('russia') };
}

/** The pilots a room holds, the host included: its seats, two to ten (any number up to ten in Free Flight). */
export function roomCapacity(s: Pick<RoomSettings, 'mode' | 'teamSize'>): number {
  return s.mode === 'free-flight' ? MAX_PILOTS : Math.min(MAX_PILOTS, 2 * Math.max(1, s.teamSize));
}

/** Parses and checks a JSON text message from a pilot. Throws ProtocolError on anything malformed. */
export function parseClientJson(text: string): ClientJsonMessage {
  if (text.length > MAX_CLIENT_JSON_BYTES) throw new ProtocolError('message too large');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProtocolError('not JSON');
  }
  if (!isRecord(raw)) throw new ProtocolError('not an object');
  switch (raw.type) {
    case 'hello': {
      if (typeof raw.version !== 'number' || typeof raw.aircraftId !== 'string') throw new ProtocolError('bad hello');
      const start = SPAWN_STARTS.find((s) => s === raw.start) ?? 'air';
      return { type: 'hello', version: raw.version, callsign: sanitizeCallsign(raw.callsign), aircraftId: raw.aircraftId.slice(0, 32), start };
    }
    case 'ping':
      if (typeof raw.t !== 'number' || !Number.isFinite(raw.t)) throw new ProtocolError('bad ping');
      return { type: 'ping', t: raw.t };
    case 'chat':
      if (!Number.isInteger(raw.index) || (raw.index as number) < 0 || (raw.index as number) >= QUICK_CHAT.length) throw new ProtocolError('bad chat');
      return { type: 'chat', index: raw.index as number };
    case 'jet':
      if (typeof raw.aircraftId !== 'string') throw new ProtocolError('bad jet');
      return { type: 'jet', aircraftId: raw.aircraftId.slice(0, 32) };
    case 'world': {
      if (!isWeather(raw.weather) || typeof raw.hour !== 'number' || !Number.isFinite(raw.hour)) throw new ProtocolError('bad world');
      return { type: 'world', weather: raw.weather, hour: ((raw.hour % 24) + 24) % 24, clockRunning: raw.clockRunning === true };
    }
    case 'flyFrom':
      if (typeof raw.x !== 'number' || typeof raw.z !== 'number' || !Number.isFinite(raw.x) || !Number.isFinite(raw.z)) throw new ProtocolError('bad flyFrom');
      return { type: 'flyFrom', x: raw.x, z: raw.z };
    default:
      throw new ProtocolError('unknown message type');
  }
}

/** Room codes: six letters and digits that read the same aloud and on paper (no 0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

/** A new random room code. */
export function newRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  return code;
}

/** A typed or pasted code (or invite link) as a room code, or null when it cannot be one. */
export function parseRoomCode(raw: string): string | null {
  const fromLink = /[?&]join=([^&#]+)/.exec(raw);
  const text = (fromLink ? decodeURIComponent(fromLink[1]) : raw).toUpperCase().replace(/[\s-]/g, '');
  if (text.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of text) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return text;
}
