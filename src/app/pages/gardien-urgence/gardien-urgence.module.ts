import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { GardienUrgencePageRoutingModule } from './gardien-urgence-routing.module';
import { GardienUrgencePage } from './gardien-urgence.page';

@NgModule({
  imports: [CommonModule, IonicModule, GardienUrgencePageRoutingModule],
  declarations: [GardienUrgencePage]
})
export class GardienUrgencePageModule {}
