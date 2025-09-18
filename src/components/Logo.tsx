const logoPath = '/logo.svg'

export default function Logo({ width = 160, height = 40, alt = 'zerotrust-jobs', className = '' }: { width?: number; height?: number; alt?: string; className?: string }) {
  return (
    <img src={logoPath} width={width} height={height} alt={alt} className={className} />
  )
} 