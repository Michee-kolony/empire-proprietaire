import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { GardienShellModule } from '../../components/gardien-shell/gardien-shell.module';
import { GardienIncidentsPageRoutingModule } from './gardien-incidents-routing.module';
import { GardienIncidentsPage } from './gardien-incidents.page';

@NgModule({
  imports: [CommonModule, RouterModule, IonicModule, GardienShellModule, GardienIncidentsPageRoutingModule],
  declarations: [GardienIncidentsPage]
})
export class GardienIncidentsPageModule {}
