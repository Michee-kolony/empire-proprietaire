import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../components/shared.module';
import { GardienDetailPage } from './gardien-detail.page';

@NgModule({
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: GardienDetailPage }])],
  declarations: [GardienDetailPage]
})
export class GardienDetailPageModule {}
