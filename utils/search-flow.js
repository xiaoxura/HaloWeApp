const { MOMENT_TYPE } = require('./adapters/search')

/**
 * Resolve the optional Moment branch without making it part of the search
 * request's failure boundary. Article hits remain usable when runtime config
 * or capability probing is unavailable.
 *
 * @param {object} response Search API response
 * @param {object} deps Runtime/capability functions
 * @returns {Promise<boolean>} whether Moment hits may be included
 */
async function resolveMomentSearchOption(response, deps) {
  const hits = response && Array.isArray(response.hits) ? response.hits : []
  const hasMomentHit = hits.some((hit) => hit && hit.type === MOMENT_TYPE)
  if (!hasMomentHit) return false

  try {
    await deps.runtimeReady()
    if (!deps.canReadMoments()) return false
    return (await deps.momentsAvailable()) === true
  } catch (err) {
    // Moment is optional; a failed config/capability check must not erase posts.
    return false
  }
}

module.exports = {
  resolveMomentSearchOption
}
