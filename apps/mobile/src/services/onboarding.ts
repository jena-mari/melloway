import { areas, sydneyToday, validatePreferences, type Preferences } from '@melloway/domain';

export const onboardingSteps = ['profile', 'about', 'details', 'vibes', 'food', 'notes'] as const;
export type OnboardingStep = typeof onboardingSteps[number];
export interface Question { step: OnboardingStep; q: number }
/** Extra answers are retained separately until the newer curation provider is migrated. */
export interface OnboardingAnswers {
  ageInput: string | null;
  budgetInput: string | null;
  date: string | null;
  time: string | null;
  timeExplicit: boolean;
  occasion: 'a date' | 'just friends' | 'family';
  locationQuery: string | null;
  idea: string;
  ideaExplicit: boolean;
  diningVibes: string[];
  notes: string;
}
export const defaultOnboarding = (): OnboardingAnswers => ({
  ageInput: null, budgetInput: null, date: null, time: null, timeExplicit: false,
  occasion: 'a date', locationQuery: null, idea: '', ideaExplicit: false,
  diningVibes: [], notes: '',
});
export const ideas = [
  { id: 'market-matcha', title: 'flea market + matcha', drawing: 'market' },
  { id: 'vintage-photos', title: 'vintage finds + cute photos', drawing: 'camera' },
  { id: 'books-coffee', title: 'bookshop browsing + coffee', drawing: 'books' },
  { id: 'art-picnic', title: 'a little art + a picnic', drawing: 'picnic' },
] as const;
export const hangoutOptions = ['Flea markets', 'Thrifting', 'Vintage stores', 'Matcha cafés', 'Coffee shops', 'Jazz bars', 'Speakeasies', 'Cocktail bars', 'Live music', 'Beaches', 'Bookshops', 'Art galleries'];
export const foodOptions = ['Asian food', 'Italian food', 'Café food', 'Brunch', 'Dinner', 'Fine dining', 'Desserts', 'Street food'];
export const activityOptions = ['Escape rooms', 'Music festivals', 'Arcades', 'Museums', 'Photo spots', 'Photo booths', 'Picnics', 'Shopping', 'Scenic walks'];
export const diningOptions = ['Chill', 'Cozy', 'Lively', 'Outdoors', 'Fancy'];

export function readQuestion(step?: string, q?: string): Question {
  const section = onboardingSteps.find(s => s === step) ?? 'profile';
  const last = section === 'about' || section === 'food' ? 1 : section === 'details' ? 8 : section === 'vibes' ? 3 : 0;
  return { step: section, q: Math.min(last, Math.max(0, Math.floor(Number(q)) || 0)) };
}
export function questionTrail(value?: string): Question[] {
  return (value ?? '').split(',').slice(-32).flatMap(entry => {
    const [step, q] = entry.split('.');
    return onboardingSteps.some(s => s === step) && /^\d$/.test(q ?? '') ? [readQuestion(step, q)] : [];
  });
}
export function previousQuestion({ step, q }: Question): Question | null {
  if (q > 0) return { step, q: q - 1 };
  const previous: Record<OnboardingStep, Question | null> = {
    profile: null, about: { step: 'profile', q: 0 }, details: { step: 'about', q: 1 },
    vibes: { step: 'details', q: 3 }, food: { step: 'vibes', q: 0 }, notes: { step: 'food', q: 1 },
  };
  return previous[step];
}
export function nextQuestion({ step, q }: Question, skipped = false): Question | null {
  if (skipped) {
    if (step === 'food' && q === 0 || step === 'details' && (q === 5 || q === 6)) return { step, q: q + 1 };
  } else {
    if (step === 'vibes' && q === 1) return { step, q: 3 };
    if ((step === 'about' || step === 'food') && q < 1 || step === 'details' && (q < 3 || q >= 4 && q < 8) || step === 'vibes' && q > 0 && q < 3) return { step, q: q + 1 };
  }
  const next = onboardingSteps[onboardingSteps.indexOf(step) + 1];
  return next ? { step: next, q: 0 } : null;
}
export function budgetIsValid(value: string): boolean {
  return !!value.trim() && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 200;
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validTime(value: string): boolean { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }
export function onboardingDate(prefs: Preferences, answers: OnboardingAnswers, today = sydneyToday()): string {
  return answers.date ?? (prefs.date < today ? today : prefs.date);
}
export function questionError(question: Question, prefs: Preferences, answers: OnboardingAnswers, today = sydneyToday()): string | null {
  if (question.step === 'about' && question.q === 0) {
    const age = answers.ageInput ?? String(prefs.age);
    if (age.trim() && (!Number.isInteger(Number(age)) || Number(age) < 18 || Number(age) > 100)) return 'Enter a whole age between 18 and 100.';
  }
  if (question.step === 'details') {
    if (question.q === 2 && answers.locationQuery?.trim() && answers.locationQuery !== prefs.area) return 'Choose a suggestion, or leave it open to anywhere in Sydney.';
    if (question.q === 3 && !budgetIsValid(answers.budgetInput ?? String(prefs.budget))) return 'Enter an amount from $0 to $200 AUD per person.';
    const day = onboardingDate(prefs, answers, today);
    if (question.q === 5 && day && (!validDate(day) || day < today)) return 'Pick today or a future date.';
    const time = answers.time ?? prefs.time;
    if (question.q === 6 && time && !validTime(time)) return 'Choose a valid starting time.';
  }
  return null;
}
/** Preserve the current planner's contract, with optional dates/times resolved at submission. */
export function planningPreferences(prefs: Preferences, answers: OnboardingAnswers, today = sydneyToday()): Preferences {
  const age = answers.ageInput ?? String(prefs.age);
  const budget = answers.budgetInput ?? String(prefs.budget);
  const day = onboardingDate(prefs, answers, today);
  const time = answers.time ?? prefs.time;
  return { ...prefs,
    age: age.trim() && Number.isInteger(Number(age)) && Number(age) >= 18 && Number(age) <= 100 ? Number(age) : prefs.age,
    budget: budgetIsValid(budget) ? Number(budget) : 80,
    date: day || today, time: time || '11:00',
    area: answers.locationQuery === null || answers.locationQuery.trim() ? prefs.area : 'Anywhere in Sydney',
  };
}
export function submissionError(prefs: Preferences, answers: OnboardingAnswers, today = sydneyToday()): string | null {
  const unresolved = questionError({ step: 'details', q: 2 }, prefs, answers, today);
  return unresolved || validatePreferences(planningPreferences(prefs, answers, today), today);
}
export function localAreas(query: string): string[] {
  const term = query.trim().toLowerCase();
  return Object.keys(areas).filter(name => name !== 'Anywhere in Sydney' && (!term || name.toLowerCase().includes(term)));
}
