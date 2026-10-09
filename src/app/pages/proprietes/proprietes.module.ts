import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../components/shared.module';
import { ProprietesPage } from './proprietes.page';

@NgModule({
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: ProprietesPage }])],
  declarations: [ProprietesPage]
})
export class ProprietesPageModule {}
