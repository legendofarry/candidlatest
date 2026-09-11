// Local storage service for caching and persistence
const CACHE_PREFIX = "candid_";
const CACHE_EXPIRY_KEY = (key: string) => `${CACHE_PREFIX}${key}_expiry`;
const CACHE_VALUE_KEY = (key: string) => `${CACHE_PREFIX}${key}`;

interface CacheOptions {
  expiryMinutes?: number; // Default: 60 minutes
}

export const storageService = {
  /**
   * Set a value in local storage with optional expiry
   */
  set<T>(key: string, value: T, options?: CacheOptions): void {
    try {
      const expiryMinutes = options?.expiryMinutes ?? 60;
      const now = Date.now();
      const expiry = now + expiryMinutes * 60 * 1000;

      localStorage.setItem(CACHE_VALUE_KEY(key), JSON.stringify(value));
      localStorage.setItem(CACHE_EXPIRY_KEY(key), expiry.toString());
    } catch (error) {
      console.warn(`[storageService] Failed to set ${key}:`, error);
    }
  },

  /**
   * Get a value from local storage (returns null if expired or not found)
   */
  get<T>(key: string): T | null {
    try {
      const expiry = localStorage.getItem(CACHE_EXPIRY_KEY(key));
      
      // Check if expired
      if (expiry && Date.now() > parseInt(expiry)) {
        storageService.remove(key);
        return null;
      }

      const value = localStorage.getItem(CACHE_VALUE_KEY(key));
      return value ? JSON.parse(value) as T : null;
    } catch (error) {
      console.warn(`[storageService] Failed to get ${key}:`, error);
      return null;
    }
  },

  /**
   * Remove a value from local storage
   */
  remove(key: string): void {
    try {
      localStorage.removeItem(CACHE_VALUE_KEY(key));
      localStorage.removeItem(CACHE_EXPIRY_KEY(key));
    } catch (error) {
      console.warn(`[storageService] Failed to remove ${key}:`, error);
    }
  },

  /**
   * Clear all candid-prefixed cache
   */
  clearCache(): void {
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX));
      keys.forEach((k) => localStorage.removeItem(k));
    } catch (error) {
      console.warn("[storageService] Failed to clear cache:", error);
    }
  },

  /**
   * Get all cached keys
   */
  getAllKeys(): string[] {
    try {
      return Object.keys(localStorage)
        .filter((k) => k.startsWith(CACHE_PREFIX) && !k.endsWith("_expiry"))
        .map((k) => k.replace(CACHE_PREFIX, ""));
    } catch (error) {
      console.warn("[storageService] Failed to get keys:", error);
      return [];
    }
  },
};

/**
 * React hook for persisted state with local storage
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  options?: CacheOptions
): [T, (value: T) => void] {
  const [state, setState] = React.useState<T>(() => {
    const stored = storageService.get<T>(key);
    return stored ?? initialValue;
  });

  const setValue = (value: T) => {
    setState(value);
    storageService.set(key, value, options);
  };

  return [state, setValue];
}

import React from "react";
