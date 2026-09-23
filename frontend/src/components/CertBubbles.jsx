// CertBubbles.jsx — Re-exports ShowcaseSpotlight for backwards compatibility
import ShowcaseSpotlight from './ShowcaseSpotlight'

export default function CertBubbles({ certs, onClose }) {
  return <ShowcaseSpotlight items={certs} onClose={onClose} />
}
