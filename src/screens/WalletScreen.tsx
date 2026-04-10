import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { apiRequest, ApiHttpError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { PageResponse, TransactionResponse, WalletResponse } from '../types/api';

const { height: SCREEN_H } = Dimensions.get('window');

// ─── Palette ────────────────────────────────────────────────────────────────
const C = {
  bg: '#060D18',
  card: '#0D1B2A',
  card2: '#10233A',
  border: 'rgba(255,255,255,0.07)',
  borderGold: 'rgba(245,197,24,0.25)',
  text: '#FFFFFF',
  muted: '#A9B6C7',
  muted2: '#6F8197',
  yellow: '#F5C518',
  yellowSoft: 'rgba(245,197,24,0.10)',
  green: '#22C55E',
  red: '#FF5A5F',
  blue: '#60A5FA',
  overlay: 'rgba(4,9,18,0.90)',
};

// ─── Opérateurs Mobile Money ─────────────────────────────────────────────────
const PROVIDERS = [
  {
    group: '🇬🇦 Gabon — Opérateurs principaux',
    items: [
      { value: 'AIRTEL_MONEY', label: 'Airtel Money', sub: 'Airtel Gabon', icon: '📱' },
      { value: 'MOOV_MONEY', label: 'Moov Money', sub: 'Moov Africa Gabon', icon: '📱' },
      { value: 'LIQO', label: 'Liqo', sub: 'Anciennement Mobicash', icon: '📱' },
    ],
  },
  {
    group: '🌍 Région CEMAC',
    items: [
      { value: 'MTN_MOMO', label: 'MTN MoMo', sub: 'MTN Mobile Money', icon: '📱' },
      { value: 'ORANGE_MONEY', label: 'Orange Money', sub: 'Orange Gabon', icon: '📱' },
      { value: 'FREE_MONEY', label: 'Free Money', sub: 'Free Gabon', icon: '📱' },
      { value: 'EXPRESION', label: 'Expresion Money', sub: 'Expresion', icon: '📱' },
    ],
  },
  {
    group: '🏦 Carte & Virement',
    items: [
      { value: 'VISA_CARD', label: 'Carte Visa / Mastercard', sub: 'Paiement par carte', icon: '💳' },
      { value: 'VIREMENT', label: 'Virement bancaire', sub: 'BEAC / COBAC', icon: '🏦' },
    ],
  },
];

const ALL_PROVIDERS = PROVIDERS.flatMap(g => g.items);
const PRESET_AMOUNTS = [1000, 2000, 5000, 10000, 25000, 50000, 100000, 200000];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatError(error: any): string {
  if (error instanceof ApiHttpError) {
    const parts: string[] = [];
    if (error.message) parts.push(error.message);
    if (error.status) parts.push(`HTTP ${error.status}`);
    if (error.errorCode) parts.push(`Code: ${error.errorCode}`);
    if (error.validationErrors) {
      Object.entries(error.validationErrors).forEach(([field, msg]) => {
        parts.push(`${field}: ${msg}`);
      });
    }
    return parts.join(' · ');
  }
  return error?.message || 'Erreur inconnue';
}

function formatMoney(value?: number | string, currency = 'XAF'): string {
  const amount = typeof value === 'number' ? value : Number(value || 0);
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('fr-FR');
}

function compactStatus(status?: string): string {
  if (!status) return 'Inconnu';
  return status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function toneForStatus(status?: string) {
  const s = (status || '').toUpperCase();
  if (s === 'SUCCESS') return { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.30)', text: C.green };
  if (s === 'FAILED') return { bg: 'rgba(255,90,95,0.12)', border: 'rgba(255,90,95,0.30)', text: C.red };
  if (s === 'PENDING') return { bg: 'rgba(245,197,24,0.12)', border: 'rgba(245,197,24,0.30)', text: C.yellow };
  if (s === 'REVERSED') return { bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.30)', text: C.blue };
  return { bg: 'rgba(255,255,255,0.08)', border: C.border, text: C.text };
}

function iconForType(type?: string): string {
  const t = (type || '').toUpperCase();
  if (t === 'RECHARGE') return '💳';
  if (t === 'RIDE_PAYMENT') return '🚕';
  if (t === 'WITHDRAWAL') return '🏦';
  if (t === 'BONUS') return '🎁';
  if (t === 'REFUND') return '↩️';
  if (t === 'COMMISSION') return '🧾';
  return '💼';
}

// ─── Vue active dans le modal (état machine) ─────────────────────────────────
// IMPORTANT: On utilise UN SEUL <Modal> avec 3 vues internes pour contourner
// le bug React Native / Android qui empêche les <Modal> imbriqués de s'afficher.
type SheetView = 'recharge' | 'provider' | 'amount' | null;

// ─── Écran Principal ──────────────────────────────────────────────────────────
export function WalletScreen() {

  // ── Numéro réel du chauffeur depuis le contexte Auth ──────────────────────
  const { user } = useAuth();
  // user.phoneNumber est le numéro enregistré sur le compte du chauffeur
  const driverPhone: string = user?.phoneNumber || '';

  // ── Données wallet ────────────────────────────────────────────────────────
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [transactions, setTransactions] = useState<TransactionResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [txFilter, setTxFilter] = useState<string>('all');

  // ── Navigation dans le modal unique ──────────────────────────────────────
  const [sheetView, setSheetView] = useState<SheetView>(null);
  const modalVisible = sheetView !== null;

  // ── Formulaire recharge ───────────────────────────────────────────────────
  const [provider, setProvider] = useState('AIRTEL_MONEY');
  const [selectedAmount, setSelectedAmount] = useState<number | null>(5000);
  const [customAmount, setCustomAmount] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [phoneMode, setPhoneMode] = useState<'registered' | 'other'>('registered');
  const [otherPhone, setOtherPhone] = useState('');
  const [recharging, setRecharging] = useState(false);

  const currentProvider = ALL_PROVIDERS.find(p => p.value === provider);
  const finalAmount = selectedAmount ?? (customAmount ? Number(customAmount) : null);
  const finalPhone = phoneMode === 'registered' ? driverPhone : otherPhone;

  // ── Chargement wallet + transactions ─────────────────────────────────────
  const loadAll = useCallback(async (isRefresh = false) => {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      const [walletRes, txRes] = await Promise.all([
        apiRequest<WalletResponse>('/wallet'),
        apiRequest<PageResponse<TransactionResponse>>('/wallet/transactions?page=0&size=30'),
      ]);
      setWallet(walletRes.data);
      setTransactions(txRes.data.content || []);
    } catch (error: any) {
      Alert.alert('Erreur', formatError(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const balanceText = useMemo(
    () => formatMoney(wallet?.balance as any, wallet?.currency || 'XAF'),
    [wallet],
  );

  const filteredTx = useMemo(() => {
    if (txFilter === 'all') return transactions;
    return transactions.filter(t => (t.status as string).toUpperCase() === txFilter);
  }, [transactions, txFilter]);

  // ── Navigation retour dans le modal ──────────────────────────────────────
  const handleModalBack = () => {
    if (sheetView === 'provider' || sheetView === 'amount') {
      setSheetView('recharge');
    } else {
      setSheetView(null);
    }
  };

  // ── Appel API recharge ────────────────────────────────────────────────────
  const recharge = async () => {
    if (!finalAmount || finalAmount <= 0) {
      Alert.alert('Montant invalide', 'Veuillez sélectionner ou saisir un montant valide.');
      return;
    }
    if (!finalPhone.trim()) {
      Alert.alert('Numéro requis', 'Veuillez renseigner un numéro Mobile Money.');
      return;
    }
    try {
      setRecharging(true);
      await apiRequest('/wallet/recharge', {
        method: 'POST',
        body: JSON.stringify({
          amount: finalAmount,
          provider,
          mobileMoneyNumber: finalPhone.trim(),
          externalReference: `OVR-${Date.now()}`,
        }),
      });
      Alert.alert('✅ Recharge envoyée', 'Votre recharge a été enregistrée avec succès.');
      setSheetView(null);
      await loadAll();
    } catch (error: any) {
      Alert.alert('Erreur', formatError(error));
    } finally {
      setRecharging(false);
    }
  };

  // ── Contenu du modal selon la vue active ─────────────────────────────────
  const renderSheetContent = () => {

    // ╔══════════════════════════════╗
    // ║  VUE : Liste des opérateurs  ║
    // ╚══════════════════════════════╝
    if (sheetView === 'provider') {
      return (
        <View style={ms.sheet}>
          <View style={ms.handle} />
          {/* Bouton retour */}
          <Pressable style={ms.backRow} onPress={() => setSheetView('recharge')}>
            <Text style={ms.backArrow}>‹</Text>
            <Text style={ms.backLabel}>Retour</Text>
          </Pressable>
          <Text style={ms.sheetTitle}>Choisir un opérateur</Text>
          <Text style={ms.sheetSub}>Mobile Money · Gabon & région CEMAC</Text>

          <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 14 }}>
            {PROVIDERS.map(group => (
              <View key={group.group}>
                <Text style={ms.groupLabel}>{group.group}</Text>
                {group.items.map(item => {
                  const active = provider === item.value;
                  return (
                    <Pressable
                      key={item.value}
                      style={[ms.providerRow, active && ms.providerRowActive]}
                      onPress={() => {
                        setProvider(item.value);
                        setSheetView('recharge');
                      }}
                    >
                      <View style={ms.providerIconWrap}>
                        <Text style={{ fontSize: 20 }}>{item.icon}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[ms.providerName, active && { color: C.yellow }]}>
                          {item.label}
                        </Text>
                        <Text style={ms.providerSub}>{item.sub}</Text>
                      </View>
                      {active && (
                        <View style={ms.checkCircle}>
                          <Text style={{ color: C.yellow, fontSize: 14, fontWeight: '900' }}>✓</Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ))}
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      );
    }

    // ╔═════════════════════════════╗
    // ║  VUE : Sélecteur de montant ║
    // ╚═════════════════════════════╝
    if (sheetView === 'amount') {
      return (
        <View style={[ms.sheet, { maxHeight: SCREEN_H * 0.78 }]}>
          <View style={ms.handle} />
          <Pressable style={ms.backRow} onPress={() => setSheetView('recharge')}>
            <Text style={ms.backArrow}>‹</Text>
            <Text style={ms.backLabel}>Retour</Text>
          </Pressable>
          <Text style={ms.sheetTitle}>Choisir un montant</Text>
          <Text style={ms.sheetSub}>Francs CFA (XAF)</Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={ms.amtGrid}>
              {PRESET_AMOUNTS.map(amt => {
                const active = selectedAmount === amt && !showCustomInput;
                return (
                  <Pressable
                    key={amt}
                    style={[ms.amtChip, active && ms.amtChipActive]}
                    onPress={() => {
                      setSelectedAmount(amt);
                      setShowCustomInput(false);
                      setCustomAmount('');
                      setSheetView('recharge');
                    }}
                  >
                    <Text style={[ms.amtChipVal, active && { color: C.yellow }]}>
                      {new Intl.NumberFormat('fr-FR').format(amt)}
                    </Text>
                    <Text style={[ms.amtChipUnit, active && { color: C.yellow }]}>XAF</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={[ms.customToggle, showCustomInput && ms.customToggleActive]}
              onPress={() => {
                setShowCustomInput(v => !v);
                setSelectedAmount(null);
              }}
            >
              <Text style={[ms.customToggleTxt, showCustomInput && { color: C.yellow }]}>
                ✏️  Montant personnalisé
              </Text>
            </Pressable>

            {showCustomInput && (
              <View style={ms.customInputRow}>
                <TextInput
                  style={ms.customInput}
                  value={customAmount}
                  onChangeText={setCustomAmount}
                  placeholder="Entrez un montant…"
                  placeholderTextColor={C.muted2}
                  keyboardType="numeric"
                  autoFocus
                />
                <Text style={ms.customInputUnit}>XAF</Text>
              </View>
            )}

            <Pressable style={ms.confirmBtn} onPress={() => setSheetView('recharge')}>
              <Text style={ms.confirmBtnTxt}>Valider ce montant</Text>
            </Pressable>
            <View style={{ height: 30 }} />
          </ScrollView>
        </View>
      );
    }

    // ╔══════════════════════════════════╗
    // ║  VUE PRINCIPALE : Formulaire     ║
    // ╚══════════════════════════════════╝
    return (
      <View style={[ms.sheet, { maxHeight: SCREEN_H * 0.92 }]}>
        <View style={ms.handle} />

        {/* En-tête */}
        <View style={rs.header}>
          <View>
            <Text style={rs.title}>Recharger le wallet</Text>
            <Text style={rs.sub}>Mobile Money · Gabon</Text>
          </View>
          <View style={rs.secureBadge}>
            <Text style={rs.secureBadgeText}>🔒 Sécurisé</Text>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ── Opérateur ── */}
          <Text style={rs.fieldLabel}>Opérateur Mobile Money</Text>
          <Pressable style={rs.selector} onPress={() => setSheetView('provider')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Text style={{ fontSize: 22, marginRight: 12 }}>
                {currentProvider?.icon || '📱'}
              </Text>
              <View>
                <Text style={rs.selectorVal}>
                  {currentProvider?.label || 'Sélectionner un opérateur'}
                </Text>
                <Text style={rs.selectorSub}>
                  {currentProvider?.sub || 'Appuyez pour choisir'}
                </Text>
              </View>
            </View>
            <Text style={rs.selectorArrow}>›</Text>
          </Pressable>

          {/* ── Montant ── */}
          <Text style={[rs.fieldLabel, { marginTop: 16 }]}>Montant à recharger</Text>
          <Pressable style={rs.selector} onPress={() => setSheetView('amount')}>
            <View style={{ flex: 1 }}>
              <Text style={rs.selectorVal}>
                {finalAmount
                  ? new Intl.NumberFormat('fr-FR').format(finalAmount) + ' XAF'
                  : 'Sélectionner un montant'}
              </Text>
              <Text style={rs.selectorSub}>Appuyez pour modifier</Text>
            </View>
            <Text style={rs.selectorArrow}>›</Text>
          </Pressable>

          {/* ── Numéro Mobile Money ── */}
          <Text style={[rs.fieldLabel, { marginTop: 16 }]}>Numéro Mobile Money</Text>
          <View style={rs.phoneToggleRow}>
            <Pressable
              style={[rs.phoneToggleBtn, phoneMode === 'registered' && rs.phoneToggleBtnActive]}
              onPress={() => setPhoneMode('registered')}
            >
              <Text style={[rs.phoneToggleTxt, phoneMode === 'registered' && { color: C.yellow }]}>
                Mon numéro
              </Text>
            </Pressable>
            <Pressable
              style={[rs.phoneToggleBtn, phoneMode === 'other' && rs.phoneToggleBtnActive]}
              onPress={() => setPhoneMode('other')}
            >
              <Text style={[rs.phoneToggleTxt, phoneMode === 'other' && { color: C.yellow }]}>
                Autre numéro
              </Text>
            </Pressable>
          </View>

          {phoneMode === 'registered' ? (
            <View style={rs.phoneRegistered}>
              <Text style={{ fontSize: 20, marginRight: 12 }}>📱</Text>
              <View style={{ flex: 1 }}>
                {/* ← Numéro réel du profil chauffeur */}
                <Text style={rs.phoneRegVal}>
                  {driverPhone || '— Numéro non renseigné sur votre profil'}
                </Text>
                <Text style={rs.phoneRegSub}>Numéro enregistré sur votre compte</Text>
              </View>
              <View style={rs.phoneRegCheck}>
                <Text style={{ color: C.green, fontSize: 16, fontWeight: '900' }}>✓</Text>
              </View>
            </View>
          ) : (
            <View style={rs.phoneInputWrap}>
              <Text style={rs.phoneFlag}>🇬🇦</Text>
              <TextInput
                style={rs.phoneInput}
                value={otherPhone}
                onChangeText={setOtherPhone}
                placeholder="+241 07 XX XX XX"
                placeholderTextColor={C.muted2}
                keyboardType="phone-pad"
              />
            </View>
          )}

          {/* ── Récapitulatif ── */}
          {!!finalAmount && !!finalPhone.trim() && (
            <View style={rs.recap}>
              <Text style={rs.recapTitle}>Récapitulatif</Text>
              {[
                { k: 'Opérateur', v: currentProvider?.label || provider },
                { k: 'Numéro', v: finalPhone },
                { k: 'Montant', v: formatMoney(finalAmount), highlight: true },
              ].map(row => (
                <View key={row.k} style={rs.recapRow}>
                  <Text style={rs.recapKey}>{row.k}</Text>
                  <Text
                    style={[
                      rs.recapVal,
                      row.highlight && { color: C.yellow, fontSize: 16, fontWeight: '900' },
                    ]}
                  >
                    {row.v}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* ── Bouton valider ── */}
          <Pressable
            style={[rs.submitBtn, recharging && { opacity: 0.65 }]}
            onPress={recharge}
            disabled={recharging}
          >
            {recharging ? (
              <ActivityIndicator color="#0B1220" />
            ) : (
              <>
                <Text style={rs.submitBtnTxt}>Recharger le wallet</Text>
                <Text style={rs.submitBtnArrow}>→</Text>
              </>
            )}
          </Pressable>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    );
  };

  const TX_FILTERS = [
    { key: 'all', label: 'Tout' },
    { key: 'SUCCESS', label: 'Succès' },
    { key: 'PENDING', label: 'En cours' },
    { key: 'FAILED', label: 'Échoués' },
  ];

  // ── Rendu de l'écran ──────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadAll(true)}
            tintColor={C.yellow}
          />
        }
      >
        {/* Hero */}
        <LinearGradient
          colors={['#F5C518', '#E2AE00', '#C89000']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <Text style={styles.heroBrand}>OVIRO · GABON</Text>
          <Text style={styles.heroTitle}>Portefeuille{'\n'}chauffeur</Text>
          <View style={styles.balanceBox}>
            <Text style={styles.balanceLabel}>SOLDE DISPONIBLE</Text>
            <Text style={styles.balanceValue}>{balanceText}</Text>
            <View style={styles.balanceMeta}>
              <Text style={styles.balanceMetaTxt}>Devise · XAF</Text>
              <View style={[styles.statusDot, { backgroundColor: wallet?.active ? '#0B1220' : '#a00' }]} />
              <Text style={styles.balanceMetaTxt}>
                {wallet?.active ? 'Wallet actif' : 'Inactif'}
              </Text>
            </View>
          </View>
          <Pressable style={styles.rechargeHeroBtn} onPress={() => setSheetView('recharge')}>
            <Text style={styles.rechargeHeroBtnText}>+ Recharger le wallet</Text>
          </Pressable>
        </LinearGradient>

        {/* KPIs */}
        <View style={styles.kpiRow}>
          {[
            { val: String(transactions.length), lbl: 'Opérations', color: undefined },
            { val: 'XAF', lbl: 'Devise', color: undefined },
            { val: wallet?.active ? 'Actif' : 'Off', lbl: 'Statut', color: wallet?.active ? C.green : C.red },
          ].map(k => (
            <View key={k.lbl} style={styles.kpiCard}>
              <Text style={[styles.kpiVal, k.color ? { color: k.color } : null]}>{k.val}</Text>
              <Text style={styles.kpiLbl}>{k.lbl}</Text>
            </View>
          ))}
        </View>

        {/* Historique */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Historique</Text>
              <Text style={styles.sectionSub}>Journal des opérations du compte</Text>
            </View>
            <Pressable onPress={() => loadAll(true)} style={styles.refreshBtn}>
              <Text style={styles.refreshBtnTxt}>Actualiser</Text>
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
            {TX_FILTERS.map(f => (
              <Pressable
                key={f.key}
                style={[styles.filterChip, txFilter === f.key && styles.filterChipActive]}
                onPress={() => setTxFilter(f.key)}
              >
                <Text style={[styles.filterChipTxt, txFilter === f.key && { color: C.yellow }]}>
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color={C.yellow} size="large" />
              <Text style={styles.emptyTitle}>Chargement…</Text>
            </View>
          ) : filteredTx.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 36 }}>📭</Text>
              <Text style={styles.emptyTitle}>Aucune transaction</Text>
              <Text style={styles.emptyText}>Les prochaines opérations apparaîtront ici.</Text>
            </View>
          ) : (
            filteredTx.map(tx => {
              const tone = toneForStatus(tx.status as string);
              return (
                <View key={tx.id} style={styles.txCard}>
                  <View style={styles.txHeader}>
                    <View style={styles.txLeft}>
                      <View style={styles.txIconWrap}>
                        <Text style={styles.txIconTxt}>{iconForType(tx.type as string)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.txRef} numberOfLines={1}>{tx.reference}</Text>
                        <Text style={styles.txDate}>{formatDate(tx.createdAt as string)}</Text>
                      </View>
                    </View>
                    <View style={[styles.statusChip, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                      <Text style={[styles.statusChipTxt, { color: tone.text }]}>
                        {compactStatus(tx.status as string)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.txDivider} />
                  <View style={styles.txGrid}>
                    {[
                      { l: 'Type', v: compactStatus(tx.type as string) },
                      { l: 'Montant', v: formatMoney(tx.amount as any) },
                      { l: 'Avant', v: formatMoney(tx.balanceBefore as any) },
                      { l: 'Après', v: formatMoney(tx.balanceAfter as any) },
                    ].map(item => (
                      <View key={item.l} style={styles.txInfoItem}>
                        <Text style={styles.txInfoLbl}>{item.l}</Text>
                        <Text style={styles.txInfoVal}>{item.v}</Text>
                      </View>
                    ))}
                  </View>
                  {!!tx.description && (
                    <View style={styles.descBox}>
                      <Text style={styles.descTxt}>{tx.description}</Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* FAB */}
      <View style={styles.fabWrap}>
        <Pressable style={styles.fab} onPress={() => setSheetView('recharge')}>
          <LinearGradient colors={['#F5C518', '#C89000']} style={styles.fabGradient}>
            <Text style={styles.fabTxt}>💳  Recharger</Text>
          </LinearGradient>
        </Pressable>
      </View>

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL UNIQUE — évite le bug Android des modaux imbriqués.
          La vue active (recharge / provider / amount) est contrôlée par
          `sheetView`. On navigue entre vues sans ouvrir/fermer le Modal.
          ══════════════════════════════════════════════════════════════════════ */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={handleModalBack}
      >
        <TouchableWithoutFeedback onPress={handleModalBack}>
          <View style={ms.overlay} />
        </TouchableWithoutFeedback>
        {renderSheetContent()}
      </Modal>
    </View>
  );
}

export default WalletScreen;

// ─── Styles principaux ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 100 },
  heroCard: {
    borderRadius: 28, padding: 22, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 }, elevation: 10,
  },
  heroBrand: { color: '#0B1220', fontSize: 10, fontWeight: '900', letterSpacing: 3, marginBottom: 10 },
  heroTitle: { color: '#0B1220', fontSize: 30, fontWeight: '900', lineHeight: 34, marginBottom: 18 },
  balanceBox: { backgroundColor: 'rgba(11,18,32,0.12)', borderRadius: 22, padding: 18, marginBottom: 16 },
  balanceLabel: { color: '#30445C', fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginBottom: 6 },
  balanceValue: { color: '#0B1220', fontSize: 32, fontWeight: '900', letterSpacing: -0.5, marginBottom: 10 },
  balanceMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  balanceMetaTxt: { color: '#23344A', fontSize: 12, fontWeight: '700' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  rechargeHeroBtn: { backgroundColor: '#0B1220', borderRadius: 16, height: 50, alignItems: 'center', justifyContent: 'center' },
  rechargeHeroBtnText: { color: C.yellow, fontSize: 15, fontWeight: '900', letterSpacing: 0.3 },
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  kpiCard: { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingVertical: 18, paddingHorizontal: 10, alignItems: 'center' },
  kpiVal: { color: C.text, fontSize: 20, fontWeight: '900', marginBottom: 5 },
  kpiLbl: { color: C.muted2, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  sectionCard: { backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 16 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { color: C.text, fontSize: 18, fontWeight: '900' },
  sectionSub: { color: C.muted, fontSize: 12, marginTop: 3 },
  refreshBtn: { backgroundColor: C.yellowSoft, borderWidth: 1, borderColor: C.borderGold, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  refreshBtnTxt: { color: C.yellow, fontSize: 12, fontWeight: '900' },
  filterRow: { marginBottom: 14 },
  filterChip: { marginRight: 8, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  filterChipActive: { backgroundColor: C.yellowSoft, borderColor: C.borderGold },
  filterChipTxt: { color: C.muted, fontSize: 12, fontWeight: '800' },
  emptyState: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  emptyTitle: { color: C.text, fontSize: 15, fontWeight: '900' },
  emptyText: { color: C.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  txCard: { backgroundColor: C.card2, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 10 },
  txHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  txLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', marginRight: 10 },
  txIconWrap: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.yellowSoft, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  txIconTxt: { fontSize: 18 },
  txRef: { color: C.text, fontSize: 13, fontWeight: '900', marginBottom: 3 },
  txDate: { color: C.muted2, fontSize: 11, fontWeight: '700' },
  statusChip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  statusChipTxt: { fontSize: 11, fontWeight: '900' },
  txDivider: { height: 1, backgroundColor: C.border, marginVertical: 12 },
  txGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  txInfoItem: { width: '50%', paddingHorizontal: 4, marginBottom: 10 },
  txInfoLbl: { color: C.muted2, fontSize: 11, fontWeight: '700', marginBottom: 3 },
  txInfoVal: { color: C.text, fontSize: 13, fontWeight: '800' },
  descBox: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 10, marginTop: 4 },
  descTxt: { color: C.muted, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  fabWrap: { position: 'absolute', bottom: 24, left: 20, right: 20 },
  fab: { borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  fabGradient: { height: 56, alignItems: 'center', justifyContent: 'center' },
  fabTxt: { color: '#0B1220', fontSize: 16, fontWeight: '900' },
});

// ─── Styles Modal (ms) ────────────────────────────────────────────────────────
const ms = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.overlay,
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: '#0A1622',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(245,197,24,0.18)',
    padding: 20,
    paddingBottom: 0,
    maxHeight: SCREEN_H * 0.9,
  },
  handle: {
    width: 44, height: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 4 },
  backArrow: { color: C.yellow, fontSize: 22, fontWeight: '300', lineHeight: 24 },
  backLabel: { color: C.yellow, fontSize: 13, fontWeight: '800' },
  sheetTitle: { color: C.text, fontSize: 20, fontWeight: '900', marginBottom: 4 },
  sheetSub: { color: C.muted, fontSize: 13 },

  // Opérateurs
  groupLabel: { color: C.muted2, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 18, marginBottom: 8 },
  providerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card2, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 8 },
  providerRowActive: { backgroundColor: C.yellowSoft, borderColor: C.borderGold },
  providerIconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  providerName: { color: C.text, fontSize: 14, fontWeight: '800', marginBottom: 2 },
  providerSub: { color: C.muted2, fontSize: 12, fontWeight: '600' },
  checkCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.yellowSoft, borderWidth: 1, borderColor: C.borderGold, alignItems: 'center', justifyContent: 'center' },

  // Montants
  amtGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16, marginBottom: 6 },
  amtChip: { width: '30%', backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  amtChipActive: { backgroundColor: C.yellowSoft, borderColor: C.borderGold },
  amtChipVal: { color: C.text, fontSize: 14, fontWeight: '900', marginBottom: 2 },
  amtChipUnit: { color: C.muted2, fontSize: 10, fontWeight: '700' },
  customToggle: { backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 4, marginBottom: 10 },
  customToggleActive: { backgroundColor: C.yellowSoft, borderColor: C.borderGold },
  customToggleTxt: { color: C.muted, fontSize: 14, fontWeight: '800' },
  customInputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card2, borderWidth: 1, borderColor: C.borderGold, borderRadius: 16, paddingHorizontal: 16, height: 54, marginBottom: 12 },
  customInput: { flex: 1, color: C.text, fontSize: 18, fontWeight: '800' },
  customInputUnit: { color: C.yellow, fontSize: 13, fontWeight: '900', marginLeft: 8 },
  confirmBtn: { backgroundColor: C.yellow, borderRadius: 18, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  confirmBtnTxt: { color: '#0B1220', fontSize: 15, fontWeight: '900' },
});

// ─── Styles Formulaire Recharge (rs) ─────────────────────────────────────────
const rs = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title: { color: C.text, fontSize: 20, fontWeight: '900' },
  sub: { color: C.muted, fontSize: 13, marginTop: 2 },
  secureBadge: { backgroundColor: 'rgba(34,197,94,0.12)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  secureBadgeText: { color: C.green, fontSize: 12, fontWeight: '800' },
  fieldLabel: { color: C.muted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8 },
  selector: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card2, borderWidth: 1, borderColor: C.borderGold, borderRadius: 18, padding: 16, minHeight: 66 },
  selectorVal: { color: C.text, fontSize: 15, fontWeight: '800', marginBottom: 2 },
  selectorSub: { color: C.muted2, fontSize: 12, fontWeight: '600' },
  selectorArrow: { color: C.yellow, fontSize: 28, marginLeft: 8 },
  phoneToggleRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  phoneToggleBtn: { flex: 1, height: 42, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  phoneToggleBtnActive: { backgroundColor: C.yellowSoft, borderColor: C.borderGold },
  phoneToggleTxt: { color: C.muted, fontSize: 13, fontWeight: '800' },
  phoneRegistered: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card2, borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)', borderRadius: 18, padding: 16 },
  phoneRegVal: { color: C.text, fontSize: 15, fontWeight: '900', marginBottom: 2 },
  phoneRegSub: { color: C.muted2, fontSize: 12, fontWeight: '600' },
  phoneRegCheck: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(34,197,94,0.12)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)', alignItems: 'center', justifyContent: 'center' },
  phoneInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card2, borderWidth: 1, borderColor: C.borderGold, borderRadius: 18, paddingHorizontal: 16, height: 56 },
  phoneFlag: { fontSize: 22, marginRight: 12 },
  phoneInput: { flex: 1, color: C.text, fontSize: 16, fontWeight: '700' },
  recap: { backgroundColor: 'rgba(245,197,24,0.06)', borderWidth: 1, borderColor: C.borderGold, borderRadius: 18, padding: 16, marginTop: 18, marginBottom: 4 },
  recapTitle: { color: C.yellow, fontSize: 10, fontWeight: '900', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 },
  recapRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  recapKey: { color: C.muted2, fontSize: 13, fontWeight: '700' },
  recapVal: { color: C.text, fontSize: 13, fontWeight: '800' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: C.yellow, borderRadius: 20, height: 56, marginTop: 18 },
  submitBtnTxt: { color: '#0B1220', fontSize: 16, fontWeight: '900' },
  submitBtnArrow: { color: '#0B1220', fontSize: 20, fontWeight: '900' },
});