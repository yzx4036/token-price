export function sitePath(path = ''): string {
  const base = import.meta.env.BASE_URL;
  const cleanPath = path.replace(/^\/+|\/+$/g, '');
  return cleanPath ? `${base}${cleanPath}/` : base;
}
