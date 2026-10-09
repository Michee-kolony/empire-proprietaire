// Mise en forme pour l'affichage (heure locale du téléphone, format français).
// Aucune règle métier ici : retards, durées et statuts viennent du serveur.

const FORMAT_HEURE = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const FORMAT_DATE = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const FORMAT_JOUR = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

// ISO UTC -> 'HH:mm' local
export function heureLocale(iso: string | null | undefined): string {
  return iso ? FORMAT_HEURE.format(new Date(iso)) : '—';
}

// ISO UTC -> 'JJ/MM/AAAA' local
export function dateLocale(iso: string | null | undefined): string {
  return iso ? FORMAT_DATE.format(new Date(iso)) : '—';
}

// ISO UTC -> 'JJ/MM/AAAA HH:mm' local
export function dateHeureLocale(iso: string | null | undefined): string {
  return iso ? `${FORMAT_DATE.format(new Date(iso))} ${FORMAT_HEURE.format(new Date(iso))}` : '—';
}

// 'AAAA-MM-JJ' (jour de service) -> « lundi 3 mars »
export function jourLabel(jour: string): string {
  const [a, m, j] = (jour || '').split('-').map(Number);
  return a ? FORMAT_JOUR.format(new Date(a, m - 1, j)) : '';
}

// 'AAAA-MM-JJ' -> 'JJ/MM/AAAA'
export function jourCourt(jour: string): string {
  const [a, m, j] = (jour || '').split('-');
  return a ? `${j}/${m}/${a}` : '';
}

// Date locale -> 'AAAA-MM-JJ' (paramètres du/au de l'API)
export function jourIso(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

// 705 -> « 11 h 45 » ; 40 -> « 40 min »
export function dureeLabel(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h === 0 ? `${m} min` : `${h} h ${String(m).padStart(2, '0')}`;
}

export function heuresLabel(heures: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(heures)} h`;
}

// 'HH:mm' -> '18h00'
export function heureAffectation(heure: string | null | undefined): string {
  return heure ? heure.replace(':', 'h') : '';
}

export function roleLabel(role: string | null | undefined): string {
  return role === 'principal' ? 'Principal' : 'Remplaçant';
}

export function nomComplet(p: { prenom?: string; nom?: string; postnom?: string } | null | undefined): string {
  if (!p) return '';
  return [p.prenom, p.nom, p.postnom].filter(Boolean).join(' ');
}

export function adresse(p: { avenue?: string; numero?: string; quartier?: string; commune?: string } | null | undefined): string {
  if (!p) return '';
  return [[p.avenue, p.numero].filter(Boolean).join(' '), p.quartier, p.commune].filter(Boolean).join(', ');
}

// Numéro utilisable dans un lien tel:
export function lienTel(numero: string | null | undefined): string {
  return numero ? `tel:${numero.replace(/[^\d+]/g, '')}` : '';
}
