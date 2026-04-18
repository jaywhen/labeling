import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import Konva from 'konva';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('stageHost', { static: true }) stageHost!: ElementRef<HTMLDivElement>;

  readonly images = [
    'https://raw.githubusercontent.com/jaywhen/data-annotation/main/src/assets/image/cat.png',
    'https://raw.githubusercontent.com/jaywhen/data-annotation/main/src/assets/image/cat1.jpeg',
    'https://raw.githubusercontent.com/jaywhen/data-annotation/main/src/assets/image/cat2.jpg',
    'https://raw.githubusercontent.com/jaywhen/data-annotation/main/src/assets/image/cat3.jpg'
  ];

  currentIndex = 0;
  mode: 'rect' | 'polygon' = 'rect';

  private stage!: Konva.Stage;
  private imageLayer!: Konva.Layer;
  private drawLayer!: Konva.Layer;
  private imageNode?: Konva.Image;
  private drawingRect?: Konva.Rect;
  private polygonPoints: number[] = [];
  private polygonPreview?: Konva.Line;

  ngAfterViewInit(): void {
    this.stage = new Konva.Stage({
      container: this.stageHost.nativeElement,
      width: this.stageHost.nativeElement.clientWidth,
      height: 760,
      draggable: true
    });

    this.imageLayer = new Konva.Layer();
    this.drawLayer = new Konva.Layer();
    this.stage.add(this.imageLayer);
    this.stage.add(this.drawLayer);

    this.registerEvents();
    this.loadImage(0);
  }

  ngOnDestroy(): void {
    this.stage?.destroy();
  }

  switchImage(index: number): void {
    this.currentIndex = index;
    this.resetDrawState();
    this.loadImage(index);
  }

  setMode(mode: 'rect' | 'polygon'): void {
    this.mode = mode;
    this.resetDrawState();
  }

  zoom(delta: number): void {
    const oldScale = this.stage.scaleX();
    const newScale = Math.max(0.2, Math.min(4, oldScale + delta));
    this.stage.scale({ x: newScale, y: newScale });
    this.stage.batchDraw();
  }

  private registerEvents(): void {
    this.stage.on('wheel', (event) => {
      event.evt.preventDefault();
      const scaleBy = 1.05;
      const oldScale = this.stage.scaleX();
      const pointer = this.stage.getPointerPosition();
      if (!pointer) return;

      const mousePointTo = {
        x: (pointer.x - this.stage.x()) / oldScale,
        y: (pointer.y - this.stage.y()) / oldScale
      };

      const direction = event.evt.deltaY > 0 ? -1 : 1;
      const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
      const clamped = Math.max(0.2, Math.min(4, newScale));
      this.stage.scale({ x: clamped, y: clamped });

      const newPos = {
        x: pointer.x - mousePointTo.x * clamped,
        y: pointer.y - mousePointTo.y * clamped
      };
      this.stage.position(newPos);
      this.stage.batchDraw();
    });

    this.stage.on('mousedown', () => {
      if (this.mode !== 'rect' || !this.imageNode) return;
      const pointer = this.stage.getPointerPosition();
      if (!pointer) return;

      this.drawingRect = new Konva.Rect({
        x: pointer.x,
        y: pointer.y,
        width: 0,
        height: 0,
        stroke: '#ff4d4f',
        strokeWidth: 2
      });
      this.drawLayer.add(this.drawingRect);
    });

    this.stage.on('mousemove', () => {
      if (this.mode !== 'rect' || !this.drawingRect) {
        if (this.mode === 'polygon' && this.polygonPreview) {
          const pointer = this.stage.getPointerPosition();
          if (!pointer) return;
          const points = [...this.polygonPoints, pointer.x, pointer.y];
          this.polygonPreview.points(points);
          this.drawLayer.batchDraw();
        }
        return;
      }

      const pointer = this.stage.getPointerPosition();
      if (!pointer) return;

      const x = this.drawingRect.x();
      const y = this.drawingRect.y();
      this.drawingRect.width(pointer.x - x);
      this.drawingRect.height(pointer.y - y);
      this.drawLayer.batchDraw();
    });

    this.stage.on('mouseup', () => {
      this.drawingRect = undefined;
    });

    this.stage.on('click', () => {
      if (this.mode !== 'polygon') return;
      const pointer = this.stage.getPointerPosition();
      if (!pointer) return;

      this.polygonPoints.push(pointer.x, pointer.y);
      if (!this.polygonPreview) {
        this.polygonPreview = new Konva.Line({
          points: [...this.polygonPoints],
          stroke: '#1e90ff',
          strokeWidth: 2,
          closed: false
        });
        this.drawLayer.add(this.polygonPreview);
      } else {
        this.polygonPreview.points([...this.polygonPoints]);
      }
      this.drawLayer.batchDraw();
    });

    this.stage.on('dblclick', () => {
      if (this.mode !== 'polygon' || this.polygonPoints.length < 6) return;
      this.polygonPreview?.destroy();
      const polygon = new Konva.Line({
        points: [...this.polygonPoints],
        stroke: '#1e90ff',
        fill: 'rgba(30,144,255,0.25)',
        strokeWidth: 2,
        closed: true
      });
      this.drawLayer.add(polygon);
      this.polygonPoints = [];
      this.polygonPreview = undefined;
      this.drawLayer.batchDraw();
    });
  }

  private loadImage(index: number): void {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = this.images[index];
    img.onload = () => {
      this.imageNode?.destroy();

      const fitScale = Math.min(
        this.stage.width() / img.width,
        this.stage.height() / img.height
      );

      this.imageNode = new Konva.Image({
        image: img,
        x: 0,
        y: 0,
        width: img.width * fitScale,
        height: img.height * fitScale
      });
      this.stage.position({ x: 0, y: 0 });
      this.stage.scale({ x: 1, y: 1 });

      this.imageLayer.destroyChildren();
      this.imageLayer.add(this.imageNode);
      this.imageLayer.draw();
      this.drawLayer.destroyChildren();
      this.drawLayer.draw();
    };
  }

  private resetDrawState(): void {
    this.polygonPoints = [];
    this.polygonPreview?.destroy();
    this.polygonPreview = undefined;
    this.drawingRect = undefined;
  }
}
