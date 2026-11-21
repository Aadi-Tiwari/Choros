export function PageBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-black">
      <video
        src="/jungle-loop.mp4"
        poster="/jungle-portal.png"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-black/55" />
    </div>
  )
}
