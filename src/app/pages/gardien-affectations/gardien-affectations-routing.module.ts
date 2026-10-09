import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { GardienAffectationsPage } from './gardien-affectations.page';

const routes: Routes = [{ path: '', component: GardienAffectationsPage }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class GardienAffectationsPageRoutingModule {}
