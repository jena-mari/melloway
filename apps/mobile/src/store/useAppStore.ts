import AsyncStorage from '@react-native-async-storage/async-storage';
import { defaultDraft, type GenerationBundle, type Itinerary, type Preferences } from '@melloway/domain';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { defaultOnboarding, type OnboardingAnswers } from '../services/onboarding';

interface AppState {
  draft: Preferences;
  onboarding: OnboardingAnswers;
  current: GenerationBundle | null;
  saved: Itinerary[];
  hydrated: boolean;
  status: string;
  update: (values: Partial<Preferences>) => void;
  updateOnboarding: (values: Partial<OnboardingAnswers>) => void;
  setCurrent: (bundle: GenerationBundle) => void;
  save: (plan: Itinerary) => void;
  remove: (id: string) => void;
  setStatus: (message: string) => void;
}

// AsyncStorage works on iOS/Android and through its web implementation in preview.
// Draft, current result and favourites stay device-local for this milestone.
const storage = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: async (key: string, value: string) => {
    try { await AsyncStorage.setItem(key, value); }
    catch {
      const status = 'Device storage unavailable. Keep the app open to retain this plan.';
      // Zustand persists status changes too; guard against a repeated failed-write loop.
      if (useAppStore.getState().status !== status) useAppStore.setState({ status });
    }
  },
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};
export const useAppStore = create<AppState>()(persist((set) => ({
  draft: defaultDraft(), onboarding: defaultOnboarding(), current: null, saved: [], hydrated: false, status: '',
  update: values => set(state => ({ draft: { ...state.draft, ...values } })),
  updateOnboarding: values => set(state => ({ onboarding: { ...state.onboarding, ...values } })),
  setCurrent: current => set({ current }),
  setStatus: status => set({ status }),
  save: plan => set(state => ({
    saved: state.saved.some(p => p.id === plan.id) ? state.saved : [plan, ...state.saved],
    status: 'Saved on this device.',
  })),
  remove: id => set(state => ({ saved: state.saved.filter(p => p.id !== id), status: 'Removed from saved plans.' })),
}), {
  name: 'melloway.mobile.v1', version: 1,
  storage: createJSONStorage(() => storage, {
    replacer: (key, value) => key === 'minutes' && value === Infinity ? 'unreachable' : value,
    reviver: (key, value) => key === 'minutes' && value === 'unreachable' ? Infinity : value,
  }),
  partialize: state => ({ draft: state.draft, onboarding: state.onboarding, current: state.current, saved: state.saved }),
  merge: (persisted, current) => {
    const saved = persisted as Partial<AppState> | undefined;
    return { ...current, ...saved, onboarding: { ...defaultOnboarding(), ...saved?.onboarding } };
  },
  onRehydrateStorage: () => (_state, error) => {
    useAppStore.setState({ hydrated: true, ...(error ? { status: 'Could not restore device storage. You can still make a plan.' } : {}) });
  },
}));
