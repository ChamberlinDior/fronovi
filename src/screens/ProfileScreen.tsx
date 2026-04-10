import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { apiRequest, ApiHttpError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { DriverProfile } from '../types/api';
import { AppButton, AppInput } from '../components/UI';

const D = {
  bg: '#05090F',
  card: '#0B1420',
  cardAlt: '#0F1B2F',
  input: '#111E30',
  gold: '#F5C518',
  goldDim: 'rgba(245,197,24,0.14)',
  goldBorder: 'rgba(245,197,24,0.30)',
  green: '#10B981',
  red: '#EF4444',
  text: '#F0F6FF',
  textSub: '#8FA3BF',
  textMuted: '#4A627A',
  border: 'rgba(255,255,255,0.07)',
  borderMid: 'rgba(255,255,255,0.11)',
  r: { sm: 10, md: 16, lg: 22, xl: 28, full: 999 },
};

const VEHICLE_TYPES = ['Berline', 'SUV', 'Van', 'Moto', 'Taxi urbain', 'Autre'];
const VEHICLE_COLORS = ['Noir', 'Blanc', 'Gris', 'Bleu', 'Rouge', 'Jaune', 'Vert', 'Autre'];
const VEHICLE_SEATS = ['2', '4', '5', '7', '8'];

type EditMode = 'photo' | 'identity' | 'vehicle' | null;
type InlineSelectorMode = 'birthDate' | 'licenseDate' | 'vehicleType' | 'vehicleColor' | 'vehicleSeats' | null;

type UploadPhotoResponse = {
  fileName?: string;
  contentType?: string;
  size?: number;
  viewUrl?: string;
};

const log = (tag: string, ...args: any[]) => console.log(`[PROFILE:${tag}]`, ...args);

function fmtError(e: any) {
  if (e instanceof ApiHttpError) {
    return [e.message, e.status && `HTTP ${e.status}`, e.errorCode && `Code: ${e.errorCode}`]
      .filter(Boolean)
      .join(' · ');
  }
  return e?.message || 'Action impossible';
}

const fmtDate = (v?: string) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString('fr-FR');
};

const toISO = (v?: string) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

function resolveImageUrl(base: string, path?: string) {
  if (!path?.trim()) return '';
  const p = path.trim();

  if (p.startsWith('file://') || p.startsWith('http://') || p.startsWith('https://')) {
    return p;
  }

  const normalizedBase = base.replace(/\/+$/, '');
  const normalizedPath = p.startsWith('/') ? p : `/${p}`;
  return `${normalizedBase}${normalizedPath}`;
}

const bust = (url?: string) =>
  url ? `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}` : '';

const statusColor = (s?: string) => {
  if (!s) return D.textMuted;
  const l = s.toLowerCase();
  if (l.includes('active') || l.includes('actif') || l.includes('approved') || l.includes('offline')) return D.green;
  if (l.includes('pending') || l.includes('attente')) return D.gold;
  return D.red;
};

const fmtStatus = (s?: string) =>
  s ? s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : 'Inconnu';

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function InfoRow({ label, value, color }: { label: string; value?: any; color?: string }) {
  return (
    <View style={S.infoRow}>
      <Text style={S.infoLabel}>{label}</Text>
      <Text style={[S.infoValue, color ? { color } : null]}>
        {value != null && value !== '' ? String(value) : '—'}
      </Text>
    </View>
  );
}

function Card({
  title,
  sub,
  icon,
  onEdit,
  children,
}: {
  title: string;
  sub?: string;
  icon?: string;
  onEdit?: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={S.card}>
      <View style={S.cardHead}>
        {icon ? (
          <View style={S.cardIcon}>
            <Text style={{ fontSize: 17 }}>{icon}</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={S.cardTitle}>{title}</Text>
          {sub ? <Text style={S.cardSub}>{sub}</Text> : null}
        </View>
        {onEdit ? (
          <Pressable style={S.editPill} onPress={onEdit}>
            <Text style={S.editPillTxt}>Modifier</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={{ height: 1, backgroundColor: D.border, marginVertical: 2 }} />
      <View style={{ marginTop: 10 }}>{children}</View>
    </View>
  );
}

function Avatar({
  uri,
  authToken,
  initials,
  size,
  ring,
}: {
  uri?: string;
  authToken?: string;
  initials: string;
  size: number;
  ring?: boolean;
}) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [uri, authToken]);

  const borderStyle = ring ? { borderWidth: 3, borderColor: D.gold } : {};
  const circleStyle = { width: size, height: size, borderRadius: size / 2 };

  if (uri && !imgError) {
    return (
      <Image
        source={
          authToken
            ? { uri, headers: { Authorization: `Bearer ${authToken}` } }
            : { uri }
        }
        style={[circleStyle, borderStyle]}
        onLoad={() => log('IMG', 'loaded ✓', uri.substring(0, 120))}
        onError={e => {
          log('IMG', 'error ✗', uri.substring(0, 120), e.nativeEvent);
          setImgError(true);
        }}
      />
    );
  }

  return (
    <View
      style={[
        circleStyle,
        borderStyle,
        {
          backgroundColor: D.goldDim,
          alignItems: 'center',
          justifyContent: 'center',
        },
      ]}
    >
      <Text style={{ fontSize: size * 0.33, fontWeight: '900', color: D.gold }}>{initials}</Text>
    </View>
  );
}

function FooterBtn({ label, onPress, ghost }: { label: string; onPress: () => void; ghost?: boolean }) {
  return (
    <Pressable style={ghost ? S.footerBtnGhost : S.footerBtnPrimary} onPress={onPress}>
      <Text style={ghost ? S.footerBtnGhostTxt : S.footerBtnPrimaryTxt}>{label}</Text>
    </Pressable>
  );
}

function SelectBox({
  label,
  value,
  placeholder,
  onPress,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={S.selectBox} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={S.selectLabel}>{label}</Text>
        <Text style={S.selectValue}>{value || placeholder || 'Sélectionner'}</Text>
      </View>
      <Text style={{ fontSize: 20, color: D.gold }}>›</Text>
    </Pressable>
  );
}

export function ProfileScreen() {
  const { user, session, logout, apiBaseUrl, refreshLocalSession } = useAuth();

  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [editMode, setEditMode] = useState<EditMode>(null);
  const [selectorMode, setSelectorMode] = useState<InlineSelectorMode>(null);

  const [localUri, setLocalUri] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [pictureUrl, setPictureUrl] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [licenseNum, setLicenseNum] = useState('');
  const [licenseExp, setLicenseExp] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [vType, setVType] = useState('');
  const [seats, setSeats] = useState('');
  const [plate, setPlate] = useState('');

  const [tmpY, setTmpY] = useState(1995);
  const [tmpM, setTmpM] = useState(1);
  const [tmpD, setTmpD] = useState(1);

  const accessToken = session?.accessToken || '';

  const previewUri = useMemo(() => {
    if (localUri) {
      log('PREVIEW', 'local URI →', localUri.substring(0, 120));
      return localUri;
    }

    const raw = pictureUrl || user?.profilePictureUrl || '';
    const resolved = resolveImageUrl(apiBaseUrl, raw);
    const busted = bust(resolved);

    log('PREVIEW', 'remote resolved →', busted ? busted.substring(0, 160) : '');
    return busted;
  }, [localUri, pictureUrl, user?.profilePictureUrl, apiBaseUrl, refreshKey]);

  const initials = ((firstName[0] || user?.firstName?.[0] || 'C') + (lastName[0] || user?.lastName?.[0] || '')).toUpperCase();
  const fullName = `${firstName || user?.firstName || ''} ${lastName || user?.lastName || ''}`.trim() || '—';

  function hydrate(d: DriverProfile | null) {
    const v = {
      pictureUrl: d?.user?.profilePictureUrl || user?.profilePictureUrl || '',
      firstName: d?.user?.firstName || user?.firstName || '',
      lastName: d?.user?.lastName || user?.lastName || '',
      email: d?.user?.email || user?.email || '',
      phone: d?.user?.phoneNumber || user?.phoneNumber || '',
      dob: toISO(d?.user?.dateOfBirth) || toISO(user?.dateOfBirth),
      licenseNum: d?.licenseNumber || '',
      licenseExp: d?.licenseExpiryDate || '',
      nationalId: d?.nationalId || '',
      make: d?.currentVehicle?.make || '',
      model: d?.currentVehicle?.model || '',
      year: d?.currentVehicle?.year ? String(d.currentVehicle.year) : '',
      color: d?.currentVehicle?.color || '',
      vType: d?.currentVehicle?.type || '',
      seats: d?.currentVehicle?.seats ? String(d.currentVehicle.seats) : '',
      plate: d?.currentVehicle?.plateNumber || '',
    };

    setPictureUrl(v.pictureUrl);
    setFirstName(v.firstName);
    setLastName(v.lastName);
    setEmail(v.email);
    setPhone(v.phone);
    setDob(v.dob);
    setLicenseNum(v.licenseNum);
    setLicenseExp(v.licenseExp);
    setNationalId(v.nationalId);
    setMake(v.make);
    setModel(v.model);
    setYear(v.year);
    setColor(v.color);
    setVType(v.vType);
    setSeats(v.seats);
    setPlate(v.plate);

    log('HYDRATE', 'pictureUrl =', v.pictureUrl);
  }

  async function loadProfile() {
    try {
      setLoading(true);
      const res = await apiRequest<DriverProfile>('/driver/profile');
      log('LOAD', 'success, profilePictureUrl =', res.data?.user?.profilePictureUrl);
      setProfile(res.data);
      hydrate(res.data);
      setRefreshKey(k => k + 1);
    } catch (e: any) {
      log('LOAD', 'error', e);
      Alert.alert('Erreur', fmtError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
  }, []);

  async function pickPhoto() {
    try {
      const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission refusée', "L'accès à la galerie est requis.");
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });

      if (res.canceled) {
        log('PHOTO', 'picker cancelled');
        return;
      }

      const asset = res.assets?.[0];
      if (!asset?.uri) {
        log('PHOTO', 'no asset URI');
        return;
      }

      log('PHOTO', 'asset selected', JSON.stringify({ uri: asset.uri.substring(0, 120), mime: asset.mimeType }));

      setLocalUri(asset.uri);
      setUploading(true);

      const fd = new FormData();
      fd.append('file', {
        uri: asset.uri,
        name: asset.fileName || `profile_${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      } as any);

      const upload = await apiRequest<UploadPhotoResponse>('/driver/profile/photo', {
        method: 'POST',
        body: fd,
      });

      log('PHOTO', 'upload response', JSON.stringify(upload.data));

      if (upload.data?.viewUrl) {
        setPictureUrl(upload.data.viewUrl);
      } else {
        setPictureUrl('/driver/profile/photo');
      }

      setLocalUri('');
      await loadProfile();
      await refreshLocalSession();
      setRefreshKey(k => k + 1);

      Alert.alert('Photo mise à jour', 'La photo a été enregistrée avec succès.');
    } catch (e: any) {
      log('PHOTO', 'error', e);
      Alert.alert('Erreur', fmtError(e));
    } finally {
      setUploading(false);
    }
  }

  async function saveProfile() {
    try {
      setSaving(true);

      const body = {
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        email: email.trim() || null,
        phoneNumber: phone.trim() || null,
        dateOfBirth: dob || null,
        licenseNumber: licenseNum.trim() || null,
        licenseExpiryDate: licenseExp || null,
        nationalId: nationalId.trim() || null,
        vehicleMake: make.trim() || null,
        vehicleModel: model.trim() || null,
        vehicleYear: year.trim() ? Number(year) : null,
        vehicleColor: color || null,
        vehicleType: vType || null,
        vehicleSeats: seats ? Number(seats) : null,
        plateNumber: plate.trim() || null,
      };

      log('SAVE', 'payload', JSON.stringify(body));

      await apiRequest<DriverProfile>('/driver/profile', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });

      await loadProfile();
      await refreshLocalSession();
      setEditMode(null);
      setSelectorMode(null);

      Alert.alert('Profil mis à jour', 'Les modifications ont été enregistrées.');
    } catch (e: any) {
      log('SAVE', 'error', e);
      Alert.alert('Erreur', fmtError(e));
    } finally {
      setSaving(false);
    }
  }

  function openDate(mode: 'birthDate' | 'licenseDate') {
    const src = mode === 'birthDate' ? dob : licenseExp;
    const [y, m, d] = (src || '1995-01-01').split('-').map(Number);
    setTmpY(y || 1995);
    setTmpM(m || 1);
    setTmpD(d || 1);
    setSelectorMode(mode);
  }

  function confirmDate() {
    const maxD = new Date(tmpY, tmpM, 0).getDate();
    const iso = `${tmpY}-${String(tmpM).padStart(2, '0')}-${String(Math.min(tmpD, maxD)).padStart(2, '0')}`;

    if (selectorMode === 'birthDate') setDob(iso);
    if (selectorMode === 'licenseDate') setLicenseExp(iso);

    setSelectorMode(null);
  }

  function renderInlineSelector() {
    if (!selectorMode) return null;

    if (selectorMode === 'birthDate' || selectorMode === 'licenseDate') {
      const years = Array.from({ length: selectorMode === 'birthDate' ? 80 : 25 }, (_, i) =>
        selectorMode === 'birthDate' ? new Date().getFullYear() - i : new Date().getFullYear() + i
      );
      const months = Array.from({ length: 12 }, (_, i) => i + 1);
      const days = Array.from({ length: daysInMonth(tmpY, tmpM) }, (_, i) => i + 1);

      return (
        <View style={S.inlineSelectorWrap}>
          <Text style={S.sheetTitle}>
            {selectorMode === 'birthDate' ? 'Date de naissance' : 'Expiration licence'}
          </Text>

          <View style={{ flexDirection: 'row', gap: 6 }}>
            <ScrollView style={S.dateCol} showsVerticalScrollIndicator={false}>
              {days.map(v => (
                <Pressable key={v} style={[S.dateItem, tmpD === v && S.dateItemOn]} onPress={() => setTmpD(v)}>
                  <Text style={[S.dateItemTxt, tmpD === v && S.dateItemTxtOn]}>{String(v).padStart(2, '0')}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <ScrollView style={S.dateCol} showsVerticalScrollIndicator={false}>
              {months.map(v => (
                <Pressable key={v} style={[S.dateItem, tmpM === v && S.dateItemOn]} onPress={() => setTmpM(v)}>
                  <Text style={[S.dateItemTxt, tmpM === v && S.dateItemTxtOn]}>{String(v).padStart(2, '0')}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <ScrollView style={S.dateCol} showsVerticalScrollIndicator={false}>
              {years.map(v => (
                <Pressable key={v} style={[S.dateItem, tmpY === v && S.dateItemOn]} onPress={() => setTmpY(v)}>
                  <Text style={[S.dateItemTxt, tmpY === v && S.dateItemTxtOn]}>{v}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={S.sheetFooter}>
            <FooterBtn label="Annuler" ghost onPress={() => setSelectorMode(null)} />
            <FooterBtn label="Valider" onPress={confirmDate} />
          </View>
        </View>
      );
    }

    const opts: Record<string, string[]> = {
      vehicleType: VEHICLE_TYPES,
      vehicleColor: VEHICLE_COLORS,
      vehicleSeats: VEHICLE_SEATS,
    };

    const titles: Record<string, string> = {
      vehicleType: 'Type de véhicule',
      vehicleColor: 'Couleur',
      vehicleSeats: 'Nombre de places',
    };

    function pick(v: string) {
      if (selectorMode === 'vehicleType') setVType(v);
      if (selectorMode === 'vehicleColor') setColor(v);
      if (selectorMode === 'vehicleSeats') setSeats(v);
      setSelectorMode(null);
    }

    return (
      <View style={S.inlineSelectorWrap}>
        <Text style={S.sheetTitle}>{titles[selectorMode]}</Text>

        <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
          {(opts[selectorMode] || []).map(o => (
            <Pressable key={o} style={S.optionItem} onPress={() => pick(o)}>
              <Text style={S.optionTxt}>{o}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={S.sheetFooter}>
          <FooterBtn label="Fermer" ghost onPress={() => setSelectorMode(null)} />
        </View>
      </View>
    );
  }

  function renderEdit() {
    if (editMode === 'photo') {
      return (
        <>
          <Text style={S.modalTitle}>Photo de profil</Text>
          <View style={S.photoCentre}>
            <Avatar uri={previewUri} authToken={accessToken} initials={initials} size={120} ring />
          </View>
          <AppButton
            label={uploading ? 'Upload en cours…' : 'Choisir depuis la galerie'}
            onPress={pickPhoto}
            loading={uploading}
          />
        </>
      );
    }

    if (editMode === 'identity') {
      return (
        <>
          <Text style={S.modalTitle}>Identité chauffeur</Text>
          <View style={S.row2}>
            <View style={{ flex: 1 }}>
              <AppInput label="Prénom" value={firstName} onChangeText={setFirstName} />
            </View>
            <View style={{ flex: 1 }}>
              <AppInput label="Nom" value={lastName} onChangeText={setLastName} />
            </View>
          </View>

          <AppInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <AppInput label="Téléphone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <SelectBox label="Date de naissance" value={dob} placeholder="Choisir la date" onPress={() => openDate('birthDate')} />
          <AppInput label="Numéro de licence" value={licenseNum} onChangeText={setLicenseNum} />
          <SelectBox label="Expiration licence" value={licenseExp} placeholder="Choisir la date" onPress={() => openDate('licenseDate')} />
          <AppInput label="National ID" value={nationalId} onChangeText={setNationalId} />

          {renderInlineSelector()}
        </>
      );
    }

    if (editMode === 'vehicle') {
      return (
        <>
          <Text style={S.modalTitle}>Véhicule</Text>
          <View style={S.row2}>
            <View style={{ flex: 1 }}>
              <AppInput label="Marque" value={make} onChangeText={setMake} />
            </View>
            <View style={{ flex: 1 }}>
              <AppInput label="Modèle" value={model} onChangeText={setModel} />
            </View>
          </View>

          <AppInput label="Année" value={year} onChangeText={setYear} keyboardType="numeric" />
          <SelectBox label="Type de véhicule" value={vType} onPress={() => setSelectorMode('vehicleType')} />
          <SelectBox label="Couleur" value={color} onPress={() => setSelectorMode('vehicleColor')} />
          <SelectBox label="Nombre de places" value={seats} onPress={() => setSelectorMode('vehicleSeats')} />
          <AppInput label="Plaque d'immatriculation" value={plate} onChangeText={setPlate} autoCapitalize="characters" />

          {renderInlineSelector()}
        </>
      );
    }

    return null;
  }

  const sc = statusColor(profile?.status);

  return (
    <View style={S.root}>
      <StatusBar barStyle="light-content" backgroundColor={D.bg} />

      <ScrollView contentContainerStyle={S.scroll} showsVerticalScrollIndicator={false}>
        <View style={S.header}>
          <View>
            <Text style={S.brand}>OVIRO</Text>
            <Text style={S.pageTitle}>Mon profil</Text>
          </View>
          <View style={[S.statusPill, { backgroundColor: sc + '22', borderColor: sc + '55' }]}>
            <View style={[S.statusDot, { backgroundColor: sc }]} />
            <Text style={[S.statusTxt, { color: sc }]}>{fmtStatus(profile?.status)}</Text>
          </View>
        </View>

        <View style={S.heroCard}>
          <View style={S.heroTop}>
            <View>
              <Avatar uri={previewUri} authToken={accessToken} initials={initials} size={88} ring />
              <Pressable style={S.editBubble} onPress={() => setEditMode('photo')}>
                <Text style={{ fontSize: 13, color: D.bg }}>✎</Text>
              </Pressable>
            </View>
            <View style={{ flex: 1, marginLeft: 16 }}>
              <Text style={S.heroName}>{fullName}</Text>
              <Text style={S.heroMeta}>{phone || user?.phoneNumber || '—'}</Text>
              <Text style={S.heroMeta}>{email || user?.email || '—'}</Text>
              {dob ? <Text style={S.heroMeta}>Né(e) le {fmtDate(dob)}</Text> : null}
            </View>
          </View>

          <View style={S.divider} />

          <View style={S.stats}>
            {[
              { label: 'Véhicule', val: make || '—' },
              { label: 'Plaque', val: plate || '—' },
              { label: 'Vérifié', val: profile?.verified ? 'Oui' : 'Non', c: profile?.verified ? D.green : D.red },
            ].map((s, i) => (
              <React.Fragment key={s.label}>
                {i > 0 && <View style={S.statSep} />}
                <View style={S.statItem}>
                  <Text style={[S.statVal, s.c ? { color: s.c } : null]}>{s.val}</Text>
                  <Text style={S.statLabel}>{s.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        </View>

        <Card title="Identité" sub="Informations personnelles et administratives" icon="👤" onEdit={() => setEditMode('identity')}>
          <InfoRow label="Prénom" value={firstName || user?.firstName} />
          <InfoRow label="Nom" value={lastName || user?.lastName} />
          <InfoRow label="Téléphone" value={phone || user?.phoneNumber} />
          <InfoRow label="Email" value={email || user?.email} />
          <InfoRow label="Date de naissance" value={fmtDate(dob)} />
          <InfoRow label="N° de licence" value={licenseNum} />
          <InfoRow label="Exp. licence" value={fmtDate(licenseExp)} />
          <InfoRow label="National ID" value={nationalId} />
          <InfoRow label="Vérifié" value={profile?.verified ? '✓ Oui' : '✗ Non'} color={profile?.verified ? D.green : D.red} />
        </Card>

        <Card title="Véhicule" sub="Informations d'exploitation" icon="🚗" onEdit={() => setEditMode('vehicle')}>
          <View style={S.plateBlock}>
            <View style={S.plateBadge}>
              <Text style={S.plateTxt}>{plate || 'XXXXXX'}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={S.vehicleMain}>{[year, make, model].filter(Boolean).join(' ') || '—'}</Text>
              <Text style={S.vehicleSub}>{[vType, color, seats ? `${seats} places` : ''].filter(Boolean).join(' · ') || '—'}</Text>
            </View>
          </View>
        </Card>

        <View style={S.footer}>
          <Pressable style={S.btnPrimary} onPress={saveProfile} disabled={saving}>
            <Text style={S.btnPrimaryTxt}>{saving ? 'Enregistrement…' : 'Enregistrer les modifications'}</Text>
          </Pressable>
          <Pressable style={S.btnSecondary} onPress={loadProfile} disabled={loading}>
            <Text style={S.btnSecondaryTxt}>{loading ? 'Actualisation…' : '↻  Actualiser le profil'}</Text>
          </Pressable>
          <Pressable onPress={logout}>
            <Text style={S.btnGhost}>Se déconnecter</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={!!editMode} transparent animationType="slide" onRequestClose={() => setEditMode(null)}>
        <View style={S.overlay}>
          <View style={S.sheet}>
            <View style={S.pill} />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              {renderEdit()}
              <View style={S.sheetFooter}>
                <FooterBtn label="Annuler" ghost onPress={() => { setSelectorMode(null); setEditMode(null); }} />
                {editMode !== 'photo' ? (
                  <FooterBtn label={saving ? 'Enregistrement…' : 'Enregistrer'} onPress={saveProfile} />
                ) : null}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: D.bg },
  scroll: { paddingBottom: 40 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 20 },
  brand: { fontSize: 10, fontWeight: '900', letterSpacing: 3.5, color: D.gold, marginBottom: 4 },
  pageTitle: { fontSize: 28, fontWeight: '800', color: D.text, letterSpacing: -0.5 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: D.r.full, borderWidth: 1 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusTxt: { fontSize: 12, fontWeight: '700' },

  heroCard: { marginHorizontal: 16, marginBottom: 16, backgroundColor: D.card, borderRadius: D.r.xl, borderWidth: 1, borderColor: D.borderMid, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'center', padding: 20 },
  editBubble: { position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: D.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: D.card },
  heroName: { fontSize: 20, fontWeight: '800', color: D.text, marginBottom: 4 },
  heroMeta: { fontSize: 13, color: D.textSub, lineHeight: 19 },
  divider: { height: 1, backgroundColor: D.border },
  stats: { flexDirection: 'row', paddingVertical: 14 },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statVal: { fontSize: 14, fontWeight: '800', color: D.text },
  statLabel: { fontSize: 10, fontWeight: '600', color: D.textMuted, textTransform: 'uppercase', letterSpacing: 0.7 },
  statSep: { width: 1, height: '75%', alignSelf: 'center', backgroundColor: D.border },

  card: { marginHorizontal: 16, marginBottom: 14, backgroundColor: D.card, borderRadius: D.r.lg, borderWidth: 1, borderColor: D.border, padding: 16 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  cardIcon: { width: 36, height: 36, borderRadius: D.r.md, backgroundColor: D.cardAlt, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: D.text },
  cardSub: { fontSize: 11, color: D.textMuted },
  editPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: D.r.full, backgroundColor: D.goldDim, borderWidth: 1, borderColor: D.goldBorder },
  editPillTxt: { fontSize: 11, fontWeight: '700', color: D.gold },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: D.border },
  infoLabel: { fontSize: 12, color: D.textMuted, fontWeight: '500' },
  infoValue: { fontSize: 13, color: D.text, fontWeight: '700', maxWidth: '55%', textAlign: 'right' },

  plateBlock: { flexDirection: 'row', alignItems: 'center', backgroundColor: D.cardAlt, borderRadius: D.r.md, padding: 14, borderWidth: 1, borderColor: D.borderMid },
  plateBadge: { backgroundColor: D.bg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 2, borderColor: D.gold },
  plateTxt: { fontSize: 18, fontWeight: '900', color: D.gold, letterSpacing: 2 },
  vehicleMain: { fontSize: 14, fontWeight: '800', color: D.text, marginBottom: 3 },
  vehicleSub: { fontSize: 12, color: D.textSub },

  footer: { marginHorizontal: 16, marginTop: 8, gap: 10 },
  btnPrimary: { height: 52, borderRadius: D.r.md, backgroundColor: D.gold, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryTxt: { fontSize: 15, fontWeight: '800', color: D.bg },
  btnSecondary: { height: 48, borderRadius: D.r.md, backgroundColor: D.card, borderWidth: 1, borderColor: D.borderMid, alignItems: 'center', justifyContent: 'center' },
  btnSecondaryTxt: { fontSize: 14, fontWeight: '700', color: D.text },
  btnGhost: { textAlign: 'center', paddingVertical: 12, fontSize: 14, fontWeight: '600', color: D.red },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: D.card, borderTopLeftRadius: D.r.xl, borderTopRightRadius: D.r.xl, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 34, borderTopWidth: 1, borderColor: D.goldBorder, maxHeight: '90%' },
  pill: { width: 44, height: 4, borderRadius: 2, backgroundColor: D.borderMid, alignSelf: 'center', marginBottom: 18 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: D.text, marginBottom: 16 },
  sheetFooter: { flexDirection: 'row', gap: 10, marginTop: 16 },
  footerBtnGhost: { flex: 1, height: 50, borderRadius: D.r.md, backgroundColor: D.cardAlt, borderWidth: 1, borderColor: D.borderMid, alignItems: 'center', justifyContent: 'center' },
  footerBtnGhostTxt: { fontSize: 14, fontWeight: '700', color: D.textSub },
  footerBtnPrimary: { flex: 1, height: 50, borderRadius: D.r.md, backgroundColor: D.gold, alignItems: 'center', justifyContent: 'center' },
  footerBtnPrimaryTxt: { fontSize: 14, fontWeight: '800', color: D.bg },

  photoCentre: { alignItems: 'center', paddingVertical: 24 },
  row2: { flexDirection: 'row', gap: 10 },

  selectBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: D.input, borderRadius: D.r.md, borderWidth: 1, borderColor: D.goldBorder, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
  selectLabel: { fontSize: 10, fontWeight: '700', color: D.textMuted, marginBottom: 2 },
  selectValue: { fontSize: 14, fontWeight: '700', color: D.text },

  inlineSelectorWrap: {
    marginTop: 10,
    backgroundColor: D.cardAlt,
    borderRadius: D.r.lg,
    borderWidth: 1,
    borderColor: D.goldBorder,
    padding: 14,
  },

  sheetTitle: { fontSize: 17, fontWeight: '800', color: D.text, textAlign: 'center', marginBottom: 14 },

  dateCol: { flex: 1, maxHeight: 220, backgroundColor: D.input, borderRadius: D.r.md, padding: 6 },
  dateItem: { paddingVertical: 10, borderRadius: 10, marginBottom: 4, alignItems: 'center' },
  dateItemOn: { backgroundColor: D.gold },
  dateItemTxt: { fontSize: 14, fontWeight: '700', color: D.text },
  dateItemTxtOn: { color: D.bg },

  optionItem: { backgroundColor: D.input, borderRadius: D.r.md, paddingVertical: 14, paddingHorizontal: 14, marginBottom: 8 },
  optionTxt: { fontSize: 15, fontWeight: '700', color: D.text },
});

export default ProfileScreen;