import { useState } from 'react';
import localImages from 'virtual:notepick-local-images';
import { LaptopPlaceholder } from './Icons';

export default function ProductImage({ image, productId, name, compact = false }) {
  const [failedImage, setFailedImage] = useState(null);
  image=localImages[productId];
  const allowed = typeof image === 'string' && image.startsWith('/product-images/');
  if (!allowed || failedImage === image) return <LaptopPlaceholder compact={compact} />;
  return <div className={`laptop-placeholder ${compact ? 'compact' : ''}`}><img loading="lazy" decoding="async" referrerPolicy="no-referrer" src={image} alt={name} onError={() => setFailedImage(image)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /></div>;
}
