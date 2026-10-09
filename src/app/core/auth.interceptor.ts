import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { ProprietaireAuthService } from '../services/proprietaire-auth.service';

// Ajoute « Authorization: Bearer <token> » aux appels de l'API et gère l'expiration
// du token (24 h) : sur un 401, la session est effacée et le propriétaire renvoyé vers la connexion.
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) return next(req);

  const auth = inject(ProprietaireAuthService);
  const token = auth.token;
  const requete = token && !req.headers.has('Authorization')
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(requete).pipe(
    catchError((error: unknown) => {
      // Pas de token envoyé (ex. mauvais mot de passe au login) : ce n'est pas une expiration
      if (token && error instanceof HttpErrorResponse && error.status === 401) {
        void auth.expirerSession();
      }
      return throwError(() => error);
    })
  );
};
