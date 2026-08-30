// Placeholder backdrop standing in for a real blurred market-stall photo — this
// project doesn't yet have an actual photo asset checked in. To use a real one,
// drop it at src/renderer/src/assets/market-bg.jpg and swap the div below for
// `<div className="absolute inset-0 -z-10 bg-cover bg-center blur-2xl scale-110" style={{ backgroundImage: 'url(/src/assets/market-bg.jpg)' }} />`.
export function MarketBackdrop() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-stone-900">
      <div
        className="absolute inset-0 scale-125"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 380px 260px at 12% 18%, #d97706e6, transparent 62%),
            radial-gradient(ellipse 420px 300px at 42% 12%, #ca8a04e6, transparent 62%),
            radial-gradient(ellipse 360px 260px at 70% 20%, #92400ee6, transparent 62%),
            radial-gradient(ellipse 400px 280px at 94% 16%, #b45309e6, transparent 62%),
            radial-gradient(ellipse 420px 300px at 18% 58%, #a16207e6, transparent 62%),
            radial-gradient(ellipse 380px 260px at 52% 66%, #854d0ee6, transparent 62%),
            radial-gradient(ellipse 400px 280px at 86% 62%, #ca8a04e6, transparent 62%),
            radial-gradient(ellipse 500px 320px at 28% 100%, #78350fe6, transparent 62%),
            radial-gradient(ellipse 500px 320px at 78% 96%, #92400ee6, transparent 62%)
          `,
          filter: 'blur(70px) saturate(120%)',
        }}
      />
      <div className="absolute inset-0 bg-slate-950/35" />
    </div>
  )
}
