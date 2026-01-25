import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

// Import messages directly for fallback
import enMessages from '../../_locales/en/messages.json';
import zhCNMessages from '../../_locales/zh_CN/messages.json';

type Messages = Record<string, { message: string; placeholders?: Record<string, { content: string }> }>;

@Injectable({
  providedIn: 'root',
})
export class I18nService {
  private messages: Messages = enMessages;
  private currentLanguage = new BehaviorSubject<string>('auto');

  // Available languages
  readonly languages = [
    { code: 'auto', name: 'Auto (Browser)' },
    { code: 'en', name: 'English' },
    { code: 'zh_CN', name: '简体中文' },
  ];

  private messagesMap: Record<string, Messages> = {
    en: enMessages,
    zh_CN: zhCNMessages,
  };

  constructor() {
    this.setLanguage('auto');
  }

  /**
   * Set the current language
   * @param lang Language code ('auto', 'en', 'zh_CN', etc.)
   */
  setLanguage(lang: string) {
    this.currentLanguage.next(lang);

    if (lang === 'auto') {
      // Use browser language
      const browserLang = this.getBrowserLanguage();
      this.messages = this.messagesMap[browserLang] || enMessages;
    } else {
      this.messages = this.messagesMap[lang] || enMessages;
    }
  }

  /**
   * Get the browser's UI language
   */
  private getBrowserLanguage(): string {
    try {
      if (typeof chrome !== 'undefined' && chrome.i18n) {
        const uiLang = chrome.i18n.getUILanguage();
        // Convert browser language to our format (e.g., 'zh-CN' -> 'zh_CN')
        const normalized = uiLang.replace('-', '_');
        if (this.messagesMap[normalized]) {
          return normalized;
        }
        // Try base language (e.g., 'zh' from 'zh_CN')
        const baseLang = normalized.split('_')[0];
        if (this.messagesMap[baseLang]) {
          return baseLang;
        }
      }
    } catch (e) {
      console.warn('i18n: Failed to get browser language', e);
    }
    return 'en';
  }

  /**
   * Get localized message by key
   * @param key Message key from messages.json
   * @param substitutions Optional substitution values for placeholders
   * @returns Localized message string
   */
  getMessage(key: string, substitutions?: string | string[]): string {
    const entry = this.messages[key];
    if (!entry) {
      // Fallback to key itself
      return key;
    }

    let message = entry.message;

    // Handle substitutions (e.g., $COUNT$ -> value)
    if (substitutions && entry.placeholders) {
      const subs = Array.isArray(substitutions) ? substitutions : [substitutions];
      Object.entries(entry.placeholders).forEach(([name, placeholder]) => {
        const match = placeholder.content.match(/\$(\d+)/);
        if (match) {
          const index = parseInt(match[1], 10) - 1;
          if (subs[index] !== undefined) {
            message = message.replace(
              new RegExp(`\\$${name.toUpperCase()}\\$`, 'g'),
              subs[index]
            );
          }
        }
      });
    }

    return message;
  }

  /**
   * Shorthand for getMessage
   */
  t(key: string, substitutions?: string | string[]): string {
    return this.getMessage(key, substitutions);
  }

  /**
   * Get current language code
   */
  getCurrentLanguage(): string {
    return this.currentLanguage.value;
  }

  /**
   * Get current UI language (resolved, not 'auto')
   */
  getResolvedLanguage(): string {
    if (this.currentLanguage.value === 'auto') {
      return this.getBrowserLanguage();
    }
    return this.currentLanguage.value;
  }
}
