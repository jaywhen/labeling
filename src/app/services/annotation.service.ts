import { Injectable } from '@angular/core';
import Konva from 'konva';

import { ANNOTATION_DB_CONFIG, POLYGON_STYLE, RECT_STYLE } from '../const';
import { AnnotationRecord, StoredAnnotation } from '../types/annotation.types';

@Injectable({
  providedIn: 'root'
})
export class AnnotationService {
  private readonly dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = this.initDB();
  }

  async saveAnnotations(
    imageIndex: number,
    contentGroup: Konva.Group,
    imageNode: Konva.Image | undefined,
    polygonPreview: Konva.Line | undefined,
    drawingRect: Konva.Rect | undefined
  ): Promise<void> {
    const annotations = this.serializeAnnotations(contentGroup, imageNode, polygonPreview, drawingRect);
    const payload: AnnotationRecord = { imageIndex, annotations };
    const db = await this.dbPromise;
    await this.putRecord(db, payload);
  }

  async restoreAnnotations(imageIndex: number, contentGroup: Konva.Group, layer: Konva.Layer): Promise<void> {
    const db = await this.dbPromise;
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
          ...RECT_STYLE
        });
        contentGroup.add(rect);
      }

      if (item.type === 'polygon') {
        const polygon = new Konva.Line({
          points: item.points ?? [],
          closed: true,
          ...POLYGON_STYLE
        });
        contentGroup.add(polygon);
      }
    });

    layer.batchDraw();
  }

  private serializeAnnotations(
    contentGroup: Konva.Group,
    imageNode: Konva.Image | undefined,
    polygonPreview: Konva.Line | undefined,
    drawingRect: Konva.Rect | undefined
  ): StoredAnnotation[] {
    const nodes = contentGroup.getChildren((node) => node !== imageNode);
    const result: StoredAnnotation[] = [];

    nodes.forEach((node) => {
      if (node === polygonPreview || node === drawingRect) {
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

  private initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(ANNOTATION_DB_CONFIG.name, ANNOTATION_DB_CONFIG.version);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(ANNOTATION_DB_CONFIG.storeName)) {
          db.createObjectStore(ANNOTATION_DB_CONFIG.storeName, { keyPath: 'imageIndex' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open indexedDB'));
    });
  }

  private putRecord(db: IDBDatabase, payload: AnnotationRecord): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ANNOTATION_DB_CONFIG.storeName, 'readwrite');
      const store = tx.objectStore(ANNOTATION_DB_CONFIG.storeName);
      store.put(payload);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to save annotations'));
    });
  }

  private getRecord(db: IDBDatabase, imageIndex: number): Promise<AnnotationRecord | undefined> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ANNOTATION_DB_CONFIG.storeName, 'readonly');
      const store = tx.objectStore(ANNOTATION_DB_CONFIG.storeName);
      const request = store.get(imageIndex);

      request.onsuccess = () => resolve(request.result as AnnotationRecord | undefined);
      request.onerror = () => reject(request.error ?? new Error('Failed to load annotations'));
    });
  }
}
