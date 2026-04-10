import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { apiRequest } from '../api/client';

export function useDriverGps(enabled: boolean) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [gpsState, setGpsState] = useState<'idle' | 'running' | 'denied'>('idle');
  const [lastPosition, setLastPosition] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setGpsState('idle');
      return;
    }

    const start = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGpsState('denied');
        return;
      }

      const pushLocation = async () => {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const payload = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        setLastPosition(payload);
        await apiRequest('/driver/location', {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
      };

      await pushLocation();
      setGpsState('running');
      timerRef.current = setInterval(() => {
        pushLocation().catch(() => {});
      }, 30000);
    };

    start().catch(() => setGpsState('idle'));

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled]);

  return { gpsState, lastPosition };
}
