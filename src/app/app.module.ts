// src/app/app.module.ts

import { NgModule, inject, provideAppInitializer } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { IonicModule, IonicRouteStrategy } from '@ionic/angular';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './core/auth.interceptor';
import { ProprietaireAuthService } from './services/proprietaire-auth.service';
import { SharedModule } from './components/shared.module';

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule,
    IonicModule.forRoot(),
    AppRoutingModule,
    SharedModule
  ],
  providers: [
    {
      provide: RouteReuseStrategy,
      useClass: IonicRouteStrategy
    },
    provideHttpClient(withInterceptors([authInterceptor])),
    // Session lue depuis @capacitor/preferences avant la première navigation
    provideAppInitializer(() => inject(ProprietaireAuthService).init())
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
