import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { theme } from '../constants/theme';

export function Screen({ children }: { children: React.ReactNode }) {
  return <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>{children}</ScrollView>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Title({ children }: { children: React.ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Subtitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  small
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
}) {
  const map = {
    primary: { backgroundColor: theme.colors.primary, color: theme.colors.white },
    secondary: { backgroundColor: theme.colors.surfaceAlt, color: theme.colors.white },
    danger: { backgroundColor: theme.colors.danger, color: theme.colors.white },
    ghost: { backgroundColor: 'transparent', color: theme.colors.text }
  };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        small && { paddingVertical: 10, paddingHorizontal: 14 },
        { backgroundColor: map[variant].backgroundColor, opacity: pressed || disabled ? 0.75 : 1 }
      ]}
    >
      {loading ? <ActivityIndicator color={map[variant].color} /> : <Text style={[styles.buttonText, { color: map[variant].color }]}>{label}</Text>}
    </Pressable>
  );
}

export function AppInput({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  secureTextEntry
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'number-pad' | 'numeric' | 'phone-pad';
  secureTextEntry?: boolean;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        keyboardType={keyboardType}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        style={[styles.input, multiline && { minHeight: 96, textAlignVertical: 'top' }]}
      />
    </View>
  );
}

export function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={[styles.statCard, accent ? { borderLeftColor: accent } : null]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function Badge({ label, tone = 'default' }: { label: string; tone?: 'default' | 'success' | 'warning' | 'danger' }) {
  const bg = tone === 'success' ? 'rgba(18,183,106,0.18)' : tone === 'warning' ? 'rgba(247,144,9,0.18)' : tone === 'danger' ? 'rgba(240,68,56,0.18)' : 'rgba(45,140,255,0.18)';
  const color = tone === 'success' ? theme.colors.success : tone === 'warning' ? theme.colors.warning : tone === 'danger' ? theme.colors.danger : theme.colors.primarySoft;
  return <Text style={[styles.badge, { backgroundColor: bg, color }]}>{label}</Text>;
}

export function AppModal({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable onPress={onClose}><Text style={styles.close}>✕</Text></Pressable>
          </View>
          <ScrollView>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  screenContent: { padding: 18, paddingBottom: 120 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 14,
    ...theme.shadow
  },
  title: { color: theme.colors.text, fontSize: 28, fontWeight: '800', marginBottom: 6 },
  subtitle: { color: theme.colors.textMuted, fontSize: 14, marginBottom: 16, lineHeight: 20 },
  button: { borderRadius: 16, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  buttonText: { fontWeight: '800', fontSize: 15 },
  inputLabel: { color: theme.colors.text, fontWeight: '700', marginBottom: 8 },
  input: { backgroundColor: theme.colors.surfaceAlt, color: theme.colors.text, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14, borderWidth: 1, borderColor: theme.colors.border },
  statCard: { flex: 1, minWidth: '47%', backgroundColor: theme.colors.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: theme.colors.border, borderLeftWidth: 4 },
  statValue: { color: theme.colors.text, fontSize: 22, fontWeight: '800' },
  statLabel: { color: theme.colors.textMuted, marginTop: 6 },
  badge: { alignSelf: 'flex-start', paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, fontWeight: '800', fontSize: 12, overflow: 'hidden' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: theme.colors.bg, maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, borderTopWidth: 1, borderColor: theme.colors.border },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { color: theme.colors.text, fontSize: 20, fontWeight: '800' },
  close: { color: theme.colors.text, fontSize: 22, fontWeight: '800' }
});
