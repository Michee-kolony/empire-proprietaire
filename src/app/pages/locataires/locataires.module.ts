import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../components/shared.module';
import { LocatairesPage } from './locataires.page';

@NgModule({
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: LocatairesPage }])],
  declarations: [LocatairesPage]
})
export class LocatairesPageModule {}
