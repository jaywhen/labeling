import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import Konva from 'konva';

type ToolMode = 'pan' | 'rect' | 'polygon';
type AnnotationType = 'rect' | 'polygon';

interface StoredAnnotation {
  type: AnnotationType;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  points?: number[];
}

interface AnnotationRecord {
  imageIndex: number;
  annotations: StoredAnnotation[];
}

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
  mode: ToolMode = 'pan';

  private readonly dbName = 'annotation-cache';
  private readonly dbVersion = 1;
  private readonly storeName = 'annotations';
  private dbPromise?: Promise<IDBDatabase>;

  private stage!: Konva.Stage;
  private layer!: Konva.Layer;
  private contentGroup!: Konva.Group;
  private imageNode?: Konva.Image;

  private drawingRect?: Konva.Rect;
  private polygonPoints: number[] = [];
  private polygonPreview?: Konva.Line;

  ngAfterViewInit(): void {
    this.dbPromise = this.initDB();

    this.stage = new Konva.Stage({
      container: this.stageHost.nativeElement,
      width: this.stageHost.nativeElement.clientWidth,
      height: 760,
      draggable: true
    });

    this.layer = new Konva.Layer();
    this.contentGroup = new Konva.Group({ x: 0, y: 0 });
    this.layer.add(this.contentGroup);
    this.stage.add(this.layer);

    this.registerEvents();
    this.loadImage(0);
    this.updateStageDragState();
  }

  ngOnDestroy(): void {
    this.stage?.destroy();
  }

  switchImage(index: number): void {
    this.currentIndex = index;
    this.clearCurrentDrawingState();
    this.loadImage(index);
  }

  setMode(mode: ToolMode): void {
    this.mode = mode;
    this.clearCurrentDrawingState();
    this.updateStageDragState();
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

      const oldScale = this.stage.scaleX();
      const pointer = this.stage.getPointerPosition();
      if (!pointer) {
        return;
      }

      const zoomFactor = 1.05;
      const direction = event.evt.deltaY > 0 ? -1 : 1;
      const nextScale = direction > 0 ? oldScale * zoomFactor : oldScale / zoomFactor;
      const clampedScale = Math.max(0.2, Math.min(4, nextScale));

      const mousePointTo = {
        x: (pointer.x - this.stage.x()) / oldScale,
        y: (pointer.y - this.stage.y()) / oldScale
      };

      this.stage.scale({ x: clampedScale, y: clampedScale });
      this.stage.position({
        x: pointer.x - mousePointTo.x * clampedScale,
        y: pointer.y - mousePointTo.y * clampedScale
      });
      this.stage.batchDraw();
    });

    this.stage.on('mousedown', (event) => {
      if (this.mode !== 'rect' || !this.imageNode) {
        return;
      }
      if (event.target !== this.imageNode) {
        return;
      }

      const pointer = this.getPointerInContent();
      if (!pointer) {
        return;
      }

      this.drawingRect = new Konva.Rect({
        x: pointer.x,
        y: pointer.y,
        width: 0,
        height: 0,
        stroke: '#ff4d4f',
        strokeWidth: 2
      });
      this.contentGroup.add(this.drawingRect);
      this.layer.batchDraw();
    });

    this.stage.on('mousemove', () => {
      if (this.mode === 'polygon' && this.polygonPreview) {
        const pointer = this.getPointerInContent();
        if (!pointer) {
          return;
        }
        this.polygonPreview.points([...this.polygonPoints, pointer.x, pointer.y]);
        this.layer.batchDraw();
        return;
      }

      if (this.mode !== 'rect' || !this.drawingRect) {
        return;
      }

      const pointer = this.getPointerInContent();
      if (!pointer) {
        return;
      }

      this.drawingRect.width(pointer.x - this.drawingRect.x());
      this.drawingRect.height(pointer.y - this.drawingRect.y());
      this.layer.batchDraw();
    });

    this.stage.on('mouseup', () => {
      if (this.mode !== 'rect' || !this.drawingRect) {
        return;
      }

      const minSize = 3;
      if (Math.abs(this.drawingRect.width()) < minSize || Math.abs(this.drawingRect.height()) < minSize) {
        this.drawingRect.destroy();
      }
      this.drawingRect = undefined;
      this.layer.batchDraw();
      void this.saveAnnotationsForCurrentImage();
    });

    this.stage.on('click', (event) => {
      if (this.mode !== 'polygon' || !this.imageNode) {
        return;
      }
      if (event.target !== this.imageNode && event.target !== this.polygonPreview) {
        return;
      }

      const pointer = this.getPointerInContent();
      if (!pointer) {
        return;
      }

      this.polygonPoints.push(pointer.x, pointer.y);
      if (!this.polygonPreview) {
        this.polygonPreview = new Konva.Line({
          points: [...this.polygonPoints],
          stroke: '#1e90ff',
          strokeWidth: 2,
          closed: false
        });
        this.contentGroup.add(this.polygonPreview);
      } else {
        this.polygonPreview.points([...this.polygonPoints]);
      }
      this.layer.batchDraw();
    });

    this.stage.on('dblclick', () => {
      if (this.mode !== 'polygon' || this.polygonPoints.length < 6 || !this.polygonPreview) {
        return;
      }

      this.polygonPreview.destroy();
      const polygon = new Konva.Line({
        points: [...this.polygonPoints],
        stroke: '#1e90ff',
        fill: 'rgba(30,144,255,0.25)',
        strokeWidth: 2,
        closed: true
      });
      this.contentGroup.add(polygon);

      this.polygonPoints = [];
      this.polygonPreview = undefined;
      this.layer.batchDraw();
      void this.saveAnnotationsForCurrentImage();
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

      this.contentGroup.destroyChildren();
      this.imageNode = new Konva.Image({
        image: img,
        x: 0,
        y: 0,
        width: img.width * fitScale,
        height: img.height * fitScale
      });
      this.contentGroup.add(this.imageNode);

      this.polygonPoints = [];
      this.polygonPreview = undefined;
      this.drawingRect = undefined;

      this.stage.position({ x: 0, y: 0 });
      this.stage.scale({ x: 1, y: 1 });
      this.layer.draw();
      void this.restoreAnnotations(index);
    };
  }

  private clearCurrentDrawingState(): void {
    this.polygonPoints = [];
    this.polygonPreview?.destroy();
    this.polygonPreview = undefined;
    this.drawingRect = undefined;
  }

  private updateStageDragState(): void {
    this.stage.draggable(this.mode === 'pan');
  }

  private getPointerInContent(): Konva.Vector2d | null {
    const pointer = this.contentGroup.getRelativePointerPosition();
    if (!pointer || !this.imageNode) {
      return null;
    }

    const withinImage =
      pointer.x >= this.imageNode.x() &&
      pointer.y >= this.imageNode.y() &&
      pointer.x <= this.imageNode.x() + this.imageNode.width() &&
      pointer.y <= this.imageNode.y() + this.imageNode.height();

    return withinImage ? pointer : null;
  }

  private initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'imageIndex' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open indexedDB'));
    });
  }

  private async saveAnnotationsForCurrentImage(): Promise<void> {
    const db = await this.dbPromise;
    if (!db) {
      return;
    }

    const annotations = this.serializeAnnotations();
    const payload: AnnotationRecord = {
      imageIndex: this.currentIndex,
      annotations
    };

    await this.putRecord(db, payload);
  }

  private serializeAnnotations(): StoredAnnotation[] {
    const nodes = this.contentGroup.getChildren((node) => node !== this.imageNode);
    const result: StoredAnnotation[] = [];

    nodes.forEach((node) => {
      if (node === this.polygonPreview || node === this.drawingRect) {
        return;
      }

      if (node instanceof Konva.Rect) {
        result.push({
          type: 'rect',
          x: node.x(),
          y: node.y(),
          width: node.width(),
          height: node.height()
        });
      }

      if (node instanceof Konva.Line && node.closed()) {
        result.push({
          type: 'polygon',
          points: node.points()
        });
      }
    });

    return result;
  }

  private async restoreAnnotations(imageIndex: number): Promise<void> {
    const db = await this.dbPromise;
    if (!db) {
      return;
    }

    const record = await this.getRecord(db, imageIndex);
    if (!record?.annotations?.length) {
      return;
    }

    record.annotations.forEach((item) => {
      if (item.type === 'rect') {
        const rect = new Konva.Rect({
          x: item.x ?? 0,
          y: item.y ?? 0,
          width: item.width ?? 0,
          height: item.height ?? 0,
          stroke: '#ff4d4f',
          strokeWidth: 2
        });
        this.contentGroup.add(rect);
      }

      if (item.type === 'polygon') {
        const polygon = new Konva.Line({
          points: item.points ?? [],
          stroke: '#1e90ff',
          fill: 'rgba(30,144,255,0.25)',
          strokeWidth: 2,
          closed: true
        });
        this.contentGroup.add(polygon);
      }
    });

    this.layer.batchDraw();
  }

  private putRecord(db: IDBDatabase, payload: AnnotationRecord): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.put(payload);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to save annotations'));
    });
  }

  private getRecord(db: IDBDatabase, imageIndex: number): Promise<AnnotationRecord | undefined> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(imageIndex);

      request.onsuccess = () => resolve(request.result as AnnotationRecord | undefined);
      request.onerror = () => reject(request.error ?? new Error('Failed to load annotations'));
    });
  }
}
