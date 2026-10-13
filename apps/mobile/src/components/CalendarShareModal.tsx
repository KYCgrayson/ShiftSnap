import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';
import ViewShot, { releaseCapture } from 'react-native-view-shot';
import { useTranslation } from 'react-i18next';
import { getMonthlyShareQuote, type ShareQuoteMode } from '../services/calendarShareQuotes';

export interface CalendarShareShift {
  id: string;
  date: string;
  name: string;
  startTime: string | null;
  endTime: string | null;
  isDayOff: boolean;
}

interface Props {
  visible: boolean;
  accountId: string;
  yearMonth: string;
  shifts: CalendarShareShift[];
  locale: string;
  onClose: () => void;
}

const WEEKDAYS = {
  'zh-TW': ['日', '一', '二', '三', '四', '五', '六'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

function getWeeks(yearMonth: string): Array<Array<number | null>> {
  const [year, month] = yearMonth.split('-').map(Number);
  const offset = new Date(year, month - 1, 1).getDay();
  const days = new Date(year, month, 0).getDate();
  const cellCount = Math.ceil((offset + days) / 7) * 7;
  return Array.from({ length: cellCount / 7 }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) => {
      const date = week * 7 + weekday - offset + 1;
      return date >= 1 && date <= days ? date : null;
    }),
  );
}

function displayTime(time: string | null): string | null {
  return time ? time.slice(0, 5) : null;
}

export function CalendarShareModal({ visible, accountId, yearMonth, shifts, locale, onClose }: Props) {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const shotRef = useRef<ViewShot>(null);
  const sharingRef = useRef(false);
  const savingModeRef = useRef(false);
  const scopeRef = useRef(`${accountId}:${yearMonth}`);
  const [mode, setMode] = useState<ShareQuoteMode>('gentle');
  const [modeReady, setModeReady] = useState(false);
  const [modeError, setModeError] = useState(false);
  const [savingMode, setSavingMode] = useState(false);
  const [quote, setQuote] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [laidOut, setLaidOut] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const language = locale === 'zh-TW' ? 'zh-TW' : 'en';
  const cardWidth = Math.min(windowWidth - 28, 420);
  const weeks = useMemo(() => getWeeks(yearMonth), [yearMonth]);
  const [year, month] = yearMonth.split('-').map(Number);
  const modeKey = `ishift:share-mode:v1:${accountId}`;

  const shiftsByDay = useMemo(() => {
    const result = new Map<string, CalendarShareShift[]>();
    for (const shift of shifts) {
      const entries = result.get(shift.date) || [];
      entries.push(shift);
      result.set(shift.date, entries);
    }
    return result;
  }, [shifts]);

  useEffect(() => {
    const scope = `${accountId}:${yearMonth}`;
    scopeRef.current = scope;
    return () => { if (scopeRef.current === scope) scopeRef.current = ''; };
  }, [accountId, yearMonth]);

  useEffect(() => {
    let cancelled = false;
    setModeReady(false);
    setModeError(false);
    AsyncStorage.getItem(modeKey)
      .then((saved) => {
        if (cancelled) return;
        setMode(saved === 'toxic' || saved === 'none' ? saved : 'gentle');
        setModeReady(true);
      })
      .catch(() => { if (!cancelled) { setModeError(true); setModeReady(true); } });
    return () => { cancelled = true; };
  }, [modeKey]);

  useEffect(() => {
    if (!visible || !modeReady || modeError) return;
    let cancelled = false;
    setQuote(null);
    setQuoteError(false);
    if (mode === 'none') {
      setQuote('');
      return;
    }
    getMonthlyShareQuote(accountId, yearMonth, mode, locale)
      .then((line) => { if (!cancelled) setQuote(line); })
      .catch(() => { if (!cancelled) setQuoteError(true); });
    return () => { cancelled = true; };
  }, [accountId, yearMonth, mode, locale, retryNonce, visible, modeReady, modeError]);

  useEffect(() => {
    if (quote === null) return;
    // Wait until the selected line has been laid out before allowing capture.
    setLaidOut(false);
    const frame = requestAnimationFrame(() => setLaidOut(true));
    return () => cancelAnimationFrame(frame);
  }, [quote]);

  const shareImage = async () => {
    if (sharingRef.current || !modeReady || modeError || savingMode || quote === null || !laidOut || !logoLoaded || logoError) return;
    sharingRef.current = true;
    setSharing(true);
    setShareError(null);
    const scope = `${accountId}:${yearMonth}`;
    let uri: string | null = null;
    try {
      if (!await Sharing.isAvailableAsync()) {
        if (scopeRef.current === scope) setShareError(t('calendarShare.unavailable'));
        return;
      }
      if (scopeRef.current !== scope) return;
      const capture = shotRef.current?.capture;
      if (!capture) throw new Error('View shot not mounted');
      uri = await capture.call(shotRef.current);
      if (scopeRef.current !== scope) return;
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        UTI: 'public.png',
        dialogTitle: t('calendarShare.shareTitle'),
      });
      // The native sheet can be dismissed without a destination. Do not claim a save or send.
    } catch {
      if (scopeRef.current === scope) setShareError(t('calendarShare.shareFailed'));
    } finally {
      if (uri) releaseCapture(uri);
      sharingRef.current = false;
      setSharing(false);
    }
  };

  const switchMode = async (next: ShareQuoteMode) => {
    if (sharingRef.current || savingModeRef.current) return;
    savingModeRef.current = true;
    setSavingMode(true);
    setShareError(null);
    try {
      await AsyncStorage.setItem(modeKey, next);
      setQuote(null);
      setLaidOut(false);
      setMode(next);
      setRetryNonce((value) => value + 1);
      setModeError(false);
      setQuoteError(false);
    } catch {
      setModeError(true);
    } finally {
      savingModeRef.current = false;
      setSavingMode(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { if (!sharing) onClose(); }}>
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => { if (!sharing) onClose(); }} disabled={sharing} accessibilityRole="button" accessibilityLabel={t('common.cancel')} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#754F4B" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>{t('calendarShare.previewTitle')}</Text>
          <View style={styles.closeButton} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ViewShot
            ref={shotRef}
            options={{ format: 'png', result: 'tmpfile', width: 1080 }}
            style={[styles.poster, { width: cardWidth }]}
            onLayout={() => setLaidOut(true)}
          >
            <View collapsable={false} style={styles.posterInner}>
              <View style={styles.posterTopLine}>
                <Text style={styles.topLineText}>{yearMonth.replace('-', '.')}</Text>
                <Text style={styles.topLineText}>{t('calendarShare.diaryStyle')}</Text>
              </View>
              <Text style={[styles.posterTitle, mode !== 'none' && styles.quoteTitle]}>
                {mode === 'none' ? t('calendarShare.posterTitle') : quote || ' '}
              </Text>
              <View style={styles.titleRule} />
              <Text style={styles.posterMonth}>
                {t('calendarShare.posterMonth', { year, month })}
              </Text>

              <View style={styles.weekdayRow}>
                {WEEKDAYS[language].map((weekday, index) => (
                  <Text key={index} style={[styles.weekday, (index === 0 || index === 6) && styles.weekendText]}>{weekday}</Text>
                ))}
              </View>
              {weeks.map((week, weekIndex) => (
                <View key={weekIndex} style={styles.weekRow}>
                  {week.map((day, weekday) => {
                    const date = day === null ? null : `${yearMonth}-${String(day).padStart(2, '0')}`;
                    const entries = date ? shiftsByDay.get(date) || [] : [];
                    const isRest = entries.length > 0 && entries.every((entry) => entry.isDayOff);
                    const isWeekend = weekday === 0 || weekday === 6;
                    return (
                      <View key={weekday} style={[styles.dayCell, day === null && styles.blankCell, isRest && styles.restCell, !isRest && isWeekend && day !== null && styles.weekendCell]}>
                        {day !== null && (
                          <>
                            <Text style={[styles.dayNumber, isWeekend && styles.weekendText]}>{day}</Text>
                            {entries.map((entry) => (
                              <View key={entry.id} style={styles.shiftBlock}>
                                <Text style={[styles.shiftName, entry.isDayOff && styles.restText]}>
                                  {entry.isDayOff ? t('calendarShare.dayOff') : entry.name}
                                </Text>
                                {!entry.isDayOff && (entry.startTime || entry.endTime) && (
                                  <Text style={styles.shiftTime}>
                                    {[displayTime(entry.startTime), displayTime(entry.endTime)].filter(Boolean).join('\n')}
                                    {entry.startTime && entry.endTime && entry.endTime < entry.startTime ? `\n${t('calendarShare.nextDay')}` : ''}
                                  </Text>
                                )}
                              </View>
                            ))}
                          </>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}
              {shifts.length === 0 && <Text style={styles.emptyMonth}>{t('calendarShare.emptyMonth')}</Text>}
              <View style={styles.footer}>
                <View style={styles.brand}>
                  <Image
                    source={require('../../assets/ishift-logo-light.png')}
                    style={styles.brandLogo}
                    resizeMode="contain"
                    onLoad={() => setLogoLoaded(true)}
                    onError={() => setLogoError(true)}
                  />
                  <Text style={styles.brandName}>IShift</Text>
                </View>
                <Text style={styles.footerLabel}>{t('calendarShare.diaryStyle')}</Text>
              </View>
            </View>
          </ViewShot>

          <Text style={styles.privacyNote}>{t('calendarShare.privacyNote')}</Text>
          <View style={styles.modeRow}>
            {(['gentle', 'toxic', 'none'] as ShareQuoteMode[]).map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.modeButton, mode === option && styles.modeButtonSelected]}
                onPress={() => void switchMode(option)}
                disabled={!modeReady || savingMode || sharing}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === option }}
              >
                <Text style={[styles.modeText, mode === option && styles.modeTextSelected]}>{t(`calendarShare.mode.${option}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {quoteError && (
            <TouchableOpacity onPress={() => setRetryNonce((value) => value + 1)} accessibilityRole="button">
              <Text style={styles.errorText}>{t('calendarShare.quoteFailed')} {t('common.retry')}</Text>
            </TouchableOpacity>
          )}
          {modeError && <Text style={styles.errorText}>{t('calendarShare.modeSaveFailed')}</Text>}
          {logoError && <Text style={styles.errorText}>{t('calendarShare.logoFailed')}</Text>}
          {shareError && <Text style={styles.errorText}>{shareError}</Text>}
        </ScrollView>
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.shareButton, (sharing || savingMode || !modeReady || modeError || quote === null || !laidOut || !logoLoaded || logoError) && styles.shareButtonDisabled]}
            disabled={sharing || savingMode || !modeReady || modeError || quote === null || !laidOut || !logoLoaded || logoError}
            onPress={() => void shareImage()}
            accessibilityRole="button"
            accessibilityLabel={t('calendarShare.shareButton')}
          >
            {sharing ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="share-outline" size={19} color="#FFFFFF" />}
            <Text style={styles.shareButtonText}>{t('calendarShare.shareButton')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FBF7F3' },
  topBar: { height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 17, fontWeight: '600', color: '#754F4B' },
  scrollContent: { alignItems: 'center', paddingBottom: 18 },
  poster: { backgroundColor: '#FFFDFC', borderRadius: 14, overflow: 'hidden', elevation: 3, shadowColor: '#B59388', shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  posterInner: { paddingHorizontal: 13, paddingTop: 16, paddingBottom: 12, backgroundColor: '#FFFDFC' },
  posterTopLine: { flexDirection: 'row', justifyContent: 'space-between' },
  topLineText: { fontSize: 10, color: '#B69B94', letterSpacing: 1 },
  posterTitle: { marginTop: 14, minHeight: 36, textAlign: 'center', fontSize: 26, color: '#805C55', fontWeight: '400', letterSpacing: 5 },
  quoteTitle: { fontSize: 13, lineHeight: 20, letterSpacing: 1.5, fontWeight: '400', paddingHorizontal: 4 },
  titleRule: { alignSelf: 'center', marginTop: 8, width: 25, height: 1, backgroundColor: '#C3938B' },
  posterMonth: { marginTop: 10, marginBottom: 12, textAlign: 'center', fontSize: 17, color: '#805C55', letterSpacing: 1 },
  weekdayRow: { flexDirection: 'row', marginBottom: 6 },
  weekday: { flex: 1, textAlign: 'center', color: '#805C55', fontSize: 11, fontWeight: '600' },
  weekendText: { color: '#C96776' },
  weekRow: { flexDirection: 'row', marginBottom: 4, alignItems: 'stretch' },
  dayCell: { flex: 1, minWidth: 0, minHeight: 67, marginHorizontal: 1, paddingHorizontal: 2, paddingVertical: 5, borderRadius: 6, backgroundColor: '#FAF7F4' },
  blankCell: { backgroundColor: '#FCFAF8' },
  weekendCell: { backgroundColor: '#FFF1F1' },
  restCell: { backgroundColor: '#FBEAE3' },
  dayNumber: { marginLeft: 2, fontSize: 12, fontWeight: '500', color: '#704D48' },
  shiftBlock: { marginTop: 4, alignItems: 'center' },
  shiftName: { fontSize: 10, textAlign: 'center', color: '#704D48', fontWeight: '500' },
  shiftTime: { marginTop: 1, fontSize: 8, textAlign: 'center', color: '#775852' },
  restText: { fontSize: 15, color: '#CB8875' },
  emptyMonth: { marginTop: 10, textAlign: 'center', fontSize: 12, color: '#A2867F' },
  footer: { marginTop: 18, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: '#E6D5D0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center' },
  brandLogo: { width: 20, height: 20 },
  brandName: { marginLeft: 5, fontSize: 11, fontWeight: '600', color: '#A68179' },
  footerLabel: { fontSize: 9, color: '#B79B93' },
  privacyNote: { marginTop: 12, marginHorizontal: 18, textAlign: 'center', color: '#8E7974', fontSize: 12 },
  modeRow: { marginTop: 14, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  modeButton: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: 18, borderWidth: 1, borderColor: '#E8CFC5', backgroundColor: '#FFFDFC' },
  modeButtonSelected: { backgroundColor: '#D98D7E', borderColor: '#D98D7E' },
  modeText: { color: '#906D65', fontSize: 13 },
  modeTextSelected: { color: '#FFFFFF', fontWeight: '600' },
  errorText: { textAlign: 'center', color: '#B54B48', marginTop: 10, marginHorizontal: 20, fontSize: 12 },
  bottomBar: { padding: 12, borderTopWidth: 1, borderTopColor: '#F0DDD6', backgroundColor: '#FBF7F3' },
  shareButton: { minHeight: 48, borderRadius: 12, backgroundColor: '#CF7E70', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  shareButtonDisabled: { opacity: 0.45 },
  shareButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
