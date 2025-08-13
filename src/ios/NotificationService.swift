import UserNotifications
import UIKit
import Foundation

@objc(NotificationService)
class NotificationService: UNNotificationServiceExtension {

    var contentHandler: ((UNNotificationContent) -> Void)?
    var bestAttemptContent: UNMutableNotificationContent?



    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler
        self.bestAttemptContent = (request.content.mutableCopy() as? UNMutableNotificationContent)

        // 🔍 디버깅: Extension이 호출되었는지 확인
        NSLog("🚀 NotificationService Extension Started!")
        NSLog("📱 UserInfo: %@", request.content.userInfo)

        guard let content = bestAttemptContent else {
            NSLog("❌ bestAttemptContent not a UNMutableNotificationContent")
            contentHandler(request.content)
            return
        }

        // 사용자 정보에서 데이터 추출
        let userInfo: [AnyHashable: Any] = request.content.userInfo
        NSLog("🔍 Processing userInfo with keys: %@", Array(userInfo.keys))

        // Extension이 정상적으로 호출되었음을 로그로 확인
        NSLog("🔧 NotificationService Extension processing notification")

        // 타임아웃 방지를 위한 빠른 처리 (25초 제한)
        let startTime = Date()

        // 이미지 첨부 처리
        processImageAttachments(userInfo: userInfo, content: content) { [weak self] in
            let processingTime = Date().timeIntervalSince(startTime)
            NSLog("⏱️ Processing completed in %.2f seconds", processingTime)

            // 커스텀 UI 설정 (확장 화면용)
            self?.setupCustomUI(userInfo: userInfo, content: content)

            // 콘텐츠 핸들러 호출
            guard let copy = self?.bestAttemptContent else {
                NSLog("❌ bestAttemptContent is nil in completion")
                return
            }
            NSLog("✅ Calling contentHandler with processed content")
            contentHandler(copy)
        }
    }

    override func serviceExtensionTimeWillExpire() {
        if let contentHandler = contentHandler, let content = self.bestAttemptContent {
            contentHandler(content)
        }
    }

    // MARK: - 이미지 첨부 처리

    private func processImageAttachments(userInfo: [AnyHashable: Any], content: UNMutableNotificationContent, completion: @escaping () -> Void) {
        var attachments: [UNNotificationAttachment] = []
        let group = DispatchGroup()

        // 🔍 디버깅: FCM options 확인
        NSLog("🔍 Looking for image URL in fcm_options...")
        NSLog("📋 Available keys: %@", Array(userInfo.keys))

        // FCM notification.image → fcm_options.image 자동 변환 지원
        var imageURLString: String?
        let imageType = "public.png"
        let imageIdentifier = "image.png"

        // fcm_options.image에서 이미지 URL 추출
        if let fcmOptions = userInfo["fcm_options"] as? [String: Any],
           let imageUrl = fcmOptions["image"] as? String, !imageUrl.isEmpty {
            imageURLString = imageUrl
            NSLog("✅ Found image URL in fcm_options.image: %@", imageUrl)
        }

        // 이미지 다운로드 및 첨부
        if let imageURLString = imageURLString {
            group.enter()
            downloadAndAttachImage(urlString: imageURLString, identifier: imageIdentifier, type: imageType) { attachment in
                if let attachment = attachment {
                    NSLog("✅ Successfully created image attachment")
                    attachments.append(attachment)
                } else {
                    NSLog("❌ Failed to create image attachment")
                }
                group.leave()
            }
        } else {
            NSLog("❌ No image URL found in fcm_options")
        }

        // 모든 다운로드 완료 후 첨부
        group.notify(queue: .main) {
            NSLog("📎 Final attachments count: %d", attachments.count)
            content.attachments = attachments
            if attachments.count > 0 {
                NSLog("✅ Successfully attached %d media files", attachments.count)
            } else {
                NSLog("⚠️ No attachments were created")
            }
            completion()
        }
    }

    private func downloadAndAttachImage(urlString: String, identifier: String, type: String, completion: @escaping (UNNotificationAttachment?) -> Void) {
        NSLog("🌐 Starting download for: %@", urlString)

        guard let url = URL(string: urlString) else {
            NSLog("❌ Invalid URL: %@", urlString)
            completion(nil)
            return
        }

        // 타임아웃 설정 (20초 제한)
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 20.0
        config.timeoutIntervalForResource = 20.0
        let session = URLSession(configuration: config)

        let task = session.dataTask(with: url) { data, response, error in
            if let error = error {
                NSLog("❌ Download error: %@", error.localizedDescription)
                completion(nil)
                return
            }

            guard let data = data else {
                NSLog("❌ No data received")
                completion(nil)
                return
            }

            NSLog("✅ Downloaded %d bytes", data.count)
            let attachment = self.save(identifier: identifier, data: data, type: type)
            if attachment != nil {
                NSLog("✅ Successfully saved attachment: %@", identifier)
            } else {
                NSLog("❌ Failed to save attachment: %@", identifier)
            }
            completion(attachment)
        }
        task.resume()
    }

    // MARK: - 커스텀 UI 설정 (확장 화면용)

    private func setupCustomUI(userInfo: [AnyHashable: Any], content: UNMutableNotificationContent) {
        // 확장 화면에서 표시할 추가 정보 설정
        if let description = userInfo["notification_description"] as? String {
            content.subtitle = description
        }

        // 커스텀 카테고리 설정
        if let categoryIdentifier = userInfo["notification_category"] as? String {
            content.categoryIdentifier = categoryIdentifier
        }

        // 액션 버튼 설정
        if let actionTitle = userInfo["notification_action_title"] as? String {
            content.userInfo["action_title"] = actionTitle
        }

        // 딥링크 URL 설정
        if let deepLink = userInfo["notification_deep_link"] as? String {
            content.userInfo["deep_link"] = deepLink
        }
    }

    // MARK: - 헬퍼 메서드

    private func save(identifier: String, data: Data, type: String) -> UNNotificationAttachment? {
        let directory = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent(ProcessInfo.processInfo.globallyUniqueString, isDirectory: true)
        let fileURL = directory.appendingPathComponent(identifier)

        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: nil)
            try data.write(to: fileURL, options: [])

            let options: [AnyHashable: Any] = [
                UNNotificationAttachmentOptionsTypeHintKey: type,
                UNNotificationAttachmentOptionsThumbnailHiddenKey: false,
                UNNotificationAttachmentOptionsThumbnailClippingRectKey: CGRect(x: 0, y: 0, width: 1, height: 1).dictionaryRepresentation
            ]

            return try UNNotificationAttachment(identifier: identifier, url: fileURL, options: options)
        } catch {
            print("Failed to save attachment: \(error)")
            return nil
        }
    }

    private func exitGracefully(_ reason: String = "") {
        guard let copy = bestAttemptContent?.mutableCopy() as? UNMutableNotificationContent else { return }
        copy.title = reason
        contentHandler?(copy)
    }
}

// MARK: - CGRect Extension

extension CGRect {
    var dictionaryRepresentation: [String: Any] {
        return [
            "X": origin.x,
            "Y": origin.y,
            "Width": size.width,
            "Height": size.height
        ]
    }
}
