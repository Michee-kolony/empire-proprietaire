import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../components/shared.module';
import { CartePage } from './carte.page';

@NgModule({
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: CartePage }])],
  declarations: [CartePage]
})
export class CartePageModule {}
