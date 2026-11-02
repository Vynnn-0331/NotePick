export function Arrow({ direction = 'right', ...props }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {direction === 'up' ? <path d="M5 11 12 4l7 7M12 4v16" /> : direction === 'left' ? <path d="m11 5-7 7 7 7M4 12h16" /> : <path d="m13 5 7 7-7 7M20 12H4" />}
  </svg>;
}

export function LaptopPlaceholder({ compact = false }) {
  return <div className={`laptop-placeholder ${compact ? 'compact' : ''}`} role="img" aria-label="笔记本产品图片占位">
    <svg viewBox="0 0 260 170" fill="none" aria-hidden="true">
      <rect x="43" y="24" width="174" height="112" rx="8" fill="#f4f4f4" stroke="currentColor" strokeWidth="1.5" />
      <rect x="50" y="31" width="160" height="98" rx="3" fill="#e4e4e4" />
      <path d="M43 136 20 147c-2 1-1 5 2 5h216c3 0 4-4 2-5l-23-11H43Z" fill="#f4f4f4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M106 137h48l-5 5h-38l-5-5Z" stroke="currentColor" strokeWidth="1.2" />
    </svg>
    {!compact && <span>PRODUCT IMAGE · 占位图</span>}
  </div>;
}
