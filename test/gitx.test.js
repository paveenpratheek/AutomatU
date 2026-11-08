import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withoutTrailers } from '../src/sources/gitx.js';

test('the trailer block is dropped from a commit message', () => {
  const msg = 'feat(x): a thing\n\nWhy it changed.\n\nGitX-Builds-On: abc1234\nGitX-Thoughts: t-0123456789\nCo-Authored-By: Someone <a@b.c>\n';
  assert.equal(withoutTrailers(msg), 'feat(x): a thing\n\nWhy it changed.');
});

test('a message with no trailers is kept whole', () => {
  assert.equal(withoutTrailers('fix: one line'), 'fix: one line');
  assert.equal(withoutTrailers('fix: a\n\nBody: with a colon in prose, and more words'), 'fix: a\n\nBody: with a colon in prose, and more words');
});

test('a last paragraph that is only partly trailers stays', () => {
  const msg = 'feat: a\n\nGitX-Root: X\nand a sentence';
  assert.equal(withoutTrailers(msg), msg);
});
