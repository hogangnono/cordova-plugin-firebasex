import UserNotifications
import UIKit

class NotificationService: UNNotificationServiceExtension {

    var contentHandler: ((UNNotificationContent) -> Void)?
    var bestAttemptContent: UNMutableNotificationContent?

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler
        self.bestAttemptContent = (request.content.mutableCopy() as? UNMutableNotificationContent)

        guard let content = bestAttemptContent else {
            #if DEBUG
            exitGracefully("bestAttemptContent not a UNMutableNotificationContent")
            #endif
            return
        }

        // 사용자 정보에서 데이터 추출
        let userInfo: [AnyHashable: Any] = request.content.userInfo

        // 이미지 첨부 처리
        processImageAttachments(userInfo: userInfo, content: content) { [weak self] in
            // 커스텀 UI 설정 (확장 화면용)
            self?.setupCustomUI(userInfo: userInfo, content: content)

            // 콘텐츠 핸들러 호출
            guard let copy = self?.bestAttemptContent else {
                #if DEBUG
                self?.exitGracefully("bestAttemptContent is nil")
                #endif
                return
            }
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

        // PNG 이미지 처리
        if let imageURLString = userInfo["notification_ios_image_png"] as? String {
            group.enter()
            downloadAndAttachImage(urlString: imageURLString, identifier: "image.png", type: "public.png") { attachment in
                if let attachment = attachment {
                    attachments.append(attachment)
                }
                group.leave()
            }
        }

        // JPG 이미지 처리
        if let imageURLString = userInfo["notification_ios_image_jpg"] as? String {
            group.enter()
            downloadAndAttachImage(urlString: imageURLString, identifier: "image.jpg", type: "public.jpeg") { attachment in
                if let attachment = attachment {
                    attachments.append(attachment)
                }
                group.leave()
            }
        }

        // GIF 이미지 처리
        if let imageURLString = userInfo["notification_ios_image_gif"] as? String {
            group.enter()
            downloadAndAttachImage(urlString: imageURLString, identifier: "image.gif", type: "com.compuserve.gif") { attachment in
                if let attachment = attachment {
                    attachments.append(attachment)
                }
                group.leave()
            }
        }

        // 모든 다운로드 완료 후 첨부
        group.notify(queue: .main) {
            content.attachments = attachments
            completion()
        }
    }

    private func downloadAndAttachImage(urlString: String, identifier: String, type: String, completion: @escaping (UNNotificationAttachment?) -> Void) {
        guard let url = URL(string: urlString) else {
            completion(nil)
            return
        }

        let task = URLSession.shared.dataTask(with: url) { data, response, error in
            guard let data = data, error == nil else {
                completion(nil)
                return
            }

            let attachment = self.save(identifier: identifier, data: data, type: type)
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
