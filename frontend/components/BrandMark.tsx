export default function BrandMark({ className = "size-7" }: { className?: string }) {
  // A bridge arc over a descending pain line: "from high pain toward relief".
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#0f7668" />
      <path d="M5 22 C 10 10, 22 10, 27 22" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M9 22 V18 M16 22 V14 M23 22 V18" stroke="#9ee6da" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 25.5 H27" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
