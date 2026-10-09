import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { GardienUrgencePage } from './gardien-urgence.page';

const routes: Routes = [{ path: '', component: GardienUrgencePage }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class GardienUrgencePageRoutingModule {}
