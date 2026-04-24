import SpiralLoader from './Loader'

export default function LoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6">
      <SpiralLoader />
    </div>
  )
}
