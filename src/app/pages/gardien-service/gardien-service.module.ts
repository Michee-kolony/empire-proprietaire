import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { GardienShellModule } from '../../components/gardien-shell/gardien-shell.module';
import { GardienServicePageRoutingModule } from './gardien-service-routing.module';
import { GardienServicePage } from './gardien-service.page';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, GardienShellModule, GardienServicePageRoutingModule],
  declarations: [GardienServicePage]
})
export class GardienServicePageModule {}
