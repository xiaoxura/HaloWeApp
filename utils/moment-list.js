function validMoment(item) {
  return item && typeof item === 'object' && typeof item.name === 'string' && item.name.length > 0
}

/** 按 metadata.name 对分页结果稳定去重；先到的数据保留原顺序。 */
function mergeMomentsByName(existing, incoming) {
  const result = []
  const names = new Set()
  ;[...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])].forEach(
    (item) => {
      if (!validMoment(item) || names.has(item.name)) return
      names.add(item.name)
      result.push(item)
    }
  )
  return result
}

function buildMomentListParams(page, size, tag) {
  const params = {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    size: Number.isInteger(size) && size > 0 ? size : 20,
    sort: ['spec.releaseTime,desc']
  }
  if (typeof tag === 'string' && tag.trim()) params.tag = tag.trim()
  return params
}

module.exports = {
  mergeMomentsByName,
  buildMomentListParams
}
