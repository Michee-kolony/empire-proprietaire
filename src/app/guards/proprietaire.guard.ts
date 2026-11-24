import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ProprietaireAuthService } from '../services/proprietaire-auth.service';

// Pages de l'espace propriétaire : connexion propriétaire obligatoire (un locataire va dans son espace)
export const proprietaireGuard: CanActivateFn = () => {
  const auth = inject(ProprietaireAuthService);
  if (auth.espace === 'proprietaire') return true;
  return inject(Router).createUrlTree([auth.espace === 'locataire' ? '/locataire/accueil' : '/login']);
};

// Pages de l'espace locataire : connexion locataire obligatoire
export const locataireGuard: CanActivateFn = () => {
  const auth = inject(ProprietaireAuthService);
  if (auth.espace === 'locataire') return true;
  return inject(Router).createUrlTree([auth.espace === 'proprietaire' ? '/proprietaire/accueil' : '/login']);
};

// Page de connexion : déjà connecté -> accueil de son espace
export const visiteurGuard: CanActivateFn = () => {
  const auth = inject(ProprietaireAuthService);
  return auth.isLoggedIn ? inject(Router).createUrlTree([auth.accueil]) : true;
};
