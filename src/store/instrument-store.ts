/**
 * Instrument Profile Store — Phase 8
 *
 * Manages instrument training data and the KNN classifier.
 * Profiles persist to IDB via instrumentProfiles object store.
 */

import { create } from 'zustand';
import type { InstrumentProfile, InstrumentName, ClassificationResult } from '../analysis/classification';
import { KNNClassifier } from '../analysis/classification';
import type { SpectralFeatures } from '../analysis/types';
import * as db from './db';

export interface InstrumentStoreState {
  /** All instrument profiles */
  profiles: InstrumentProfile[];
  /** Whether profiles have been loaded from IDB */
  loaded: boolean;
  /** The active KNN classifier instance */
  classifier: KNNClassifier;

  // Actions
  loadFromDB: () => Promise<void>;
  addTrainingSamples: (
    instrument: InstrumentName,
    features: SpectralFeatures[],
  ) => Promise<{ accuracy: number }>;
  deleteProfile: (instrument: InstrumentName) => Promise<void>;
  clearAllProfiles: () => Promise<void>;
  classifyOnsets: (features: SpectralFeatures[]) => ClassificationResult[];
  isClassifierReady: () => boolean;
}

export const useInstrumentStore = create<InstrumentStoreState>((set, get) => ({
  profiles: [],
  loaded: false,
  classifier: new KNNClassifier(),

  loadFromDB: async () => {
    try {
      const records = await db.getAllInstrumentProfiles();
      const profiles: InstrumentProfile[] = records.map((r) => ({
        name: r.name as InstrumentName,
        samples: r.samples.map((s) => ({
          features: s.features as SpectralFeatures,
          label: s.label as InstrumentName,
        })),
        accuracy: r.accuracy,
        lastTrained: r.lastTrained,
      }));

      const classifier = new KNNClassifier();
      classifier.loadProfiles(profiles);

      set({ profiles, loaded: true, classifier });
    } catch (err) {
      console.error('Failed to load instrument profiles:', err);
      set({ loaded: true });
    }
  },

  addTrainingSamples: async (instrument, features) => {
    const { profiles, classifier } = get();

    // Find or create profile
    let profile = profiles.find((p) => p.name === instrument);
    if (!profile) {
      profile = {
        name: instrument,
        samples: [],
        accuracy: 0,
        lastTrained: new Date().toISOString(),
      };
    }

    // Add new samples
    const newSamples = features.map((f) => ({
      features: f,
      label: instrument,
    }));
    profile = {
      ...profile,
      samples: [...profile.samples, ...newSamples],
      lastTrained: new Date().toISOString(),
    };

    // Update profiles list
    const updatedProfiles = profiles.filter((p) => p.name !== instrument);
    updatedProfiles.push(profile);

    // Reload classifier and compute accuracy
    classifier.loadProfiles(updatedProfiles);
    const accuracy = classifier.crossValidate(profile.samples);
    profile = { ...profile, accuracy };

    // Persist to IDB
    await db.putInstrumentProfile({
      name: profile.name,
      samples: profile.samples.map((s) => ({
        features: s.features,
        label: s.label,
      })),
      accuracy: profile.accuracy,
      lastTrained: profile.lastTrained,
    });

    // Update final profiles list with accuracy
    const finalProfiles = updatedProfiles.map((p) =>
      p.name === instrument ? profile! : p,
    );

    set({ profiles: finalProfiles, classifier });
    return { accuracy };
  },

  deleteProfile: async (instrument) => {
    const { profiles, classifier } = get();
    const updated = profiles.filter((p) => p.name !== instrument);
    classifier.loadProfiles(updated);
    await db.deleteInstrumentProfile(instrument);
    set({ profiles: updated });
  },

  clearAllProfiles: async () => {
    const { classifier } = get();
    classifier.loadProfiles([]);
    await db.clearAllInstrumentProfiles();
    set({ profiles: [] });
  },

  classifyOnsets: (features) => {
    const { classifier } = get();
    if (!classifier.isReady()) {
      return features.map(() => ({
        label: 'Unknown' as const,
        confidence: 0,
        topCandidates: [],
      }));
    }
    return classifier.classifyAll(features);
  },

  isClassifierReady: () => {
    return get().classifier.isReady();
  },
}));
