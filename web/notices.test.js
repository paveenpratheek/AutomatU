import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveCommits, regionsOf, regionLabel, sinceLine, closedLine } from './notices.js';

const R = (id, start) => ({ id, file: id.split('::')[0], name: id.split('::')[1], start, end: start + 9 });
const n = {
  commits: [
    { sha: 'a1', at: '2026-11-09T10:40:00Z', state: 'behind', regions: [R('t.py::drift', 198), R('t.py::follow', 70)] },
    { sha: 'b2', at: '2026-11-09T11:00:00Z', state: 'behind', regions: [R('t.py::drift', 198)] },
    { sha: 'c3', at: '2026-11-09T09:00:00Z', state: 'ticked', regions: [R('t.py::old', 1)] },
  ],
};

test('a notice lists the regions its commits moved, the most moved first, and leaves ticked work out', () => {
  assert.deepEqual(liveCommits(n).map((c) => c.sha), ['a1', 'b2']);
  assert.deepEqual(regionsOf(n).map((r) => [r.id, r.commits]), [['t.py::drift', 2], ['t.py::follow', 1]]);
  assert.equal(regionLabel(R('t.py::drift', 198)), 't.py · drift() · lines 198–207');
  assert.equal(regionLabel({ file: 'a.py', name: '(top of file)', start: 1, end: 9 }), 'a.py · (top of file) · lines 1–9');
});

test('it says how far behind the box is, and how a closed one was closed', () => {
  assert.equal(sinceLine(n, (t) => t.slice(11, 16)), '2 commits since 10:40');
  assert.equal(closedLine({ closed_how: 'still-right', closed_note: 'only a rename', closed_by: 'claude-automatu-builder' }),
    'its words still hold: only a rename · claude-automatu-builder');
});
