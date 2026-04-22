export const IMAGE_URLS = [
  'https://raw.githubusercontent.com/jaywhen/data-annotation/main/src/assets/image/cat.png',
  'https://raw.githubusercontent.com/jaywhen/data-annotation/main/src/assets/image/cat1.jpeg',
  'https://raw.githubusercontent.com/jaywhen/data-annotation/main/src/assets/image/cat2.jpg',
  'https://raw.githubusercontent.com/jaywhen/data-annotation/main/src/assets/image/cat3.jpg'
] as const;

export const ANNOTATION_DB_CONFIG = {
  name: 'annotation-cache',
  version: 1,
  storeName: 'annotations'
} as const;

export const RECT_STYLE = {
  stroke: '#ff4d4f',
  strokeWidth: 2
} as const;

export const POLYGON_STYLE = {
  stroke: '#1e90ff',
  fill: 'rgba(30,144,255,0.25)',
  strokeWidth: 2
} as const;
