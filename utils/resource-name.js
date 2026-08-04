// Halo metadata.name 进入 tracker、详情路由和本地状态前的共同门槛。
// 该约束与客户端 tracker 的主体字段保持一致，异常名称直接降级为不可导航。
const RESOURCE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.-]{0,127}$/

function safeResourceName(value) {
  if (typeof value !== 'string') return ''
  const name = value.trim()
  return RESOURCE_NAME_PATTERN.test(name) ? name : ''
}

module.exports = {
  RESOURCE_NAME_PATTERN,
  safeResourceName
}
