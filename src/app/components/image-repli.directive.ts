import { Directive, ElementRef, HostListener, Input, OnChanges } from '@angular/core';

const REPLIS = {
  avatar: 'assets/gardien/avatar.svg',
  propriete: 'assets/gardien/propriete.svg'
};

// <img [gdImage]="url" gdRepli="propriete"> : image de remplacement si l'URL est vide ou en erreur
@Directive({
  selector: "img[gdImage]",
  standalone: false
})
export class ImageRepliDirective implements OnChanges {

  @Input() gdImage: string | null | undefined;
  @Input() gdRepli: keyof typeof REPLIS = 'propriete';

  constructor(private el: ElementRef<HTMLImageElement>) {}

  ngOnChanges(): void {
    this.el.nativeElement.src = this.gdImage || REPLIS[this.gdRepli];
  }

  @HostListener('error')
  onError(): void {
    const repli = REPLIS[this.gdRepli];
    if (!this.el.nativeElement.src.endsWith(repli)) {
      this.el.nativeElement.src = repli;
    }
  }
}
