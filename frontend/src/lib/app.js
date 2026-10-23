// True inside the Moonlight Android app (its WebView adds "MoonlightApp/<version>" to the user agent).
export const IN_APP = typeof navigator !== 'undefined' && /\bMoonlightApp\//.test(navigator.userAgent || '');
