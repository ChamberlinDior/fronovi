import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { LinearGradient } from 'expo-linear-gradient';
import { apiRequest, ApiHttpError } from '../api/client';
import { useDriverGps } from '../hooks/useDriverGps';
import { useAuth } from '../context/AuthContext';
import { DriverProfile, PageResponse, RideResponse } from '../types/api';

// ─── Tokens ───────────────────────────────────────────────────────────────────

const C = {
  bg:     '#071120',
  card:   '#0D1B2A',
  card2:  '#10233A',
  border: 'rgba(255,255,255,0.08)',
  text:   '#FFFFFF',
  muted:  '#A9B6C7',
  yellow: '#F5C518',
  green:  '#22C55E',
  red:    '#FF5A5F',
  orange: '#F59E0B',
  shadow: '#000000',
} as const;

const ACTIVE_STATUSES = [
  'DRIVER_ASSIGNED',
  'DRIVER_EN_ROUTE',
  'DRIVER_ARRIVED',
  'IN_PROGRESS',
];

// ─── Custom map style — deep navy/blue Uber-like ──────────────────────────────
const MAP_STYLE = [
  { elementType: 'geometry',            stylers: [{ color: '#0a1628' }] },
  { elementType: 'labels.text.stroke',  stylers: [{ color: '#0a1628' }] },
  { elementType: 'labels.text.fill',    stylers: [{ color: '#4a6fa5' }] },
  { featureType: 'administrative',        elementType: 'geometry',           stylers: [{ color: '#1c2d4a' }] },
  { featureType: 'administrative.country',elementType: 'labels.text.fill',   stylers: [{ color: '#9db7d8' }] },
  { featureType: 'administrative.locality',elementType: 'labels.text.fill',  stylers: [{ color: '#c7d8ed' }] },
  { featureType: 'poi',                   elementType: 'labels.text.fill',   stylers: [{ color: '#4a6fa5' }] },
  { featureType: 'poi',                   elementType: 'geometry',           stylers: [{ color: '#0d1f38' }] },
  { featureType: 'poi.park',              elementType: 'geometry',           stylers: [{ color: '#0b2a1a' }] },
  { featureType: 'poi.park',              elementType: 'labels.text.fill',   stylers: [{ color: '#1a5c32' }] },
  { featureType: 'road',                  elementType: 'geometry',           stylers: [{ color: '#1a2f50' }] },
  { featureType: 'road',                  elementType: 'geometry.stroke',    stylers: [{ color: '#0d1f38' }] },
  { featureType: 'road',                  elementType: 'labels.text.fill',   stylers: [{ color: '#8fa8c8' }] },
  { featureType: 'road.arterial',         elementType: 'geometry',           stylers: [{ color: '#1e3660' }] },
  { featureType: 'road.highway',          elementType: 'geometry',           stylers: [{ color: '#1e4080' }] },
  { featureType: 'road.highway',          elementType: 'geometry.stroke',    stylers: [{ color: '#F5C51830' }] },
  { featureType: 'road.highway',          elementType: 'labels.text.fill',   stylers: [{ color: '#b8cfe8' }] },
  { featureType: 'road.local',            elementType: 'labels.text.fill',   stylers: [{ color: '#5b7fa6' }] },
  { featureType: 'transit',               elementType: 'geometry',           stylers: [{ color: '#0d1f38' }] },
  { featureType: 'transit.station',       elementType: 'labels.text.fill',   stylers: [{ color: '#4a6fa5' }] },
  { featureType: 'water',                 elementType: 'geometry',           stylers: [{ color: '#051020' }] },
  { featureType: 'water',                 elementType: 'labels.text.fill',   stylers: [{ color: '#1a3a5c' }] },
  { featureType: 'water',                 elementType: 'labels.text.stroke', stylers: [{ color: '#051020' }] },
];

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function compactStatus(status?: string): string {
  if (!status) return 'Inconnu';
  return status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMoney(value?: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XAF',
    maximumFractionDigits: 0,
  }).format(typeof value === 'number' ? value : 0);
}

function formatError(error: any): string {
  if (error instanceof ApiHttpError) {
    const parts: string[] = [];
    if (error.message) parts.push(error.message);
    if (error.status) parts.push(`HTTP ${error.status}`);
    if (error.errorCode) parts.push(`Code: ${error.errorCode}`);
    if (error.validationErrors) {
      Object.entries(error.validationErrors).forEach(([f, m]) =>
        parts.push(`${f}: ${m}`),
      );
    }
    return parts.join(' · ');
  }
  return error?.message || 'Erreur inconnue';
}

function driverName(
  profile: DriverProfile | null,
  first?: string,
  last?: string,
): string {
  const f = profile?.user?.firstName?.trim() || first?.trim() || '';
  const l = profile?.user?.lastName?.trim()  || last?.trim()  || '';
  return `${f} ${l}`.trim() || 'Chauffeur';
}

function driverInitials(
  profile: DriverProfile | null,
  first?: string,
  last?: string,
): string {
  const f = profile?.user?.firstName?.[0] || first?.[0] || 'C';
  const l = profile?.user?.lastName?.[0]  || last?.[0]  || '';
  return `${f}${l}`.toUpperCase();
}

function buildRegion(
  profile: DriverProfile | null,
  ride: RideResponse | undefined,
  lat?: number,
  lng?: number,
) {
  return {
    latitude:  lat ?? profile?.currentLatitude  ?? ride?.pickupLatitude  ?? 0.4162,
    longitude: lng ?? profile?.currentLongitude ?? ride?.pickupLongitude ?? 9.4673,
    latitudeDelta:  0.006,
    longitudeDelta: 0.006,
  };
}

function resolveImg(base: string, path?: string): string {
  if (!path?.trim()) return '';
  const p = path.trim();
  if (/^(https?|file):\/\//.test(p)) return p;
  const b = base.replace(/\/+$/, '');
  if (p.startsWith('/api/v1/')) return `${b.replace(/\/api\/v1$/, '')}${p}`;
  return `${b}${p.startsWith('/') ? p : `/${p}`}`;
}

function bust(url?: string): string {
  if (!url) return '';
  return `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res  = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=fr`,
      { headers: { 'User-Agent': 'OviroDriverApp/1.0' } },
    );
    const json = await res.json();
    const a    = json?.address ?? {};
    const nb   = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.district || '';
    const city = a.city   || a.town          || a.village || a.county        || '';
    if (nb && city) return `${nb}, ${city}`;
    if (nb)         return nb;
    if (city)       return city;
    return (json?.display_name ?? '').split(',').slice(0, 2).join(',').trim() || 'Position inconnue';
  } catch {
    return 'Position inconnue';
  }
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({
  uri,
  token,
  initials,
}: {
  uri?: string;
  token?: string;
  initials: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [uri]);

  if (uri && !failed) {
    return (
      <Image
        source={token ? { uri, headers: { Authorization: `Bearer ${token}` } } : { uri }}
        style={S.avatar}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={S.avatarFallback}>
      <Text style={S.avatarInitials}>{initials}</Text>
    </View>
  );
}

// ─── Driver map marker ────────────────────────────────────────────────────────

function DriverMarker({ initials }: { initials: string }) {
  return (
    <View style={S.markerWrap}>
      <View style={S.markerBubble}>
        <View style={S.markerDot} />
        <Text style={S.markerInitials}>{initials}</Text>
      </View>
      <View style={S.markerTail} />
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function DashboardScreen() {
  const { user, session, apiBaseUrl } = useAuth();

  const [profile,      setProfile]      = useState<DriverProfile | null>(null);
  const [rides,        setRides]        = useState<RideResponse[]>([]);
  const [loadProfile_,  setLoadProfile_]  = useState(false);
  const [loadRides_,    setLoadRides_]    = useState(false);
  const [refreshing,   setRefreshing]   = useState(false);
  const [profileErr,   setProfileErr]   = useState('');
  const [ridesErr,     setRidesErr]     = useState('');
  const [place,        setPlace]        = useState('Localisation en cours…');

  const lastGeo  = useRef<{ lat: number; lng: number } | null>(null);
  const mapRef   = useRef<MapView | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const { gpsState, lastPosition } = useDriverGps(true);

  const activeRide = useMemo(
    () => rides.find((r) => ACTIVE_STATUSES.includes(r.status)),
    [rides],
  );

  const name     = useMemo(() => driverName(profile, user?.firstName, user?.lastName),    [profile, user]);
  const initials = useMemo(() => driverInitials(profile, user?.firstName, user?.lastName),[profile, user]);

  const imgUri = useMemo(
    () => bust(resolveImg(apiBaseUrl, profile?.user?.profilePictureUrl || user?.profilePictureUrl || '')),
    [profile?.user?.profilePictureUrl, user?.profilePictureUrl, apiBaseUrl],
  );

  const region = useMemo(
    () => buildRegion(profile, activeRide, lastPosition?.latitude, lastPosition?.longitude),
    [profile, activeRide, lastPosition],
  );

  const driverCoord = useMemo(() => ({
    latitude:  lastPosition?.latitude  ?? profile?.currentLatitude  ?? region.latitude,
    longitude: lastPosition?.longitude ?? profile?.currentLongitude ?? region.longitude,
  }), [lastPosition, profile?.currentLatitude, profile?.currentLongitude, region]);

  // Pulse
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 1000, useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [pulseAnim]);

  // Reverse geocode on position change (~50 m throttle)
  useEffect(() => {
    const { latitude, longitude } = driverCoord;
    if (!latitude || !longitude) return;
    const prev = lastGeo.current;
    if (prev && Math.abs(prev.lat - latitude) < 0.00045 && Math.abs(prev.lng - longitude) < 0.00045) return;
    lastGeo.current = { lat: latitude, lng: longitude };
    reverseGeocode(latitude, longitude).then(setPlace);
  }, [driverCoord]);

  // Follow map
  useEffect(() => {
    if (!mapRef.current) return;
    // Offset camera slightly south so driver marker sits upper-center (Uber style)
    const cameraRegion = {
      ...region,
      latitude: region.latitude - region.latitudeDelta * 0.18,
    };
    mapRef.current.animateCamera(
      {
        center: { latitude: cameraRegion.latitude, longitude: cameraRegion.longitude },
        pitch: 45,
        heading: 0,
        altitude: 500,
        zoom: 16,
      },
      { duration: 800 },
    );
  }, [region]);

  // Data
  const fetchProfile = useCallback(async () => {
    setLoadProfile_(true);
    setProfileErr('');
    try {
      const r = await apiRequest<DriverProfile>('/driver/profile');
      setProfile(r.data);
    } catch (e: any) {
      setProfileErr(formatError(e));
    } finally {
      setLoadProfile_(false);
    }
  }, []);

  const fetchRides = useCallback(async () => {
    setLoadRides_(true);
    setRidesErr('');
    try {
      const r = await apiRequest<PageResponse<RideResponse>>('/rides/driver/my?page=0&size=20');
      setRides(r.data.content || []);
    } catch (e: any) {
      setRidesErr(formatError(e));
      setRides([]);
    } finally {
      setLoadRides_(false);
    }
  }, []);

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    await Promise.allSettled([fetchProfile(), fetchRides()]);
    setRefreshing(false);
  }, [fetchProfile, fetchRides]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const setOnline = async (online: boolean) => {
    try {
      await apiRequest(online ? '/driver/online' : '/driver/offline', { method: 'PATCH' });
      await fetchProfile();
    } catch (e: any) {
      Alert.alert('Erreur', formatError(e));
    }
  };

  const pushGps = async () => {
    const lat = lastPosition?.latitude  ?? profile?.currentLatitude;
    const lng = lastPosition?.longitude ?? profile?.currentLongitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      Alert.alert('GPS', 'Aucune coordonnée disponible.');
      return;
    }
    try {
      await apiRequest('/driver/location', { method: 'PATCH', body: JSON.stringify({ latitude: lat, longitude: lng }) });
      await fetchProfile();
      Alert.alert('Succès', 'Position mise à jour.');
    } catch (e: any) {
      Alert.alert('Erreur', formatError(e));
    }
  };

  const statusTone =
    profile?.status === 'ONLINE'  ? C.green  :
    profile?.status === 'SOS'     ? C.red    :
    profile?.status === 'ON_RIDE' ? C.orange :
    C.muted;

  const isLoading = loadProfile_ || loadRides_;

  return (
    <View style={S.root}>
      <ScrollView
        contentContainerStyle={S.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadAll(true)} />
        }
      >
        {/* ── Hero ── */}
        <LinearGradient colors={[C.yellow, '#E6B800', '#C89400']} style={S.hero}>
          <View style={S.heroRow}>
            <View style={{ flex: 1 }}>
              <Text style={S.brand}>OVIRO DRIVER</Text>
              <Text style={S.hello}>Bonjour, {name}</Text>
              <Text style={S.plate}>
                {profile?.currentVehicle?.plateNumber || 'Aucun véhicule actif'}
              </Text>
              <View style={S.statusRow}>
                <View style={[S.statusDot, { backgroundColor: statusTone }]} />
                <Text style={S.statusTxt}>{compactStatus(profile?.status || 'OFFLINE')}</Text>
              </View>
            </View>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <Avatar uri={imgUri} token={session?.accessToken} initials={initials} />
            </Animated.View>
          </View>

          <View style={S.kpiRow}>
            {[
              { label: 'Note',    value: String(profile?.rating ?? 0) },
              { label: 'Courses', value: String(profile?.totalRides ?? 0) },
              { label: 'Gains',   value: formatMoney(profile?.totalEarnings), small: true },
            ].map((k, i) => (
              <React.Fragment key={k.label}>
                {i > 0 && <View style={S.kpiDiv} />}
                <View style={S.kpiItem}>
                  <Text style={S.kpiLbl}>{k.label}</Text>
                  <Text style={k.small ? S.kpiValSm : S.kpiVal}>{k.value}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        </LinearGradient>

        {/* ── Errors ── */}
        {profileErr ? (
          <View style={S.errorBox}>
            <Text style={S.errorTitle}>Erreur profil</Text>
            <Text style={S.errorTxt}>{profileErr}</Text>
          </View>
        ) : null}
        {ridesErr ? (
          <View style={S.warnBox}>
            <Text style={S.warnTitle}>Erreur courses</Text>
            <Text style={S.warnTxt}>{ridesErr}</Text>
          </View>
        ) : null}

        {/* ── Map ── */}
        <View style={S.card}>
          <View style={S.cardHead}>
            <Text style={S.cardTitle}>Carte en direct</Text>
            <Text style={S.cardBadge}>{gpsState.toUpperCase()}</Text>
          </View>

          <View style={S.mapWrap}>
            <MapView
              ref={(r) => { mapRef.current = r; }}
              style={StyleSheet.absoluteFillObject}
              provider={PROVIDER_GOOGLE}
              initialRegion={region}
              mapType="standard"
              customMapStyle={MAP_STYLE}
              showsTraffic
              showsBuildings
              showsCompass={false}
              showsUserLocation={false}
              rotateEnabled
              pitchEnabled
              scrollEnabled={false}
              zoomEnabled={false}
              toolbarEnabled={false}
              loadingEnabled
              loadingBackgroundColor="#0a1628"
              loadingIndicatorColor={C.yellow}
            >
              <Marker
                coordinate={driverCoord}
                anchor={{ x: 0.5, y: 0.9 }}
                title={name}
                description={place}
              >
                <DriverMarker initials={initials} />
              </Marker>

              {activeRide ? (
                <>
                  <Marker
                    coordinate={{ latitude: activeRide.pickupLatitude, longitude: activeRide.pickupLongitude }}
                    title="Départ"
                    description={activeRide.pickupAddress}
                    pinColor="green"
                  />
                  <Marker
                    coordinate={{ latitude: activeRide.dropoffLatitude, longitude: activeRide.dropoffLongitude }}
                    title="Destination"
                    description={activeRide.dropoffAddress}
                    pinColor="red"
                  />
                </>
              ) : null}
            </MapView>

            {/* Overlay quartier */}
            <View style={S.mapOverlay}>
              <Text style={S.mapOverlayLbl}>Position actuelle</Text>
              <View style={S.mapOverlayRow}>
                <View style={S.mapOverlayPin} />
                <Text style={S.mapOverlayTxt} numberOfLines={1}>{place}</Text>
              </View>
            </View>
          </View>

          <View style={S.btnRow}>
            <Pressable
              style={[S.btn, profile?.status === 'ONLINE' && S.btnActive]}
              onPress={() => setOnline(true)}
            >
              <Text style={[S.btnTxt, profile?.status === 'ONLINE' && S.btnActiveTxt]}>
                En ligne
              </Text>
            </Pressable>
            <Pressable style={S.btn} onPress={() => setOnline(false)}>
              <Text style={S.btnTxt}>Hors ligne</Text>
            </Pressable>
            <Pressable style={S.btn} onPress={pushGps}>
              <Text style={S.btnTxt}>Envoyer GPS</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Active ride ── */}
        <View style={S.card}>
          <View style={S.cardHead}>
            <Text style={S.cardTitle}>Course active</Text>
            <Text style={S.cardBadge}>
              {activeRide ? compactStatus(activeRide.status) : 'Aucune'}
            </Text>
          </View>

          {loadRides_ ? (
            <View style={S.empty}>
              <ActivityIndicator color={C.yellow} />
              <Text style={S.emptyTitle}>Chargement…</Text>
            </View>
          ) : activeRide ? (
            <>
              <Text style={S.rideRef}>{activeRide.reference}</Text>

              {[
                { label: 'Client',      value: activeRide.clientName },
                { label: 'Départ',      value: activeRide.pickupAddress },
                { label: 'Destination', value: activeRide.dropoffAddress },
              ].map((row) => (
                <View key={row.label} style={S.rideBlock}>
                  <Text style={S.rideLabel}>{row.label}</Text>
                  <Text style={S.rideValue}>{row.value}</Text>
                </View>
              ))}

              <View style={S.priceRow}>
                {[
                  {
                    label: 'Distance',
                    value: typeof activeRide.estimatedDistanceKm === 'number'
                      ? `${activeRide.estimatedDistanceKm.toFixed(1)} km`
                      : '—',
                  },
                  {
                    label: 'Durée',
                    value: typeof activeRide.estimatedDurationMinutes === 'number'
                      ? `${Math.round(activeRide.estimatedDurationMinutes)} min`
                      : '—',
                  },
                  { label: 'Tarif', value: formatMoney(activeRide.estimatedFare) },
                ].map((p) => (
                  <View key={p.label} style={S.priceBox}>
                    <Text style={S.priceLabel}>{p.label}</Text>
                    <Text style={S.priceValue}>{p.value}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <View style={S.empty}>
              <Text style={S.emptyTitle}>Aucune course en cours</Text>
              <Text style={S.emptyTxt}>Passez en ligne pour recevoir des courses.</Text>
            </View>
          )}
        </View>

        {/* ── Refresh ── */}
        <Pressable style={S.refreshBtn} onPress={() => loadAll()}>
          {isLoading
            ? <ActivityIndicator color="#111827" />
            : <Text style={S.refreshTxt}>Actualiser</Text>}
        </Pressable>
      </ScrollView>
    </View>
  );
}

export default DashboardScreen;

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 16, paddingBottom: 30 },

  // Hero
  hero: {
    borderRadius: 26, padding: 18, marginBottom: 16,
    shadowColor: C.shadow, shadowOpacity: 0.2, shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  heroRow:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 18 },
  brand:     { color: '#0B1220', fontSize: 11, fontWeight: '900', letterSpacing: 2, marginBottom: 8 },
  hello:     { color: '#0B1220', fontSize: 26, fontWeight: '900', lineHeight: 31 },
  plate:     { color: '#23344A', fontSize: 13, marginTop: 5, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 7 },
  statusTxt: { color: '#0B1220', fontSize: 12, fontWeight: '900' },

  avatar: {
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 2.5, borderColor: '#111827',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  avatarFallback: {
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 2.5, borderColor: '#111827',
    backgroundColor: 'rgba(17,24,39,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { color: '#111827', fontSize: 20, fontWeight: '900' },

  kpiRow:  { flexDirection: 'row', backgroundColor: 'rgba(11,18,32,0.10)', borderRadius: 18, paddingVertical: 10, paddingHorizontal: 8 },
  kpiItem: { flex: 1, alignItems: 'center' },
  kpiDiv:  { width: 1, backgroundColor: 'rgba(11,18,32,0.15)' },
  kpiLbl:  { color: '#30445C', fontSize: 11, fontWeight: '800', marginBottom: 4 },
  kpiVal:  { color: '#0B1220', fontSize: 18, fontWeight: '900' },
  kpiValSm:{ color: '#0B1220', fontSize: 14, fontWeight: '900' },

  // Errors
  errorBox:  { backgroundColor: 'rgba(255,90,95,0.10)',  borderColor: 'rgba(255,90,95,0.25)',  borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 12 },
  errorTitle:{ color: '#FF8B90', fontSize: 14, fontWeight: '900', marginBottom: 4 },
  errorTxt:  { color: '#FFD5D7', fontSize: 12, lineHeight: 18 },
  warnBox:   { backgroundColor: 'rgba(245,197,24,0.10)', borderColor: 'rgba(245,197,24,0.22)', borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 16 },
  warnTitle: { color: C.yellow, fontSize: 14, fontWeight: '900', marginBottom: 4 },
  warnTxt:   { color: '#F8E7A0', fontSize: 12, lineHeight: 18 },

  // Card
  card:     { backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 16 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle:{ color: C.text,   fontSize: 18, fontWeight: '900' },
  cardBadge:{ color: C.yellow, fontSize: 12, fontWeight: '800' },

  // Map
  mapWrap: {
    height: 380, borderRadius: 22, overflow: 'hidden',
    marginTop: 14, backgroundColor: '#0A1524',
  },
  mapOverlay: {
    position: 'absolute', left: 12, right: 12, bottom: 12,
    backgroundColor: 'rgba(7,17,32,0.84)',
    borderRadius: 16, padding: 12,
  },
  mapOverlayLbl: { color: C.muted,   fontSize: 11, fontWeight: '700', marginBottom: 6 },
  mapOverlayRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mapOverlayPin: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.yellow },
  mapOverlayTxt: { color: C.text, fontSize: 15, fontWeight: '900', flex: 1 },

  // Driver marker
  markerWrap:     { alignItems: 'center' },
  markerBubble:   {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.yellow, borderRadius: 20,
    paddingVertical: 6, paddingHorizontal: 10,
    borderWidth: 2, borderColor: '#0B1220',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  markerDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green, borderWidth: 1.5, borderColor: '#0B1220' },
  markerInitials: { color: '#0B1220', fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  markerTail:     {
    width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderTopColor: C.yellow, marginTop: -1,
  },

  // Buttons
  btnRow:      { flexDirection: 'row', marginTop: 12 },
  btn:         { flex: 1, backgroundColor: C.card2, borderRadius: 14, paddingVertical: 12, marginHorizontal: 4, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  btnActive:   { backgroundColor: C.yellow, borderColor: C.yellow },
  btnTxt:      { color: C.text,   fontSize: 12, fontWeight: '800' },
  btnActiveTxt:{ color: '#0B1220' },

  // Ride
  rideRef:    { color: C.yellow, fontSize: 16, fontWeight: '900', marginTop: 14, marginBottom: 12 },
  rideBlock:  { backgroundColor: C.card2, borderRadius: 16, padding: 12, marginBottom: 10 },
  rideLabel:  { color: C.muted, fontSize: 11, fontWeight: '700', marginBottom: 5 },
  rideValue:  { color: C.text,  fontSize: 14, fontWeight: '700', lineHeight: 20 },
  priceRow:   { flexDirection: 'row', marginTop: 2 },
  priceBox:   { flex: 1, backgroundColor: C.card2, borderRadius: 16, padding: 12, marginHorizontal: 4 },
  priceLabel: { color: C.muted, fontSize: 11, fontWeight: '700', marginBottom: 5 },
  priceValue: { color: C.text,  fontSize: 13, fontWeight: '900' },

  empty:      { backgroundColor: C.card2, borderRadius: 16, padding: 14, marginTop: 14, alignItems: 'center', gap: 8 },
  emptyTitle: { color: C.text,  fontSize: 15, fontWeight: '900' },
  emptyTxt:   { color: C.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },

  refreshBtn: { height: 54, borderRadius: 18, backgroundColor: C.yellow, justifyContent: 'center', alignItems: 'center' },
  refreshTxt: { color: '#0B1220', fontSize: 15, fontWeight: '900' },
});