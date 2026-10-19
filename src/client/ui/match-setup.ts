import { DIFFICULTIES, type DifficultyId } from '../../shared/ai/difficulty.ts';
import { MAP_IDS, MAP_NAMES, type MapId } from '../../shared/data/maps/registry.ts';
import { ONLINE_MODES, type OnlineModeId } from '../../shared/net/protocol.ts';
import { SPAWN_STARTS, type SpawnStart } from '../../shared/world/spawns.ts';
import { TIME_OF_DAY_IDS, TIME_OF_DAY_LABELS, type TimeOfDayId } from '../../shared/world/time-of-day.ts';
import { MISSION_RULES } from '../hud/objective-hud.ts';
import { choiceGroup, el } from './choice-group.ts';
import { MISSION_LABELS } from './records-format.ts';
import { loadSetting, saveSetting } from './storage.ts';

/** The missions a match can fly, alone or online: the same five (Training stays on the title screen). */
export type PlayMission = OnlineModeId;
export const PLAY_MISSIONS: readonly PlayMission[] = ['team-deathmatch', 'air-superiority', 'team-objective', 'strike', 'free-flight'];

export const SEATS = ['1', '2', '4'] as const;
export type Seats = (typeof SEATS)[number];

/** Everything set up before a match (revision 34): the mission, the time of day, the AI pilots, the pilots per side, the map and the start. */
export interface MatchSetup {
  mission: PlayMission;
  time: TimeOfDayId;
  skill: DifficultyId;
  seats: Seats;
  map: MapId;
  start: SpawnStart;
}

const START_LABELS: Record<SpawnStart, string> = { air: 'Air start', runway: 'Runway start' };
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => allowed.find((a) => a === v) ?? fallback;

/**
 * The map and start a mission really flies with: Strike keeps the Test Range it was laid out on, from the air; runway
 * starts need Lechovia's airfields.
 */
export function fixedWorld(s: MatchSetup): { map: MapId; start: SpawnStart } {
  const map: MapId = s.mission === 'strike' ? 'test-range' : s.map;
  return { map, start: map === 'lechovia' && s.mission !== 'strike' ? s.start : 'air' };
}

/** Free Flight has no enemies and no AI pilots: their skill and the pilots per side do not apply. */
export const flies = (mission: PlayMission) => mission !== 'free-flight';

/** One line on what the mission asks of the pilot. */
export function missionLine(mission: PlayMission): string {
  switch (mission) {
    case 'team-deathmatch':
      return 'Shoot down the other side: the first to the score limit, or the most kills when time runs out, wins.';
    case 'air-superiority':
    case 'team-objective':
      return MISSION_RULES[mission];
    case 'strike':
      return 'Russia bombs three ground targets on the Test Range; the USA defends them. Your jet picks your side.';
    case 'free-flight':
      return 'No enemies, no score: fly anywhere on the map, and change the sky from the pause menu.';
  }
}

/**
 * The setups are kept per kind: alone with the keys the title screen used before revision 34 ("mission",
 * "timeOfDay", "difficulty", "teamSize", "map", "start"), online with the Online sheet's ("onlineMode", "onlineSeats",
 * "onlineSkill", "onlineWorld").
 */
export function loadSetup(kind: 'solo' | 'online'): MatchSetup {
  if (kind === 'solo') {
    return {
      mission: pick(loadSetting<unknown>('mission', 'team-deathmatch'), PLAY_MISSIONS, 'team-deathmatch'),
      time: pick(loadSetting<unknown>('timeOfDay', 'day'), TIME_OF_DAY_IDS, 'day'),
      skill: pick(loadSetting<unknown>('difficulty', 'rookie'), Object.keys(DIFFICULTIES) as DifficultyId[], 'rookie'),
      seats: pick(String(loadSetting<unknown>('teamSize', '1')), SEATS, '1'),
      map: pick(loadSetting<unknown>('map', 'lechovia'), MAP_IDS, 'lechovia'),
      start: pick(loadSetting<unknown>('start', 'air'), SPAWN_STARTS, 'air'),
    };
  }
  const solo = loadSetup('solo');
  const world = loadSetting<Partial<Record<'map' | 'start' | 'time', unknown>> | null>('onlineWorld', null);
  return {
    mission: pick(loadSetting<unknown>('onlineMode', 'team-deathmatch'), ONLINE_MODES, 'team-deathmatch'),
    time: pick(world?.time, TIME_OF_DAY_IDS, solo.time),
    skill: pick(loadSetting<unknown>('onlineSkill', 'veteran'), Object.keys(DIFFICULTIES) as DifficultyId[], 'veteran'),
    seats: pick(String(loadSetting<unknown>('onlineSeats', '2')), SEATS, '2'),
    map: pick(world?.map, MAP_IDS, solo.map),
    start: pick(world?.start, SPAWN_STARTS, solo.start),
  };
}

export function saveSetup(kind: 'solo' | 'online', s: MatchSetup): void {
  if (kind === 'solo') {
    saveSetting('mission', s.mission);
    saveSetting('timeOfDay', s.time);
    saveSetting('difficulty', s.skill);
    saveSetting('teamSize', s.seats);
    saveSetting('map', s.map);
    saveSetting('start', s.start);
    return;
  }
  saveSetting('onlineMode', s.mission);
  saveSetting('onlineSkill', s.skill);
  saveSetting('onlineSeats', s.seats);
  saveSetting('onlineWorld', { map: s.map, start: s.start, time: s.time });
}

function select<T extends string>(label: string, values: readonly T[], names: (v: T) => string, value: T, onChange: (v: T) => void): HTMLSelectElement {
  const sel = el('select', 'world-select');
  sel.setAttribute('aria-label', label);
  sel.title = label;
  for (const v of values) {
    const o = el('option', undefined, names(v));
    o.value = v;
    sel.appendChild(o);
  }
  sel.value = value;
  sel.addEventListener('change', () => onChange(sel.value as T));
  return sel;
}

/**
 * The match settings (revision 34, at the owner's request): the mission, the time of day, the AI pilots' skill and the
 * pilots per side, then the map and the start. Solo and online show the same form; each keeps its own choices.
 * `onChange` hears every change (the title screen's sky follows the time of day).
 */
export function matchSetupForm(kind: 'solo' | 'online', onChange?: (s: MatchSetup) => void): { element: HTMLElement; value(): MatchSetup } {
  const s = loadSetup(kind);
  const box = el('div', 'match-setup');
  const changed = () => {
    saveSetup(kind, s);
    refresh();
    onChange?.({ ...s });
  };
  const missions = choiceGroup(`${kind}-mission`, 'Mission', PLAY_MISSIONS.map((m) => ({ value: m, label: MISSION_LABELS[m] })), s.mission, (m) => {
    s.mission = m;
    changed();
  });
  const note = el('p', 'setup-note');
  note.setAttribute('aria-live', 'polite');
  missions.appendChild(note);
  const time = choiceGroup(`${kind}-time`, 'Time of day', TIME_OF_DAY_IDS.map((t) => ({ value: t, label: TIME_OF_DAY_LABELS[t] })), s.time, (t) => {
    s.time = t;
    changed();
  });
  const skill = choiceGroup(`${kind}-skill`, 'AI pilots', Object.values(DIFFICULTIES).map((d) => ({ value: d.id, label: d.label })), s.skill, (d) => {
    s.skill = d;
    changed();
  });
  skill.title = kind === 'solo' ? 'How well the AI pilots fly and fight: your opponents and your wingmen' : 'How well the AI pilots in the empty seats fly and fight';
  const seats = choiceGroup(`${kind}-seats`, 'Pilots per side', SEATS.map((n) => ({ value: n, label: `${n} v ${n}` })), s.seats, (n) => {
    s.seats = n;
    changed();
  });
  seats.title = kind === 'solo' ? 'You and AI wingmen against as many AI pilots' : 'Seats on each side: the ones no one takes are flown by AI pilots';
  const fights = el('div', 'setup-row');
  fights.append(skill, seats);

  const world = el('fieldset', 'pick pick-world');
  world.appendChild(el('legend', 'eyebrow', 'World'));
  const worldRow = el('div', 'world-row');
  const map = select('Map', MAP_IDS, (m) => MAP_NAMES[m], s.map, (m) => {
    s.map = m;
    changed();
  });
  const start = select('Start', SPAWN_STARTS, (v) => START_LABELS[v], s.start, (v) => {
    s.start = v;
    changed();
  });
  worldRow.append(map, start);
  const worldNote = el('p', 'setup-note');
  world.append(worldRow, worldNote);
  box.append(missions, time, fights, world);

  const disable = (set: HTMLFieldSetElement, off: boolean) => {
    set.disabled = off;
    set.classList.toggle('is-off', off);
  };
  const refresh = () => {
    const fixed = fixedWorld(s);
    map.disabled = s.mission === 'strike';
    map.value = fixed.map;
    start.disabled = fixed.map !== 'lechovia';
    start.value = fixed.start;
    disable(skill, !flies(s.mission));
    disable(seats, !flies(s.mission));
    note.textContent = missionLine(s.mission);
    worldNote.textContent =
      s.mission === 'strike'
        ? 'Strike is flown on the Test Range, from the air.'
        : kind === 'online'
          ? 'The map and the time of day are the same for everyone in the room; each pilot starts as they choose, and the AI pilots start with you.'
          : fixed.map === 'lechovia'
            ? 'A runway start takes off from your side’s airfield, with the AI pilots.'
            : 'The Test Range has no airfields: everyone starts in the air.';
  };
  refresh();
  return { element: box, value: () => ({ ...s }) };
}
