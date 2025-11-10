import { useState, useCallback } from 'react';
import type { PersonaSettings } from '../../types';

const PERSONA_SETTINGS_KEY = 'gemini-persona-settings';

const getInitialSettings = (): PersonaSettings => {
  try {
    const storedValue = localStorage.getItem(PERSONA_SETTINGS_KEY);
    if (storedValue) {
        return JSON.parse(storedValue);
    }
  } catch (error) {
    console.error('Failed to retrieve persona settings:', error);
  }
  return { persona: 'default', customInstruction: '' };
};

export const usePersonaSettings = (): [PersonaSettings, (settings: PersonaSettings) => void] => {
  const [settings, setSettings] = useState<PersonaSettings>(getInitialSettings);

  const saveSettings = useCallback((newSettings: PersonaSettings) => {
    try {
      setSettings(newSettings);
      localStorage.setItem(PERSONA_SETTINGS_KEY, JSON.stringify(newSettings));
    } catch (error) {
      console.error('Failed to save persona settings:', error);
    }
  }, []);

  return [settings, saveSettings];
};