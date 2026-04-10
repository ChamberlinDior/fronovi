import { Platform } from 'react-native';

export function getDeviceInfo() {
  return `ExpoGo/${Platform.OS}`;
}
