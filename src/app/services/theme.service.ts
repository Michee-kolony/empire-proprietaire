import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type Theme = 'clair' | 'sombre';

const THEME_KEY = 'es_theme';

// Mode clair / sombre de toute l'application.
// Tant que l'utilisateur n'a rien choisi, on suit le réglage du téléphone.
// Le thème est aussi appliqué par un script dans index.html avant le démarrage d'Angular (évite un flash).
@Injectable({ providedIn: 'root' })
export class ThemeService {

  private systeme = window.matchMedia('(prefers-color-scheme: dark)');
  private readonly etat = new BehaviorSubject<Theme>(this.lireChoix() ?? this.themeSysteme());
  readonly theme$ = this.etat.asObservable();

  constructor() {
    this.appliquer(this.etat.value);
    this.systeme.addEventListener('change', () => {
      if (!this.lireChoix()) this.definir(this.themeSysteme(), false);
    });
  }

  get sombre(): boolean {
    return this.etat.value === 'sombre';
  }

  basculer(): void {
    this.definir(this.sombre ? 'clair' : 'sombre');
  }

  private definir(theme: Theme, memoriser = true): void {
    if (memoriser) {
      try { localStorage.setItem(THEME_KEY, theme); } catch { /* stockage indisponible : thème non mémorisé */ }
    }
    this.appliquer(theme);
    this.etat.next(theme);
  }

  private appliquer(theme: Theme): void {
    const html = document.documentElement;
    // « dark » : variables de l'app et Tailwind ; « ion-palette-dark » : composants Ionic (alertes, selects…)
    html.classList.toggle('dark', theme === 'sombre');
    html.classList.toggle('ion-palette-dark', theme === 'sombre');
    html.style.colorScheme = theme === 'sombre' ? 'dark' : 'light';
  }

  private lireChoix(): Theme | null {
    try {
      const v = localStorage.getItem(THEME_KEY);
      return v === 'clair' || v === 'sombre' ? v : null;
    } catch {
      return null;
    }
  }

  private themeSysteme(): Theme {
    return this.systeme.matches ? 'sombre' : 'clair';
  }
}
