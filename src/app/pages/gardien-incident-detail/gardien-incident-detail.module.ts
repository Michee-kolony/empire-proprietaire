import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { GardienShellModule } from '../../components/gardien-shell/gardien-shell.module';
import { GardienIncidentDetailPageRoutingModule } from './gardien-incident-detail-routing.module';
import { GardienIncidentDetailPage } from './gardien-incident-detail.page';

@NgModule({
  imports: [CommonModule, IonicModule, GardienShellModule, GardienIncidentDetailPageRoutingModule],
  declarations: [GardienIncidentDetailPage]
})
export class GardienIncidentDetailPageModule {}
