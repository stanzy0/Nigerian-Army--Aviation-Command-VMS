export function isDemoMode(): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
  )
}
