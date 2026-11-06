import { File } from 'expo-file-system';

const isLocalFile = (uri: string): boolean => /^(file|content):\/\//i.test(uri);

/** Read original file bytes directly, including bundled App Review examples. */
export async function readRosterImageBase64(uri: string): Promise<string> {
  if (isLocalFile(uri)) return new File(uri).base64();

  // Existing schedules may reopen with a signed HTTPS storage URL.
  const response = await fetch(uri);
  if (!response.ok) throw new Error('Unable to load roster image');
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string' || !result.includes(',')) {
        reject(new Error('Unable to read roster image'));
        return;
      }
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read roster image'));
    reader.onabort = () => reject(new Error('Roster image reading was cancelled'));
    reader.readAsDataURL(blob);
  });
}
