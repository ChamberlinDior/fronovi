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
import { apiRequest } from '../api/client';
import { useDriverGps } from '../hooks/useDriverGps';
import {
  PageResponse,
  QrCodeResponse,
  RideResponse,
  RideStatus,
} from '../types/api';

// ─── Dimensions ───────────────────────────────────────────────────────────────

const { height: H } = Dimensions.get('window');
const SNAP_POINTS = [90, Math.round(H * 0.48), Math.round(H * 0.88)];

// ─── Tokens ───────────────────────────────────────────────────────────────────

const C = {
  bg:       '#0A0A0F',
  surface:  '#13131A',
  surface2: '#1C1C26',
  border:   '#2A2A38',
  border2:  '#383848',
  accent:   '#6C63FF',
  accentS:  'rgba(108,99,255,0.12)',
  accentG:  'rgba(108,99,255,0.26)',
  ok:       '#22D3A5',
  okS:      'rgba(34,211,165,0.12)',
  warn:     '#F5A623',
  warnS:    'rgba(245,166,35,0.12)',
  red:      '#FF4D6D',
  redS:     'rgba(255,77,109,0.12)',
  txt:      '#F0EFF8',
  muted:    '#8A89A0',
  dim:      '#4A4A60',
  white:    '#FFFFFF',
  mapBg:    '#0a1628',
} as const;

// ─── Uber-style dark blue map style ──────────────────────────────────────────

const MAP_STYLE = [
  { elementType: 'geometry',             stylers: [{ color: '#0a1628' }] },
  { elementType: 'labels.text.stroke',   stylers: [{ color: '#0a1628' }] },
  { elementType: 'labels.text.fill',     stylers: [{ color: '#4a6fa5' }] },
  { featureType: 'administrative',        elementType: 'geometry',          stylers: [{ color: '#1c2d4a' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill',stylers: [{ color: '#c7d8ed' }] },
  { featureType: 'poi',                   elementType: 'geometry',          stylers: [{ color: '#0d1f38' }] },
  { featureType: 'poi',                   elementType: 'labels.text.fill',  stylers: [{ color: '#4a6fa5' }] },
  { featureType: 'poi.park',              elementType: 'geometry',          stylers: [{ color: '#0b2a1a' }] },
  { featureType: 'poi.park',              elementType: 'labels.text.fill',  stylers: [{ color: '#1a5c32' }] },
  { featureType: 'road',                  elementType: 'geometry',          stylers: [{ color: '#1a2f50' }] },
  { featureType: 'road',                  elementType: 'geometry.stroke',   stylers: [{ color: '#0d1f38' }] },
  { featureType: 'road',                  elementType: 'labels.text.fill',  stylers: [{ color: '#8fa8c8' }] },
  { featureType: 'road.arterial',         elementType: 'geometry',          stylers: [{ color: '#1e3660' }] },
  { featureType: 'road.highway',          elementType: 'geometry',          stylers: [{ color: '#1e4080' }] },
  { featureType: 'road.highway',          elementType: 'geometry.stroke',   stylers: [{ color: '#6C63FF33' }] },
  { featureType: 'road.highway',          elementType: 'labels.text.fill',  stylers: [{ color: '#b8cfe8' }] },
  { featureType: 'road.local',            elementType: 'labels.text.fill',  stylers: [{ color: '#5b7fa6' }] },
  { featureType: 'transit',               elementType: 'geometry',          stylers: [{ color: '#0d1f38' }] },
  { featureType: 'transit.station',       elementType: 'labels.text.fill',  stylers: [{ color: '#4a6fa5' }] },
  { featureType: 'water',                 elementType: 'geometry',          stylers: [{ color: '#051020' }] },
  { featureType: 'water',                 elementType: 'labels.text.fill',  stylers: [{ color: '#1a3a5c' }] },
];

// ─── Status metadata ──────────────────────────────────────────────────────────

const STATUS_META: Record<RideStatus, { label: string; color: string; bg: string; step: number }> = {
  REQUESTED:           { label: 'En attente',         color: C.warn,   bg: C.warnS,   step: 0 },
  DRIVER_ASSIGNED:     { label: 'Chauffeur assigné',   color: C.accent, bg: C.accentS, step: 1 },
  DRIVER_EN_ROUTE:     { label: 'En route',            color: C.accent, bg: C.accentS, step: 2 },
  DRIVER_ARRIVED:      { label: 'Arrivé au point',     color: C.ok,     bg: C.okS,     step: 3 },
  IN_PROGRESS:         { label: 'Course en cours',     color: C.ok,     bg: C.okS,     step: 4 },
  COMPLETED:           { label: 'Terminée',            color: C.ok,     bg: C.okS,     step: 5 },
  PAYMENT_PENDING:     { label: 'Paiement en attente', color: C.warn,   bg: C.warnS,   step: 5 },
  PAID:                { label: 'Payée',               color: C.ok,     bg: C.okS,     step: 6 },
  CANCELLED_BY_CLIENT: { label: 'Annulée (client)',    color: C.red,    bg: C.redS,    step: -1 },
  CANCELLED_BY_DRIVER: { label: 'Annulée (chauffeur)', color: C.red,    bg: C.redS,    step: -1 },
};

const FLOW_NEXT: Partial<Record<RideStatus, RideStatus>> = {
  DRIVER_ASSIGNED: 'DRIVER_EN_ROUTE',
  DRIVER_EN_ROUTE: 'DRIVER_ARRIVED',
  DRIVER_ARRIVED:  'IN_PROGRESS',
  IN_PROGRESS:     'COMPLETED',
};

const FLOW_LABEL: Partial<Record<RideStatus, string>> = {
  DRIVER_ASSIGNED: 'Démarrer le trajet',
  DRIVER_EN_ROUTE: 'Je suis arrivé',
  DRIVER_ARRIVED:  'Démarrer la course',
  IN_PROGRESS:     'Terminer la course',
};

const CANCELLABLE: RideStatus[] = ['REQUESTED', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(v?: number | null): string {
  if (v == null) return '—';
  return new Intl.NumberFormat('fr-GA', {
    style: 'currency', currency: 'XAF', maximumFractionDigits: 0,
  }).format(v);
}

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('fr-FR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function fmtDur(min?: number | null): string {
  if (!min) return '—';
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}

function isActiveStatus(s: RideStatus): boolean {
  return ['REQUESTED','DRIVER_ASSIGNED','DRIVER_EN_ROUTE','DRIVER_ARRIVED','IN_PROGRESS','COMPLETED'].includes(s);
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
    const city = a.city   || a.town          || a.village || a.county || '';
    if (nb && city) return `${nb}, ${city}`;
    if (nb)         return nb;
    if (city)       return city;
    return (json?.display_name ?? '').split(',').slice(0, 2).join(',').trim() || 'Position inconnue';
  } catch {
    return 'Position inconnue';
  }
}

// ─── Custom driver marker ─────────────────────────────────────────────────────

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
  wrap:     { alignItems: 'center' },
  bubble:   {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.accent, borderRadius: 20,
    paddingVertical: 6, paddingHorizontal: 11,
    borderWidth: 2, borderColor: '#fff',
    shadowColor: C.accent, shadowOpacity: 0.6,
    shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 8,
  },
  dot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: C.ok, borderWidth: 1.5, borderColor: '#fff' },
  initials: { color: '#fff', fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  tail:     {
    width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderTopColor: C.accent, marginTop: -1,
  },
});

// ─── StatusPill ───────────────────────────────────────────────────────────────

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
  wrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, gap: 5 },
  dot:  { width: 6, height: 6, borderRadius: 3 },
  txt:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
});

// ─── StepBar ──────────────────────────────────────────────────────────────────

function StepBar({ status }: { status: RideStatus }) {
  const step = STATUS_META[status]?.step ?? 0;
  if (step < 0) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 4, marginVertical: 12 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={{
          flex: 1, height: 3, borderRadius: 2,
          backgroundColor: i < step ? C.ok : i === step ? C.accent : C.border,
        }} />
      ))}
    </View>
  );
}

function Divider() {
  return <View style={{ height: 0.5, backgroundColor: C.border, marginVertical: 12 }} />;
}

// ─── QR Modal ────────────────────────────────────────────────────────────────

function QrModal({
  visible, qr, onClose,
}: {
  visible: boolean; qr: QrCodeResponse | null; onClose: () => void;
}) {
  const fade  = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fade,  { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, tension: 65, friction: 9, useNativeDriver: true }),
      ]).start();
    } else {
      fade.setValue(0);
      scale.setValue(0.88);
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[qm.overlay, { opacity: fade }]}>
        <Animated.View style={[qm.card, { transform: [{ scale }] }]}>
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
                <View style={[qm.corner, { top: -2, left: -2,  borderTopWidth: 3, borderLeftWidth: 3,  borderTopLeftRadius: 5 }]} />
                <View style={[qm.corner, { top: -2, right: -2, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 5 }]} />
                <View style={[qm.corner, { bottom: -2, left: -2,  borderBottomWidth: 3, borderLeftWidth: 3,  borderBottomLeftRadius: 5 }]} />
                <View style={[qm.corner, { bottom: -2, right: -2, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 5 }]} />
              </View>
              <View style={qm.metaRow}>
                <View style={qm.metaCell}>
                  <Text style={qm.metaLbl}>Token</Text>
                  <Text style={qm.metaVal} numberOfLines={1}>{qr.token.slice(0, 14)}…</Text>
                </View>
                <View style={{ width: 0.5, backgroundColor: C.border }} />
                <View style={qm.metaCell}>
                  <Text style={qm.metaLbl}>Expire</Text>
                  <Text style={qm.metaVal}>{fmtDate(qr.expiresAt)}</Text>
                </View>
              </View>
              <View style={[qm.validBadge, { backgroundColor: qr.valid ? C.okS : C.redS }]}>
                <Text style={[qm.validTxt, { color: qr.valid ? C.ok : C.red }]}>
                  {qr.valid ? '● QR Valide' : '● QR Expiré'}
                </Text>
              </View>
            </>
          ) : (
            <ActivityIndicator color={C.accent} style={{ marginVertical: 40 }} />
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const qm = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.86)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:       { backgroundColor: C.surface, borderRadius: 28, borderWidth: 0.5, borderColor: C.border, padding: 22, width: '100%', maxWidth: 370 },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  title:      { color: C.txt,   fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  sub:        { color: C.muted, fontSize: 12, marginTop: 3 },
  closeBtn:   { width: 32, height: 32, borderRadius: 10, backgroundColor: C.surface2, borderWidth: 0.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  closeTxt:   { color: C.muted, fontSize: 14, fontWeight: '700' },
  amountChip: { backgroundColor: C.okS, borderRadius: 14, borderWidth: 1, borderColor: C.ok, padding: 14, marginBottom: 18, alignItems: 'center' },
  amountLbl:  { color: C.ok, fontSize: 10, letterSpacing: 1.2, marginBottom: 4 },
  amountVal:  { color: C.ok, fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  imgWrap:    { position: 'relative', alignSelf: 'center', marginBottom: 18 },
  img:        { width: 240, height: 240, borderRadius: 12, backgroundColor: C.white },
  corner:     { position: 'absolute', width: 18, height: 18, borderColor: C.accent },
  metaRow:    { flexDirection: 'row', backgroundColor: C.surface2, borderRadius: 12, borderWidth: 0.5, borderColor: C.border, marginBottom: 12, overflow: 'hidden' },
  metaCell:   { flex: 1, padding: 12, alignItems: 'center' },
  metaLbl:    { color: C.muted, fontSize: 10, letterSpacing: 0.8, marginBottom: 4 },
  metaVal:    { color: C.txt, fontSize: 11, fontWeight: '600', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  validBadge: { borderRadius: 10, padding: 10, alignItems: 'center' },
  validTxt:   { fontSize: 13, fontWeight: '700' },
});

// ─── RideDetailCard ───────────────────────────────────────────────────────────

function RideDetailCard({
  ride, onProgress, onCancel, onQr, loading,
}: {
  ride: RideResponse;
  onProgress: () => void;
  onCancel: () => void;
  onQr: () => void;
  loading: boolean;
}) {
  const nextLabel = FLOW_LABEL[ride.status];
  const canCancel = CANCELLABLE.includes(ride.status);
  const canQr     = ride.status === 'COMPLETED';

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
        {ride.driverPhone ? (
          <View style={rd.callBadge}>
            <Text style={rd.callTxt}>📞 {ride.driverPhone}</Text>
          </View>
        ) : null}
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
            {loading
              ? <ActivityIndicator color={C.white} size="small" />
              : <Text style={rd.ctaPrimaryTxt}>{nextLabel}</Text>}
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
  wrap:          { backgroundColor: C.surface2, borderRadius: 20, borderWidth: 0.5, borderColor: C.border, padding: 16, marginBottom: 10 },
  headerRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  ref:           { color: C.txt, fontSize: 16, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', letterSpacing: 0.4 },
  date:          { color: C.muted, fontSize: 11, marginTop: 3 },
  clientRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar:        { width: 38, height: 38, borderRadius: 19, backgroundColor: C.accentS, borderWidth: 1, borderColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  avatarTxt:     { color: C.accent, fontSize: 15, fontWeight: '700' },
  clientName:    { color: C.txt,   fontSize: 14, fontWeight: '600' },
  clientLbl:     { color: C.muted, fontSize: 10, marginTop: 1 },
  callBadge:     { backgroundColor: C.okS, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
  callTxt:       { color: C.ok, fontSize: 10, fontWeight: '600' },
  routeRow:      { flexDirection: 'row', gap: 10 },
  dotCol:        { alignItems: 'center', paddingTop: 3, width: 14 },
  dotPickup:     { width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent, borderWidth: 2, borderColor: C.accentG },
  routeLine:     { width: 2, flex: 1, backgroundColor: C.border, marginVertical: 3, minHeight: 18 },
  dotDrop:       { width: 10, height: 10, backgroundColor: C.ok, transform: [{ rotate: '45deg' }] },
  routeLbl:      { color: C.dim, fontSize: 9, letterSpacing: 0.8, marginBottom: 2 },
  routeAddr:     { color: C.txt, fontSize: 13, fontWeight: '500', lineHeight: 18 },
  statsRow:      { flexDirection: 'row', gap: 7 },
  stat:          { flex: 1, backgroundColor: C.surface, borderRadius: 12, borderWidth: 0.5, borderColor: C.border, padding: 10, alignItems: 'center' },
  statVal:       { color: C.txt, fontSize: 14, fontWeight: '700' },
  statLbl:       { color: C.muted, fontSize: 9, marginTop: 3, textAlign: 'center' },
  ctaPrimary:    { backgroundColor: C.accent, borderRadius: 15, paddingVertical: 15, alignItems: 'center' },
  ctaPrimaryTxt: { color: C.white, fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  ctaSec:        { flex: 1, backgroundColor: C.accentS, borderRadius: 13, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: C.accent },
  ctaSecTxt:     { color: C.accent, fontSize: 12, fontWeight: '700' },
  ctaDanger:     { flex: 1, backgroundColor: C.redS, borderRadius: 13, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: C.red },
  ctaDangerTxt:  { color: C.red, fontSize: 12, fontWeight: '700' },
});

// ─── HistoryCard ──────────────────────────────────────────────────────────────

function HistoryCard({ ride, onPress }: { ride: RideResponse; onPress: () => void }) {
  const meta   = STATUS_META[ride.status];
  const fadeA  = useRef(new Animated.Value(0)).current;
  const slideA = useRef(new Animated.Value(14)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeA,  { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.timing(slideA, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={{ opacity: fadeA, transform: [{ translateY: slideA }] }}>
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
    </Animated.View>
  );
}

const hc = StyleSheet.create({
  wrap:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface2, borderRadius: 16, borderWidth: 0.5, borderColor: C.border, overflow: 'hidden', marginBottom: 8 },
  accent:    { width: 3, alignSelf: 'stretch' },
  topRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  ref:       { color: C.txt, fontSize: 12, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  addr:      { color: C.muted, fontSize: 11, marginBottom: 5 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between' },
  meta:      { color: C.dim, fontSize: 11 },
  fare:      { fontSize: 12, fontWeight: '700' },
  chevron:   { color: C.dim, fontSize: 22, paddingHorizontal: 10 },
});

// ─── Bottom Sheet ─────────────────────────────────────────────────────────────

function BottomSheet({
  children, header, snapIndex, onSnap,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
  snapIndex: number;
  onSnap: (i: number) => void;
}) {
  const transY = useRef(new Animated.Value(H - SNAP_POINTS[snapIndex])).current;
  const lastY  = useRef(H - SNAP_POINTS[snapIndex]);

  useEffect(() => {
    const target = H - SNAP_POINTS[snapIndex];
    Animated.spring(transY, { toValue: target, tension: 68, friction: 12, useNativeDriver: true }).start();
    lastY.current = target;
  }, [snapIndex]);

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
    })
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
  sheet:      { position: 'absolute', left: 0, right: 0, bottom: 0, height: H, backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 0.5, borderColor: C.border },
  handleArea: { paddingTop: 10, paddingHorizontal: 18, paddingBottom: 4 },
  pill:       { width: 36, height: 4, backgroundColor: C.border2, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
});

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

export function RidesScreen() {
  const mapRef = useRef<MapView | null>(null);
  const lastGeoRef = useRef<{ lat: number; lng: number } | null>(null);

  const [rides,       setRides]       = useState<RideResponse[]>([]);
  const [selected,    setSelected]    = useState<RideResponse | null>(null);
  const [qr,          setQr]          = useState<QrCodeResponse | null>(null);
  const [qrVisible,   setQrVisible]   = useState(false);
  const [apiLoading,  setApiLoading]  = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [searchId,    setSearchId]    = useState('');
  const [snapIdx,     setSnapIdx]     = useState<0 | 1 | 2>(1);
  const [view,        setView]        = useState<'active' | 'history'>('active');
  const [place,       setPlace]       = useState('Localisation en cours…');
  const [driverInitials] = useState('CH'); // fallback; remplacez par les vraies initiales si disponibles

  // GPS hook — même hook que DashboardScreen
  const { gpsState, lastPosition } = useDriverGps(true);

  // ── Driver coords from GPS ─────────────────────────────────────────────────
  const driverCoord = useMemo(() => ({
    latitude:  lastPosition?.latitude  ?? 0.4162,
    longitude: lastPosition?.longitude ?? 9.4673,
  }), [lastPosition]);

  // ── Reverse geocoding (throttle ~50m) ─────────────────────────────────────
  useEffect(() => {
    const { latitude, longitude } = driverCoord;
    if (!latitude || !longitude) return;
    const prev = lastGeoRef.current;
    if (prev && Math.abs(prev.lat - latitude) < 0.00045 && Math.abs(prev.lng - longitude) < 0.00045) return;
    lastGeoRef.current = { lat: latitude, lng: longitude };
    reverseGeocode(latitude, longitude).then(setPlace);
  }, [driverCoord]);

  const activeRide  = useMemo(() => rides.find(r => isActiveStatus(r.status)) ?? null, [rides]);
  const displayRide = selected ?? activeRide;
  const history     = useMemo(() => rides.filter(r => !isActiveStatus(r.status) || r.status === 'PAID'), [rides]);

  // ── Map region: center on driver, or on ride if active ────────────────────
  const mapRegion = useMemo(() => {
    if (displayRide) {
      // Show both driver and ride — center between driver and pickup
      const midLat = (driverCoord.latitude + Number(displayRide.pickupLatitude)) / 2;
      const midLng = (driverCoord.longitude + Number(displayRide.pickupLongitude)) / 2;
      const spanLat = Math.abs(driverCoord.latitude - Number(displayRide.pickupLatitude)) * 1.8 + 0.006;
      const spanLng = Math.abs(driverCoord.longitude - Number(displayRide.pickupLongitude)) * 1.8 + 0.006;
      return { latitude: midLat, longitude: midLng, latitudeDelta: spanLat, longitudeDelta: spanLng };
    }
    return {
      latitude:  driverCoord.latitude  - 0.001, // slight south offset = driver upper-center
      longitude: driverCoord.longitude,
      latitudeDelta:  0.006,
      longitudeDelta: 0.006,
    };
  }, [driverCoord, displayRide?.id]);

  // ── Animate map + camera when region changes ───────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    if (displayRide) {
      mapRef.current.animateToRegion(mapRegion, 800);
    } else {
      // Uber-style: driver centered-left, pitch 45, zoom 16
      mapRef.current.animateCamera(
        {
          center: {
            latitude:  driverCoord.latitude  - driverCoord.latitude * 0.000018,
            longitude: driverCoord.longitude,
          },
          pitch:   45,
          heading: 0,
          altitude: 500,
          zoom:    16,
        },
        { duration: 800 },
      );
    }
  }, [mapRegion, displayRide?.id]);

  // Polyline for active ride
  const ridePolyline = useMemo(() => {
    if (!displayRide) return null;
    return [
      { latitude: driverCoord.latitude,                   longitude: driverCoord.longitude },
      { latitude: Number(displayRide.pickupLatitude),     longitude: Number(displayRide.pickupLongitude) },
      { latitude: Number(displayRide.dropoffLatitude),    longitude: Number(displayRide.dropoffLongitude) },
    ];
  }, [driverCoord, displayRide?.id]);

  // ── Data ───────────────────────────────────────────────────────────────────

  const loadRides = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await apiRequest<PageResponse<RideResponse>>(
        '/rides/driver/my?page=0&size=50&sort=requestedAt,desc'
      );
      setRides(res.data.content ?? []);
    } catch (e: any) {
      if (!silent) Alert.alert('Erreur', e?.message ?? 'Indisponible');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadRides();
    const t = setInterval(() => loadRides(true), 15_000);
    return () => clearInterval(t);
  }, [loadRides]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleSearch = async () => {
    const id = searchId.trim();
    if (!id) return;
    setApiLoading(true);
    try {
      const res = await apiRequest<RideResponse>(`/rides/${id}`);
      setSelected(res.data);
      setView('active');
      setSnapIdx(1);
    } catch (e: any) {
      Alert.alert('Introuvable', e?.message ?? 'Course introuvable');
    } finally {
      setApiLoading(false);
    }
  };

  const handleAccept = async (id: string) => {
    setApiLoading(true);
    try {
      const res = await apiRequest<RideResponse>(`/rides/${id}/accept`, { method: 'POST' });
      setSelected(res.data);
      await loadRides(true);
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Acceptation impossible');
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
        `/rides/${ride.id}/status?status=${next}`, { method: 'PATCH' }
      );
      setSelected(res.data);
      await loadRides(true);
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible');
    } finally {
      setApiLoading(false);
    }
  };

  const handleCancel = async (ride: RideResponse) => {
    Alert.alert('Annuler la course', "Confirmer l'annulation ?", [
      { text: 'Non', style: 'cancel' },
      {
        text: 'Oui, annuler', style: 'destructive',
        onPress: async () => {
          setApiLoading(true);
          try {
            const res = await apiRequest<RideResponse>(
              `/rides/${ride.id}/cancel?reason=Annulation+chauffeur`, { method: 'POST' }
            );
            setSelected(res.data);
            await loadRides(true);
          } catch (e: any) {
            Alert.alert('Erreur', e?.message ?? 'Annulation impossible');
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
      Alert.alert('Erreur QR', e?.message ?? 'Génération impossible');
    } finally {
      setApiLoading(false);
    }
  };

  // ── Sheet header ───────────────────────────────────────────────────────────

  const sheetHeader = (
    <View style={s.sheetHeader}>
      <View style={{ flex: 1 }}>
        <Text style={s.sheetTitle}>{activeRide ? 'Course active' : 'Mes courses'}</Text>
        <Text style={s.sheetSub}>
          {activeRide
            ? STATUS_META[activeRide.status].label
            : `${rides.length} course${rides.length !== 1 ? 's' : ''}`}
        </Text>
      </View>
      {activeRide ? <StatusPill status={activeRide.status} /> : null}
      <TouchableOpacity style={s.refreshBtn} onPress={() => loadRides()} disabled={refreshing} activeOpacity={0.7}>
        {refreshing
          ? <ActivityIndicator color={C.accent} size="small" />
          : <Text style={s.refreshIco}>↻</Text>}
      </TouchableOpacity>
    </View>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={s.root}>

      {/* ── Full-screen Google Map ── */}
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
        {/* Driver marker */}
        <Marker
          coordinate={driverCoord}
          anchor={{ x: 0.5, y: 0.9 }}
          title="Ma position"
          description={place}
        >
          <DriverMarker initials={driverInitials} />
        </Marker>

        {/* Active ride markers + polyline */}
        {displayRide ? (
          <>
            {/* Pickup */}
            <Marker
              coordinate={{
                latitude:  Number(displayRide.pickupLatitude),
                longitude: Number(displayRide.pickupLongitude),
              }}
              anchor={{ x: 0.5, y: 1 }}
              title="Prise en charge"
              description={displayRide.pickupAddress}
            >
              <View style={s.pickupMarker}>
                <View style={s.pickupMarkerInner} />
              </View>
            </Marker>

            {/* Dropoff */}
            <Marker
              coordinate={{
                latitude:  Number(displayRide.dropoffLatitude),
                longitude: Number(displayRide.dropoffLongitude),
              }}
              anchor={{ x: 0.5, y: 1 }}
              title="Destination"
              description={displayRide.dropoffAddress}
            >
              <View style={s.dropoffMarker}>
                <Text style={s.dropoffMarkerTxt}>▼</Text>
              </View>
            </Marker>

            {/* Route polyline */}
            {ridePolyline ? (
              <Polyline
                coordinates={ridePolyline}
                strokeColor={C.accent}
                strokeWidth={4}
                lineDashPattern={[0]}
              />
            ) : null}
          </>
        ) : null}
      </MapView>

      {/* ── Location overlay (top-left, Uber style) ── */}
      <View style={s.locationChip}>
        <View style={s.locationDot} />
        <Text style={s.locationTxt} numberOfLines={1}>{place}</Text>
        <View style={s.locationGpsBadge}>
          <Text style={s.locationGpsTxt}>{gpsState === 'active' ? '●' : '○'}</Text>
        </View>
      </View>

      {/* ── Search bar ── */}
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
              {apiLoading
                ? <ActivityIndicator color={C.white} size="small" />
                : <Text style={s.searchGoTxt}>→</Text>}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* ── Accept banner ── */}
      {selected?.status === 'REQUESTED' ? (
        <View style={s.acceptBanner}>
          <View style={{ flex: 1 }}>
            <Text style={s.acceptTitle}>Course disponible</Text>
            <Text style={s.acceptRef}>{selected.reference}</Text>
          </View>
          <TouchableOpacity style={s.acceptBtn} onPress={() => handleAccept(selected.id)} disabled={apiLoading} activeOpacity={0.85}>
            {apiLoading
              ? <ActivityIndicator color={C.white} size="small" />
              : <Text style={s.acceptBtnTxt}>Accepter</Text>}
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ── Bottom Sheet ── */}
      <BottomSheet snapIndex={snapIdx} onSnap={i => setSnapIdx(i as 0 | 1 | 2)} header={sheetHeader}>
        <View style={{ paddingHorizontal: 16 }}>
          <View style={s.tabs}>
            {(['active', 'history'] as const).map(t => (
              <TouchableOpacity key={t} style={[s.tab, view === t && s.tabActive]} onPress={() => setView(t)} activeOpacity={0.8}>
                <Text style={[s.tabTxt, view === t && s.tabTxtActive]}>
                  {t === 'active' ? 'Active' : 'Historique'}
                </Text>
                {t === 'active' && activeRide ? (
                  <View style={s.tabBadge}><Text style={s.tabBadgeTxt}>1</Text></View>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>

          {view === 'active' ? (
            displayRide ? (
              <RideDetailCard
                ride={displayRide}
                onProgress={() => handleProgress(displayRide)}
                onCancel={() => handleCancel(displayRide)}
                onQr={() => handleQr(displayRide)}
                loading={apiLoading}
              />
            ) : (
              <View style={s.empty}>
                <Text style={s.emptyIco}>🚗</Text>
                <Text style={s.emptyTitle}>Aucune course active</Text>
                <Text style={s.emptySub}>Recherchez par UUID ou attendez une assignation</Text>
              </View>
            )
          ) : (
            history.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyIco}>📋</Text>
                <Text style={s.emptyTitle}>Aucun historique</Text>
                <Text style={s.emptySub}>Vos courses terminées apparaîtront ici</Text>
              </View>
            ) : (
              <View style={{ marginTop: 6 }}>
                {history.map(r => (
                  <HistoryCard
                    key={r.id}
                    ride={r}
                    onPress={() => { setSelected(r); setView('active'); setSnapIdx(1); }}
                  />
                ))}
              </View>
            )
          )}
        </View>
      </BottomSheet>

      {/* ── QR Modal ── */}
      <QrModal visible={qrVisible} qr={qr} onClose={() => setQrVisible(false)} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.mapBg },

  // Location chip — top-left Uber style
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
  locationDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  locationTxt:   { flex: 1, color: C.txt, fontSize: 13, fontWeight: '700' },
  locationGpsBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: C.accentS },
  locationGpsTxt:   { color: C.accent, fontSize: 10, fontWeight: '900' },

  // Search bar
  searchWrap: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 58 : 54,
    left: 16, right: 16, zIndex: 20,
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(19,19,26,0.96)',
    borderRadius: 16, borderWidth: 0.5, borderColor: C.border,
    paddingHorizontal: 14, height: 46, gap: 10,
  },
  searchIco:   { fontSize: 17, color: C.muted },
  searchInput: { flex: 1, color: C.txt, fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  searchGoBtn: { backgroundColor: C.accent, width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  searchGoTxt: { color: C.white, fontSize: 15, fontWeight: '700' },

  // Accept banner
  acceptBanner: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 118 : 112,
    left: 16, right: 16, zIndex: 20,
    backgroundColor: 'rgba(19,19,26,0.96)',
    borderRadius: 16, borderWidth: 1, borderColor: C.accent,
    padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  acceptTitle:  { color: C.txt,   fontSize: 13, fontWeight: '700' },
  acceptRef:    { color: C.muted, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginTop: 2 },
  acceptBtn:    { backgroundColor: C.accent, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
  acceptBtnTxt: { color: C.white, fontSize: 13, fontWeight: '800' },

  // Custom markers
  pickupMarker: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: C.accentG, borderWidth: 2.5, borderColor: C.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.accent, shadowOpacity: 0.7, shadowRadius: 6, elevation: 6,
  },
  pickupMarkerInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  dropoffMarker: {
    width: 26, height: 26, borderRadius: 7,
    backgroundColor: C.ok, alignItems: 'center', justifyContent: 'center',
    shadowColor: C.ok, shadowOpacity: 0.7, shadowRadius: 6, elevation: 6,
  },
  dropoffMarkerTxt: { color: C.white, fontSize: 11, fontWeight: '700', transform: [{ rotate: '180deg' }] },

  // Sheet header
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sheetTitle:  { color: C.txt, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  sheetSub:    { color: C.muted, fontSize: 11, marginTop: 2 },
  refreshBtn:  { width: 34, height: 34, backgroundColor: C.surface2, borderRadius: 10, borderWidth: 0.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  refreshIco:  { color: C.accent, fontSize: 17, fontWeight: '700' },

  // Tabs
  tabs:        { flexDirection: 'row', backgroundColor: C.surface2, borderRadius: 13, padding: 4, marginTop: 12, marginBottom: 12, gap: 4 },
  tab:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 10, gap: 6 },
  tabActive:   { backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border },
  tabTxt:      { color: C.muted, fontSize: 13, fontWeight: '500' },
  tabTxtActive:{ color: C.txt,   fontSize: 13, fontWeight: '700' },
  tabBadge:    { backgroundColor: C.accent, width: 15, height: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tabBadgeTxt: { color: C.white, fontSize: 9, fontWeight: '700' },

  // Empty
  empty:      { alignItems: 'center', paddingVertical: 52, gap: 10 },
  emptyIco:   { fontSize: 38 },
  emptyTitle: { color: C.txt,   fontSize: 16, fontWeight: '700' },
  emptySub:   { color: C.muted, fontSize: 13, textAlign: 'center', maxWidth: 240, lineHeight: 18 },
});