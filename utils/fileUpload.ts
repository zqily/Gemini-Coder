// File handling utilities

export const NATIVELY_SUPPORTED_MIME_TYPES = [
  'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif',
  'text/plain', 'text/html', 'text/css', 'text/javascript', 'application/x-javascript',
  'text/x-typescript', 'application/x-typescript', 'text/csv', 'text/markdown',
  'text/x-python', 'application/x-python-code', 'application/json', 'text/xml', 'application/rtf',
  'application/pdf'
];

// A map of text-based MIME types to convert to 'text/plain' for wider compatibility
export const CONVERTIBLE_TO_TEXT_MIME_TYPES: Record<string, string> = {
    'image/svg+xml': 'text/plain',
    'application/x-sh': 'text/plain',
    'text/x-c': 'text/plain',
    'text/x-csharp': 'text/plain',
    'text/x-c++': 'text/plain',
    'text/x-java-source': 'text/plain',
    'text/x-php': 'text/plain',
    'text/x-ruby': 'text/plain',
    'text/x-go': 'text/plain',
    'text/rust': 'text/plain',
    'application/toml': 'text/plain',
    'text/yaml': 'text/plain',
};

export const ALL_ACCEPTED_MIME_TYPES = [...NATIVELY_SUPPORTED_MIME_TYPES, ...Object.keys(CONVERTIBLE_TO_TEXT_MIME_TYPES)];

export const fileToDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
};