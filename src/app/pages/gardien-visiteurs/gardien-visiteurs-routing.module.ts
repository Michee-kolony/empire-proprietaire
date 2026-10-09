import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { GardienVisiteursPage } from './gardien-visiteurs.page';

const routes: Routes = [{ path: '', component: GardienVisiteursPage }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class GardienVisiteursPageRoutingModule {}
