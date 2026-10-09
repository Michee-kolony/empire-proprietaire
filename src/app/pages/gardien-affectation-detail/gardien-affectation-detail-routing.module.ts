import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { GardienAffectationDetailPage } from './gardien-affectation-detail.page';

const routes: Routes = [{ path: '', component: GardienAffectationDetailPage }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class GardienAffectationDetailPageRoutingModule {}
