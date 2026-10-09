// Mise en forme des dates de la messagerie (heure locale du téléphone)

const FORMAT_HEURE = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const FORMAT_DATE = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
const FORMAT_JOUR = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

function memeJour(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function hier(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

// Liste des conversations : « 14:32 », « Hier », « 03/10/26 »
export function dateConversation(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (memeJour(date, new Date())) return FORMAT_HEURE.format(date);
  if (memeJour(date, hier())) return 'Hier';
  return FORMAT_DATE.format(date);
}

// Séparateur dans une discussion : « Aujourd'hui », « Hier », « lundi 6 octobre »
export function jourMessage(iso: string): string {
  const date = new Date(iso);
  if (memeJour(date, new Date())) return 'Aujourd\'hui';
  if (memeJour(date, hier())) return 'Hier';
  return FORMAT_JOUR.format(date);
}

export function heureMessage(iso: string): string {
  return FORMAT_HEURE.format(new Date(iso));
}

// Clé de regroupement par jour local
export function cleJour(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
