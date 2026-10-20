import { fullName, getAircraft, listAircraft } from '../../shared/data/aircraft/registry.ts';
import type { TeamId } from '../../shared/data/aircraft/types.ts';
import { MAP_IDS, type MapId } from '../../shared/data/maps/registry.ts';
import { ONLINE_NAME_MAX, type OnlineModeId, onlineName, parseRoomCode, ROOM_CODE_LENGTH, type RoomSettings, sanitizeAiJets, sanitizeRoomSettings } from '../../shared/net/protocol.ts';
import type { SpawnStart } from '../../shared/world/spawns.ts';
import type { EnvironmentSettings, TimeOfDayId } from '../../shared/world/time-of-day.ts';
import { el } from './choice-group.ts';
import { fixedWorld, flies, loadSetup, PLAY_MISSIONS, saveSetup, type Seats } from './match-setup.ts';
import { type MpView, MultiplayerLayout, seatRows, withAiJet } from './multiplayer.ts';
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

/** What the Multiplayer screen needs from the title screen. */
export interface OnlinePilot {
  /** why the chosen jet cannot fly (not developed, grounded), or null */
  jetProblem(): string | null;
  /** the jets this pilot may fly, both sides, and the one chosen; choosing one there chooses it on the title screen */
  jets(): { id: string; name: string; team: TeamId }[];
  jet(): string;
  setJet(id: string): void;
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
/** The AI seats' jets for a room set up here (revision 37). */
const AI_JETS_KEY = 'onlineAiJets';

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
 * The Multiplayer screen (revision 37, laid out after the owner's picture; revision 28's Online sheet, in the Play
 * sheet since revision 34): HOST sets the room up (players, mode, time of day, AI pilots, map, your start; the mode
 * cards; your jet and the AI seats' jets) and creates it; JOIN takes a code. Online the pilot needs a name, up to five
 * letters (revision 33), typed at the top. `?join=CODE` opens it on JOIN with the code filled in.
 */
export function multiplayerScreen(
  pilot: OnlinePilot,
  onGo: (start: OnlineStart) => void,
  onBack: () => void,
): { dialog: HTMLDialogElement; open(code?: string, error?: string): void } {
  const dialog = el('dialog', 'mp-dialog');
  dialog.setAttribute('aria-labelledby', 'mp-title');
  let role: 'host' | 'join' = 'host';
  let name = '';
  let code = '';
  let error = '';
  let setup = loadSetup('online');
  let aiJets = sanitizeAiJets(loadSetting<unknown>(AI_JETS_KEY, null));
  const allJets = listAircraft().map((a) => ({ id: a.id, name: fullName(a), team: a.team }));

  const view = (): MpView => {
    const w = fixedWorld(setup);
    const jet = pilot.jet();
    const team = getAircraft(jet).team;
    const host = role === 'host';
    const you = { callsign: onlineName(name) || 'You', team, jet, host, you: true };
    return {
      stage: 'setup',
      role,
      name,
      code,
      invite: '',
      status: host ? 'Share this code with your friends to join.' : `Type the ${ROOM_CODE_LENGTH}-letter code your friend gave you.`,
      error,
      settings: { mode: setup.mission, teamSize: Number(setup.seats), time: setup.time, skill: setup.skill, map: w.map, aiJets },
      start: w.start,
      runway: w.map === 'lechovia',
      edit: host,
      minSeats: 1,
      modes: PLAY_MISSIONS,
      maps: setup.mission === 'strike' ? ['test-range'] : MAP_IDS,
      seats: host ? seatRows(Number(setup.seats), [you], aiJets, flies(setup.mission)) : seatRows(1, [you], undefined, false),
      jets: pilot.jets(),
      allJets,
      action: { label: host ? 'Create room' : 'Join room', enabled: true },
      back: 'Back',
    };
  };
  const render = () => layout.update(view());

  const ready = (): boolean => {
    if (!saveOnlineName(name)) {
      error = `Choose a pilot name first: ${NAME_RULE}, not "${DEFAULT_CALLSIGN}".`;
      render();
      layout.focusName();
      return false;
    }
    name = loadOnlineName();
    const problem = pilot.jetProblem();
    if (problem) {
      error = problem;
      render();
      return false;
    }
    return true;
  };
  const go = () => {
    if (role === 'join') {
      const parsed = parseRoomCode(code);
      if (!parsed) {
        error = `A room code is ${ROOM_CODE_LENGTH} letters and digits, like K7QF3M.`;
        render();
        layout.focusCode();
        return;
      }
      if (!ready()) return;
      dialog.close();
      onGo({ role: 'join', code: parsed, name });
      return;
    }
    if (!ready()) return;
    const w = fixedWorld(setup);
    dialog.close();
    onGo({
      role: 'host',
      start: w.start,
      name,
      settings: sanitizeRoomSettings({ mode: setup.mission, map: w.map, environment: pilot.environment(setup.time), teamSize: Number(setup.seats), botSkill: setup.skill, aiJets }),
    });
  };
  const back = () => {
    dialog.close();
    onBack();
  };

  const layout = new MultiplayerLayout({
    onRole: (r) => {
      role = r;
      error = '';
      render();
      if (r === 'join') layout.focusCode();
    },
    onName: (v) => {
      name = v;
      if (error) {
        error = '';
        render();
      }
    },
    onCode: (v) => {
      code = v;
      if (error) {
        error = '';
        render();
      }
    },
    onSettings: (next) => {
      setup = { ...setup, mission: next.mode, seats: String(next.teamSize) as Seats, time: next.time, skill: next.skill, map: next.mode === 'strike' ? setup.map : next.map };
      saveSetup('online', setup);
      render();
    },
    onStart: (start) => {
      setup = { ...setup, start };
      saveSetup('online', setup);
      render();
    },
    onJet: (id) => {
      pilot.setJet(id);
      error = '';
      render();
    },
    onAiJet: (team, index, jet) => {
      aiJets = withAiJet(aiJets, team, index, jet);
      saveSetting(AI_JETS_KEY, aiJets);
      render();
    },
    onAction: go,
    onBack: back,
  });
  dialog.appendChild(layout.element);
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    back();
  });

  return {
    dialog,
    open(prefill?: string, message?: string) {
      setup = loadSetup('online');
      name = loadOnlineName() || suggestedName();
      if (prefill) {
        role = 'join';
        code = prefill;
      }
      error = message ?? '';
      render();
      dialog.showModal();
      if (loadOnlineName() === '') layout.focusName();
      else layout.focusAction();
    },
  };
}
