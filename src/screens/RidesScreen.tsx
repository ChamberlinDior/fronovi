import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { apiRequest, ApiHttpError } from '../api/client';
import { useDriverGps } from '../hooks/useDriverGps';
import { useAuth } from '../context/AuthContext';
import {
  DriverProfile,
  PageResponse,
  QrCodeResponse,
  RideResponse,
  RideStatus,
} from '../types/api';

const { height: H } = Dimensions.get('window');
const SNAP_POINTS = [90, Math.round(H * 0.48), Math.round(H * 0.88)];

const C = {
  bg: '#0A0A0F',
  surface: '#13131A',
  surface2: '#1C1C26',
  border: '#2A2A38',
  border2: '#383848',
  accent: '#6C63FF',
  accentS: 'rgba(108,99,255,0.12)',
  accentG: 'rgba(108,99,255,0.26)',
  ok: '#22D3A5',
  okS: 'rgba(34,211,165,0.12)',
  warn: '#F5A623',
  warnS: 'rgba(245,166,35,0.12)',
  red: '#FF4D6D',
  redS: 'rgba(255,77,109,0.12)',
  txt: '#F0EFF8',
  muted: '#8A89A0',
  dim: '#4A4A60',
  white: '#FFFFFF',
  mapBg: '#0a1628',
} as const;

const MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0a1628' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0a1628' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4a6fa5' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#1c2d4a' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#c7d8ed' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#0d1f38' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#4a6fa5' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#0b2a1a' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#1a5c32' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a2f50' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0d1f38' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8fa8c8' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#1e3660' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#1e4080' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#6C63FF33' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#b8cfe8' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#5b7fa6' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#0d1f38' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#4a6fa5' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#051020' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#1a3a5c' }] },
];

const STATUS_META: Record<RideStatus, { label: string; color: string; bg: string; step: number }> = {
  REQUESTED: { label: 'En attente', color: C.warn, bg: C.warnS, step: 0 },
  DRIVER_ASSIGNED: { label: 'Chauffeur assigné', color: C.accent, bg: C.accentS, step: 1 },
  DRIVER_EN_ROUTE: { label: 'En route', color: C.accent, bg: C.accentS, step: 2 },
  DRIVER_ARRIVED: { label: 'Arrivé au point', color: C.ok, bg: C.okS, step: 3 },
  IN_PROGRESS: { label: 'Course en cours', color: C.ok, bg: C.okS, step: 4 },
  COMPLETED: { label: 'Terminée', color: C.ok, bg: C.okS, step: 5 },
  PAYMENT_PENDING: { label: 'Paiement en attente', color: C.warn, bg: C.warnS, step: 5 },
  PAID: { label: 'Payée', color: C.ok, bg: C.okS, step: 6 },
  CANCELLED_BY_CLIENT: { label: 'Annulée (client)', color: C.red, bg: C.redS, step: -1 },
  CANCELLED_BY_DRIVER: { label: 'Annulée (chauffeur)', color: C.red, bg: C.redS, step: -1 },
};

const FLOW_NEXT: Partial<Record<RideStatus, RideStatus>> = {
  DRIVER_ASSIGNED: 'DRIVER_EN_ROUTE',
  DRIVER_EN_ROUTE: 'DRIVER_ARRIVED',
  DRIVER_ARRIVED: 'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
};

const FLOW_LABEL: Partial<Record<RideStatus, string>> = {
  DRIVER_ASSIGNED: 'Démarrer le trajet',
  DRIVER_EN_ROUTE: 'Je suis arrivé',
  DRIVER_ARRIVED: 'Démarrer la course',
  IN_PROGRESS: 'Terminer la course',
};

const CANCELLABLE: RideStatus[] = ['REQUESTED', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE'];

function fmtMoney(v?: number | null): string {
  if (v == null) return '—';
  return new Intl.NumberFormat('fr-GA', {
    style: 'currency',
    currency: 'XAF',
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDur(min?: number | null): string {
  if (!min) return '—';
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}

function isDriverActiveStatus(s: RideStatus): boolean {
  return ['DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'IN_PROGRESS', 'COMPLETED'].includes(s);
}

function isOpportunityStatus(s: RideStatus): boolean {
  return s === 'REQUESTED';
}

function formatError(error: any): string {
  if (error instanceof ApiHttpError) {
    const parts: string[] = [];
    if (error.message) parts.push(error.message);
    if (error.status) parts.push(`HTTP ${error.status}`);
    if (error.errorCode) parts.push(`Code: ${error.errorCode}`);
    if (error.validationErrors) {
      Object.entries(error.validationErrors).forEach(([f, m]) => parts.push(`${f}: ${m}`));
    }
    return parts.join(' · ');
  }
  return error?.message || 'Erreur inconnue';
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

function driverName(
  profile: DriverProfile | null,
  first?: string,
  last?: string,
): string {
  const f = profile?.user?.firstName?.trim() || first?.trim() || '';
  const l = profile?.user?.lastName?.trim() || last?.trim() || '';
  return `${f} ${l}`.trim() || 'Chauffeur';
}

function driverInitials(
  profile: DriverProfile | null,
  first?: string,
  last?: string,
): string {
  const f = profile?.user?.firstName?.[0] || first?.[0] || 'C';
  const l = profile?.user?.lastName?.[0] || last?.[0] || '';
  return `${f}${l}`.toUpperCase();
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=fr`,
      { headers: { 'User-Agent': 'OviroDriverApp/1.0' } },
    );
    const json = await res.json();
    const a = json?.address ?? {};
    const nb = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.district || '';
    const city = a.city || a.town || a.village || a.county || '';
    if (nb && city) return `${nb}, ${city}`;
    if (nb) return nb;
    if (city) return city;
    return (json?.display_name ?? '').split(',').slice(0, 2).join(',').trim() || 'Position inconnue';
  } catch {
    return 'Position inconnue';
  }
}

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

  useEffect(() => {
    setFailed(false);
  }, [uri, token]);

  if (uri && !failed) {
    return (
      <Image
        source={token ? { uri, headers: { Authorization: `Bearer ${token}` } } : { uri }}
        style={s.driverAvatar}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View style={s.driverAvatarFallback}>
      <Text style={s.driverAvatarFallbackTxt}>{initials}</Text>
    </View>
  );
}

function DriverMarker({ initials }: { initials: string }) {
  return (
    <View style={mk.wrap}>
      <View style={mk.bubble}>
        <View style={mk.dot} />
        <Text style={mk.initials}>{initials}</Text>
      </View>
      <View style={mk.tail} />
    </View>
  );
}

const mk = StyleSheet.create({
  wrap: { alignItems: 'center' },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.accent,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: C.accent,
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.ok,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  initials: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  tail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: C.accent,
    marginTop: -1,
  },
});

function StatusPill({ status }: { status: RideStatus }) {
  const m = STATUS_META[status];
  return (
    <View style={[pl.wrap, { backgroundColor: m.bg }]}>
      <View style={[pl.dot, { backgroundColor: m.color }]} />
      <Text style={[pl.txt, { color: m.color }]}>{m.label}</Text>
    </View>
  );
}

const pl = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  txt: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

function StepBar({ status }: { status: RideStatus }) {
  const step = STATUS_META[status]?.step ?? 0;
  if (step < 0) return null;

  return (
    <View style={{ flexDirection: 'row', gap: 4, marginVertical: 12 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 3,
            borderRadius: 2,
            backgroundColor: i < step ? C.ok : i === step ? C.accent : C.border,
          }}
        />
      ))}
    </View>
  );
}

function Divider() {
  return <View style={{ height: 0.5, backgroundColor: C.border, marginVertical: 12 }} />;
}

function OpportunityCard({
  ride,
  onAccept,
  loading,
}: {
  ride: RideResponse;
  onAccept: () => void;
  loading: boolean;
}) {
  return (
    <View style={oc.wrap}>
      <View style={oc.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={oc.ref}>{ride.reference}</Text>
          <Text style={oc.date}>{fmtDate(ride.requestedAt)}</Text>
        </View>
        <StatusPill status={ride.status} />
      </View>

      <Divider />

      <View style={oc.routeRow}>
        <View style={oc.dotCol}>
          <View style={oc.dotPickup} />
          <View style={oc.routeLine} />
          <View style={oc.dotDrop} />
        </View>

        <View style={{ flex: 1, gap: 6 }}>
          <View>
            <Text style={oc.routeLbl}>PRISE EN CHARGE</Text>
            <Text style={oc.routeAddr} numberOfLines={2}>{ride.pickupAddress}</Text>
          </View>
          <View>
            <Text style={oc.routeLbl}>DESTINATION</Text>
            <Text style={oc.routeAddr} numberOfLines={2}>{ride.dropoffAddress}</Text>
          </View>
        </View>
      </View>

      <View style={oc.statsRow}>
        <View style={oc.stat}>
          <Text style={oc.statVal}>
            {ride.estimatedDistanceKm != null ? `${ride.estimatedDistanceKm} km` : '—'}
          </Text>
          <Text style={oc.statLbl}>Distance</Text>
        </View>
        <View style={oc.stat}>
          <Text style={oc.statVal}>{fmtDur(ride.estimatedDurationMinutes)}</Text>
          <Text style={oc.statLbl}>Durée</Text>
        </View>
        <View style={oc.stat}>
          <Text style={[oc.statVal, { color: C.ok }]}>
            {fmtMoney(ride.estimatedFare)}
          </Text>
          <Text style={oc.statLbl}>Tarif</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[oc.acceptBtn, loading && { opacity: 0.6 }]}
        onPress={onAccept}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading ? (
          <ActivityIndicator color={C.white} size="small" />
        ) : (
          <Text style={oc.acceptBtnTxt}>Accepter cette opportunité</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const oc = StyleSheet.create({
  wrap: {
    backgroundColor: C.surface2,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: C.border,
    padding: 16,
    marginBottom: 10,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ref: {
    color: C.txt,
    fontSize: 16,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  date: {
    color: C.muted,
    fontSize: 11,
    marginTop: 3,
  },
  routeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dotCol: {
    alignItems: 'center',
    paddingTop: 3,
    width: 14,
  },
  dotPickup: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.accent,
    borderWidth: 2,
    borderColor: C.accentG,
  },
  routeLine: {
    width: 2,
    flex: 1,
    backgroundColor: C.border,
    marginVertical: 3,
    minHeight: 18,
  },
  dotDrop: {
    width: 10,
    height: 10,
    backgroundColor: C.ok,
    transform: [{ rotate: '45deg' }],
  },
  routeLbl: {
    color: C.dim,
    fontSize: 9,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  routeAddr: {
    color: C.txt,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 14,
  },
  stat: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: C.border,
    padding: 10,
    alignItems: 'center',
  },
  statVal: {
    color: C.txt,
    fontSize: 14,
    fontWeight: '700',
  },
  statLbl: {
    color: C.muted,
    fontSize: 9,
    marginTop: 3,
    textAlign: 'center',
  },
  acceptBtn: {
    marginTop: 14,
    backgroundColor: C.ok,
    borderRadius: 15,
    paddingVertical: 15,
    alignItems: 'center',
  },
  acceptBtnTxt: {
    color: C.white,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});

function QrModal({
  visible, qr, onClose,
}: {
  visible: boolean; qr: QrCodeResponse | null; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={qm.overlay}>
        <View style={qm.card}>
          <View style={qm.header}>
            <View>
              <Text style={qm.title}>QR Paiement</Text>
              <Text style={qm.sub}>Présentez ce code au client</Text>
            </View>
            <TouchableOpacity style={qm.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={qm.closeTxt}>✕</Text>
            </TouchableOpacity>
          </View>

          {qr ? (
            <>
              <View style={qm.amountChip}>
                <Text style={qm.amountLbl}>MONTANT À PERCEVOIR</Text>
                <Text style={qm.amountVal}>{fmtMoney(qr.amount)}</Text>
              </View>

              <View style={qm.imgWrap}>
                <Image
                  source={{ uri: `data:image/png;base64,${qr.qrCodeImage}` }}
                  style={qm.img}
                  resizeMode="contain"
                />
              </View>
            </>
          ) : (
            <ActivityIndicator color={C.accent} style={{ marginVertical: 40 }} />
          )}
        </View>
      </View>
    </Modal>
  );
}

const qm = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.86)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: 28,
    borderWidth: 0.5,
    borderColor: C.border,
    padding: 22,
    width: '100%',
    maxWidth: 370,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  title: {
    color: C.txt,
    fontSize: 20,
    fontWeight: '800',
  },
  sub: {
    color: C.muted,
    fontSize: 12,
    marginTop: 3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.surface2,
    borderWidth: 0.5,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeTxt: {
    color: C.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  amountChip: {
    backgroundColor: C.okS,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.ok,
    padding: 14,
    marginBottom: 18,
    alignItems: 'center',
  },
  amountLbl: {
    color: C.ok,
    fontSize: 10,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  amountVal: {
    color: C.ok,
    fontSize: 28,
    fontWeight: '900',
  },
  imgWrap: {
    alignSelf: 'center',
  },
  img: {
    width: 240,
    height: 240,
    borderRadius: 12,
    backgroundColor: C.white,
  },
});

function RideDetailCard({
  ride,
  onProgress,
  onCancel,
  onQr,
  loading,
}: {
  ride: RideResponse;
  onProgress: () => void;
  onCancel: () => void;
  onQr: () => void;
  loading: boolean;
}) {
  const nextLabel = FLOW_LABEL[ride.status];
  const canCancel = CANCELLABLE.includes(ride.status);
  const canQr = ride.status === 'COMPLETED';

  return (
    <View style={rd.wrap}>
      <View style={rd.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={rd.ref}>{ride.reference}</Text>
          <Text style={rd.date}>{fmtDate(ride.requestedAt)}</Text>
        </View>
        <StatusPill status={ride.status} />
      </View>

      <StepBar status={ride.status} />
      <Divider />

      <View style={rd.clientRow}>
        <View style={rd.avatar}>
          <Text style={rd.avatarTxt}>{ride.clientName?.charAt(0)?.toUpperCase() ?? '?'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={rd.clientName}>{ride.clientName}</Text>
          <Text style={rd.clientLbl}>Client</Text>
        </View>
      </View>

      <Divider />

      <View style={rd.routeRow}>
        <View style={rd.dotCol}>
          <View style={rd.dotPickup} />
          <View style={rd.routeLine} />
          <View style={rd.dotDrop} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <View>
            <Text style={rd.routeLbl}>PRISE EN CHARGE</Text>
            <Text style={rd.routeAddr} numberOfLines={2}>{ride.pickupAddress}</Text>
          </View>
          <View>
            <Text style={rd.routeLbl}>DESTINATION</Text>
            <Text style={rd.routeAddr} numberOfLines={2}>{ride.dropoffAddress}</Text>
          </View>
        </View>
      </View>

      <Divider />

      <View style={rd.statsRow}>
        <View style={rd.stat}>
          <Text style={rd.statVal}>{ride.estimatedDistanceKm ?? '—'} km</Text>
          <Text style={rd.statLbl}>Distance</Text>
        </View>
        <View style={rd.stat}>
          <Text style={rd.statVal}>{fmtDur(ride.estimatedDurationMinutes)}</Text>
          <Text style={rd.statLbl}>Durée est.</Text>
        </View>
        <View style={rd.stat}>
          <Text style={[rd.statVal, { color: C.ok }]}>
            {fmtMoney(ride.actualFare ?? ride.estimatedFare)}
          </Text>
          <Text style={rd.statLbl}>Montant</Text>
        </View>
      </View>

      <View style={{ marginTop: 14, gap: 9 }}>
        {nextLabel ? (
          <TouchableOpacity
            style={[rd.ctaPrimary, loading && { opacity: 0.55 }]}
            onPress={onProgress}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={C.white} size="small" />
            ) : (
              <Text style={rd.ctaPrimaryTxt}>{nextLabel}</Text>
            )}
          </TouchableOpacity>
        ) : null}

        {(canQr || canCancel) ? (
          <View style={{ flexDirection: 'row', gap: 9 }}>
            {canQr ? (
              <TouchableOpacity style={rd.ctaSec} onPress={onQr} activeOpacity={0.8}>
                <Text style={rd.ctaSecTxt}>Générer QR</Text>
              </TouchableOpacity>
            ) : null}
            {canCancel ? (
              <TouchableOpacity style={rd.ctaDanger} onPress={onCancel} activeOpacity={0.8}>
                <Text style={rd.ctaDangerTxt}>Annuler</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const rd = StyleSheet.create({
  wrap: {
    backgroundColor: C.surface2,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: C.border,
    padding: 16,
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  ref: {
    color: C.txt,
    fontSize: 16,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 0.4,
  },
  date: {
    color: C.muted,
    fontSize: 11,
    marginTop: 3,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.accentS,
    borderWidth: 1,
    borderColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: {
    color: C.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  clientName: {
    color: C.txt,
    fontSize: 14,
    fontWeight: '600',
  },
  clientLbl: {
    color: C.muted,
    fontSize: 10,
    marginTop: 1,
  },
  routeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dotCol: {
    alignItems: 'center',
    paddingTop: 3,
    width: 14,
  },
  dotPickup: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.accent,
    borderWidth: 2,
    borderColor: C.accentG,
  },
  routeLine: {
    width: 2,
    flex: 1,
    backgroundColor: C.border,
    marginVertical: 3,
    minHeight: 18,
  },
  dotDrop: {
    width: 10,
    height: 10,
    backgroundColor: C.ok,
    transform: [{ rotate: '45deg' }],
  },
  routeLbl: {
    color: C.dim,
    fontSize: 9,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  routeAddr: {
    color: C.txt,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 7,
  },
  stat: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: C.border,
    padding: 10,
    alignItems: 'center',
  },
  statVal: {
    color: C.txt,
    fontSize: 14,
    fontWeight: '700',
  },
  statLbl: {
    color: C.muted,
    fontSize: 9,
    marginTop: 3,
    textAlign: 'center',
  },
  ctaPrimary: {
    backgroundColor: C.accent,
    borderRadius: 15,
    paddingVertical: 15,
    alignItems: 'center',
  },
  ctaPrimaryTxt: {
    color: C.white,
    fontSize: 14,
    fontWeight: '800',
  },
  ctaSec: {
    flex: 1,
    backgroundColor: C.accentS,
    borderRadius: 13,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.accent,
  },
  ctaSecTxt: {
    color: C.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  ctaDanger: {
    flex: 1,
    backgroundColor: C.redS,
    borderRadius: 13,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.red,
  },
  ctaDangerTxt: {
    color: C.red,
    fontSize: 12,
    fontWeight: '700',
  },
});

function HistoryCard({ ride, onPress }: { ride: RideResponse; onPress: () => void }) {
  const meta = STATUS_META[ride.status];
  return (
    <TouchableOpacity style={hc.wrap} onPress={onPress} activeOpacity={0.75}>
      <View style={[hc.accent, { backgroundColor: meta.color }]} />
      <View style={{ flex: 1, padding: 12 }}>
        <View style={hc.topRow}>
          <Text style={hc.ref}>{ride.reference}</Text>
          <StatusPill status={ride.status} />
        </View>
        <Text style={hc.addr} numberOfLines={1}>{ride.pickupAddress} → {ride.dropoffAddress}</Text>
        <View style={hc.bottomRow}>
          <Text style={hc.meta}>{fmtDate(ride.requestedAt)}</Text>
          <Text style={[hc.fare, { color: C.ok }]}>{fmtMoney(ride.actualFare ?? ride.estimatedFare)}</Text>
        </View>
      </View>
      <Text style={hc.chevron}>›</Text>
    </TouchableOpacity>
  );
}

const hc = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface2,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: C.border,
    overflow: 'hidden',
    marginBottom: 8,
  },
  accent: {
    width: 3,
    alignSelf: 'stretch',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  ref: {
    color: C.txt,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  addr: {
    color: C.muted,
    fontSize: 11,
    marginBottom: 5,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  meta: {
    color: C.dim,
    fontSize: 11,
  },
  fare: {
    fontSize: 12,
    fontWeight: '700',
  },
  chevron: {
    color: C.dim,
    fontSize: 22,
    paddingHorizontal: 10,
  },
});

function BottomSheet({
  children,
  header,
  snapIndex,
  onSnap,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
  snapIndex: number;
  onSnap: (i: number) => void;
}) {
  const transY = useRef(new Animated.Value(H - SNAP_POINTS[snapIndex])).current;
  const lastY = useRef(H - SNAP_POINTS[snapIndex]);

  useEffect(() => {
    const target = H - SNAP_POINTS[snapIndex];
    Animated.spring(transY, {
      toValue: target,
      tension: 68,
      friction: 12,
      useNativeDriver: true,
    }).start();
    lastY.current = target;
  }, [snapIndex, transY]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
      onPanResponderMove: (_, g) => {
        const minY = H - SNAP_POINTS[SNAP_POINTS.length - 1];
        const maxY = H - SNAP_POINTS[0];
        transY.setValue(Math.max(minY, Math.min(maxY, lastY.current + g.dy)));
      },
      onPanResponderRelease: (_, g) => {
        const cur = lastY.current + g.dy;
        const nearest = SNAP_POINTS
          .map((sp, i) => ({ i, dist: Math.abs(cur - (H - sp)) }))
          .sort((a, b) => a.dist - b.dist)[0];
        onSnap(nearest.i);
      },
    }),
  ).current;

  return (
    <Animated.View style={[bs.sheet, { transform: [{ translateY: transY }] }]}>
      <View {...pan.panHandlers} style={bs.handleArea}>
        <View style={bs.pill} />
        {header}
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={snapIndex === 2}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </Animated.View>
  );
}

const bs = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: H,
    backgroundColor: C.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 0.5,
    borderColor: C.border,
  },
  handleArea: {
    paddingTop: 10,
    paddingHorizontal: 18,
    paddingBottom: 4,
  },
  pill: {
    width: 36,
    height: 4,
    backgroundColor: C.border2,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
});

export function RidesScreen() {
  const { user, session, apiBaseUrl } = useAuth();

  const mapRef = useRef<MapView | null>(null);
  const lastGeoRef = useRef<{ lat: number; lng: number } | null>(null);

  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [myRides, setMyRides] = useState<RideResponse[]>([]);
  const [availableRides, setAvailableRides] = useState<RideResponse[]>([]);
  const [selected, setSelected] = useState<RideResponse | null>(null);
  const [qr, setQr] = useState<QrCodeResponse | null>(null);
  const [qrVisible, setQrVisible] = useState(false);
  const [apiLoading, setApiLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchId, setSearchId] = useState('');
  const [snapIdx, setSnapIdx] = useState<0 | 1 | 2>(1);
  const [view, setView] = useState<'opportunities' | 'active' | 'history'>('opportunities');
  const [place, setPlace] = useState('Localisation en cours…');
  const [errorMsg, setErrorMsg] = useState('');

  const { gpsState, lastPosition } = useDriverGps(true);

  const name = useMemo(
    () => driverName(profile, user?.firstName, user?.lastName),
    [profile, user],
  );

  const initials = useMemo(
    () => driverInitials(profile, user?.firstName, user?.lastName),
    [profile, user],
  );

  const imgUri = useMemo(
    () => bust(resolveImg(apiBaseUrl, profile?.user?.profilePictureUrl || user?.profilePictureUrl || '')),
    [apiBaseUrl, profile?.user?.profilePictureUrl, user?.profilePictureUrl],
  );

  const driverCoord = useMemo(
    () => ({
      latitude: lastPosition?.latitude ?? profile?.currentLatitude ?? 0.4162,
      longitude: lastPosition?.longitude ?? profile?.currentLongitude ?? 9.4673,
    }),
    [lastPosition, profile?.currentLatitude, profile?.currentLongitude],
  );

  useEffect(() => {
    const { latitude, longitude } = driverCoord;
    if (!latitude || !longitude) return;
    const prev = lastGeoRef.current;
    if (prev && Math.abs(prev.lat - latitude) < 0.00045 && Math.abs(prev.lng - longitude) < 0.00045) return;
    lastGeoRef.current = { lat: latitude, lng: longitude };
    reverseGeocode(latitude, longitude).then(setPlace);
  }, [driverCoord]);

  const activeRide = useMemo(
    () => myRides.find(r => isDriverActiveStatus(r.status)) ?? null,
    [myRides],
  );

  const history = useMemo(
    () => myRides.filter(r => !isDriverActiveStatus(r.status) || r.status === 'PAID'),
    [myRides],
  );

  const displayedRide = useMemo(() => {
    if (selected) return selected;
    if (activeRide) return activeRide;
    if (availableRides.length > 0) return availableRides[0];
    return null;
  }, [selected, activeRide, availableRides]);

  const mapRegion = useMemo(() => {
    if (displayedRide) {
      const targetLat = Number(displayedRide.pickupLatitude);
      const targetLng = Number(displayedRide.pickupLongitude);
      const midLat = (driverCoord.latitude + targetLat) / 2;
      const midLng = (driverCoord.longitude + targetLng) / 2;
      const spanLat = Math.abs(driverCoord.latitude - targetLat) * 1.8 + 0.008;
      const spanLng = Math.abs(driverCoord.longitude - targetLng) * 1.8 + 0.008;
      return {
        latitude: midLat,
        longitude: midLng,
        latitudeDelta: spanLat,
        longitudeDelta: spanLng,
      };
    }

    return {
      latitude: driverCoord.latitude - 0.001,
      longitude: driverCoord.longitude,
      latitudeDelta: 0.006,
      longitudeDelta: 0.006,
    };
  }, [driverCoord, displayedRide?.id]);

  useEffect(() => {
    if (!mapRef.current) return;

    if (displayedRide) {
      mapRef.current.animateToRegion(mapRegion, 800);
    } else {
      mapRef.current.animateCamera(
        {
          center: {
            latitude: driverCoord.latitude - driverCoord.latitude * 0.000018,
            longitude: driverCoord.longitude,
          },
          pitch: 45,
          heading: 0,
          altitude: 500,
          zoom: 16,
        },
        { duration: 800 },
      );
    }
  }, [mapRegion, displayedRide?.id, driverCoord]);

  const ridePolyline = useMemo(() => {
    if (!displayedRide) return null;
    return [
      { latitude: driverCoord.latitude, longitude: driverCoord.longitude },
      { latitude: Number(displayedRide.pickupLatitude), longitude: Number(displayedRide.pickupLongitude) },
      { latitude: Number(displayedRide.dropoffLatitude), longitude: Number(displayedRide.dropoffLongitude) },
    ];
  }, [driverCoord, displayedRide?.id]);

  const fetchProfile = useCallback(async () => {
    const res = await apiRequest<DriverProfile>('/driver/profile');
    setProfile(res.data);
  }, []);

  const fetchMyRides = useCallback(async () => {
    const res = await apiRequest<PageResponse<RideResponse>>(
      '/rides/driver/my?page=0&size=50&sort=requestedAt,desc',
    );
    setMyRides(res.data.content ?? []);
  }, []);

  const fetchAvailableRides = useCallback(async () => {
    const res = await apiRequest<PageResponse<RideResponse>>(
      '/rides/available?page=0&size=20',
    );
    const content = res.data.content ?? [];
    const requestedOnly = content.filter(r => isOpportunityStatus(r.status));
    setAvailableRides(requestedOnly);
  }, []);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    setErrorMsg('');

    try {
      await Promise.all([
        fetchProfile(),
        fetchMyRides(),
        fetchAvailableRides(),
      ]);
    } catch (e: any) {
      setErrorMsg(formatError(e));
    } finally {
      setRefreshing(false);
    }
  }, [fetchProfile, fetchMyRides, fetchAvailableRides]);

  useEffect(() => {
    loadAll();
    const t = setInterval(() => loadAll(true), 8000);
    return () => clearInterval(t);
  }, [loadAll]);

  const handleSearch = async () => {
    const id = searchId.trim();
    if (!id) return;

    setApiLoading(true);
    try {
      const res = await apiRequest<RideResponse>(`/rides/${id}`);
      setSelected(res.data);
      setView(res.data.status === 'REQUESTED' ? 'opportunities' : 'active');
      setSnapIdx(1);
    } catch (e: any) {
      Alert.alert('Introuvable', formatError(e));
    } finally {
      setApiLoading(false);
    }
  };

  const handleAccept = async (id: string) => {
    setApiLoading(true);
    try {
      const res = await apiRequest<RideResponse>(`/rides/${id}/accept`, { method: 'POST' });
      setSelected(res.data);
      await loadAll(true);
      setView('active');
      setSnapIdx(1);
      Alert.alert('Succès', 'La course a été acceptée.');
    } catch (e: any) {
      Alert.alert('Erreur', formatError(e));
    } finally {
      setApiLoading(false);
    }
  };

  const handleProgress = async (ride: RideResponse) => {
    const next = FLOW_NEXT[ride.status];
    if (!next) return;

    setApiLoading(true);
    try {
      const res = await apiRequest<RideResponse>(
        `/rides/${ride.id}/status?status=${next}`,
        { method: 'PATCH' },
      );
      setSelected(res.data);
      await loadAll(true);
    } catch (e: any) {
      Alert.alert('Erreur', formatError(e));
    } finally {
      setApiLoading(false);
    }
  };

  const handleCancel = async (ride: RideResponse) => {
    Alert.alert('Annuler la course', "Confirmer l'annulation ?", [
      { text: 'Non', style: 'cancel' },
      {
        text: 'Oui, annuler',
        style: 'destructive',
        onPress: async () => {
          setApiLoading(true);
          try {
            const res = await apiRequest<RideResponse>(
              `/rides/${ride.id}/cancel?reason=Annulation+chauffeur`,
              { method: 'POST' },
            );
            setSelected(res.data);
            await loadAll(true);
          } catch (e: any) {
            Alert.alert('Erreur', formatError(e));
          } finally {
            setApiLoading(false);
          }
        },
      },
    ]);
  };

  const handleQr = async (ride: RideResponse) => {
    setApiLoading(true);
    try {
      const res = await apiRequest<QrCodeResponse>(`/qr/generate/${ride.id}`, { method: 'POST' });
      setQr(res.data);
      setQrVisible(true);
    } catch (e: any) {
      Alert.alert('Erreur QR', formatError(e));
    } finally {
      setApiLoading(false);
    }
  };

  const sheetHeader = (
    <View style={s.sheetHeader}>
      <View style={{ flex: 1 }}>
        <Text style={s.sheetTitle}>
          {view === 'opportunities'
            ? 'Opportunités'
            : activeRide
            ? 'Course active'
            : 'Mes courses'}
        </Text>
        <Text style={s.sheetSub}>
          {view === 'opportunities'
            ? `${availableRides.length} opportunité${availableRides.length > 1 ? 's' : ''}`
            : activeRide
            ? STATUS_META[activeRide.status].label
            : `${myRides.length} course${myRides.length > 1 ? 's' : ''}`}
        </Text>
      </View>

      <Avatar uri={imgUri} token={session?.accessToken} initials={initials} />

      <TouchableOpacity style={s.refreshBtn} onPress={() => loadAll()} disabled={refreshing} activeOpacity={0.7}>
        {refreshing ? (
          <ActivityIndicator color={C.accent} size="small" />
        ) : (
          <Text style={s.refreshIco}>↻</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={s.root}>
      <MapView
        ref={(r) => { mapRef.current = r; }}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        initialRegion={mapRegion}
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
        loadingBackgroundColor={C.mapBg}
        loadingIndicatorColor={C.accent}
      >
        <Marker
          coordinate={driverCoord}
          anchor={{ x: 0.5, y: 0.9 }}
          title={name}
          description={place}
        >
          <DriverMarker initials={initials} />
        </Marker>

        {displayedRide ? (
          <>
            <Marker
              coordinate={{
                latitude: Number(displayedRide.pickupLatitude),
                longitude: Number(displayedRide.pickupLongitude),
              }}
              anchor={{ x: 0.5, y: 1 }}
              title="Prise en charge"
              description={displayedRide.pickupAddress}
            >
              <View style={s.pickupMarker}>
                <View style={s.pickupMarkerInner} />
              </View>
            </Marker>

            <Marker
              coordinate={{
                latitude: Number(displayedRide.dropoffLatitude),
                longitude: Number(displayedRide.dropoffLongitude),
              }}
              anchor={{ x: 0.5, y: 1 }}
              title="Destination"
              description={displayedRide.dropoffAddress}
            >
              <View style={s.dropoffMarker}>
                <Text style={s.dropoffMarkerTxt}>▼</Text>
              </View>
            </Marker>

            {ridePolyline ? (
              <Polyline
                coordinates={ridePolyline}
                strokeColor={displayedRide.status === 'REQUESTED' ? C.warn : C.accent}
                strokeWidth={4}
              />
            ) : null}
          </>
        ) : null}
      </MapView>

      <View style={s.locationChip}>
        <View style={s.locationDot} />
        <Text style={s.locationTxt} numberOfLines={1}>{place}</Text>
        <View style={s.locationGpsBadge}>
          <Text style={s.locationGpsTxt}>{gpsState === 'active' ? '●' : '○'}</Text>
        </View>
      </View>

      <View style={s.searchWrap}>
        <View style={s.searchBox}>
          <Text style={s.searchIco}>⌕</Text>
          <TextInput
            style={s.searchInput}
            placeholder="UUID de la course…"
            placeholderTextColor={C.dim}
            value={searchId}
            onChangeText={setSearchId}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchId.length > 0 ? (
            <TouchableOpacity style={s.searchGoBtn} onPress={handleSearch} disabled={apiLoading} activeOpacity={0.8}>
              {apiLoading ? (
                <ActivityIndicator color={C.white} size="small" />
              ) : (
                <Text style={s.searchGoTxt}>→</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {availableRides.length > 0 && !activeRide ? (
        <View style={s.acceptBanner}>
          <View style={{ flex: 1 }}>
            <Text style={s.acceptTitle}>Nouvelle opportunité disponible</Text>
            <Text style={s.acceptRef}>{availableRides[0].reference}</Text>
          </View>
          <TouchableOpacity
            style={s.acceptBtn}
            onPress={() => handleAccept(availableRides[0].id)}
            disabled={apiLoading}
            activeOpacity={0.85}
          >
            {apiLoading ? (
              <ActivityIndicator color={C.white} size="small" />
            ) : (
              <Text style={s.acceptBtnTxt}>Accepter</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      <BottomSheet snapIndex={snapIdx} onSnap={i => setSnapIdx(i as 0 | 1 | 2)} header={sheetHeader}>
        <View style={{ paddingHorizontal: 16 }}>
          <View style={s.tabs}>
            {(['opportunities', 'active', 'history'] as const).map(t => (
              <TouchableOpacity
                key={t}
                style={[s.tab, view === t && s.tabActive]}
                onPress={() => setView(t)}
                activeOpacity={0.8}
              >
                <Text style={[s.tabTxt, view === t && s.tabTxtActive]}>
                  {t === 'opportunities' ? 'Opportunités' : t === 'active' ? 'Active' : 'Historique'}
                </Text>
                {t === 'opportunities' && availableRides.length > 0 ? (
                  <View style={s.tabBadge}><Text style={s.tabBadgeTxt}>{availableRides.length}</Text></View>
                ) : null}
                {t === 'active' && activeRide ? (
                  <View style={s.tabBadge}><Text style={s.tabBadgeTxt}>1</Text></View>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>

          {!!errorMsg ? (
            <View style={s.errorBox}>
              <Text style={s.errorTitle}>Erreur de chargement</Text>
              <Text style={s.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          {view === 'opportunities' ? (
            availableRides.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyIco}>🎯</Text>
                <Text style={s.emptyTitle}>Aucune opportunité pour le moment</Text>
                <Text style={s.emptySub}>Les nouvelles courses REQUESTED apparaîtront ici automatiquement.</Text>
              </View>
            ) : (
              <View style={{ marginTop: 6 }}>
                {availableRides.map(ride => (
                  <OpportunityCard
                    key={ride.id}
                    ride={ride}
                    onAccept={() => handleAccept(ride.id)}
                    loading={apiLoading}
                  />
                ))}
              </View>
            )
          ) : view === 'active' ? (
            activeRide || selected ? (
              <RideDetailCard
                ride={(selected && selected.status !== 'REQUESTED') ? selected : (activeRide as RideResponse)}
                onProgress={() => handleProgress((selected && selected.status !== 'REQUESTED') ? selected : (activeRide as RideResponse))}
                onCancel={() => handleCancel((selected && selected.status !== 'REQUESTED') ? selected : (activeRide as RideResponse))}
                onQr={() => handleQr((selected && selected.status !== 'REQUESTED') ? selected : (activeRide as RideResponse))}
                loading={apiLoading}
              />
            ) : (
              <View style={s.empty}>
                <Text style={s.emptyIco}>🚗</Text>
                <Text style={s.emptyTitle}>Aucune course active</Text>
                <Text style={s.emptySub}>Passez sur l’onglet Opportunités pour accepter une nouvelle course.</Text>
              </View>
            )
          ) : history.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyIco}>📋</Text>
              <Text style={s.emptyTitle}>Aucun historique</Text>
              <Text style={s.emptySub}>Vos courses terminées apparaîtront ici.</Text>
            </View>
          ) : (
            <View style={{ marginTop: 6 }}>
              {history.map(r => (
                <HistoryCard
                  key={r.id}
                  ride={r}
                  onPress={() => {
                    setSelected(r);
                    setView('active');
                    setSnapIdx(1);
                  }}
                />
              ))}
            </View>
          )}
        </View>
      </BottomSheet>

      <QrModal visible={qrVisible} qr={qr} onClose={() => setQrVisible(false)} />
    </View>
  );
}

export default RidesScreen;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.mapBg },

  driverAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: C.accent,
    marginRight: 8,
  },
  driverAvatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: C.accent,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accentS,
  },
  driverAvatarFallbackTxt: {
    color: C.accent,
    fontSize: 13,
    fontWeight: '900',
  },

  locationChip: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 14 : 10,
    left: 16,
    right: 80,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10,22,40,0.88)',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: 'rgba(108,99,255,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  locationDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  locationTxt: { flex: 1, color: C.txt, fontSize: 13, fontWeight: '700' },
  locationGpsBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: C.accentS },
  locationGpsTxt: { color: C.accent, fontSize: 10, fontWeight: '900' },

  searchWrap: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 58 : 54,
    left: 16,
    right: 16,
    zIndex: 20,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(19,19,26,0.96)',
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: C.border,
    paddingHorizontal: 14,
    height: 46,
    gap: 10,
  },
  searchIco: { fontSize: 17, color: C.muted },
  searchInput: {
    flex: 1,
    color: C.txt,
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  searchGoBtn: {
    backgroundColor: C.accent,
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchGoTxt: { color: C.white, fontSize: 15, fontWeight: '700' },

  acceptBanner: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 118 : 112,
    left: 16,
    right: 16,
    zIndex: 20,
    backgroundColor: 'rgba(19,19,26,0.96)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.ok,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  acceptTitle: { color: C.txt, fontSize: 13, fontWeight: '700' },
  acceptRef: {
    color: C.muted,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
  acceptBtn: {
    backgroundColor: C.ok,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  acceptBtnTxt: { color: C.white, fontSize: 13, fontWeight: '800' },

  pickupMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.accentG,
    borderWidth: 2.5,
    borderColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.accent,
    shadowOpacity: 0.7,
    shadowRadius: 6,
    elevation: 6,
  },
  pickupMarkerInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.accent,
  },
  dropoffMarker: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: C.ok,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.ok,
    shadowOpacity: 0.7,
    shadowRadius: 6,
    elevation: 6,
  },
  dropoffMarkerTxt: {
    color: C.white,
    fontSize: 11,
    fontWeight: '700',
    transform: [{ rotate: '180deg' }],
  },

  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sheetTitle: { color: C.txt, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  sheetSub: { color: C.muted, fontSize: 11, marginTop: 2 },
  refreshBtn: {
    width: 34,
    height: 34,
    backgroundColor: C.surface2,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshIco: { color: C.accent, fontSize: 17, fontWeight: '700' },

  tabs: {
    flexDirection: 'row',
    backgroundColor: C.surface2,
    borderRadius: 13,
    padding: 4,
    marginTop: 12,
    marginBottom: 12,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    gap: 6,
  },
  tabActive: { backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border },
  tabTxt: { color: C.muted, fontSize: 13, fontWeight: '500' },
  tabTxtActive: { color: C.txt, fontSize: 13, fontWeight: '700' },
  tabBadge: {
    backgroundColor: C.accent,
    minWidth: 15,
    height: 15,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeTxt: { color: C.white, fontSize: 9, fontWeight: '700' },

  errorBox: {
    backgroundColor: C.redS,
    borderColor: C.red,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  errorTitle: { color: C.red, fontSize: 13, fontWeight: '800', marginBottom: 4 },
  errorText: { color: C.white, fontSize: 12, lineHeight: 18 },

  empty: { alignItems: 'center', paddingVertical: 52, gap: 10 },
  emptyIco: { fontSize: 38 },
  emptyTitle: { color: C.txt, fontSize: 16, fontWeight: '700' },
  emptySub: { color: C.muted, fontSize: 13, textAlign: 'center', maxWidth: 240, lineHeight: 18 },
});