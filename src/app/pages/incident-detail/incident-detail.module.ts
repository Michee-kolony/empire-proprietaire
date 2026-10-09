import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../components/shared.module';
import { IncidentDetailPage } from './incident-detail.page';

@NgModule({
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: IncidentDetailPage }])],
  declarations: [IncidentDetailPage]
})
export class IncidentDetailPageModule {}
