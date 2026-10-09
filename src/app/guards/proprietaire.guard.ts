import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ProprietaireAuthService } from '../services/proprietaire-auth.service';

// Pages de l'espace propriétaire : connexion obligatoire
export const proprietaireGuard: CanActivateFn = () => {
  const auth = inject(ProprietaireAuthService);
  return auth.isLoggedIn ? true : inject(Router).createUrlTree(['/login']);
};

// Page de connexion : déjà connecté -> accueil
export const visiteurGuard: CanActivateFn = () => {
  const auth = inject(ProprietaireAuthService);
  return auth.isLoggedIn ? inject(Router).createUrlTree(['/proprietaire/accueil']) : true;
};
