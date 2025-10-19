export const STORAGE_KEYS = {
  endpoint: 'ldexplorer:endpoint',
  uri: 'ldexplorer:uri',
  class: 'ldexplorer:class',
  theme: 'ldexplorer:theme'
};

export function getStoredValue(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (_err) {
    return null;
  }
}

export function setStoredValue(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (_err) {
    /* ignore storage errors */
  }
}

export function removeStoredValue(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (_err) {
    /* ignore storage errors */
  }
}
