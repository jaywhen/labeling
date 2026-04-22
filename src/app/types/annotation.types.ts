export type ToolMode = 'pan' | 'rect' | 'polygon';
export type AnnotationType = 'rect' | 'polygon';

export interface StoredAnnotation {
  type: AnnotationType;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  points?: number[];
}

export interface AnnotationRecord {
  imageIndex: number;
  annotations: StoredAnnotation[];
}
