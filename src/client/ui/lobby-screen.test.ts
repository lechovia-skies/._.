import { describe, expect, it } from 'vitest';
import { CALM_NOON } from '../../shared/world/time-of-day.ts';
import { type LobbyPilot, lobbyLine, roomSummary, sortPilots } from './lobby-screen.ts';

const pilot = (id: number, callsign: string, over: Partial<LobbyPilot> = {}): LobbyPilot => ({ id, callsign, team: 'usa', jet: 'F-16C', host: false, you: false, ...over });

describe('the lobby (revision 33)', () => {
  it('sums up the room in a few lines', () => {
    const lines = roomSummary({ mode: 'team-deathmatch', map: 'lechovia', environment: { ...CALM_NOON }, teamSize: 2, botSkill: 'veteran' });
    expect(lines[0]).toBe('Dogfight');
    expect(lines[1]).toMatch(/^2 v 2 · empty seats flown by Veteran AI pilots$/);
    expect(lines[2]).toMatch(/^Lechovia · 12:00 · /);
    expect(roomSummary({ mode: 'free-flight', map: 'lechovia', environment: { ...CALM_NOON }, teamSize: 2, botSkill: 'veteran' })).toHaveLength(2);
  });

  it('lists the host first, then by side and name', () => {
    const list = sortPilots([pilot(3, 'Zed', { team: 'russia' }), pilot(2, 'Bo'), pilot(1, 'Host', { team: 'russia', host: true }), pilot(4, 'Al', { team: 'russia' })]);
    expect(list.map((p) => p.callsign)).toEqual(['Host', 'Al', 'Zed', 'Bo']);
  });

  it('tells the host to pass the code on, and the others whom they wait for', () => {
    expect(lobbyLine({ isHost: true, hostName: 'Hiro', pilots: [pilot(1, 'Hiro', { host: true })] })).toMatch(/code to your friends/);
    expect(lobbyLine({ isHost: true, hostName: 'Hiro', pilots: [pilot(1, 'Hiro'), pilot(2, 'Ken')] })).toMatch(/^2 pilots in the room/);
    expect(lobbyLine({ isHost: false, hostName: 'Hiro', pilots: [] })).toBe('Waiting for Hiro to start the match.');
  });
});
