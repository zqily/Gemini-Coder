import { useState, useCallback } from 'react';
import type { PersonaSettings, CustomPersona } from '../../types';

const PERSONA_SETTINGS_KEY = 'gemini-persona-settings-v2';

export const DEFAULT_GENERAL_PERSONA: CustomPersona = {
  id: 'default-general',
  title: 'Default Assistant',
  instruction: "You are a helpful assistant. Help with whatever the user needs in a friendly and efficient manner.",
};

export const DEFAULT_CODER_PERSONA: CustomPersona = {
  id: 'default-coder',
  title: 'Default Coder',
  instruction: "You are a world-class programmer. Your primary purpose is to help the user with their code by generating high-quality, clean, and efficient solutions.",
};


const getInitialSettings = (): PersonaSettings => {
  try {
    const storedValue = localStorage.getItem(PERSONA_SETTINGS_KEY);
    if (storedValue) {
        return JSON.parse(storedValue);
    }
  } catch (error) {
    console.error('Failed to retrieve persona settings:', error);
  }
  // Default state
  return { 
    generalPersonaId: 'default-general',
    coderPersonaId: 'default-coder',
    customGeneralPersonas: [],
    customCoderPersonas: [],
  };
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
