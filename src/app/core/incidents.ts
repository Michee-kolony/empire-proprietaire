// Affichage des incidents : icône par type. Les types eux-mêmes viennent de
// GET /api/incidents/options ; on reconnaît l'icône à un mot-clé de la valeur.

const ICONES: [string, string][] = [
  ['intrusion', 'log-in-outline'],
  ['vol', 'bag-remove-outline'],
  ['incendie', 'flame-outline'],
  ['feu', 'flame-outline'],
  ['accident', 'car-outline'],
  ['suspect', 'eye-outline'],
  ['technique', 'construct-outline'],
  ['panne', 'construct-outline'],
  ['medical', 'medkit-outline'],
  ['sante', 'medkit-outline'],
  ['bagarre', 'people-outline'],
  ['agression', 'people-outline']
];

export function iconeIncident(type: string | null | undefined): string {
  const valeur = (type || '').toLowerCase();
  return ICONES.find(([cle]) => valeur.includes(cle))?.[1] ?? 'alert-circle-outline';
}

// Lien Google Maps si la position est connue
export function lienMaps(position: { lat: number | null; lng: number | null } | null | undefined): string {
  if (position?.lat === null || position?.lat === undefined || position.lng === null || position.lng === undefined) return '';
  return `https://www.google.com/maps?q=${position.lat},${position.lng}`;
}
