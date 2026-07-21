import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';

export interface OptionListModalOption { value: string; label: string; detail?: string; }

interface OptionListModalProps {
  visible: boolean; title: string; options: OptionListModalOption[]; selectedValue?: string | null;
  cancelLabel: string; onSelect: (value: string) => void; onClose: () => void;
}

/** A touch-friendly replacement for Android Alerts with long option lists. */
export function OptionListModal({ visible, title, options, selectedValue, cancelLabel, onSelect, onClose }: OptionListModalProps) {
  const theme = useTheme();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={cancelLabel} />
      <View style={[styles.sheet, { backgroundColor: theme.colors.warmWhite }]} accessibilityViewIsModal>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{title}</Text>
        <ScrollView style={styles.options} contentContainerStyle={styles.optionsContent}>
          {options.map((option) => {
            const selected = option.value === selectedValue;
            return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={option.detail ? `${option.label}, ${option.detail}` : option.label} style={[styles.option, { borderColor: theme.colors.borderLight }]} onPress={() => onSelect(option.value)}>
              <View style={styles.optionCopy}><Text style={[styles.optionLabel, { color: theme.colors.textPrimary }]}>{option.label}</Text>{option.detail ? <Text style={[styles.optionDetail, { color: theme.colors.textSecondary }]}>{option.detail}</Text> : null}</View>
              {selected ? <Text style={[styles.check, { color: theme.colors.primary }]}>✓</Text> : null}
            </Pressable>;
          })}
        </ScrollView>
        <Pressable accessibilityRole="button" style={[styles.cancel, { borderColor: theme.colors.border }]} onPress={onClose}><Text style={[styles.cancelText, { color: theme.colors.primary }]}>{cancelLabel}</Text></Pressable>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.45)' }, sheet: { maxHeight: '75%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 28 }, title: { fontSize: 18, fontWeight: '700', marginBottom: 12 }, options: { maxHeight: 360 }, optionsContent: { paddingBottom: 4 }, option: { minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }, optionCopy: { flex: 1, paddingRight: 12 }, optionLabel: { fontSize: 16, fontWeight: '600' }, optionDetail: { fontSize: 13, marginTop: 2 }, check: { fontSize: 21, fontWeight: '700' }, cancel: { alignItems: 'center', borderWidth: 1, borderRadius: 10, marginTop: 16, paddingVertical: 12 }, cancelText: { fontSize: 16, fontWeight: '600' },
});
