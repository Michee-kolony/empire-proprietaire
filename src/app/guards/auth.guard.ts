import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { GardienAuthService } from '../services/gardien-auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(GardienAuthService);
  const router = inject(Router);

  if (auth.isLoggedIn) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
