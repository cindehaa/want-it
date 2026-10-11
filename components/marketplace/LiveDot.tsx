/** Pulsing green dot: live state only. */
export default function LiveDot({ size = 7 }: { size?: number }) {
  return <span aria-hidden className="wi-live-dot inline-block shrink-0 rounded-full bg-accent" style={{ width: size, height: size }} />;
}
