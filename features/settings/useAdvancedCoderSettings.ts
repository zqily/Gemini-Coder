import { useState, useCallback } from 'react';
import type { AdvancedCoderSettings } from '../../types';

const ADVANCED_CODER_SETTINGS_KEY = 'gemini-advanced-coder-settings';

const getInitialSettings = (): AdvancedCoderSettings => {
  try {
    const storedValue = localStorage.getItem(ADVANCED_CODER_SETTINGS_KEY);
    if (storedValue) {
        const parsed = JSON.parse(storedValue);
        // Validate phaseCount
        if ([3, 6, 9, 12].includes(parsed.phaseCount)) {
            return parsed;
        }
    }
  } catch (error) {
    console.error('Failed to retrieve advanced coder settings:', error);
  }
  return { phaseCount: 6 };
};

export const useAdvancedCoderSettings = (): [AdvancedCoderSettings, (settings: AdvancedCoderSettings) => void] => {
  const [settings, setSettings] = useState<AdvancedCoderSettings>(getInitialSettings);

  const saveSettings = useCallback((newSettings: AdvancedCoderSettings) => {
    try {
      setSettings(newSettings);
      localStorage.setItem(ADVANCED_CODER_SETTINGS_KEY, JSON.stringify(newSettings));
    } catch (error) {
      console.error('Failed to save advanced coder settings:', error);
    }
  }, []);

  return [settings, saveSettings];
};
