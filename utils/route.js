/** Decode a URL route parameter without allowing malformed or oversized values into page state. */
function decodeRouteParam(value, maxLength = 128) {
  if (typeof value !== 'string' || !value) return ''
  try {
    const decoded = decodeURIComponent(value)
    if (!decoded || /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/.test(decoded)) return ''
    const normalized = decoded.trim()
    if (!normalized || Array.from(normalized).length > maxLength) return ''
    return normalized
  } catch (e) {
    return ''
  }
}

module.exports = { decodeRouteParam }
