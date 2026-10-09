import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { GardienShellModule } from '../../components/gardien-shell/gardien-shell.module';
import { GardienHistoriquePageRoutingModule } from './gardien-historique-routing.module';
import { GardienHistoriquePage } from './gardien-historique.page';

@NgModule({
  imports: [CommonModule, IonicModule, GardienShellModule, GardienHistoriquePageRoutingModule],
  declarations: [GardienHistoriquePage]
})
export class GardienHistoriquePageModule {}
