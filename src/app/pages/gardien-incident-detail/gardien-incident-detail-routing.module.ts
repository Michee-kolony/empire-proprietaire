import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { GardienIncidentDetailPage } from './gardien-incident-detail.page';

const routes: Routes = [{ path: '', component: GardienIncidentDetailPage }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class GardienIncidentDetailPageRoutingModule {}
