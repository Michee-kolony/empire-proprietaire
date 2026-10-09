import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { GardienShellModule } from '../../components/gardien-shell/gardien-shell.module';
import { GardienIncidentNouveauPageRoutingModule } from './gardien-incident-nouveau-routing.module';
import { GardienIncidentNouveauPage } from './gardien-incident-nouveau.page';

@NgModule({
  imports: [CommonModule, IonicModule, GardienShellModule, GardienIncidentNouveauPageRoutingModule],
  declarations: [GardienIncidentNouveauPage]
})
export class GardienIncidentNouveauPageModule {}
