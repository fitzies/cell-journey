import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

export async function pickProfilePhoto(): Promise<ArrayBuffer | null> {
  // Keep this first: the web picker also needs the original user gesture.
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsMultipleSelection: false, allowsEditing: false,
    quality: 1, exif: false,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  const context = ImageManipulator.manipulate(asset.uri);
  const image = await context.resize(asset.width >= asset.height
    ? { width: Math.min(asset.width, 512) } : { height: Math.min(asset.height, 512) }).renderAsync();
  let uri: string | undefined;
  try {
    const output = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
    uri = output.uri;
    const bytes = Platform.OS === 'web' ? await (await fetch(uri)).arrayBuffer() : await new File(uri).arrayBuffer();
    if (bytes.byteLength > 512 * 1024) throw new Error('This photo is too large. Please choose another image.');
    return bytes;
  } finally {
    image.release();
    context.release();
    if (uri && Platform.OS !== 'web') {
      try { new File(uri).delete(); } catch { /* Cache cleanup must not discard a selected photo. */ }
    }
  }
}
