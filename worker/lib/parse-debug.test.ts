import { describe, it, expect } from 'vitest';
import { refang, parseArtifacts, siParseText } from './si-parse';
describe('refang-debug', () => {
  it('logs', () => {
    console.log('A:', JSON.stringify(refang('hxxp[://]evil[.com]')));
    console.log('B:', JSON.stringify(refang('hxxp[://]evil[dot]com')));
    const r = siParseText('Path: C:\\\\Users\\\\Public\\\\runme.exe and /home/user/.local/runme');
    console.log('PATHS:', r.artifacts.filePath);
  });
});
