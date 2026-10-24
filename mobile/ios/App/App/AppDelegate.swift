import UIKit
import Capacitor
import WebKit
import QuickLook

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

// MARK: - Moonlight additions
// Kept in this file so the Xcode project needs no extra file references.

/// The app's main screen: Capacitor's web view plus a teal strip behind the status bar, swipe-back navigation and
/// in-app viewing of invoices and shared files.
class AppViewController: CAPBridgeViewController {
    private let statusBarBackdrop = UIView()

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(FileDownloads())
        webView?.allowsBackForwardNavigationGestures = true

        statusBarBackdrop.backgroundColor = UIColor(red: 0x12 / 255.0, green: 0x3f / 255.0, blue: 0x46 / 255.0, alpha: 1)
        statusBarBackdrop.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(statusBarBackdrop)
        NSLayoutConstraint.activate([
            statusBarBackdrop.topAnchor.constraint(equalTo: view.topAnchor),
            statusBarBackdrop.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            statusBarBackdrop.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            statusBarBackdrop.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor)
        ])
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .lightContent
    }
}

/// Opens invoice PDFs, message attachments and shared documents inside the app. These links need the signed-in
/// session, which Safari does not have, so the file is fetched with the web view's cookies and shown in Quick Look
/// (with Share, Print and Save to Files).
@objc(FileDownloads)
class FileDownloads: CAPPlugin, CAPBridgedPlugin, QLPreviewControllerDataSource {
    let identifier = "FileDownloads"
    let jsName = "FileDownloads"
    let pluginMethods: [CAPPluginMethod] = []

    private var previewURL: URL?
    private static let filePaths = try? NSRegularExpression(
        pattern: "^/api/(billing/invoices/[^/]+/pdf|team/attachments/[^/]+|team/documents/[^/]+/file)$")

    override func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
        guard let url = navigationAction.request.url, let host = url.host,
              bridge?.config.shouldAllowNavigation(to: host) == true,
              let pattern = FileDownloads.filePaths else { return nil }
        let path = url.path
        guard pattern.firstMatch(in: path, range: NSRange(path.startIndex..., in: path)) != nil else { return nil }
        fetch(url)
        return true
    }

    private func fetch(_ url: URL) {
        guard let webView = bridge?.webView else { return }
        webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { cookies in
            let host = url.host ?? ""
            let matching = cookies.filter { cookie in
                let domain = cookie.domain.hasPrefix(".") ? String(cookie.domain.dropFirst()) : cookie.domain
                return host == domain || host.hasSuffix("." + domain)
            }
            var request = URLRequest(url: url)
            for (field, value) in HTTPCookie.requestHeaderFields(with: matching) {
                request.setValue(value, forHTTPHeaderField: field)
            }
            URLSession(configuration: .ephemeral).downloadTask(with: request) { location, response, _ in
                guard let location = location, let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                    DispatchQueue.main.async { self.showError() }
                    return
                }
                var name = http.suggestedFilename ?? url.lastPathComponent
                if (name as NSString).pathExtension.isEmpty, http.mimeType == "application/pdf" {
                    name += ".pdf"
                }
                let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
                let file = folder.appendingPathComponent(name)
                do {
                    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                    try FileManager.default.moveItem(at: location, to: file)
                } catch {
                    DispatchQueue.main.async { self.showError() }
                    return
                }
                DispatchQueue.main.async { self.preview(file) }
            }.resume()
        }
    }

    private func preview(_ file: URL) {
        previewURL = file
        let controller = QLPreviewController()
        controller.dataSource = self
        bridge?.viewController?.present(controller, animated: true)
    }

    private func showError() {
        let alert = UIAlertController(title: "Couldn't open the file",
                                      message: "Check your internet connection and try again.",
                                      preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        bridge?.viewController?.present(alert, animated: true)
    }

    func numberOfPreviewItems(in controller: QLPreviewController) -> Int {
        return previewURL == nil ? 0 : 1
    }

    func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
        return (previewURL ?? URL(fileURLWithPath: "/")) as NSURL
    }
}
