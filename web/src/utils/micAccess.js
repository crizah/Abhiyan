// Chrome/Firefox/Edge on iOS run in Apple's WKWebView, which never shows its own
// in-page microphone prompt. Access is gated by the OS-level toggle at
// Settings -> [Browser] -> Microphone; if it's off, getUserMedia rejects with
// NotAllowedError immediately, with no prompt ever shown.
const IOS_UA_RE = /iPhone|iPad|iPod/;
const IOS_BROWSER_NAMES = [
  [/CriOS/, 'Chrome'],
  [/FxiOS/, 'Firefox'],
  [/EdgiOS/, 'Edge'],
];

export function getMicErrorMessage(err) {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
    return "Voice recording isn't available in this browser.";
  }

  const ua = navigator.userAgent || '';
  const iosBrowser = IOS_UA_RE.test(ua) && IOS_BROWSER_NAMES.find(([re]) => re.test(ua));
  if (err?.name === 'NotAllowedError' && iosBrowser) {
    const [, name] = iosBrowser;
    return `${name} needs microphone access. Go to iPhone Settings → ${name} → Microphone and turn it on, then reload this page.`;
  }

  return 'Microphone access denied.';
}
