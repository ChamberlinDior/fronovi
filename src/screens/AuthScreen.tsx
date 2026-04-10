import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { getDeviceInfo } from '../utils/device';
import { ApiHttpError } from '../api/client';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg: '#07080C',
  surface: 'rgba(12,16,26,0.97)',
  surfaceHigh: 'rgba(18,23,36,0.98)',
  surfaceMid: 'rgba(20,26,42,0.6)',
  border: 'rgba(255,255,255,0.07)',
  borderFocus: '#F5C518',
  yellow: '#F5C518',
  yellowDeep: '#C9A014',
  yellowDim: '#A88210',
  yellowGlow: 'rgba(245,197,24,0.18)',
  yellowSoft: 'rgba(245,197,24,0.06)',
  yellowBright: 'rgba(245,197,24,0.92)',
  white: '#FFFFFF',
  textMuted: '#4A566E',
  textSub: '#7080A0',
  textBody: '#A0AECA',
  error: '#FF5555',
  errorBg: 'rgba(255,85,85,0.07)',
  errorBorder: 'rgba(255,85,85,0.25)',
  success: '#2ECC71',
  successBg: 'rgba(46,204,113,0.07)',
  divider: 'rgba(255,255,255,0.06)',
};

// ─── Country codes ─────────────────────────────────────────────────────────────
const COUNTRIES = [
  { code: '+241', flag: '🇬🇦', name: 'Gabon' },
  { code: '+237', flag: '🇨🇲', name: 'Cameroun' },
  { code: '+242', flag: '🇨🇬', name: 'Congo' },
  { code: '+243', flag: '🇨🇩', name: 'RD Congo' },
  { code: '+225', flag: '🇨🇮', name: "Côte d'Ivoire" },
  { code: '+221', flag: '🇸🇳', name: 'Sénégal' },
  { code: '+33', flag: '🇫🇷', name: 'France' },
  { code: '+1', flag: '🇺🇸', name: 'États-Unis' },
];

// ─── Password strength ────────────────────────────────────────────────────────
function getStrength(pw: string): { level: 0 | 1 | 2 | 3; label: string } {
  if (!pw) return { level: 0, label: '' };
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 1) return { level: 1, label: 'Faible' };
  if (s === 2) return { level: 2, label: 'Moyen' };
  return { level: 3, label: 'Fort' };
}
const STRENGTH_COLOR: Record<number, string> = {
  0: 'transparent',
  1: '#FF5555',
  2: '#F5A623',
  3: '#2ECC71',
};

// ─── Error formatter ──────────────────────────────────────────────────────────
function formatError(error: any): string {
  if (error instanceof ApiHttpError) {
    const p: string[] = [];
    if (error.message) p.push(error.message);
    if (error.status) p.push(`HTTP ${error.status}`);
    if (error.errorCode) p.push(`Code: ${error.errorCode}`);
    if (error.validationErrors) {
      Object.entries(error.validationErrors).forEach(([f, m]) => p.push(`${f}: ${m}`));
    }
    return p.join(' · ');
  }
  return error?.message || 'Action impossible';
}

// ─── Watermark ─────────────────────────────────────────────────────────────────
const WM = [
  { t: '🚕', x: '3%', y: '1%', s: 48, r: '-14deg', o: 0.07 },
  { t: 'OVIRO', x: '26%', y: '0%', s: 10, r: '0deg', o: 0.05, b: true },
  { t: '🚖', x: '66%', y: '3%', s: 34, r: '10deg', o: 0.08 },
  { t: 'OVIRO', x: '79%', y: '1%', s: 20, r: '-8deg', o: 0.04, b: true },
  { t: '🚕', x: '12%', y: '10%', s: 20, r: '20deg', o: 0.05 },
  { t: '🚖', x: '86%', y: '13%', s: 52, r: '-5deg', o: 0.06 },
  { t: 'OVIRO', x: '37%', y: '18%', s: 28, r: '-12deg', o: 0.04, b: true },
  { t: '🚕', x: '57%', y: '22%', s: 26, r: '8deg', o: 0.06 },
  { t: '🚖', x: '75%', y: '32%', s: 40, r: '15deg', o: 0.07 },
  { t: 'OVIRO', x: '8%', y: '30%', s: 16, r: '-4deg', o: 0.04 },
  { t: '🚕', x: '88%', y: '45%', s: 30, r: '-20deg', o: 0.06 },
  { t: 'OVIRO', x: '3%', y: '52%', s: 22, r: '5deg', o: 0.04, b: true },
  { t: '🚖', x: '47%', y: '55%', s: 18, r: '-10deg', o: 0.06 },
  { t: '🚕', x: '15%', y: '67%', s: 44, r: '12deg', o: 0.07 },
  { t: 'OVIRO', x: '79%', y: '69%', s: 18, r: '-18deg', o: 0.04, b: true },
  { t: '🚖', x: '35%', y: '75%', s: 28, r: '6deg', o: 0.06 },
  { t: '🚕', x: '72%', y: '85%', s: 36, r: '-8deg', o: 0.08 },
  { t: 'OVIRO', x: '42%', y: '90%', s: 24, r: '10deg', o: 0.04, b: true },
  { t: '🚖', x: '90%', y: '91%', s: 22, r: '-15deg', o: 0.06 },
];

function LuxuryBackground() {
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <View style={bgS.base} />
      <View style={bgS.diag1} />
      <View style={bgS.diag2} />
      <View style={bgS.vignette} />
      <View style={bgS.topLine} />
      {WM.map((item, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: item.x as any,
            top: item.y as any,
            transform: [{ rotate: item.r }],
            opacity: item.o,
          }}
        >
          <Text
            style={{
              fontSize: item.s,
              color: C.yellow,
              fontWeight: (item as any).b ? '900' : '400',
              letterSpacing: (item as any).b ? 3 : 0,
            }}
          >
            {item.t}
          </Text>
        </View>
      ))}
    </View>
  );
}

const bgS = StyleSheet.create({
  base: { ...StyleSheet.absoluteFillObject, backgroundColor: C.bg },
  diag1: {
    position: 'absolute',
    top: -300,
    left: -200,
    width: 900,
    height: 900,
    backgroundColor: 'rgba(245,197,24,0.022)',
    transform: [{ rotate: '-30deg' }],
  },
  diag2: {
    position: 'absolute',
    bottom: -200,
    right: -150,
    width: 600,
    height: 600,
    backgroundColor: 'rgba(245,197,24,0.015)',
    transform: [{ rotate: '20deg' }],
  },
  vignette: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)' },
  topLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: C.yellow,
    opacity: 0.75,
  },
});

// ─── Value proposition badges ─────────────────────────────────────────────────
function ValueProps() {
  const items = [
    { icon: '💰', text: 'Revenus flexibles' },
    { icon: '🛡️', text: 'Assurance incluse' },
    { icon: '📍', text: 'Travaille partout au Gabon' },
  ];
  return (
    <View style={styles.vpRow}>
      {items.map((it, i) => (
        <View key={i} style={styles.vpChip}>
          <Text style={styles.vpIcon}>{it.icon}</Text>
          <Text style={styles.vpText}>{it.text}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Social proof ─────────────────────────────────────────────────────────────
function SocialProof() {
  return (
    <View style={styles.spRow}>
      <View style={styles.spAvatars}>
        {['🧑🏿', '👨🏾', '👩🏽', '🧔🏾'].map((e, i) => (
          <View key={i} style={[styles.spAvatar, { marginLeft: i === 0 ? 0 : -10, zIndex: 10 - i }]}>
            <Text style={{ fontSize: 18 }}>{e}</Text>
          </View>
        ))}
      </View>
      <View style={{ marginLeft: 12 }}>
        <Text style={styles.spCount}>+2 400 chauffeurs actifs</Text>
        <View style={styles.spStars}>
          {[1, 2, 3, 4, 5].map((s) => (
            <Text key={s} style={styles.spStar}>★</Text>
          ))}
          <Text style={styles.spRating}> 4.9 / 5</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Country picker ───────────────────────────────────────────────────────────
function CountryPicker({
  selected,
  onSelect,
}: {
  selected: typeof COUNTRIES[0];
  onSelect: (c: typeof COUNTRIES[0]) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity style={styles.countryBtn} onPress={() => setOpen(true)} activeOpacity={0.8}>
        <Text style={styles.countryFlag}>{selected.flag}</Text>
        <Text style={styles.countryCode}>{selected.code}</Text>
        <Text style={styles.countryChevron}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Indicatif pays</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Text style={styles.sheetClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {COUNTRIES.map((c) => (
              <TouchableOpacity
                key={c.code}
                style={[styles.countryRow, selected.code === c.code && styles.countryRowActive]}
                onPress={() => {
                  onSelect(c);
                  setOpen(false);
                }}
              >
                <Text style={styles.cFlag}>{c.flag}</Text>
                <Text style={styles.cName}>{c.name}</Text>
                <Text style={styles.cCode}>{c.code}</Text>
                {selected.code === c.code && <Text style={styles.cCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// ─── Animated field ───────────────────────────────────────────────────────────
interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: any;
  autoCapitalize?: any;
  icon: string;
  prefix?: React.ReactNode;
  showStrength?: boolean;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  icon,
  prefix,
  showStrength,
}: FieldProps) {
  const [vis, setVis] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;
  const run = (v: number) =>
    Animated.timing(anim, { toValue: v, duration: 180, useNativeDriver: false }).start();
  const strength = showStrength ? getStrength(value) : null;

  return (
    <View style={styles.fieldWrap}>
      <Animated.Text
        style={[
          styles.fieldLabel,
          {
            color: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [C.textSub, C.yellow],
            }),
          },
        ]}
      >
        {label}
      </Animated.Text>
      <Animated.View
        style={[
          styles.fieldBox,
          {
            borderColor: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [C.border, C.borderFocus],
            }),
          },
        ]}
      >
        <Text style={styles.fieldIcon}>{icon}</Text>
        {prefix}
        <TextInput
          style={styles.fieldInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.textMuted}
          secureTextEntry={secureTextEntry && !vis}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          onFocus={() => run(1)}
          onBlur={() => run(0)}
        />
        {secureTextEntry && (
          <TouchableOpacity onPress={() => setVis((v) => !v)} style={{ padding: 6 }}>
            <Text style={{ fontSize: 15 }}>{vis ? '🙈' : '👁️'}</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
      {showStrength && value.length > 0 && strength && (
        <View style={styles.strengthRow}>
          {[1, 2, 3].map((lvl) => (
            <View
              key={lvl}
              style={[
                styles.strengthBar,
                { backgroundColor: lvl <= strength.level ? STRENGTH_COLOR[strength.level] : C.border },
              ]}
            />
          ))}
          <Text style={[styles.strengthLabel, { color: STRENGTH_COLOR[strength.level] }]}>
            {strength.label}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Divider ──────────────────────────────────────────────────────────────────
function OrDivider() {
  return (
    <View style={styles.divRow}>
      <View style={styles.divLine} />
      <Text style={styles.divText}>ou</Text>
      <View style={styles.divLine} />
    </View>
  );
}

// ─── Gold CTA ─────────────────────────────────────────────────────────────────
function GoldButton({
  label,
  onPress,
  loading,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()}
        onPress={loading ? undefined : onPress}
        style={styles.goldBtn}
      >
        <View style={styles.goldShine} />
        <Text style={styles.goldBtnText}>{loading ? '⏳  Chargement…' : label}</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Ghost button ─────────────────────────────────────────────────────────────
function GhostButton({ label, onPress }: { label: string; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()}
        onPress={onPress}
        style={styles.ghostBtn}
      >
        <Text style={styles.ghostBtnText}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function AppFooter() {
  const links = [
    { label: 'Aide', url: 'https://oviro.ga/aide' },
    { label: 'Confidentialité', url: 'https://oviro.ga/confidentialite' },
    { label: 'CGU', url: 'https://oviro.ga/cgu' },
    { label: 'Contact', url: 'https://oviro.ga/contact' },
  ];

  return (
    <View style={styles.footer}>
      <Text style={styles.footerBrand}>oviro</Text>
      <View style={styles.footerLinks}>
        {links.map((l, i) => (
          <React.Fragment key={l.label}>
            <TouchableOpacity onPress={() => Linking.openURL(l.url)}>
              <Text style={styles.footerLink}>{l.label}</Text>
            </TouchableOpacity>
            {i < links.length - 1 && <Text style={styles.footerDot}>·</Text>}
          </React.Fragment>
        ))}
      </View>
      <Text style={styles.footerCopy}>
        © {new Date().getFullYear()} Oviro Technologies SAS · Libreville, Gabon
      </Text>
    </View>
  );
}

// ─── Forgot password modal ────────────────────────────────────────────────────
function ForgotModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [val, setVal] = useState('');
  const [sent, setSent] = useState(false);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.forgotCard}>
          <View style={styles.sheetHandle} />
          <Text style={styles.forgotTitle}>Réinitialiser le mot de passe</Text>
          <Text style={styles.forgotSub}>
            Saisis ton email ou téléphone. Tu recevras un lien sécurisé.
          </Text>
          {!sent ? (
            <>
              <Field
                label="Email ou téléphone"
                value={val}
                onChangeText={setVal}
                placeholder="+241074xxxxxx"
                autoCapitalize="none"
                icon="📧"
              />
              <GoldButton
                label="Envoyer le lien  →"
                onPress={() => {
                  if (val.trim()) setSent(true);
                }}
              />
            </>
          ) : (
            <View style={styles.sentBox}>
              <Text style={{ fontSize: 28 }}>✅</Text>
              <Text style={styles.sentText}>Lien envoyé ! Vérifie tes SMS ou emails.</Text>
            </View>
          )}
          <TouchableOpacity
            onPress={() => {
              onClose();
              setSent(false);
              setVal('');
            }}
            style={{ marginTop: 14, alignItems: 'center' }}
          >
            <Text style={styles.footerLink}>Fermer</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function AuthScreen() {
  const { login, registerDriver, apiBaseUrl, updateApiBaseUrl } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [submitting, setSub] = useState(false);
  const [errorMsg, setErr] = useState('');
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [identifier, setIdent] = useState('');
  const [password, setPass] = useState('');
  const [firstName, setFirst] = useState('');
  const [lastName, setLast] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [forgotVisible, setForgot] = useState(false);
  const [baseUrl] = useState(apiBaseUrl);

  const fullPhone = `${country.code}${phone.replace(/^0/, '')}`;

  const payload = useMemo(
    () => ({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase() || undefined,
      phoneNumber: fullPhone,
      password: password.trim(),
      role: 'DRIVER' as const,
    }),
    [firstName, lastName, email, fullPhone, password]
  );

  const validate = () => {
    if (payload.firstName.length < 2) throw new Error('Prénom : 2 caractères minimum.');
    if (payload.lastName.length < 2) throw new Error('Nom : 2 caractères minimum.');
    if (!/^\+?[1-9]\d{7,14}$/.test(payload.phoneNumber)) {
      throw new Error('Numéro invalide. Ex : 074 12 34 56');
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,100}$/.test(payload.password)) {
      throw new Error('Mot de passe : 8 car. min, 1 majuscule, 1 chiffre.');
    }
  };

  const sw = (m: 'login' | 'register') => {
    setMode(m);
    setErr('');
  };

  const submit = async () => {
    try {
      setSub(true);
      setErr('');
      await updateApiBaseUrl(baseUrl.trim());

      if (mode === 'login') {
        if (!identifier.trim()) throw new Error('Email ou téléphone requis.');
        if (!password.trim()) throw new Error('Mot de passe requis.');
        await login({
          identifier: identifier.trim(),
          password: password.trim(),
          deviceInfo: getDeviceInfo(),
        });
      } else {
        validate();
        await registerDriver(payload);
        Alert.alert('✅ Compte créé', 'Tu peux maintenant te connecter.');
        sw('login');
        setIdent(payload.email || payload.phoneNumber);
      }
    } catch (e: any) {
      setErr(formatError(e));
    } finally {
      setSub(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <LuxuryBackground />
      <ForgotModal visible={forgotVisible} onClose={() => setForgot(false)} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ flex: 1, minHeight: 24 }} />

          <View style={styles.headerWrap}>
            <View style={styles.logoRow}>
              <View style={styles.logoRing}>
                <Text style={{ fontSize: 24 }}>🚖</Text>
              </View>
              <View>
                <Text style={styles.logoWord}>OVIRO</Text>
                <View style={styles.logoUnder}>
                  <View style={styles.logoLine} />
                  <Text style={styles.logoSub}>DRIVER</Text>
                  <View style={styles.logoLine} />
                </View>
              </View>
            </View>

            <SocialProof />

            <Text style={styles.tagline}>
              {mode === 'login' ? 'Bon retour, chauffeur 👋' : 'Rejoins la flotte OVIRO'}
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardBar} />

            <View style={styles.tabs}>
              {(['login', 'register'] as const).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.tab, mode === m && styles.tabOn]}
                  onPress={() => sw(m)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.tabTxt, mode === m && styles.tabTxtOn]}>
                    {m === 'login' ? '🔑  Connexion' : "🚖  S'inscrire"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {mode === 'login' ? (
              <>
                <Field
                  label="Email ou téléphone"
                  value={identifier}
                  onChangeText={setIdent}
                  placeholder="+241074123456"
                  autoCapitalize="none"
                  icon="📧"
                />
                <Field
                  label="Mot de passe"
                  value={password}
                  onChangeText={setPass}
                  placeholder="••••••••"
                  secureTextEntry
                  icon="🔒"
                />

                <TouchableOpacity style={styles.forgotRow} onPress={() => setForgot(true)}>
                  <Text style={styles.forgotLink}>Mot de passe oublié ?</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Field label="Prénom" value={firstName} onChangeText={setFirst} icon="👤" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field label="Nom" value={lastName} onChangeText={setLast} icon="👤" />
                  </View>
                </View>

                <Field
                  label="Email (optionnel)"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="vous@oviro.ga"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  icon="📧"
                />

                <Field
                  label="Téléphone"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="074 12 34 56"
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  icon="📱"
                  prefix={<CountryPicker selected={country} onSelect={setCountry} />}
                />

                <Field
                  label="Mot de passe"
                  value={password}
                  onChangeText={setPass}
                  placeholder="8 car., 1 maj., 1 chiffre"
                  secureTextEntry
                  icon="🔒"
                  showStrength
                />

                <View style={styles.termsRow}>
                  <Text style={styles.termsTxt}>
                    En créant un compte, tu acceptes nos{' '}
                    <Text
                      style={styles.termsLink}
                      onPress={() => Linking.openURL('https://oviro.ga/cgu')}
                    >
                      CGU
                    </Text>{' '}
                    et notre{' '}
                    <Text
                      style={styles.termsLink}
                      onPress={() => Linking.openURL('https://oviro.ga/confidentialite')}
                    >
                      politique de confidentialité
                    </Text>
                    .
                  </Text>
                </View>
              </>
            )}

            {!!errorMsg && (
              <View style={styles.errBox}>
                <Text style={{ fontSize: 14 }}>⚠️</Text>
                <Text style={styles.errTxt}>{errorMsg}</Text>
              </View>
            )}

            <GoldButton
              label={mode === 'login' ? 'Se connecter  →' : 'Créer mon compte  →'}
              onPress={submit}
              loading={submitting}
            />

            <OrDivider />

            <GhostButton
              label="📞  Continuer par SMS"
              onPress={() =>
                Alert.alert('Bientôt disponible', 'La connexion par SMS arrive prochainement.')
              }
            />

            <View style={styles.swRow}>
              <Text style={styles.swMuted}>
                {mode === 'login' ? 'Pas encore chauffeur ?  ' : 'Déjà un compte ?  '}
              </Text>
              <TouchableOpacity onPress={() => sw(mode === 'login' ? 'register' : 'login')}>
                <Text style={styles.swLink}>{mode === 'login' ? "S'inscrire" : 'Se connecter'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {mode === 'register' && <ValueProps />}

          <AppFooter />

          <Text style={styles.devHint} numberOfLines={1}>
            ⚙ {baseUrl}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 24,
    justifyContent: 'center',
  },

  headerWrap: { alignItems: 'center', marginBottom: 22 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  logoRing: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
    borderColor: C.yellow,
    backgroundColor: 'rgba(245,197,24,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.yellow,
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  logoWord: { fontSize: 34, fontWeight: '900', color: C.white, letterSpacing: 6 },
  logoUnder: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  logoLine: { flex: 1, height: 1, backgroundColor: C.yellow, opacity: 0.45 },
  logoSub: { fontSize: 9, color: C.yellow, fontWeight: '800', letterSpacing: 4 },
  tagline: { fontSize: 13, color: C.textSub, letterSpacing: 0.3, marginTop: 8 },

  spRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  spAvatars: { flexDirection: 'row' },
  spAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.surfaceHigh,
    borderWidth: 1.5,
    borderColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spCount: { fontSize: 12, color: C.textBody, fontWeight: '600' },
  spStars: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  spStar: { fontSize: 11, color: C.yellow },
  spRating: { fontSize: 11, color: C.textSub },

  card: {
    backgroundColor: C.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(245,197,24,0.12)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.65,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 14 },
    elevation: 22,
    paddingHorizontal: 18,
    paddingBottom: 22,
    marginBottom: 16,
  },
  cardBar: {
    height: 2.5,
    backgroundColor: C.yellow,
    marginHorizontal: -18,
    marginBottom: 18,
    shadowColor: C.yellow,
    shadowOpacity: 0.8,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },

  tabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 13,
    padding: 3,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  tab: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 11 },
  tabOn: {
    backgroundColor: C.yellow,
    shadowColor: C.yellow,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  tabTxt: { fontSize: 12, fontWeight: '700', color: C.textMuted },
  tabTxtOn: { color: C.bg },

  fieldWrap: { marginBottom: 12 },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.9, marginBottom: 6 },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surfaceHigh,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    height: 50,
  },
  fieldIcon: { fontSize: 15, marginRight: 8, opacity: 0.65 },
  fieldInput: { flex: 1, color: C.white, fontSize: 15, fontWeight: '500' },

  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  strengthBar: { flex: 1, height: 3, borderRadius: 2 },
  strengthLabel: { fontSize: 10, fontWeight: '700', minWidth: 32 },

  forgotRow: { alignItems: 'flex-end', marginTop: -4, marginBottom: 10 },
  forgotLink: { fontSize: 12, color: C.yellow, fontWeight: '600' },

  divRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 14, gap: 10 },
  divLine: { flex: 1, height: 1, backgroundColor: C.divider },
  divText: { fontSize: 12, color: C.textMuted, fontWeight: '500' },

  ghostBtn: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(245,197,24,0.22)',
    backgroundColor: C.yellowSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  ghostBtnText: { fontSize: 14, fontWeight: '700', color: C.yellow, letterSpacing: 0.3 },

  goldBtn: {
    height: 54,
    borderRadius: 15,
    backgroundColor: C.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: 2,
    shadowColor: C.yellow,
    shadowOpacity: 0.45,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 7 },
    elevation: 14,
  },
  goldShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: '55%',
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderTopLeftRadius: 15,
    borderBottomLeftRadius: 15,
  },
  goldBtnText: { fontSize: 15, fontWeight: '900', color: C.bg, letterSpacing: 0.4 },

  swRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  swMuted: { color: C.textMuted, fontSize: 13 },
  swLink: { color: C.yellow, fontSize: 13, fontWeight: '800' },

  termsRow: { marginBottom: 10 },
  termsTxt: { fontSize: 11, color: C.textMuted, lineHeight: 17 },
  termsLink: { color: C.yellow, fontWeight: '700' },

  errBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: C.errorBg,
    borderWidth: 1,
    borderColor: C.errorBorder,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  errTxt: { flex: 1, color: C.error, fontSize: 13, lineHeight: 20, fontWeight: '500' },

  vpRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  vpChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.yellowSoft,
    borderWidth: 1,
    borderColor: 'rgba(245,197,24,0.15)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  vpIcon: { fontSize: 12 },
  vpText: { fontSize: 11, color: C.yellow, fontWeight: '600' },

  footer: { alignItems: 'center', paddingTop: 18, paddingBottom: 10, gap: 8 },
  footerBrand: {
    fontSize: 18,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.12)',
    letterSpacing: 4,
  },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  footerLink: { fontSize: 11, color: C.textMuted, fontWeight: '600' },
  footerDot: { fontSize: 11, color: C.textMuted, opacity: 0.4 },
  footerCopy: { fontSize: 10, color: 'rgba(255,255,255,0.1)', textAlign: 'center' },

  countryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 10,
    marginRight: 6,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.09)',
    gap: 3,
  },
  countryFlag: { fontSize: 17 },
  countryCode: { color: C.yellow, fontSize: 12, fontWeight: '700' },
  countryChevron: { color: C.textMuted, fontSize: 9 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.76)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0C1120',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 2,
    borderColor: C.yellow,
    paddingBottom: 34,
    shadowColor: C.yellow,
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 22,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  sheetTitle: { fontSize: 15, fontWeight: '800', color: C.white, letterSpacing: 0.4 },
  sheetClose: { fontSize: 16, color: C.textMuted, padding: 4 },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 13,
    gap: 12,
  },
  countryRowActive: { backgroundColor: C.yellowSoft },
  cFlag: { fontSize: 21 },
  cName: { flex: 1, color: C.white, fontSize: 14, fontWeight: '600' },
  cCode: { color: C.textSub, fontSize: 13 },
  cCheck: { color: C.yellow, fontSize: 15, fontWeight: '900' },

  forgotCard: {
    backgroundColor: '#0C1120',
    borderRadius: 24,
    margin: 16,
    borderWidth: 1,
    borderColor: 'rgba(245,197,24,0.15)',
    padding: 22,
    shadowColor: C.yellow,
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 20,
  },
  forgotTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: C.white,
    marginBottom: 6,
    textAlign: 'center',
  },
  forgotSub: {
    fontSize: 12,
    color: C.textSub,
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 18,
  },
  sentBox: { alignItems: 'center', paddingVertical: 16, gap: 10 },
  sentText: { fontSize: 14, color: C.success, fontWeight: '600', textAlign: 'center' },

  devHint: { textAlign: 'center', color: 'rgba(255,255,255,0.05)', fontSize: 9, marginTop: 14 },
});

export default AuthScreen;