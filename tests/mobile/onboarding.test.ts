import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultDraft, validatePreferences } from '@melloway/domain';
import { defaultOnboarding, nextQuestion, planningPreferences, questionError, submissionError } from '../../apps/mobile/src/services/onboarding.ts';

const today = '2026-10-11';
test('optional unanswered day/time submit as usable planner values without losing preferences', () => {
  const prefs = { ...defaultDraft(), date: today, preferences: ['Bookshops'] };
  const answers = { ...defaultOnboarding(), ageInput: '', date: '', time: '', notes: 'a quiet afternoon', diningVibes: ['Cozy'] };
  const result = planningPreferences(prefs, answers, today);
  assert.equal(result.date, today);
  assert.equal(result.time, '11:00');
  assert.equal(result.area, prefs.area);
  assert.deepEqual(result.preferences, ['Bookshops']);
  assert.equal(validatePreferences(result, today), null);
  assert.deepEqual(answers.diningVibes, ['Cozy']);
  assert.equal(answers.date, '');
  assert.ok(!Object.hasOwn(result, 'notes'), 'retain new answers outside the legacy provider contract');
});
test('an old implicit default advances to today, while an explicitly chosen past date remains an error', () => {
  const prefs = { ...defaultDraft(), date: '2026-10-10' };
  assert.equal(planningPreferences(prefs, defaultOnboarding(), today).date, today);
  assert.equal(submissionError(prefs, { ...defaultOnboarding(), date: '2026-10-10' }, today), 'Pick today or a future calendar date.');
});
test('a typed but unselected area cannot silently become the previous area', () => {
  const prefs = { ...defaultDraft(), date: today };
  const typed = { ...defaultOnboarding(), locationQuery: 'Newto' };
  assert.match(questionError({ step: 'details', q: 2 }, prefs, typed, today) ?? '', /Choose a suggestion/);
  assert.match(submissionError(prefs, typed, today) ?? '', /Choose a suggestion/);
  assert.equal(submissionError({ ...prefs, area: 'Newtown' }, { ...typed, locationQuery: 'Newtown' }, today), null);
  assert.equal(planningPreferences(prefs, { ...typed, locationQuery: '' }, today).area, 'Anywhere in Sydney');
});
test('blank and out of range budget do not advance, while free and fractional AUD amounts do', () => {
  for (const budgetInput of ['', ' ', '201', '-1', 'eighty']) assert.match(questionError({ step: 'details', q: 3 }, defaultDraft(), { ...defaultOnboarding(), budgetInput }) ?? '', /\$0 to \$200/);
  for (const budgetInput of ['0', '40.50', '200']) assert.equal(questionError({ step: 'details', q: 3 }, defaultDraft(), { ...defaultOnboarding(), budgetInput }), null);
});
test('an omitted age is optional and profile choices never change planning preferences', () => {
  const prefs = defaultDraft();
  assert.equal(questionError({ step: 'about', q: 0 }, prefs, { ...defaultOnboarding(), ageInput: '' }), null);
  for (const ageInput of ['17', '101', '24.5']) assert.match(questionError({ step: 'about', q: 0 }, prefs, { ...defaultOnboarding(), ageInput }) ?? '', /whole age/);
  assert.deepEqual(planningPreferences(prefs, defaultOnboarding()).preferences, planningPreferences({ ...prefs, age: 80, gender: 'woman' }, defaultOnboarding()).preferences);
});
test('optional sections can be skipped without losing the dining question or stranding the journey', () => {
  assert.deepEqual(nextQuestion({ step: 'details', q: 3 }), { step: 'vibes', q: 0 });
  assert.deepEqual(nextQuestion({ step: 'details', q: 5 }, true), { step: 'details', q: 6 });
  assert.deepEqual(nextQuestion({ step: 'details', q: 6 }, true), { step: 'details', q: 7 });
  assert.deepEqual(nextQuestion({ step: 'vibes', q: 1 }), { step: 'vibes', q: 3 });
  assert.deepEqual(nextQuestion({ step: 'food', q: 0 }, true), { step: 'food', q: 1 });
  assert.equal(nextQuestion({ step: 'notes', q: 0 }), null);
});
