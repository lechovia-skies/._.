import type { DifficultyId } from '../../shared/ai/difficulty.ts';
import { listAircraft, TEAM_NAMES } from '../../shared/data/aircraft/registry.ts';
import type { AircraftConfig } from '../../shared/data/aircraft/types.ts';
import { loadoutFor } from '../../shared/data/loadout.ts';
import { MAP_IDS, type MapId } from '../../shared/data/maps/registry.ts';
import { SPAWN_STARTS, type SpawnStart } from '../../shared/world/spawns.ts';
import { type EnvironmentSettings, START_HOURS, TIME_OF_DAY_IDS, type TimeOfDayId } from '../../shared/world/time-of-day.ts';
import type { WeatherId } from '../../shared/world/weather.ts';
import { STRIKE_DEFAULTS, STRIKE_DEFENDER } from '../../shared/modes/strike.ts';
import type { ControlMode } from '../input/control-mapper.ts';
import { controlsHelp, GAMEPAD_HELP } from './controls-help.ts';
import { loadCareer } from '../career.ts';
import { careerXp, isUnlocked, levelProgress, nextUnlock } from '../progression.ts';
import { canFly, develop, formatCredits, type Hangar, jetState, loadHangar, repair, saveHangar } from '../hangar.ts';
import { isTouchOnly } from './device.ts';
import { campaignSheet } from './campaign-sheet.ts';
import { fixedWorld, loadSetup, type MatchSetup } from './match-setup.ts';
import { type OnlineStart, soloCallsign } from './online-sheet.ts';
import { playSheet } from './play-sheet.ts';
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

/** Opens Play on Multiplayer as the title screen shows: with an invite link's code, or after a failed online start. */
export interface OnlineOpening {
  code?: string;
  error?: string;
}

/** Shows the title screen over the live scene. Returns a cleanup function that removes it. */
/**
 * Shows the title screen over the live scene. Revision 34 (at the owner's request): the title screen is the jet and
 * PLAY; PLAY opens the Play sheet, which asks Solo or Multiplayer and then sets the match up. Returns a cleanup
 * function that removes it.
 */
export function showStartMenu(root: HTMLElement, handlers: StartMenuHandlers, settings: SettingsStore, online?: OnlineOpening): () => void {
  const aircraft = listAircraft();
  // Pilot level (revision 26): the jets open as it rises; a saved jet still locked falls back to an open one.
  const progress = levelProgress(careerXp(loadCareer()));
  // The hangar (revision 32): developed jets, their damage and the funds.
  let hangar = loadHangar(loadCareer());
  const ids = aircraft.filter((a) => isUnlocked(a.id, progress.level)).map((a) => a.id);
  let aircraftId = pickValid(loadSetting<unknown>('aircraft', ids[0]), ids, ids[0]);

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
  const showSummary = () => {
    const a = aircraft.find((x) => x.id === aircraftId) ?? aircraft[0];
    summary.textContent = aircraftSummary(a);
    arms.textContent = armamentLine(a, false);
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

  // The sky behind the title screen follows the solo match's time of day.
  const soloSetup = loadSetup('solo');
  let world: WorldChoice = { ...loadWorldChoice(), map: soloSetup.map, start: soloSetup.start, time: soloSetup.time };

  const launch = el('div', 'launch');
  const play = el('button', 'fly', 'Play');
  play.type = 'submit';
  play.title = 'Set up a match: solo against AI pilots, or online with friends';
  play.setAttribute('aria-haspopup', 'dialog');
  const campaignButton = el('button', 'campaign-button', 'Campaign');
  campaignButton.type = 'button';
  campaignButton.title = 'Nine missions in order, for either side';
  campaignButton.setAttribute('aria-haspopup', 'dialog');
  const launchRow = el('div', 'launch-row');
  launchRow.append(play, campaignButton);
  const links = el('div', 'links');
  const training = el('button', 'link', 'Training');
  training.type = 'button';
  training.title = 'Learn to fly, shoot and beat a missile (about 3 minutes)';
  if (!settings.current.trainingDone) training.appendChild(el('span', 'link-badge', 'New'));
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
  links.append(training, controlsLink, settingsLink, recordsLink);
  launch.append(launchRow, links);

  /** Why the chosen jet cannot fly (not developed, grounded), or null. */
  const jetProblem = () =>
    canFly(hangar, aircraftId) ? null : `${aircraft.find((a) => a.id === aircraftId)?.name ?? 'This jet'}: ${hangarLine(hangar, aircraftId, progress.level).text} Choose another jet on the title screen.`;

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
    training.disabled = !canFly(hangar, aircraftId);
  };
  hangarAction.addEventListener('click', () => {
    const s = jetState(hangar, aircraftId, progress.level);
    hangar = s.kind === 'develop' ? develop(hangar, aircraftId, progress.level) : repair(hangar, aircraftId);
    saveHangar(hangar);
    refreshHangar();
  });
  refreshHangar();

  main.append(brand, jets, launch);
  form.append(top, main, credits());

  const sheet = controlsSheet(settings);
  const records = recordsSheet();
  const campaign = campaignSheet(
    () => ({ aircraftId, callsign: soloCallsign(), controlMode: settings.current.controlMode }),
    (options) => handlers.onStart(options),
  );

  const startSolo = (s: MatchSetup) => {
    if (!canFly(hangar, aircraftId)) return;
    const w = fixedWorld(s);
    const options: StartOptions = {
      aircraftId,
      callsign: soloCallsign(),
      controlMode: settings.current.controlMode,
      mission: s.mission,
      difficulty: s.skill,
      map: w.map,
      start: w.start,
      environment: environmentOf({ ...world, ...w, time: s.time }),
      teamSize: s.mission === 'free-flight' ? 1 : Number(s.seats),
    };
    saveSetting('aircraft', options.aircraftId);
    handlers.onStart(options);
  };
  const startOnline = (choice: OnlineStart) => {
    const own = loadSetup('online');
    const options: StartOptions = {
      aircraftId,
      callsign: choice.name,
      controlMode: settings.current.controlMode,
      mission: choice.role === 'host' ? choice.settings.mode : 'team-deathmatch',
      difficulty: own.skill,
      map: choice.role === 'host' ? choice.settings.map : own.map,
      start: choice.role === 'host' ? choice.start : own.start,
      environment: choice.role === 'host' ? choice.settings.environment : environmentOf({ ...world, time: own.time }),
      teamSize: choice.role === 'host' ? choice.settings.teamSize : 1,
      online: choice,
    };
    saveSetting('aircraft', options.aircraftId);
    handlers.onStart(options);
  };
  const playDialog = playSheet(
    {
      jetName: () => aircraft.find((a) => a.id === aircraftId)?.name ?? '',
      jetProblem,
      environment: (time) => environmentOf({ ...world, time }),
      onSoloChange: (s) => {
        world = { ...world, map: s.map, start: s.start, time: s.time };
        handlers.onWorld?.(environmentOf(world));
      },
    },
    startSolo,
    startOnline,
  );
  screen.append(form, sheet, records.dialog, campaign.dialog, playDialog.dialog);

  /** Training flies the Test Range from the air, at noon. */
  const startTraining = () => {
    if (!canFly(hangar, aircraftId)) return;
    const w = effectiveWorld(world, 'training');
    handlers.onStart({
      aircraftId,
      callsign: soloCallsign(),
      controlMode: settings.current.controlMode,
      mission: 'training',
      difficulty: soloSetup.skill,
      map: w.map,
      start: w.start,
      environment: environmentOf(w),
      teamSize: 1,
    });
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    playDialog.open();
  });
  training.addEventListener('click', startTraining);
  controlsLink.addEventListener('click', () => sheet.showModal());
  recordsLink.addEventListener('click', () => records.open());
  campaignButton.addEventListener('click', () => campaign.open());
  settingsLink.addEventListener('click', () => openSettings(root, settings, 'controls'));

  root.appendChild(screen);
  handlers.onPreview(aircraftId);
  handlers.onWorld?.(environmentOf(world));
  play.focus();
  if (online) playDialog.open('online', online.code, online.error);
  return () => {
    screen.remove();
  };
}
