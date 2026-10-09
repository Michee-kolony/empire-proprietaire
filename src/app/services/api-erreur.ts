import { HttpErrorResponse } from '@angular/common/http';

// Erreur renvoyée par l'API : { success: false, message, ...détails }
// On garde le code HTTP et le corps pour les cas particuliers
// (ex. 400 « Aucun service prévu » avec prochainsServices).
export class ApiErreur extends Error {
  constructor(message: string, public statut: number, public corps: any = null) {
    super(message);
  }
}

export function versApiErreur(error: unknown): ApiErreur {
  if (error instanceof ApiErreur) return error;
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return new ApiErreur('Pas de connexion internet ou serveur injoignable, réessayez.', 0);
    }
    const message = error.error?.message || 'Une erreur est survenue. Veuillez réessayer.';
    return new ApiErreur(message, error.status, error.error);
  }
  return new ApiErreur((error as Error)?.message || 'Une erreur est survenue. Veuillez réessayer.', -1);
}
