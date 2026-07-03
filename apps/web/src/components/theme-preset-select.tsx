"use client";

import { activeWebTheme, webThemePresets, type WebThemePresetValue } from "@cell-journey/theme/web";
import { useEffect, useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STORAGE_KEY = "cell-journey-web-theme";

function isThemePreset(value: string | null): value is WebThemePresetValue {
  return webThemePresets.some((preset) => preset.value === value);
}

function applyThemePreset(value: WebThemePresetValue) {
  document.documentElement.dataset.cjTheme = value;
}

export function ThemePresetSelect() {
  const [theme, setTheme] = useState<WebThemePresetValue>(activeWebTheme);

  useEffect(() => {
    const storedTheme = localStorage.getItem(STORAGE_KEY);
    const nextTheme = isThemePreset(storedTheme) ? storedTheme : activeWebTheme;
    setTheme(nextTheme);
    applyThemePreset(nextTheme);
  }, []);

  function changeTheme(value: string) {
    if (!isThemePreset(value)) return;

    setTheme(value);
    applyThemePreset(value);
    localStorage.setItem(STORAGE_KEY, value);
  }

  return (
    <Select value={theme} onValueChange={changeTheme}>
      <SelectTrigger
        aria-label="Theme preset"
        className="h-10 w-44 border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground ring-offset-primary hover:bg-primary-foreground/15 focus:ring-primary-foreground/40 [&>svg]:text-primary-foreground"
      >
        <SelectValue placeholder="Theme" />
      </SelectTrigger>
      <SelectContent align="end">
        {webThemePresets.map((preset) => (
          <SelectItem key={preset.value} value={preset.value}>
            {preset.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
