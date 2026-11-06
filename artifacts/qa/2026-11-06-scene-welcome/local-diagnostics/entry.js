// Temporary localhost-only QA diagnostics. No file paths or image bytes are logged.
require('react-native');
const originalFetch = global.fetch;
const mark = (phase) => { void originalFetch('http://127.0.0.1:55439/qa/phase/' + phase).catch(() => {}); };
function wrap(obj, method, tag) {
  if (!obj || typeof obj[method] !== 'function') return;
  const original = obj[method];
  obj[method] = function (...args) {
    mark(tag + '-begin');
    const result = original.apply(this, args);
    if (result && typeof result.then === 'function') {
      result.then(() => mark(tag + '-done'), () => mark(tag + '-error'));
    }
    return result;
  };
}
if (global.FileReader) {
  const read = global.FileReader.prototype.readAsDataURL;
  global.FileReader.prototype.readAsDataURL = function (...args) {
    mark('filereader-begin');
    this.addEventListener('loadend', () => mark('filereader-loadend'));
    this.addEventListener('error', () => mark('filereader-error'));
    return read.apply(this, args);
  };
}
global.fetch = function (...args) {
  const uri = String(args[0]?.url || args[0] || '');
  const isLocalImage = !/^https?:/.test(uri);
  if (isLocalImage) mark('image-fetch-begin');
  const promise = originalFetch.apply(this, args);
  if (!isLocalImage) return promise;
  return promise.then((response) => {
    mark('image-fetch-complete');
    wrap(response, 'blob', 'image-blob');
    return response;
  }, (error) => { mark('image-fetch-error'); throw error; });
};
require('../../../../apps/mobile/tests/native-reliability.entry.js');
