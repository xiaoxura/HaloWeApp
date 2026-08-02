// mp-html 标签默认样式。页面 wxss 无法穿透组件，文章与 Moment 详情共用这一份排版契约。
const tagStyle = Object.freeze({
  h1: 'font-size:38rpx;font-weight:700;margin:44rpx 0 20rpx;padding-bottom:16rpx;line-height:1.4;color:#1a1a1a;border-bottom:1rpx solid #eef1f5;',
  h2: 'font-size:34rpx;font-weight:700;margin:40rpx 0 18rpx;padding-left:20rpx;line-height:1.4;color:#1a1a1a;border-left:8rpx solid #1e80ff;border-radius:2rpx;',
  h3: 'font-size:31rpx;font-weight:600;margin:32rpx 0 14rpx;line-height:1.45;color:#2a2a2a;',
  h4: 'font-size:28rpx;font-weight:600;margin:26rpx 0 12rpx;line-height:1.5;color:#4a4a4a;',
  h5: 'font-size:26rpx;font-weight:600;margin:22rpx 0 10rpx;line-height:1.5;color:#5a5a5a;',
  h6: 'font-size:24rpx;font-weight:600;margin:20rpx 0 10rpx;line-height:1.5;color:#6a6a6a;',
  p: 'margin:0 0 24rpx;line-height:1.8;',
  blockquote:
    'margin:24rpx 0;padding:20rpx 28rpx;background:#f7f8fa;' +
    'border-left:6rpx solid #d6dae1;border-radius:0 20rpx 20rpx 0;color:#666;',
  ul: 'margin:0 0 24rpx 4rpx;padding-left:36rpx;',
  ol: 'margin:0 0 24rpx 4rpx;padding-left:36rpx;',
  li: 'margin-bottom:8rpx;line-height:1.8;',
  hr: 'border:none;border-top:1rpx solid #e5e7eb;margin:36rpx 0;',
  a: 'color:#1e80ff;text-decoration:underline;text-decoration-color:rgba(30,128,255,0.4);text-underline-offset:6rpx;',
  code: 'font-family:Consolas,Menlo,monospace;font-size:24rpx;',
  img: 'max-width:100%;border-radius:20rpx;margin:24rpx 0;',
  table: 'border-collapse:collapse;font-size:24rpx;',
  th: 'background:#f5f7fa;font-weight:600;padding:16rpx 24rpx;text-align:left;border:1rpx solid #e5e6eb;',
  td: 'padding:16rpx 24rpx;border:1rpx solid #f0f1f3;'
})

module.exports = { tagStyle }
