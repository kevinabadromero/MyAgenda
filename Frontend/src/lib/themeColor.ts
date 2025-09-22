// src/lib/themeColor.ts
export function getThemeColor(): string {
    const m = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    return m?.getAttribute('content') || '#ffffff';
  }
  
  export function setThemeColor(hex: string) {
    let m = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
    m.setAttribute('content', hex);
  }