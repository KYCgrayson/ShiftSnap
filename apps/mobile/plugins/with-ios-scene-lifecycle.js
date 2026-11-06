const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

// Expo SDK 54 creates its React Native window in AppDelegate. SDK 27 requires
// that window to belong to a UIWindowScene. Keep this migration in prebuild so
// local builds and EAS builds produce the same native entry point.
const marker = '// IShift scene lifecycle (Expo SDK 54)';
const legacyStartup = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif`;

const sceneDelegate = `
${marker}
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else {
      return
    }

    var launchOptions = appDelegate.reactNativeLaunchOptions ?? [:]
    if let context = connectionOptions.urlContexts.first {
      launchOptions[.url] = context.url
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: urlOptions(context))
    }
    if let activity = connectionOptions.userActivities.first {
      launchOptions[.userActivityDictionary] = [
        "UIApplicationLaunchOptionsUserActivityTypeKey": activity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": activity
      ]
      _ = appDelegate.application(UIApplication.shared, continue: activity, restorationHandler: { _ in })
    }

    // Reconnecting the single supported scene must reuse the React root.
    if let existingWindow = appDelegate.window {
      existingWindow.windowScene = windowScene
      window = existingWindow
      existingWindow.makeKeyAndVisible()
      return
    }

    let sceneWindow = UIWindow(windowScene: windowScene)
    window = sceneWindow
    appDelegate.window = sceneWindow
    factory.startReactNative(withModuleName: "main", in: sceneWindow, launchOptions: launchOptions)
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    for context in URLContexts {
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: urlOptions(context))
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    _ = appDelegate.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    (UIApplication.shared.delegate as? AppDelegate)?.applicationDidBecomeActive(UIApplication.shared)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    (UIApplication.shared.delegate as? AppDelegate)?.applicationWillResignActive(UIApplication.shared)
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    (UIApplication.shared.delegate as? AppDelegate)?.applicationWillEnterForeground(UIApplication.shared)
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    (UIApplication.shared.delegate as? AppDelegate)?.applicationDidEnterBackground(UIApplication.shared)
  }

  private func urlOptions(_ context: UIOpenURLContext) -> [UIApplication.OpenURLOptionsKey: Any] {
    var options: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: context.options.openInPlace]
    if let sourceApplication = context.options.sourceApplication {
      options[.sourceApplication] = sourceApplication
    }
    if let annotation = context.options.annotation {
      options[.annotation] = annotation
    }
    return options
  }
}
`;

function updateAppDelegate(contents) {
  if (contents.includes(marker)) return contents;
  if (!contents.includes(legacyStartup) || !contents.includes('bindReactNativeFactory(factory)')) {
    throw new Error('IShift scene migration requires the Expo SDK 54 Swift AppDelegate template. Review the native entry point after upgrading Expo.');
  }
  return contents
    .replace('  var window: UIWindow?', '  var window: UIWindow?\n  var reactNativeLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?')
    .replace(legacyStartup, '    reactNativeLaunchOptions = launchOptions')
    .concat(sceneDelegate);
}

function updateInfoPlist(plist) {
  const existing = plist.UIApplicationSceneManifest;
  if (existing && existing.UISceneConfigurations?.UIWindowSceneSessionRoleApplication?.[0]?.UISceneDelegateClassName !== '$(PRODUCT_MODULE_NAME).SceneDelegate') {
    throw new Error('IShift scene migration found another scene manifest. Review it before replacing the app scene.');
  }
  plist.UIApplicationSceneManifest = {
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: {
      UIWindowSceneSessionRoleApplication: [{
        UISceneConfigurationName: 'Default Configuration',
        UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
      }],
    },
  };
  return plist;
}

function withIShiftSceneLifecycle(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults = updateInfoPlist(mod.modResults);
    return mod;
  });
  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== 'swift') throw new Error('IShift scene migration requires Swift AppDelegate.');
    mod.modResults.contents = updateAppDelegate(mod.modResults.contents);
    return mod;
  });
}

module.exports = withIShiftSceneLifecycle;
module.exports.updateAppDelegate = updateAppDelegate;
module.exports.updateInfoPlist = updateInfoPlist;
