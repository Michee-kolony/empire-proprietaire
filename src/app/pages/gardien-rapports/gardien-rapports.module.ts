import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { GardienShellModule } from '../../components/gardien-shell/gardien-shell.module';
import { GardienRapportsPageRoutingModule } from './gardien-rapports-routing.module';
import { GardienRapportsPage } from './gardien-rapports.page';

@NgModule({
  imports: [CommonModule, IonicModule, GardienShellModule, GardienRapportsPageRoutingModule],
  declarations: [GardienRapportsPage]
})
export class GardienRapportsPageModule {}
