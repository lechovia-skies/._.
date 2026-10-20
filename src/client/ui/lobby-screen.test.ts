import { describe, expect, it } from 'vitest';
import type { RoomSettings } from '../../shared/net/protocol.ts';
import { CALM_NOON } from '../../shared/world/time-of-day.ts';
import { changedRoom, type LobbyPilot, lobbyLine, type LobbyState, roomView } from './lobby-screen.ts';
import { seatRows, timeOfDayAt, withAiJet } from './multiplayer.ts';

const pilot = (id: number, callsign: string, over: Partial<LobbyPilot> = {}): LobbyPilot => ({ id, callsign, team: 'usa', jet: 'kestrel', host: false, you: false, ...over });
const settings = (over: Partial<RoomSettings> = {}): RoomSettings => ({ mode: 'team-deathmatch', map: 'lechovia', environment: { ...CALM_NOON }, teamSize: 2, botSkill: 'veteran', ...over });
const state = (over: Partial<LobbyState> = {}): LobbyState => ({
  code: 'K7QF3M',
  invite: 'https://example.test/?join=K7QF3M',
  isHost: true,
  hostName: 'Hiro',
  settings: settings(),
  pilots: [pilot(1, 'Hiro', { host: true, you: true })],
  jets: [{ id: 'kestrel', name: 'F-16C', team: 'usa' }],
  jet: 'kestrel',
  ...over,
});

describe('the lobby (revisions 33 and 37)', () => {
  it('tells the host to pass the code on, and the others whom they wait for', () => {
    expect(lobbyLine({ isHost: true, hostName: 'Hiro', pilots: [pilot(1, 'Hiro', { host: true })] })).toMatch(/Share this code/);
    expect(lobbyLine({ isHost: true, hostName: 'Hiro', pilots: [pilot(1, 'Hiro'), pilot(2, 'Ken')] })).toMatch(/^2 pilots in the room/);
    expect(lobbyLine({ isHost: false, hostName: 'Hiro', pilots: [] })).toBe('Waiting for Hiro to start the game.');
  });

  it('lists the seats side by side: the pilots, the host first, then the AI seats with their jets', () => {
    const rows = seatRows(
      3,
      [pilot(3, 'Zed', { team: 'russia', jet: 'sapsan' }), pilot(2, 'Bo'), pilot(1, 'Hiro', { host: true, you: true }), pilot(4, 'Al', { team: 'russia', jet: 'kobchik' })],
      { usa: ['condor'], russia: [null] },
      true,
    );
    expect(rows.map((r) => `${r.n}:${r.team}:${r.who}:${r.name}:${r.jet}`)).toEqual([
      '1:usa:you:Hiro:kestrel',
      '2:usa:pilot:Bo:kestrel',
      '3:usa:ai::condor',
      '4:russia:pilot:Al:kobchik',
      '5:russia:pilot:Zed:sapsan',
      '6:russia:ai::null',
    ]);
    // Free Flight has no AI pilots; a side with more pilots than seats shows them all.
    expect(seatRows(1, [pilot(1, 'A'), pilot(2, 'B')], undefined, false).map((r) => r.who)).toEqual(['pilot', 'pilot']);
  });

  it("sets an AI seat's jet, padding and trimming the list", () => {
    expect(withAiJet(undefined, 'russia', 2, 'sapsan')).toEqual({ usa: [], russia: [null, null, 'sapsan'] });
    expect(withAiJet({ usa: ['condor', 'tempest'], russia: [] }, 'usa', 1, null)).toEqual({ usa: ['condor'], russia: [] });
  });

  it("shows the room as the Multiplayer screen does: the host's to change, the others' to read", () => {
    const host = roomView(state({ pilots: [pilot(1, 'Hiro', { host: true, you: true }), pilot(2, 'Ken'), pilot(3, 'Ann', { team: 'russia' })] }));
    expect(host).toMatchObject({ stage: 'room', role: 'host', edit: true, minSeats: 2, maps: ['lechovia'], action: { label: 'Start game', enabled: true }, back: 'Close the room' });
    // A room on Lechovia flies no Strike.
    expect(host.modes).not.toContain('strike');
    expect(host.seats).toHaveLength(4);
    const guest = roomView(state({ isHost: false, settings: settings({ map: 'test-range', mode: 'free-flight' }) }));
    expect(guest).toMatchObject({ edit: false, action: { enabled: false }, back: 'Leave the room' });
    expect(guest.modes).toContain('strike');
    expect(guest.seats.every((r) => r.who !== 'ai')).toBe(true);
  });

  it('changes the starting hour only with the time of day', () => {
    const s = settings({ environment: { weather: 'clear', startHour: 12.4, clockRunning: true } });
    expect(timeOfDayAt(12.4)).toBe('day');
    expect(changedRoom(s, { mode: 'strike', teamSize: 3, time: 'day', skill: 'ace', map: 'lechovia' })).toMatchObject({ mode: 'strike', teamSize: 3, botSkill: 'ace', environment: { startHour: 12.4 } });
    expect(changedRoom(s, { mode: 'team-deathmatch', teamSize: 2, time: 'night', skill: 'veteran', map: 'lechovia' }).environment).toEqual({ weather: 'clear', startHour: 23, clockRunning: true });
  });
});
