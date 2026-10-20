import { describe, expect, it } from 'vitest';
import { MAX_TEAM_SIZE, newRoomCode, onlineName, parseClientJson, parseRoomCode, ProtocolError, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, roomCapacity, sanitizeAiJets, sanitizeCallsign, sanitizeRoomSettings } from './protocol.ts';

describe('online protocol (revision 28)', () => {
  it('parses what pilots send and folds bad values into safe ones', () => {
    expect(parseClientJson(JSON.stringify({ type: 'hello', version: 5, callsign: '<b>Ace</b>', aircraftId: 'kestrel', start: 'runway' }))).toEqual({ type: 'hello', version: 5, callsign: 'bAceb', aircraftId: 'kestrel', start: 'runway' });
    expect(parseClientJson(JSON.stringify({ type: 'hello', version: 5, aircraftId: 'kestrel', start: 'moon' }))).toMatchObject({ callsign: 'Pilot', start: 'air' });
    expect(parseClientJson('{"type":"world","weather":"rain","hour":25,"clockRunning":true}')).toEqual({ type: 'world', weather: 'rain', hour: 1, clockRunning: true });
    expect(parseClientJson('{"type":"flyFrom","x":1,"z":-2}')).toEqual({ type: 'flyFrom', x: 1, z: -2 });
  });

  it('throws on anything malformed', () => {
    for (const bad of ['nope', '[]', '{"type":"hello"}', '{"type":"chat","index":9}', '{"type":"world","weather":"snow","hour":1}', '{"type":"x"}', 'x'.repeat(5000)]) {
      expect(() => parseClientJson(bad), bad).toThrow(ProtocolError);
    }
  });

  it('keeps room settings to known values', () => {
    expect(sanitizeRoomSettings({ mode: 'strike', map: 'lechovia', teamSize: 99, botSkill: 'god', environment: { weather: 'rain', startHour: 23 } })).toEqual({
      mode: 'strike',
      map: 'test-range',
      teamSize: MAX_TEAM_SIZE,
      botSkill: 'veteran',
      environment: { weather: 'rain', startHour: 23, clockRunning: false },
      aiJets: { usa: [], russia: [] },
    });
    expect(sanitizeRoomSettings(null)).toMatchObject({ mode: 'team-deathmatch', map: 'lechovia', teamSize: 4 });
    expect(sanitizeRoomSettings({ teamSize: 0 }).teamSize).toBe(1);
  });

  it("keeps the AI pilots' jets to fighters of their side (revision 37)", () => {
    expect(sanitizeAiJets({ usa: ['condor', 'kobchik', 7, null], russia: 'x' })).toEqual({ usa: ['condor', null, null, null], russia: [] });
    expect(sanitizeAiJets({ usa: Array(9).fill('kestrel') }).usa).toHaveLength(MAX_TEAM_SIZE);
    expect(sanitizeRoomSettings(null).aiJets).toEqual({ usa: [], russia: [] });
  });

  it('seats 2 to 10 pilots in a room, half a side (revision 35)', () => {
    expect(MAX_TEAM_SIZE).toBe(5);
    expect([1, 2, 3, 4, 5].map((teamSize) => roomCapacity({ mode: 'team-deathmatch', teamSize }))).toEqual([2, 4, 6, 8, 10]);
    expect(roomCapacity({ mode: 'free-flight', teamSize: 1 })).toBe(10);
  });

  it('makes room codes that read clearly, and reads them back from text or an invite link', () => {
    let k = 0;
    const code = newRoomCode(() => (k++ * 0.37) % 1);
    expect(code).toHaveLength(ROOM_CODE_LENGTH);
    for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch);
    expect(parseRoomCode(code.toLowerCase())).toBe(code);
    expect(parseRoomCode('ab3-k7m')).toBe('AB3K7M');
    expect(parseRoomCode('https://lechovia-skies.github.io/._./?join=AB3K7M')).toBe('AB3K7M');
    expect(parseRoomCode('AB0K7M')).toBeNull();
    expect(parseRoomCode('ABC')).toBeNull();
  });

  it('cleans callsigns', () => {
    expect(sanitizeCallsign('  Red-1  ')).toBe('Red-1');
    expect(sanitizeCallsign(42)).toBe('Pilot');
    // Revision 33: five letters at most, of any script; nothing left is no name.
    expect(sanitizeCallsign('Maverick')).toBe('Maver');
    expect(onlineName('ヒロト<b>')).toBe('ヒロトb');
    expect(onlineName('ﾄﾞﾗｺﾞﾝ部隊')).toHaveLength(5);
    expect(onlineName('ト\u3099')).toBe('ド');
    expect(onlineName('!!!')).toBe('');
  });
});
