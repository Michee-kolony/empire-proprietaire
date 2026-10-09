import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../components/shared.module';
import { ProprieteDetailPage } from './propriete-detail.page';

@NgModule({
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: ProprieteDetailPage }])],
  declarations: [ProprieteDetailPage]
})
export class ProprieteDetailPageModule {}
