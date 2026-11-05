import { Alert } from 'react-native';
import i18n from '../i18n';

/** Ask on every photo transmission, including demo photos and re-analysis. */
export function confirmRosterPhotoTransmission(kind: 'recognize' | 'reanalyze'): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (approved: boolean) => {
      if (settled) return;
      settled = true;
      resolve(approved);
    };
    Alert.alert(
      i18n.t('scan.photoConsentTitle'),
      i18n.t(kind === 'recognize' ? 'scan.photoConsentRecognize' : 'scan.photoConsentReanalyze'),
      [
        { text: i18n.t('common.cancel'), style: 'cancel', onPress: () => finish(false) },
        { text: i18n.t('scan.photoConsentConfirm'), onPress: () => finish(true) },
      ],
      { cancelable: true, onDismiss: () => finish(false) },
    );
  });
}
