import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Animated,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme';
import { Button } from '../../src/components/ui';
import { supabase } from '../../src/services/supabase';
import { useAuthStore } from '../../src/stores/authStore';
import { useScheduleStore } from '../../src/stores/scheduleStore';
import { useLocaleStore } from '../../src/stores/localeStore';
import { formatYearMonth } from '@shiftsnap/shared';

// Generate a fresh signed URL from a storage path
const getSignedImageUrl = async (imageUrl: string): Promise<string> => {
  // If it's already a local file URI or a fresh URL, return as-is
  if (imageUrl.startsWith('file://') || imageUrl.startsWith('data:')) return imageUrl;
  // If it's a storage path (no http), generate a signed URL
  if (!imageUrl.startsWith('http')) {
    const { data, error } = await supabase.storage
      .from('shift-images')
      .createSignedUrl(imageUrl, 3600);
    if (!error && data?.signedUrl) return data.signedUrl;
  }
  // Fallback: return original (might be an old signed URL)
  return imageUrl;
};

export default function ScanScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const locale = useLocaleStore((s) => s.locale);
  const { user, isGuest } = useAuthStore();
  const { createScheduleFromOCR, schedules, fetchSchedules } = useScheduleStore();
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  // Pulse animation for processing overlay
  useEffect(() => {
    if (processing) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      animation.start();
      return () => animation.stop();
    }
  }, [processing]);

  // Load scan history on mount
  useEffect(() => {
    if (user?.id) {
      fetchSchedules(user.id);
    }
  }, [user?.id]);

  // Auto-request camera permission on mount (triggers native iOS dialog)
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission]);

  // Resolve signed URLs when entering history view
  useEffect(() => {
    if (showHistory && schedules.length > 0) {
      const resolve = async () => {
        const urls: Record<string, string> = {};
        for (const schedule of schedules) {
          if (schedule.image_url) {
            urls[schedule.id] = await getSignedImageUrl(schedule.image_url);
          }
        }
        setSignedUrls(urls);
      };
      resolve();
    }
  }, [showHistory, schedules]);

  // Permission loading
  if (!permission) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.warmWhite }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setCapturedImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Image picker error:', error);
    }
  };

  // Permission denied view
  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.warmWhite }]}>
        <View style={styles.permissionContainer}>
          <View style={[styles.iconContainer, { backgroundColor: theme.colors.primary + '15' }]}>
            <Ionicons name="camera-outline" size={48} color={theme.colors.primary} />
          </View>
          <Text style={[styles.permissionTitle, { color: theme.colors.textPrimary }]}>
            {t('scan.cameraRequired')}
          </Text>
          <Text style={[styles.permissionText, { color: theme.colors.textSecondary }]}>
            {t('scan.cameraDesc')}
          </Text>
          <Button
            title={t('scan.grantCamera')}
            onPress={requestPermission}
            fullWidth
            style={{ marginTop: 24 }}
          />
          <Button
            title={t('scan.chooseFromLibrary')}
            onPress={pickImage}
            variant="secondary"
            fullWidth
            style={{ marginTop: 12 }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const takePicture = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });
      if (photo?.uri) {
        setCapturedImage(photo.uri);
      }
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
  };

  const callOcrFunction = async (body: Record<string, unknown>): Promise<any> => {
    const MAX_RETRIES = 2;
    let lastError = '';

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, attempt * 1500));
      }

      const { data, error: ocrError } = await supabase.functions.invoke('ocr-process', { body });

      if (ocrError) {
        lastError = data?.raw_response || ocrError.message;
        console.warn(`OCR attempt ${attempt + 1} failed:`, lastError);
        if (attempt < MAX_RETRIES) continue;
        throw new Error(lastError);
      }

      if (!data?.success) {
        lastError = data?.raw_response || 'Unknown error';
        console.warn(`OCR attempt ${attempt + 1} not successful:`, lastError);
        if (attempt < MAX_RETRIES) continue;
        throw new Error(lastError);
      }

      return data;
    }

    throw new Error(lastError || 'OCR failed after retries');
  };

  const processSchedule = async () => {
    if (!capturedImage) return;
    if (!user) {
      Alert.alert(t('common.error'), 'Please sign in first.');
      return;
    }

    setProcessing(true);
    try {
      let imageUrlForReview: string;
      let ocrData;

      if (isGuest) {
        // Guest mode: convert image to base64 and send directly to Edge Function
        const response = await fetch(capturedImage);
        const blob = await response.blob();
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result as string;
            // Strip the data:image/...;base64, prefix
            resolve(dataUrl.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        ocrData = await callOcrFunction({
          imageBase64: base64,
          imageMimeType: 'image/jpeg',
        });

        imageUrlForReview = capturedImage; // Use local URI for review screen
      } else {
        // Authenticated mode: upload to storage, then call Edge Function with URL
        const fileName = `schedule_${Date.now()}.jpg`;
        const response = await fetch(capturedImage);
        const blob = await response.blob();

        const { error: uploadError } = await supabase.storage
          .from('shift-images')
          .upload(fileName, blob, {
            contentType: 'image/jpeg',
          });

        if (uploadError) {
          throw new Error('Failed to upload image: ' + uploadError.message);
        }

        const { data: urlData, error: urlError } = await supabase.storage
          .from('shift-images')
          .createSignedUrl(fileName, 3600);

        if (urlError || !urlData?.signedUrl) {
          throw new Error('Failed to get image URL: ' + (urlError?.message || 'Unknown error'));
        }

        ocrData = await callOcrFunction({
          imageUrl: urlData.signedUrl,
        });

        // Store the storage file path (not signed URL) so we can regenerate URLs later
        imageUrlForReview = fileName;
      }

      // Determine year-month from OCR or use current
      const yearMonth = ocrData.detected_year && ocrData.detected_month
        ? `${ocrData.detected_year}-${String(ocrData.detected_month).padStart(2, '0')}`
        : formatYearMonth(new Date());

      // Create schedule record (in-memory for guests, DB for authenticated)
      const scheduleId = await createScheduleFromOCR(
        user.id,
        imageUrlForReview,
        yearMonth,
        ocrData
      );

      // Resolve the image URL for the review screen
      const resolvedImageUrl = await getSignedImageUrl(imageUrlForReview);

      // Navigate to review screen
      router.push({
        pathname: '/review-schedule',
        params: {
          ocrResult: JSON.stringify(ocrData),
          scheduleId,
          yearMonth,
          imageUrl: resolvedImageUrl,
        },
      });
    } catch (error) {
      console.error('Error processing schedule:', error);
      Alert.alert(
        t('scan.processingFailed'),
        error instanceof Error ? error.message : t('scan.failedToProcess')
      );
    } finally {
      setProcessing(false);
    }
  };

  // Preview captured image
  if (capturedImage) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#000' }]}>
        <View style={styles.previewContainer}>
          <Image source={{ uri: capturedImage }} style={styles.previewImage} />
          <View style={styles.previewOverlay}>
            <Text style={styles.previewTitle}>{t('scan.reviewSchedule')}</Text>
            <Text style={styles.previewText}>
              {t('scan.reviewHint')}
            </Text>
          </View>
        </View>
        <View style={[styles.previewActions, { backgroundColor: theme.colors.warmWhite }]}>
          <Button
            title={t('scan.retake')}
            onPress={retakePhoto}
            variant="secondary"
            style={{ flex: 1, marginRight: 8 }}
          />
          <Button
            title={processing ? t('scan.processing') : t('scan.processSchedule')}
            onPress={processSchedule}
            loading={processing}
            disabled={processing}
            style={{ flex: 1, marginLeft: 8 }}
          />
        </View>
        {processing && (
          <View style={styles.processingOverlayContainer}>
            <ActivityIndicator size="large" color="#FFF" style={{ transform: [{ scale: 2 }] }} />
            <Animated.Text style={[styles.processingText, { opacity: pulseAnim }]}>
              {t('scan.processingSchedule')}
            </Animated.Text>
            <Text style={styles.processingHint}>{t('scan.processingHint')}</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // Scan history view
  if (showHistory) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.warmWhite }]}>
        <View style={styles.historyHeader}>
          <TouchableOpacity onPress={() => setShowHistory(false)} style={styles.closeButton}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.historyHeaderTitle, { color: theme.colors.textPrimary }]}>
            {t('scan.scanHistory')}
          </Text>
          <View style={{ width: 40 }} />
        </View>
        {schedules.length > 0 ? (
          <FlatList
            data={schedules}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            renderItem={({ item }) => {
              const thumbnailUrl = signedUrls[item.id] || item.image_url;
              const handleOpenReview = async () => {
                if (item.raw_ocr_result) {
                  const imageUrl = await getSignedImageUrl(item.image_url);
                  router.push({
                    pathname: '/review-schedule',
                    params: {
                      ocrResult: JSON.stringify(item.raw_ocr_result),
                      scheduleId: item.id,
                      yearMonth: item.year_month,
                      imageUrl,
                    },
                  });
                } else {
                  Alert.alert(t('scan.noOcrData'), t('scan.noOcrDataDesc'));
                }
              };
              const handleReanalyze = async () => {
                const imageUrl = await getSignedImageUrl(item.image_url);
                if (!imageUrl || imageUrl.startsWith('data:')) {
                  Alert.alert(t('common.error'), t('scan.noOcrDataDesc'));
                  return;
                }
                setCapturedImage(imageUrl);
                setShowHistory(false);
              };
              return (
                <TouchableOpacity
                  style={[styles.historyCard, { backgroundColor: theme.colors.cardBackground, borderColor: theme.colors.border }]}
                  onPress={handleOpenReview}
                >
                  <Image
                    source={{ uri: thumbnailUrl }}
                    style={styles.historyThumbnail}
                  />
                  <View style={styles.historyInfo}>
                    <Text style={[styles.historyMonth, { color: theme.colors.textPrimary }]}>
                      {new Date(item.created_at).toLocaleDateString(locale, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                    <Text style={[styles.historyScheduleMonth, { color: theme.colors.textSecondary }]}>
                      {t('scan.scheduleMonth')}: {item.year_month}
                    </Text>
                    <View style={styles.historyActions}>
                      <View style={[
                        styles.historyBadge,
                        { backgroundColor: item.status === 'published' ? theme.colors.success + '20' : theme.colors.warning + '20' },
                      ]}>
                        <Text style={[
                          styles.historyBadgeText,
                          { color: item.status === 'published' ? theme.colors.success : theme.colors.warning },
                        ]}>
                          {item.status}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={handleReanalyze}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={[styles.reanalyzeButton, { borderColor: theme.colors.primary + '40' }]}
                      >
                        <Ionicons name="refresh-outline" size={12} color={theme.colors.primary} />
                        <Text style={[styles.reanalyzeText, { color: theme.colors.primary }]}>
                          {t('scan.reanalyze')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                </TouchableOpacity>
              );
            }}
          />
        ) : (
          <View style={styles.historyEmpty}>
            <Ionicons name="images-outline" size={48} color={theme.colors.textMuted} />
            <Text style={[styles.historyEmptyTitle, { color: theme.colors.textPrimary }]}>
              {t('scan.noScans')}
            </Text>
            <Text style={[styles.historyEmptyDesc, { color: theme.colors.textSecondary }]}>
              {t('scan.noScansDesc')}
            </Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // Camera view
  return (
    <View style={[styles.container, { backgroundColor: '#000' }]}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
      >
        {/* Header */}
        <SafeAreaView style={styles.cameraHeader}>
          <View style={styles.headerContent}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={28} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('scan.title')}</Text>
            <TouchableOpacity onPress={() => setShowHistory(true)} style={styles.closeButton}>
              <Ionicons name="time-outline" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        {/* Guide overlay */}
        <View style={styles.guideContainer}>
          <View style={styles.guideBox}>
            <View style={[styles.guideCorner, styles.topLeft]} />
            <View style={[styles.guideCorner, styles.topRight]} />
            <View style={[styles.guideCorner, styles.bottomLeft]} />
            <View style={[styles.guideCorner, styles.bottomRight]} />
          </View>
          <Text style={styles.guideText}>
            {t('scan.positionGuide')}
          </Text>
        </View>

        {/* Bottom controls */}
        <View style={styles.cameraControls}>
          <TouchableOpacity
            style={styles.galleryButton}
            onPress={pickImage}
          >
            <Ionicons name="images-outline" size={28} color="#FFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.captureButton}
            onPress={takePicture}
          >
            <View style={styles.captureButtonInner} />
          </TouchableOpacity>

          <View style={{ width: 56 }} />
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  camera: {
    flex: 1,
  },
  cameraHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '600',
  },
  guideContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guideBox: {
    width: '85%',
    aspectRatio: 4 / 3,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: 12,
    position: 'relative',
  },
  guideCorner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#FFF',
    borderWidth: 3,
  },
  topLeft: {
    top: -2,
    left: -2,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 12,
  },
  topRight: {
    top: -2,
    right: -2,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 12,
  },
  bottomLeft: {
    bottom: -2,
    left: -2,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
  },
  bottomRight: {
    bottom: -2,
    right: -2,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 12,
  },
  guideText: {
    color: '#FFF',
    fontSize: 14,
    marginTop: 16,
    textAlign: 'center',
  },
  cameraControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 48,
  },
  galleryButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFF',
  },
  previewContainer: {
    flex: 1,
  },
  previewImage: {
    flex: 1,
    resizeMode: 'contain',
  },
  previewOverlay: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  previewTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  previewText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  previewActions: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 32,
  },
  processingOverlayContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  processingText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 32,
  },
  processingHint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginTop: 8,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  historyHeaderTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  historyThumbnail: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#EEE',
  },
  historyInfo: {
    flex: 1,
    gap: 4,
  },
  historyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reanalyzeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  reanalyzeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  historyMonth: {
    fontSize: 16,
    fontWeight: '600',
  },
  historyScheduleMonth: {
    fontSize: 12,
    marginTop: 1,
  },
  historyBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  historyBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  historyEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  historyEmptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  historyEmptyDesc: {
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
});
