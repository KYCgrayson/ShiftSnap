import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';
import { Button } from '../../src/components/ui';
import { supabase } from '../../src/services/supabase';

export default function ScanScreen() {
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  // Request camera permission
  if (!permission) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.warmWhite }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  // Permission denied view
  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.warmWhite }]}>
        <View style={styles.permissionContainer}>
          <View style={[styles.iconContainer, { backgroundColor: theme.colors.primary + '15' }]}>
            <Ionicons name="camera-outline" size={48} color={theme.colors.primary} />
          </View>
          <Text style={[styles.permissionTitle, { color: theme.colors.textPrimary }]}>
            Camera Access Required
          </Text>
          <Text style={[styles.permissionText, { color: theme.colors.textSecondary }]}>
            ShiftSnap needs camera access to scan your work schedule. You can also select an image from your photo library.
          </Text>
          <Button
            title="Grant Camera Access"
            onPress={requestPermission}
            fullWidth
            style={{ marginTop: 24 }}
          />
          <Button
            title="Choose from Library"
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

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setCapturedImage(result.assets[0].uri);
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
  };

  const processSchedule = async () => {
    if (!capturedImage) return;

    setProcessing(true);
    try {
      // 1. Upload image to Supabase Storage
      const fileName = `schedule_${Date.now()}.jpg`;
      const response = await fetch(capturedImage);
      const blob = await response.blob();

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('schedule-images')
        .upload(fileName, blob, {
          contentType: 'image/jpeg',
        });

      if (uploadError) {
        throw new Error('Failed to upload image: ' + uploadError.message);
      }

      // 2. Get public URL
      const { data: urlData } = supabase.storage
        .from('schedule-images')
        .getPublicUrl(fileName);

      // 3. Call OCR Edge Function
      const { data: ocrData, error: ocrError } = await supabase.functions.invoke('ocr-process', {
        body: {
          imageUrl: urlData.publicUrl,
        },
      });

      if (ocrError) {
        throw new Error('Failed to process schedule: ' + ocrError.message);
      }

      // 4. Navigate to results screen
      router.push({
        pathname: '/(tabs)/shifts',
        params: { ocrResult: JSON.stringify(ocrData) },
      });
    } catch (error) {
      console.error('Error processing schedule:', error);
      Alert.alert(
        'Processing Failed',
        error instanceof Error ? error.message : 'Failed to process schedule. Please try again.'
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
            <Text style={styles.previewTitle}>Review Your Schedule</Text>
            <Text style={styles.previewText}>
              Make sure the schedule is clear and readable
            </Text>
          </View>
        </View>
        <View style={[styles.previewActions, { backgroundColor: theme.colors.warmWhite }]}>
          <Button
            title="Retake"
            onPress={retakePhoto}
            variant="secondary"
            style={{ flex: 1, marginRight: 8 }}
          />
          <Button
            title={processing ? 'Processing...' : 'Process Schedule'}
            onPress={processSchedule}
            loading={processing}
            disabled={processing}
            style={{ flex: 1, marginLeft: 8 }}
          />
        </View>
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
            <Text style={styles.headerTitle}>Scan Schedule</Text>
            <View style={{ width: 40 }} />
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
            Position your schedule within the frame
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
});
