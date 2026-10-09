// Outils communs aux cartes Leaflet (OpenStreetMap)

// Centre par défaut quand aucune position n'est connue : Kinshasa
export const CENTRE_PAR_DEFAUT: [number, number] = [-4.3217, 15.3125];

// Même rayon que le backend (PRESENCE_RAYON_ZONE_METRES) : au-delà, le gardien est « hors zone »
export const RAYON_ZONE_METRES = 200;

// Tuiles OpenStreetMap (sans clé API), assombries en CSS via la classe « pr-tuiles-sombres »
export const TUILES_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TUILES_OPTIONS = { maxZoom: 19, className: 'pr-tuiles-sombres' };
export const TUILES_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// Distance en mètres entre deux points GPS (formule de haversine, comme le backend)
export function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (degres: number) => (degres * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)));
}

// Actualisation automatique des positions et des statuts sur les cartes du propriétaire
export const ACTUALISATION_CARTE_MS = 10000;

type PointGps = { lat: number | null; lng: number | null } | null | undefined;

// Le gardien n'apparaît sur la carte que pendant son service (pointage d'arrivée -> pointage de départ) :
// le backend garde sa dernière position après son départ, elle ne doit plus être affichée
export function gardienVisible(statut: string | null | undefined, position: PointGps): boolean {
  return statut === 'en service' && position?.lat != null && position?.lng != null;
}

// En service mais à plus de 200 m de toutes les propriétés données
export function gardienHorsZone(position: PointGps, proprietes: { lat: number | null; lng: number | null }[]): boolean {
  if (position?.lat == null || position?.lng == null) return false;
  const ici = { lat: position.lat, lng: position.lng };
  return !proprietes.some(p => p.lat != null && p.lng != null
    && distanceMetres(ici, { lat: p.lat, lng: p.lng }) <= RAYON_ZONE_METRES);
}

// 85 -> « 85 m » ; 1530 -> « 1,5 km »
export function distanceLabel(metres: number | null | undefined): string {
  if (metres === null || metres === undefined) return '—';
  if (metres < 1000) return `${metres} m`;
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(metres / 1000)} km`;
}

// « à l'instant », « il y a 12 min », « il y a 3 h », « il y a 2 j »
export function depuisLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'à l\'instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  return `il y a ${Math.round(heures / 24)} j`;
}

// Texte inséré dans le HTML d'un marqueur ou d'une infobulle Leaflet
export function echapperHtml(texte: string | null | undefined): string {
  return String(texte ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c] as string));
}

// URL utilisable dans un style CSS url('…')
export function urlCss(url: string | null | undefined): string {
  return String(url ?? '').replace(/['"()\\\s<>]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
}
