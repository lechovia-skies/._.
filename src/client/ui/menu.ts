import { DIFFICULTIES, type DifficultyId } from '../../shared/ai/difficulty.ts';
import { listAircraft, TEAM_NAMES } from '../../shared/data/aircraft/registry.ts';
import type { AircraftConfig } from '../../shared/data/aircraft/types.ts';
import { loadoutFor } from '../../shared/data/loadout.ts';
import { MAP_IDS, MAP_NAMES, type MapId } from '../../shared/data/maps/registry.ts';
import { SPAWN_STARTS, type SpawnStart } from '../../shared/world/spawns.ts';
import { type EnvironmentSettings, START_HOURS, TIME_OF_DAY_IDS, TIME_OF_DAY_LABELS, type TimeOfDayId } from '../../shared/world/time-of-day.ts';
import type { WeatherId } from '../../shared/world/weather.ts';
import { STRIKE_ATTACKER, STRIKE_DEFAULTS, STRIKE_DEFENDER } from '../../shared/modes/strike.ts';
import { MISSION_RULES } from '../hud/objective-hud.ts';
import type { ControlMode } from '../input/control-mapper.ts';
import { controlsHelp, GAMEPAD_HELP } from './controls-help.ts';
import { loadCareer } from '../career.ts';
import { careerXp, isUnlocked, levelProgress, nextUnlock } from '../progression.ts';
import { canFly, develop, formatCredits, type Hangar, jetState, loadHangar, repair, saveHangar } from '../hangar.ts';
import { isTouchOnly } from './device.ts';
import { MISSION_LABELS } from './records-format.ts';
import { campaignSheet } from './campaign-sheet.ts';
import { type OnlineStart, onlineSheet, soloCallsign } from './online-sheet.ts';
import { recordsSheet } from './records-sheet.ts';
import { choiceGroup, el } from './choice-group.ts';
import { openSettings } from './settings-screen.ts';
import type { SettingsStore } from './settings.ts';
import { loadSetting, saveSetting } from './storage.ts';

export type MissionId = 'team-deathmatch' | 'air-superiority' | 'team-objective' | 'free-flight' | 'strike' | 'training';

export interface StartOptions {
  aircraftId: string;
  callsign: string;
  controlMode: ControlMode;
  mission: MissionId;
  difficulty: DifficultyId;
  /** the map for Dogfight and Free Flight (M4); Lechovia when unset */
  map?: MapId;
  /** in the air or on the runway (M4) */
  start?: SpawnStart;
  /** weather and clock (M4) */
  environment?: EnvironmentSettings;
  /** pilots per side: you and AI wingmen against as many AI pilots (M5); 1 when unset */
  teamSize?: number;
  /** AI pilots on the other side when it differs from `teamSize` (campaign) */
  enemies?: number;
  /** the wingmen's skill when it differs from the opponents' (campaign) */
  wingmenDifficulty?: DifficultyId;
  /** first to this score instead of the mode's own limit (campaign) */
  scoreLimit?: number;
  /** a campaign mission (revision 18) */
  campaign?: { missionId: string };
  /** online play (revision 28): host a room with these settings, or join one by its code */
  online?: OnlineStart;
}

export interface StartMenuHandlers {
  onStart(options: StartOptions): void;
  /** The jet currently chosen, for the live scene behind the menu. */
  onPreview(aircraftId: string): void;
  /** The weather and time currently chosen, for the live scene behind the menu (M4). */
  onWorld?(environment: EnvironmentSettings): void;
}

const CONTROL_MODES: readonly ControlMode[] = ['mouse-aim', 'direct'];
type FlyMission = Exclude<MissionId, 'free-flight' | 'training'>;
const MISSIONS: readonly { value: FlyMission; label: string }[] = (['team-deathmatch', 'air-superiority', 'team-objective', 'strike'] as const).map((value) => ({
  value,
  label: MISSION_LABELS[value],
}));
/** Pilots per side (M5). */
export const TEAM_SIZES = ['1', '2', '4'] as const;
type TeamSizeChoice = (typeof TEAM_SIZES)[number];
const CONTROL_LABELS: Record<ControlMode, string> = { 'mouse-aim': 'Mouse aim', direct: 'Keyboard' };

/** Saved settings can outlive the options they name (or be edited by hand). */
export function pickValid<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.find((a) => a === value) ?? fallback;
}

/** What the selected jet does in a Strike match (spec §15.5). */
export function strikeRole(c: AircraftConfig): string {
  return c.team === STRIKE_DEFENDER
    ? `${c.name} · ${TEAM_NAMES[c.team]}: hold all three targets for ${STRIKE_DEFAULTS.timeLimitS / 60} minutes`
    : `${c.name} · ${TEAM_NAMES[c.team]}: destroy two of the three targets`;
}

/**
 * What the jet carries (revision 30), as the real jet does: "M61A1 gun, 511 rounds · 2 AIM-9X, 4 AIM-120D · 30 flares,
 * 60 chaff". A Strike attacker's line shows its strike load.
 */
export function armamentLine(c: AircraftConfig, strike: boolean): string {
  const s = c.stores;
  const l = loadoutFor(c, strike);
  const parts = [`${s.cannon} gun, ${s.cannonRounds} rounds`];
  if (l.bomb && l.bombs > 0) parts.push(`${l.bombs} ${l.bomb.name}`);
  parts.push(l.missiles.map((m) => `${m.count} ${m.missile}`).join(', '));
  parts.push(`${s.flares} flares, ${s.chaff} chaff`);
  return parts.filter((p) => p.length > 0).join(' · ');
}

export function aircraftSummary(c: AircraftConfig): string {
  const end = c.description.indexOf('. ');
  return `${c.role} · ${end < 0 ? c.description : c.description.slice(0, end + 1)}`;
}

/** The world the next match flies in (M4): map, start, time of day, clock and weather. */
export interface WorldChoice {
  map: MapId;
  start: SpawnStart;
  time: TimeOfDayId;
  clock: boolean;
  weather: WeatherId;
}

/**
 * Matches from the title screen fly in scattered cloud with the clock standing still (revision 19: the owner took the
 * weather and "Clock runs" choices off the title screen). Free Flight's pause menu still sets both.
 */
export const TITLE_WEATHER: WeatherId = 'scattered';
export const TITLE_CLOCK = false;

export function loadWorldChoice(): WorldChoice {
  return {
    map: pickValid(loadSetting<unknown>('map', 'lechovia'), MAP_IDS, 'lechovia'),
    start: pickValid(loadSetting<unknown>('start', 'air'), SPAWN_STARTS, 'air'),
    time: pickValid(loadSetting<unknown>('timeOfDay', 'day'), TIME_OF_DAY_IDS, 'day'),
    clock: TITLE_CLOCK,
    weather: TITLE_WEATHER,
  };
}

export function environmentOf(w: WorldChoice): EnvironmentSettings {
  return { weather: w.weather, startHour: START_HOURS[w.time], clockRunning: w.clock };
}

/**
 * The map a mission flies on and whether a runway start is possible there: Strike and Training keep the Test Range
 * they were laid out on, which has no airfields.
 */
export function effectiveWorld(w: WorldChoice, mission: MissionId): WorldChoice {
  const map: MapId = mission === 'strike' || mission === 'training' ? 'test-range' : w.map;
  return { ...w, map, start: map === 'lechovia' && mission !== 'strike' && mission !== 'training' ? w.start : 'air' };
}

const START_LABELS: Record<SpawnStart, string> = { air: 'Air start', runway: 'Runway start' };

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

function worldGroup(initial: WorldChoice, onChange: (w: WorldChoice) => void): { set: HTMLFieldSetElement; refresh(mission: MissionId): void } {
  const w = { ...initial };
  const set = el('fieldset', 'pick pick-world');
  set.appendChild(el('legend', 'eyebrow', 'World'));
  const row = el('div', 'world-row');
  const changed = () => {
    saveSetting('map', w.map);
    saveSetting('start', w.start);
    saveSetting('timeOfDay', w.time);
    onChange({ ...w });
  };
  const map = select('Map', MAP_IDS, (m) => MAP_NAMES[m], w.map, (m) => {
    w.map = m;
    changed();
    refreshStart();
  });
  const start = select('Start', ['air', 'runway'] as const, (v) => START_LABELS[v], w.start, (v) => {
    w.start = v;
    changed();
  });
  const time = select('Time of day', TIME_OF_DAY_IDS, (t) => TIME_OF_DAY_LABELS[t], w.time, (t) => {
    w.time = t;
    changed();
  });
  row.append(map, start, time);
  set.appendChild(row);
  let mission: MissionId = 'team-deathmatch';
  // Strike and Training keep the Test Range; runway starts need Lechovia's airfields.
  const refreshStart = () => {
    const fixed = effectiveWorld(w, mission);
    map.disabled = fixed.map !== w.map || mission === 'strike';
    map.value = fixed.map;
    start.disabled = fixed.map !== 'lechovia' || mission === 'strike';
    start.value = fixed.start;
  };
  refreshStart();
  return {
    set,
    refresh(m: MissionId) {
      mission = m;
      refreshStart();
    },
  };
}

function titleLockup(): HTMLHeadingElement {
  const h1 = el('h1', 'brand-title');
  h1.setAttribute('aria-label', 'Lechovia Skies');
  const kicker = el('span', 'brand-kicker');
  kicker.setAttribute('aria-hidden', 'true');
  // One span per letter so the small word can be spread exactly across the width of the big one.
  for (const ch of 'LECHOVIA') kicker.appendChild(el('span', undefined, ch));
  const word = el('span', 'brand-word', 'SKIES');
  word.setAttribute('aria-hidden', 'true');
  h1.append(kicker, word);
  return h1;
}

function credits(): HTMLParagraphElement {
  // Required attribution for the CC BY 4.0 satellite imagery (full list: CREDITS.md).
  const p = el('p', 'credits');
  p.innerHTML =
    'Satellite imagery: <a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless</a> ' +
    'by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2017), ' +
    '<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a> · ' +
    'Ground detail: <a href="https://polyhaven.com" target="_blank" rel="noopener">Poly Haven</a> (CC0) · ' +
    'Water normals: three.js (MIT) · Rajdhani font: Indian Type Foundry (OFL) · ' +
    'Music: “Life in the Danger Zone” by DJARTMUSIC (Pixabay)';
  return p;
}

function controlsSheet(settings: SettingsStore): HTMLDialogElement {
  const dialog = el('dialog', 'sheet');
  dialog.setAttribute('aria-labelledby', 'controls-title');
  const form = el('form');
  form.method = 'dialog';
  const title = el('h2', 'sheet-title', 'Controls');
  title.id = 'controls-title';
  const keys = el('dl', 'keys');
  const fillKeys = (m: ControlMode) => {
    keys.replaceChildren();
    for (const [k, action] of controlsHelp(m, settings.current.keys)) keys.append(el('dt', undefined, k), el('dd', undefined, action));
  };
  const steering = choiceGroup(
    'steering',
    'Steering',
    CONTROL_MODES.map((m) => ({ value: m, label: CONTROL_LABELS[m] })),
    settings.current.controlMode,
    (m) => {
      fillKeys(m);
      settings.update({ controlMode: m });
    },
  );
  // Keys may have been rebound in Settings since the sheet was built.
  dialog.addEventListener('toggle', () => fillKeys(settings.current.controlMode));
  fillKeys(settings.current.controlMode);
  const pad = el('dl', 'keys');
  for (const [k, action] of GAMEPAD_HELP) pad.append(el('dt', undefined, k), el('dd', undefined, action));
  const note = el('p', 'sheet-note', 'Click the game view to capture the mouse. Esc releases it and pauses. Change keys, mouse and gamepad in Settings.');
  const close = el('button', 'link', 'Close');
  close.value = 'close';
  form.append(title, steering, keys, el('h3', 'eyebrow', 'Gamepad'), pad, note, close);
  dialog.appendChild(form);
  return dialog;
}

/** The pilot's level at the top of the title screen (revision 26): the level, a bar to the next one and the next jet it opens. */
function levelBadge(p: ReturnType<typeof levelProgress>): HTMLElement {
  const box = el('div', 'pilot-level');
  const next = nextUnlock(p.level);
  box.title = next ? `${(p.to - p.xp).toLocaleString('en-US')} XP to level ${p.level + 1}; the ${next.name} can be developed from level ${next.level}` : 'Every jet can be developed';
  const bar = el('span', 'pilot-level-bar');
  const fill = el('span', 'pilot-level-fill');
  fill.style.transform = `scaleX(${p.fraction.toFixed(3)})`;
  bar.appendChild(fill);
  const head = el('span', 'pilot-level-head');
  head.append(el('span', 'pilot-level-name', `Level ${p.level}`), bar);
  const xp = el('span', 'pilot-level-xp', `${p.xp.toLocaleString('en-US')} / ${p.to.toLocaleString('en-US')} XP`);
  if (next) xp.appendChild(el('span', 'pilot-level-next', ` · Next jet: ${next.name} (level ${next.level})`));
  box.append(head, xp);
  return box;
}

/** The corner tag on a jet's button (revision 32): locked until its level, its price, grounded or its condition. */
export function jetBadge(h: Hangar, id: string, level: number): { badge?: string; disabled: boolean; title?: string } {
  const s = jetState(h, id, level);
  switch (s.kind) {
    case 'locked':
      return { badge: `🔒 Lv ${s.level}`, disabled: true, title: `Can be developed from pilot level ${s.level}` };
    case 'develop':
      return { badge: formatCredits(s.cost), disabled: false, title: `Not developed yet: ${formatCredits(s.cost)} to develop` };
    case 'grounded':
      return { badge: 'Grounded', disabled: false, title: `Too badly damaged to fly: repair for ${formatCredits(s.repair)}` };
    case 'ready':
      return s.wear > 0 ? { badge: `${100 - s.wear}%`, disabled: false, title: `Condition ${100 - s.wear}%` } : { disabled: false };
  }
}

/** The line under the jet about its hangar state, and the action it offers (develop or repair), if any. */
export function hangarLine(h: Hangar, id: string, level: number): { text: string; action?: { label: string; enabled: boolean } } {
  const s = jetState(h, id, level);
  const funds = formatCredits(h.funds);
  switch (s.kind) {
    case 'locked':
      return { text: `Can be developed from pilot level ${s.level}.` };
    case 'develop':
      return {
        text: s.affordable ? `Not developed yet. Development costs ${formatCredits(s.cost)}; you have ${funds}.` : `Not developed yet: ${formatCredits(s.cost)} to develop, you have ${funds}. Shoot down enemies to earn more.`,
        action: { label: `Develop · ${formatCredits(s.cost)}`, enabled: s.affordable },
      };
    case 'grounded':
      return { text: `Grounded: shot down too often to fly. Repair costs ${formatCredits(s.repair)}; you have ${funds}.`, action: { label: `Repair · ${formatCredits(s.repair)}`, enabled: true } };
    case 'ready':
      return s.wear > 0
        ? { text: `Condition ${100 - s.wear}%: grounded at 0%. Repair costs ${formatCredits(s.repair)}.`, action: { label: `Repair · ${formatCredits(s.repair)}`, enabled: true } }
        : { text: 'Condition 100% · ready to fly.' };
  }
}

/** Opens the Online sheet as the title screen shows: with an invite link's code, or after a failed online start. */
export interface OnlineOpening {
  code?: string;
  error?: string;
}

/** Shows the title screen over the live scene. Returns a cleanup function that removes it. */
export function showStartMenu(root: HTMLElement, handlers: StartMenuHandlers, settings: SettingsStore, online?: OnlineOpening): () => void {
  const aircraft = listAircraft();
  // Pilot level (revision 26): the jets open as it rises; a saved jet still locked falls back to an open one.
  const progress = levelProgress(careerXp(loadCareer()));
  // The hangar (revision 32): developed jets, their damage and the funds.
  let hangar = loadHangar(loadCareer());
  const ids = aircraft.filter((a) => isUnlocked(a.id, progress.level)).map((a) => a.id);
  let aircraftId = pickValid(loadSetting<unknown>('aircraft', ids[0]), ids, ids[0]);
  let difficulty = pickValid(loadSetting<unknown>('difficulty', 'rookie'), Object.keys(DIFFICULTIES) as DifficultyId[], 'rookie');
  let mission = pickValid(
    loadSetting<unknown>('mission', 'team-deathmatch'),
    MISSIONS.map((m) => m.value),
    'team-deathmatch',
  );

  const screen = el('div', 'start');
  const form = el('form', 'start-form');
  form.noValidate = true;

  // No pilot name here (revision 33): flying alone needs none; online asks for one the first time.
  const top = el('div', 'start-top');
  const funds = el('div', 'pilot-funds');
  funds.title = 'Credits: shoot down enemies and win to earn them; spend them developing and repairing jets';
  // Fullscreen: the corner button on every screen (revision 29; a link here since revision 26).
  top.append(levelBadge(progress), funds);

  const main = el('div', 'start-main');
  const brand = el('header', 'brand');
  brand.append(titleLockup(), el('p', 'brand-tag', 'Jet dogfight against AI pilots'));
  if (typeof window.matchMedia === 'function' && isTouchOnly((q) => window.matchMedia(q))) {
    const notice = el('p', 'notice', 'This game needs a keyboard and mouse. Open it on a desktop or laptop computer.');
    notice.setAttribute('role', 'status');
    brand.appendChild(notice);
  }

  const summary = el('p', 'pick-note');
  summary.setAttribute('aria-live', 'polite');
  const arms = el('p', 'pick-arms');
  const hangarRow = el('div', 'hangar-row');
  const hangarText = el('p', 'hangar-text');
  hangarText.setAttribute('aria-live', 'polite');
  const hangarAction = el('button', 'button secondary hangar-action');
  hangarAction.type = 'button';
  hangarRow.append(hangarText, hangarAction);
  // In Strike the line under the jets says what the chosen jet must do; otherwise it describes the jet.
  const showSummary = () => {
    const a = aircraft.find((x) => x.id === aircraftId) ?? aircraft[0];
    summary.textContent =
      mission === 'strike' ? strikeRole(a) : mission === 'air-superiority' || mission === 'team-objective' ? `${a.name} · ${MISSION_RULES[mission]}` : aircraftSummary(a);
    arms.textContent = armamentLine(a, mission === 'strike' && a.team === STRIKE_ATTACKER);
  };
  const jets = choiceGroup(
    'aircraft',
    'Aircraft',
    aircraft.map((a) => ({ value: a.id, label: a.name, ...jetBadge(hangar, a.id, progress.level) })),
    aircraftId,
    (id) => {
      aircraftId = id;
      saveSetting('aircraft', id);
      showSummary();
      refreshHangar();
      handlers.onPreview(id);
    },
    (c) => TEAM_NAMES[aircraft.find((a) => a.id === c.value)?.team ?? 'usa'],
  );
  jets.append(summary, arms, hangarRow);
  showSummary();

  let world = loadWorldChoice();
  const worldRow = worldGroup(world, (w) => {
    world = w;
    handlers.onWorld?.(environmentOf(w));
  });
  const missions = choiceGroup('mission', 'Mission', MISSIONS, mission, (m) => {
    mission = m;
    saveSetting('mission', m);
    showSummary();
    worldRow.refresh(m);
  });
  worldRow.refresh(mission);

  const skill = choiceGroup(
    'skill',
    'Opponent',
    Object.values(DIFFICULTIES).map((d) => ({ value: d.id, label: d.label })),
    difficulty,
    (d) => {
      difficulty = d;
      saveSetting('difficulty', d);
    },
  );
  let teamSize: TeamSizeChoice = pickValid(String(loadSetting<unknown>('teamSize', '1')), TEAM_SIZES, '1');
  const size = choiceGroup(
    'size',
    'Pilots per side',
    TEAM_SIZES.map((n) => ({ value: n, label: `${n} v ${n}` })),
    teamSize,
    (n) => {
      teamSize = n;
      saveSetting('teamSize', n);
    },
  );
  size.title = 'You and AI wingmen against as many AI pilots';

  const launch = el('div', 'launch');
  const fly = el('button', 'fly', 'Fly');
  fly.type = 'submit';
  const campaignButton = el('button', 'campaign-button', 'Campaign');
  campaignButton.type = 'button';
  campaignButton.title = 'Nine missions in order, for either side';
  campaignButton.setAttribute('aria-haspopup', 'dialog');
  const onlineButton = el('button', 'campaign-button online-button', 'Online');
  onlineButton.type = 'button';
  onlineButton.title = 'Fly with friends: host a room or join one with its code';
  onlineButton.setAttribute('aria-haspopup', 'dialog');
  const launchRow = el('div', 'launch-row');
  launchRow.append(fly, campaignButton, onlineButton);
  const links = el('div', 'links');
  const training = el('button', 'link', 'Training');
  training.type = 'button';
  training.title = 'Learn to fly, shoot and beat a missile (about 3 minutes)';
  if (!settings.current.trainingDone) training.appendChild(el('span', 'link-badge', 'New'));
  const freeFlight = el('button', 'link', 'Free flight');
  freeFlight.type = 'button';
  freeFlight.title = 'Fly without enemies';
  const controlsLink = el('button', 'link', 'Controls');
  controlsLink.type = 'button';
  controlsLink.setAttribute('aria-haspopup', 'dialog');
  const settingsLink = el('button', 'link', 'Settings');
  settingsLink.type = 'button';
  settingsLink.setAttribute('aria-haspopup', 'dialog');
  const recordsLink = el('button', 'link', 'Records');
  recordsLink.type = 'button';
  recordsLink.title = 'Your matches, kills and personal bests in this browser';
  recordsLink.setAttribute('aria-haspopup', 'dialog');
  links.append(training, freeFlight, controlsLink, settingsLink, recordsLink);
  launch.append(launchRow, links);

  // The hangar's state of the chosen jet: its badge on every jet button, the line and action under it, and whether
  // it can fly (a jet not developed or grounded stays on the ground; the campaign lends its own).
  const refreshHangar = () => {
    funds.textContent = formatCredits(hangar.funds);
    for (const a of aircraft) {
      const label = jets.querySelector<HTMLLabelElement>(`label[for="pick-aircraft-${a.id}"]`);
      if (!label) continue;
      const b = jetBadge(hangar, a.id, progress.level);
      label.querySelector('.option-badge')?.remove();
      if (b.badge) label.appendChild(el('span', `option-badge${b.badge === 'Grounded' ? ' is-grounded' : ''}`, b.badge));
      label.title = b.title ?? '';
    }
    const line = hangarLine(hangar, aircraftId, progress.level);
    hangarText.textContent = line.text;
    hangarAction.hidden = !line.action;
    if (line.action) {
      hangarAction.textContent = line.action.label;
      hangarAction.disabled = !line.action.enabled;
    }
    const flyable = canFly(hangar, aircraftId);
    for (const b of [fly, freeFlight, training]) b.disabled = !flyable;
    fly.title = flyable ? '' : line.text;
  };
  hangarAction.addEventListener('click', () => {
    const s = jetState(hangar, aircraftId, progress.level);
    hangar = s.kind === 'develop' ? develop(hangar, aircraftId, progress.level) : repair(hangar, aircraftId);
    saveHangar(hangar);
    refreshHangar();
  });
  refreshHangar();

  const opponents = el('div', 'opponent-row');
  opponents.append(skill, size);
  main.append(brand, missions, jets, opponents, worldRow.set, launch);
  form.append(top, main, credits());

  const sheet = controlsSheet(settings);
  const records = recordsSheet();
  const campaign = campaignSheet(
    () => ({ aircraftId, callsign: soloCallsign(), controlMode: settings.current.controlMode }),
    (options) => handlers.onStart(options),
  );
  const onlineDialog = onlineSheet(
    {
      jetProblem: () => (canFly(hangar, aircraftId) ? null : `${aircraft.find((a) => a.id === aircraftId)?.name ?? 'This jet'}: ${hangarLine(hangar, aircraftId, progress.level).text} Choose another jet on the title screen.`),
      world: () => ({ map: world.map, start: world.start, time: world.time }),
      environment: (time) => environmentOf({ ...world, time }),
    },
    (choice) => {
      const w = effectiveWorld(world, choice.role === 'host' ? choice.settings.mode : 'team-deathmatch');
      const options: StartOptions = {
        aircraftId,
        callsign: choice.name,
        controlMode: settings.current.controlMode,
        mission: choice.role === 'host' ? choice.settings.mode : 'team-deathmatch',
        difficulty,
        map: choice.role === 'host' ? choice.settings.map : w.map,
        start: choice.role === 'host' ? choice.start : w.start,
        environment: choice.role === 'host' ? choice.settings.environment : environmentOf(w),
        teamSize: choice.role === 'host' ? choice.settings.teamSize : 1,
        online: choice,
      };
      saveSetting('aircraft', options.aircraftId);
      handlers.onStart(options);
    },
  );
  screen.append(form, sheet, records.dialog, campaign.dialog, onlineDialog.dialog);

  const start = (mission: MissionId) => {
    if (!canFly(hangar, aircraftId)) return;
    const w = effectiveWorld(world, mission);
    const options: StartOptions = {
      aircraftId,
      callsign: soloCallsign(),
      controlMode: settings.current.controlMode,
      mission,
      difficulty,
      map: w.map,
      start: w.start,
      environment: environmentOf(w),
      teamSize: Number(teamSize),
    };
    saveSetting('aircraft', options.aircraftId);
    saveSetting('difficulty', options.difficulty);
    handlers.onStart(options);
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    start(mission);
  });
  freeFlight.addEventListener('click', () => start('free-flight'));
  training.addEventListener('click', () => start('training'));
  controlsLink.addEventListener('click', () => sheet.showModal());
  recordsLink.addEventListener('click', () => records.open());
  campaignButton.addEventListener('click', () => campaign.open());
  onlineButton.addEventListener('click', () => onlineDialog.open());
  settingsLink.addEventListener('click', () => openSettings(root, settings, 'controls'));

  root.appendChild(screen);
  handlers.onPreview(aircraftId);
  handlers.onWorld?.(environmentOf(world));
  fly.focus();
  if (online) onlineDialog.open(online.code, online.error);
  return () => {
    screen.remove();
  };
}
